// 在 validation 之前把可預期的寫法差異統一，減少委員因格式小差異造成 build 失敗。

import { normalizeId, parseRef } from './refs';
import { SHEETS } from './sheet-schema';
import type { EntityKind } from './refs';

/** 2026/9/22、2026.09.22、2026-9-22 → 2026-09-22；Date 物件 → 當地日期。無法辨識時原樣回傳。 */
export function normalizeDate(v: unknown, timeZone = 'Asia/Taipei'): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return formatDate(v, timeZone);
  const s = String(v).normalize('NFKC').trim();
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  return s;
}

export function formatDate(d: Date, timeZone = 'Asia/Taipei'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function normalizeTime(v: unknown, timeZone = 'Asia/Taipei'): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(v);
  }
  const s = String(v).normalize('NFKC').trim();
  const m = s.match(/^(\d{1,2})[:：](\d{2})(?::\d{2})?$/);
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : s;
}

export function normalizeBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return ['true', '是', 'y', 'yes', '1', 'v', '✓', '☑'].includes(s);
}

export function normalizeText(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r\n?/g, '\n').trim();
}

/** 依 sheet-schema 欄位型別正規化一筆 public record（已是英文 key）。 */
export function normalizeRecord(kind: EntityKind, rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rec };
  for (const col of SHEETS[kind].columns) {
    if (!(col.key in rec)) continue;
    const v = rec[col.key];
    switch (col.type) {
      case 'date':
        out[col.key] = normalizeDate(v);
        break;
      case 'time':
        out[col.key] = normalizeTime(v);
        break;
      case 'checkbox':
        out[col.key] = normalizeBool(v);
        break;
      case 'ref': {
        const r = parseRef(v);
        out[col.key] = r === null ? normalizeText(v) : r;
        break;
      }
      case 'auto':
        out[col.key] = col.key === 'display_id' ? (normalizeId(normalizeText(v)) ?? normalizeText(v)) : normalizeDate(v);
        break;
      default:
        // 文字欄被 Sheets 自動轉成日期或數字（例如輸入「10/2」）時，轉回文字，不讓 build 失敗
        if (v instanceof Date && !Number.isNaN(v.getTime())) out[col.key] = formatDate(v);
        else if (typeof v === 'string' || typeof v === 'number' || v === null || v === undefined) out[col.key] = normalizeText(v);
    }
  }
  return out;
}
