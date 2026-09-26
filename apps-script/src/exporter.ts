// 「檢查資料」與「匯出公開資料」：讀 Sheet → src/core/export.ts（allowlist → 遮蔽 → gate → validation）。
// 有任何 error 時不覆寫 public-dataset.json，網站保持上一版。
import { driveFileId } from '../../src/core/doc-clean';
import { buildPublicDataset, type ApprovedDoc, type ExportResult, type SheetRow } from '../../src/core/export';
import { normalizeText } from '../../src/core/normalize';
import type { EntityKind } from '../../src/core/refs';
import { ENTITY_ORDER, SHEETS } from '../../src/core/sheet-schema';
import { formatProblem, type Problem } from '../../src/core/validate';
import { privacyContext, readOptions } from './context';
import { revisionOf } from './docs';
import { downloadText, getMeta, publicDownloadUrl, updateFileContent } from './drive';
import { writeLog } from './log';
import { ensurePublicFile, saveSnapshot } from './storage';
import { headerMap, readRows, sheetOf } from './sheet';

export interface CachedDoc {
  body_md: string;
  source_filename: string;
  revision: string;
  hash: string;
  approved_at: string;
  approved_by: string;
}

const DOC_KINDS: EntityKind[] = ['meeting', 'rule'];

/** 讀已核准快取；同時比對原始文件是否在核准後被修改，並更新「文件核准狀態」欄 */
function loadApprovedDocs(rows: Partial<Record<EntityKind, SheetRow[]>>, problems: Problem[]): Record<string, ApprovedDoc> {
  const docs: Record<string, ApprovedDoc> = {};
  for (const kind of DOC_KINDS) {
    const sheet = sheetOf(kind);
    const statusCol = sheet ? headerMap(sheet, kind).get('doc_approval') : undefined;
    for (const row of rows[kind] ?? []) {
      const cacheId = normalizeText(row._approved_cache_id);
      const internalId = normalizeText(row._internal_id);
      const fileId = driveFileId(normalizeText(row.doc_url));
      if (!cacheId || !internalId || !fileId) continue;
      let cached: CachedDoc;
      try {
        cached = JSON.parse(downloadText(cacheId)) as CachedDoc;
      } catch {
        problems.push({ level: 'warning', sheet: SHEETS[kind].sheet, row: row._row, id: normalizeText(row.display_id), field: '文件核准狀態', message: '找不到已核准的文件快取，請重新「預覽並核准文件」' });
        continue;
      }
      let stale = !cached.revision.startsWith(`${fileId}@`);
      if (!stale) {
        try {
          stale = revisionOf(getMeta(fileId)) !== cached.revision;
        } catch {
          // 原始文件無法讀取（權限或已刪除）時仍使用已核准版本
        }
      }
      docs[internalId] = { body_md: cached.body_md, source_filename: cached.source_filename, stale };
      if (sheet && statusCol) {
        const label = stale ? `⚠ 文件已修改，網站仍為 ${cached.approved_at.slice(0, 10)} 核准版本` : `已核准 ${cached.approved_at.slice(0, 10)}`;
        if (normalizeText(sheet.getRange(row._row, statusCol).getValue()) !== label) sheet.getRange(row._row, statusCol).setValue(label);
      }
    }
  }
  return docs;
}

export interface RunResult {
  result: ExportResult;
  extraWarnings: Problem[];
  publicUrl?: string;
}

export function buildFromSheet(): RunResult {
  const rows: Partial<Record<EntityKind, SheetRow[]>> = {};
  for (const kind of ENTITY_ORDER) rows[kind] = readRows(kind);
  const extraWarnings: Problem[] = [];
  const docs = loadApprovedDocs(rows, extraWarnings);
  const ctx = privacyContext();
  const result = buildPublicDataset({
    rows,
    dictionary: ctx.dictionary,
    docs,
    options: readOptions(),
    settings: ctx.settings,
    now: new Date(),
  });
  return { result, extraWarnings };
}

export function summarize(run: RunResult): { errors: string[]; warnings: string[]; stats: string } {
  const p = run.result.stats.published;
  const stats = Object.entries(p)
    .map(([k, v]) => `${k} ${v}`)
    .join('・');
  return {
    errors: run.result.errors.map(formatProblem),
    warnings: [...run.extraWarnings, ...run.result.warnings].map(formatProblem),
    stats,
  };
}

/** 匯出到 Drive。回傳 null 表示有錯誤、未寫出。 */
export function exportPublic(action: string): RunResult {
  const run = buildFromSheet();
  const s = summarize(run);
  if (!run.result.ok || !run.result.json) {
    writeLog(action, '失敗', [...s.errors, ...s.warnings].join('\n'));
    return run;
  }
  const json = run.result.json;
  const { id, created } = ensurePublicFile(json);
  if (!created) updateFileContent(id, json);
  saveSnapshot(json, Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss'));
  run.publicUrl = publicDownloadUrl(id);
  writeLog(action, s.warnings.length ? '警告' : '成功', [`公開資料已更新：${s.stats}`, ...s.warnings].join('\n'));
  return run;
}
