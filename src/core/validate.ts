// 驗證 public dataset：schema、重複 ID、關聯、狀態一致性。
// 同一份程式在 Apps Script「檢查資料」與 CI 執行，錯誤訊息對應到 Sheet 的列。

import type { ZodType } from 'zod';
import { normalizeRecord } from './normalize';
import { kindOfId, type EntityKind } from './refs';
import {
  DatasetEnvelopeSchema,
  ENTITY_SCHEMAS,
  SCHEMA_VERSION,
  type Dataset,
} from './schema';
import { DATA_KEY, ENTITY_ORDER, labelOf, SHEETS } from './sheet-schema';

export interface Problem {
  level: 'error' | 'warning';
  sheet: string;
  row?: number;
  id?: string;
  field?: string;
  message: string;
}

export function formatProblem(p: Problem): string {
  const where = [p.sheet, p.row ? `第 ${p.row} 列` : '', p.id ? `（${p.id}）` : ''].join(' ').replace(/\s+（/, '（').trim();
  const field = p.field ? `「${p.field}」` : '';
  return `${where}：${field}${p.message}`;
}

export interface ValidationResult {
  ok: boolean;
  dataset?: Dataset;
  errors: Problem[];
  warnings: Problem[];
}

const REF_FIELDS: Record<EntityKind, { key: string; to: EntityKind }[]> = {
  issue: [],
  action: [
    { key: 'issue_id', to: 'issue' },
    { key: 'source_meeting_id', to: 'meeting' },
  ],
  decision: [
    { key: 'issue_id', to: 'issue' },
    { key: 'meeting_id', to: 'meeting' },
  ],
  meeting: [],
  rule: [],
  announcement: [{ key: 'issue_id', to: 'issue' }],
};

export function validateDataset(raw: unknown): ValidationResult {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  const env = DatasetEnvelopeSchema.safeParse(raw);
  if (!env.success) {
    for (const issue of env.error.issues) {
      errors.push({
        level: 'error',
        sheet: '公開資料檔',
        field: issue.path.join('.') || undefined,
        message: issue.path[0] === 'schema_version' ? `版本不符（網站程式支援 ${SCHEMA_VERSION}）` : issue.message,
      });
    }
    return { ok: false, errors, warnings };
  }

  const dataset: Dataset = {
    schema_version: env.data.schema_version,
    generated_at: env.data.generated_at,
    settings: env.data.settings,
    options: env.data.options,
    privacy: env.data.privacy,
    data: { issues: [], actions: [], decisions: [], meetings: [], rules: [], announcements: [] },
  };

  const byKind = new Map<EntityKind, Map<string, Record<string, unknown>>>();
  const internalIds = new Map<string, { sheet: string; row?: number; id: string }>();

  for (const kind of ENTITY_ORDER) {
    const sheet = SHEETS[kind].sheet;
    const schema = ENTITY_SCHEMAS[kind] as ZodType;
    const rows = env.data.data[DATA_KEY[kind]] as unknown[];
    const ids = new Map<string, Record<string, unknown>>();
    byKind.set(kind, ids);

    rows.forEach((item, index) => {
      const rec = normalizeRecord(kind, (item ?? {}) as Record<string, unknown>);
      const row = typeof rec._row === 'number' ? rec._row : undefined;
      const displayId = typeof rec.display_id === 'string' ? rec.display_id : undefined;
      const loc = { sheet, row, id: displayId || `第 ${index + 1} 筆` };
      const parsed = schema.safeParse(rec);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '');
          errors.push({ level: 'error', ...loc, field: labelOf(kind, key), message: withValue(issue.message, rec[key]) });
        }
        return;
      }
      const value = parsed.data as Record<string, unknown> & { display_id: string; _internal_id: string };

      if (kindOfId(value.display_id) !== kind) {
        errors.push({ level: 'error', ...loc, field: '編號', message: `「${value.display_id}」不是${SHEETS[kind].noun}的編號格式` });
      }
      const dupDisplay = ids.get(value.display_id);
      if (dupDisplay) {
        errors.push({
          level: 'error',
          ...loc,
          field: '編號',
          message: `與第 ${dupDisplay._row ?? '?'} 列重複；請執行「管委會網站 → 檢查資料」自動修正`,
        });
        return;
      }
      const dupInternal = internalIds.get(value._internal_id);
      if (dupInternal) {
        errors.push({
          level: 'error',
          ...loc,
          message: `內部編號與 ${dupInternal.sheet} 第 ${dupInternal.row ?? '?'} 列（${dupInternal.id}）重複，可能是整列複製；請執行「檢查資料」自動修正`,
        });
        return;
      }
      internalIds.set(value._internal_id, { sheet, row, id: value.display_id });
      ids.set(value.display_id, value);
      (dataset.data[DATA_KEY[kind]] as unknown[]).push(value);
    });
  }

  // 關聯
  for (const kind of ENTITY_ORDER) {
    const sheet = SHEETS[kind].sheet;
    for (const rec of byKind.get(kind)!.values()) {
      for (const f of REF_FIELDS[kind]) {
        const target = String(rec[f.key] ?? '');
        if (!target) continue;
        if (!byKind.get(f.to)!.has(target)) {
          errors.push({
            level: 'error',
            sheet,
            row: rec._row as number | undefined,
            id: rec.display_id as string,
            field: labelOf(kind, f.key),
            message: `= ${target}，找不到對應${SHEETS[f.to].noun}（可能不存在、未勾選公開，或已刪除）`,
          });
        }
      }
    }
  }

  // 狀態一致性（warning：不擋 build，但會列在發布紀錄）
  const warn = (kind: EntityKind, rec: Record<string, unknown>, field: string, message: string) =>
    warnings.push({ level: 'warning', sheet: SHEETS[kind].sheet, row: rec._row as number | undefined, id: rec.display_id as string, field, message });

  for (const r of dataset.data.issues) {
    if (r.status === '已結案' && !r.closed_date) warn('issue', r, '結案日期', '狀態為已結案，但未填結案日期');
    if (r.closed_date && r.status !== '已結案') warn('issue', r, '結案日期', `已填結案日期，但狀態為「${r.status}」`);
  }
  for (const r of dataset.data.actions) {
    if (r.status === '已完成' && !r.completed_date) warn('action', r, '完成日期', '狀態為已完成，但未填完成日期');
  }
  for (const r of dataset.data.meetings) {
    if (r.body_stale) warn('meeting', r, '紀錄文件', '文件在核准後被修改，網站仍顯示上次核准的版本；請重新「預覽並核准文件」');
  }
  for (const r of dataset.data.rules) {
    if (r.body_stale) warn('rule', r, '內文文件', '文件在核准後被修改，網站仍顯示上次核准的版本；請重新「預覽並核准文件」');
  }

  return { ok: errors.length === 0, dataset: errors.length ? undefined : dataset, errors, warnings };
}

function withValue(message: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return message;
  const s = String(value);
  return `${message}（目前值：${s.length > 30 ? `${s.slice(0, 30)}…` : s}）`;
}
