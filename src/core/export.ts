// Public-safe dataset builder（pure）。Apps Script 讀 Sheet → 呼叫這裡 → 寫出 public-dataset.json。
// 順序：公開☑ → allowlist 欄位 → 公開範圍（整欄遮蔽）→ sanitizer → privacy gate → validation。
// 任何 error 都會讓 ok=false，呼叫端不得寫出檔案（production 保留上一版）。

import { normalizeBool, normalizeRecord, normalizeText } from './normalize';
import { privacyConfigFrom } from './privacy/config';
import { scanDataset } from './privacy/gate';
import type { PrivacyConfig } from './privacy/rules';
import { mergeHits, SANITIZER_VERSION, sanitizeText, type DictionaryTerm } from './privacy/sanitize';
import type { EntityKind } from './refs';
import { SCHEMA_VERSION } from './schema';
import { SETTINGS, withDefaults } from './settings';
import { DATA_KEY, ENTITY_ORDER, SHEETS } from './sheet-schema';
import { validateDataset, type Problem, type ValidationResult } from './validate';

/** Sheet 上的一列，已由 Apps Script 依 header 轉成英文 key。 */
export type SheetRow = Record<string, unknown> & { _row: number };

/** 已核准的文件內容（由私有 Drive 快取讀出），以 _internal_id 對應。 */
export interface ApprovedDoc {
  body_md: string;
  source_filename: string;
  /** 文件在核准後又被修改 */
  stale: boolean;
}

export interface ExportInput {
  rows: Partial<Record<EntityKind, SheetRow[]>>;
  dictionary: DictionaryTerm[];
  docs: Record<string, ApprovedDoc>;
  options: { categories: string[]; owner_types: string[] };
  settings: Record<string, string>;
  now: Date;
}

export interface ExportResult {
  ok: boolean;
  /** ok=true 時才可寫出 */
  json?: string;
  errors: Problem[];
  warnings: Problem[];
  stats: {
    published: Record<string, number>;
    skipped: Record<string, number>;
    maskedCounts: Record<string, number>;
  };
}

const MASKED = '內容遮蔽';
const INHERIT = '依議題設定';

/** 無法辨識的公開範圍一律視為遮蔽（fail safe），並由呼叫端報錯。 */
function isMasked(visibility: unknown, parentMasked: boolean): boolean {
  const v = normalizeText(visibility);
  if (!v || v === INHERIT) return parentMasked;
  return v !== '完整公開';
}

const VISIBILITY_VALUES = ['', INHERIT, '完整公開', MASKED];

function maskText(kind: EntityKind, key: string, category: string): string {
  const c = category || '';
  if (key === 'title' && kind === 'action') return `[${c}待辦內容已遮蔽]`;
  if (key === 'title' && kind === 'decision') return `[${c}決議內容已遮蔽]`;
  return `[${c}內容已遮蔽]`;
}

function hasContent(kind: EntityKind, row: SheetRow): boolean {
  return SHEETS[kind].columns.some(
    (c) => !c.key.startsWith('_') && c.type !== 'auto' && c.type !== 'checkbox' && normalizeText(row[c.key]) !== '',
  );
}

export function buildPublicDataset(input: ExportInput): ExportResult {
  const config: PrivacyConfig = privacyConfigFrom(input.settings);
  const sanitizeOpts = { config, dictionary: input.dictionary };
  const maskedCounts: Record<string, number> = {};
  const published: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const warnings: Problem[] = [];
  const exportErrors: Problem[] = [];

  const clean = (v: string) => {
    const r = sanitizeText(v, sanitizeOpts);
    mergeHits(maskedCounts, r.hits);
    return r.text;
  };

  // 先找出「內容遮蔽」的議題與其分類（子項目繼承）
  const issueInfo = new Map<string, { masked: boolean; category: string }>();
  for (const row of input.rows.issue ?? []) {
    const id = normalizeRecord('issue', { display_id: row.display_id }).display_id as string;
    if (id) issueInfo.set(id, { masked: isMasked(row.visibility, false), category: normalizeText(row.category) });
  }
  const meetingDates = new Map<string, string>();
  for (const row of input.rows.meeting ?? []) {
    const rec = normalizeRecord('meeting', row);
    if (rec.display_id) meetingDates.set(String(rec.display_id), String(rec.date ?? ''));
  }

  const data: Record<string, Record<string, unknown>[]> = {};
  for (const kind of ENTITY_ORDER) {
    const def = SHEETS[kind];
    const list: Record<string, unknown>[] = [];
    data[DATA_KEY[kind]] = list;
    published[def.sheet] = 0;
    skipped[def.sheet] = 0;

    for (const raw of input.rows[kind] ?? []) {
      if (!hasContent(kind, raw)) continue;
      if (!normalizeBool(raw.published)) {
        skipped[def.sheet]!++;
        continue;
      }
      const rec = normalizeRecord(kind, raw);
      if ('visibility' in rec && !VISIBILITY_VALUES.includes(normalizeText(rec.visibility))) {
        exportErrors.push({
          level: 'error',
          sheet: def.sheet,
          row: raw._row,
          id: String(rec.display_id ?? ''),
          field: '公開範圍',
          message: `無法辨識「${normalizeText(rec.visibility)}」，請從下拉選單選擇（暫以內容遮蔽處理）`,
        });
      }

      const parent = kind === 'issue' ? undefined : issueInfo.get(String(rec.issue_id ?? ''));
      const category = kind === 'issue' ? normalizeText(rec.category) : (parent?.category ?? '');
      const masked =
        kind === 'issue' || kind === 'action' || kind === 'decision'
          ? isMasked(rec.visibility, parent?.masked ?? false)
          : false;

      // allowlist：只有 public 欄位會被複製
      const out: Record<string, unknown> = { _row: raw._row };
      for (const col of def.columns) {
        if (!col.public) continue;
        let v = rec[col.key];
        if (masked && col.maskable) {
          if (typeof v === 'string' && v !== '') {
            v = maskText(kind, col.key, category);
            maskedCounts.visibility = (maskedCounts.visibility ?? 0) + 1;
          } else if (col.required) {
            v = maskText(kind, col.key, category);
          }
        } else if (col.public === 'sanitize' && typeof v === 'string') {
          v = clean(v);
        }
        out[col.key] = v ?? '';
      }
      if (kind === 'issue' || kind === 'action' || kind === 'decision') out.content_masked = masked;

      if (kind === 'decision' && !out.date) out.date = meetingDates.get(String(out.meeting_id ?? '')) ?? '';

      if (kind === 'meeting' || kind === 'rule') {
        const doc = input.docs[String(rec._internal_id ?? '')];
        out.body_md = doc ? clean(doc.body_md) : null;
        out.source_filename = doc ? clean(doc.source_filename) : '';
        out.body_stale = doc?.stale ?? false;
        if (!doc && normalizeText(raw.doc_url)) {
          warnings.push({
            level: 'warning',
            sheet: def.sheet,
            row: raw._row,
            id: String(rec.display_id ?? ''),
            field: '文件核准狀態',
            message: '已填文件連結但尚未核准，網站暫不顯示全文；請「預覽並核准文件」',
          });
        }
      }

      list.push(out);
      published[def.sheet]!++;
    }
  }

  const settings: Record<string, string> = {};
  const s = withDefaults(input.settings);
  for (const def of SETTINGS) settings[def.key] = def.key === 'privacy_allow' ? s[def.key]! : clean(s[def.key]!);

  const envelope = {
    schema_version: SCHEMA_VERSION,
    generated_at: input.now.toISOString(),
    settings,
    options: input.options,
    privacy: { sanitizer_version: SANITIZER_VERSION, masked_counts: maskedCounts },
    data,
  };

  const gate = scanDataset(data, settings, config);
  const validation: ValidationResult = validateDataset(envelope);
  const errors = [...exportErrors, ...gate, ...validation.errors];
  const ok = errors.length === 0;
  return {
    ok,
    json: ok ? JSON.stringify(envelope, null, 1) : undefined,
    errors,
    warnings: [...warnings, ...validation.warnings],
    stats: { published, skipped, maskedCounts },
  };
}
