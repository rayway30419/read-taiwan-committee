// 編號配發 sweep：補 _internal_id（UUID）與 display_id、修正整列複製造成的重複、補建立／更新日期。
// 由 installable onEdit 與每次檢查／匯出前執行；規則在 src/core/ids.ts（有單元測試）。
import { reconcileIds, type IdRow } from '../../src/core/ids';
import { normalizeDate, normalizeText } from '../../src/core/normalize';
import { parseRef, type EntityKind } from '../../src/core/refs';
import { ENTITY_ORDER, SHEETS } from '../../src/core/sheet-schema';
import { addReservedIds, reservedIds } from './props';
import { headerMap, isSystemColumn, sheetOf, todayStr } from './sheet';

const REASON: Record<string, string> = {
  'duplicate-internal': '整列複製造成內部編號重複，已為下方列重新配發',
  'duplicate-display': '編號重複，已為下方列重新配發',
  'missing-internal': '補上內部編號',
};

export interface SweepResult {
  assigned: number;
  notes: string[];
}

function meetingDates(): Map<string, string> {
  const out = new Map<string, string>();
  const sheet = sheetOf('meeting');
  if (!sheet || sheet.getLastRow() < 2) return out;
  const map = headerMap(sheet, 'meeting');
  const idCol = map.get('display_id');
  const dateCol = map.get('date');
  if (!idCol || !dateCol) return out;
  for (const r of sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues()) {
    const id = normalizeText(r[idCol - 1]);
    if (id) out.set(id, normalizeDate(r[dateCol - 1]));
  }
  return out;
}

export function sweepKind(kind: EntityKind, mtgDates?: Map<string, string>): SweepResult {
  const def = SHEETS[kind];
  const sheet = sheetOf(kind);
  const result: SweepResult = { assigned: 0, notes: [] };
  if (!sheet || sheet.getLastRow() < 2) return result;
  const map = headerMap(sheet, kind);
  const col = (k: string) => map.get(k);
  if (!col('display_id') || !col('_internal_id')) {
    result.notes.push(`${def.sheet}：缺少「編號」或「_internal_id」欄，請執行「初始化／修復試算表」`);
    return result;
  }
  const n = sheet.getLastRow() - 1;
  const width = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, n, width).getValues();
  const contentCols = def.columns.filter((c) => !isSystemColumn(c) && c.type !== 'checkbox' && col(c.key)).map((c) => col(c.key)!);
  const today = todayStr();
  const dates = kind === 'decision' ? (mtgDates ?? meetingDates()) : undefined;

  const rows: IdRow[] = values.map((r, i) => {
    const get = (k: string) => (col(k) ? r[col(k)! - 1] : '');
    let idDate = def.idDateKey ? normalizeDate(get(def.idDateKey)) : '';
    if (kind === 'decision' && !idDate) idDate = dates?.get(parseRef(get('meeting_id')) ?? '') ?? '';
    return {
      row: i + 2,
      internalId: normalizeText(get('_internal_id')),
      displayId: normalizeText(get('display_id')),
      idDate: /^\d{4}-\d{2}-\d{2}$/.test(idDate) ? idDate : '',
      hasContent: contentCols.some((c) => normalizeText(r[c - 1]) !== ''),
    };
  });

  const updates = reconcileIds(kind, rows, { newUuid: () => Utilities.getUuid(), today, reserved: reservedIds(kind) });
  const newIds: string[] = [];
  for (const u of updates) {
    if (u.internalId) sheet.getRange(u.row, col('_internal_id')!).setValue(u.internalId);
    if (u.displayId) {
      sheet.getRange(u.row, col('display_id')!).setValue(u.displayId);
      newIds.push(u.displayId);
    }
    result.assigned++;
    if (REASON[u.reason]) result.notes.push(`${def.sheet} 第 ${u.row} 列：${REASON[u.reason]}${u.displayId ? `（${u.displayId}）` : ''}`);
  }

  // 建立／更新日期：空白時補上
  const now = new Date().toISOString();
  rows.forEach((r, i) => {
    if (!r.hasContent) return;
    const row = values[i]!;
    for (const [k, v] of [
      ['created_at', today],
      ['updated_at', today],
      ['_created_at', now],
      ['_updated_at', now],
    ] as const) {
      const c = col(k);
      if (c && normalizeText(row[c - 1]) === '') sheet.getRange(r.row, c).setValue(v);
    }
  });

  addReservedIds(kind, [...rows.map((r) => r.displayId).filter(Boolean), ...newIds]);
  return result;
}

export function sweepAll(): SweepResult {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const total: SweepResult = { assigned: 0, notes: [] };
    const dates = meetingDates();
    // 會議先配發，決議才能取得會議日期
    for (const kind of ['meeting', ...ENTITY_ORDER.filter((k) => k !== 'meeting')] as EntityKind[]) {
      const r = sweepKind(kind, kind === 'decision' ? meetingDates() : dates);
      total.assigned += r.assigned;
      total.notes.push(...r.notes);
    }
    SpreadsheetApp.flush();
    return total;
  } finally {
    lock.releaseLock();
  }
}

/** installable onEdit：更新該列「更新日期」並配發編號 */
export function handleEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  const sheet = e.range.getSheet();
  const kind = (ENTITY_ORDER as EntityKind[]).find((k) => SHEETS[k].sheet === sheet.getName());
  if (!kind) return;
  const first = e.range.getRow();
  const last = e.range.getLastRow();
  if (last < 2) return;
  const map = headerMap(sheet, kind);
  const editedKeys = new Set<string>();
  for (let c = e.range.getColumn(); c <= e.range.getLastColumn(); c++) {
    for (const [k, idx] of map) if (idx === c) editedKeys.add(k);
  }
  const systemOnly = [...editedKeys].every((k) => {
    const def = SHEETS[kind].columns.find((c) => c.key === k);
    return def ? isSystemColumn(def) : false;
  });
  if (editedKeys.size && systemOnly) return;

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return; // 下次檢查／匯出時會補上
  try {
    const today = todayStr();
    const now = new Date().toISOString();
    const updCol = map.get('updated_at');
    const updTech = map.get('_updated_at');
    const from = Math.max(2, first);
    const count = last - from + 1;
    if (count > 0 && count <= 500) {
      if (updCol) sheet.getRange(from, updCol, count, 1).setValues(Array.from({ length: count }, () => [today]));
      if (updTech) sheet.getRange(from, updTech, count, 1).setValues(Array.from({ length: count }, () => [now]));
    }
    sweepKind(kind);
    // 清空整列時不應留下日期
    if (count > 0 && count <= 500) clearEmptyRows(sheet, kind, from, count);
  } finally {
    lock.releaseLock();
  }
}

function clearEmptyRows(sheet: GoogleAppsScript.Spreadsheet.Sheet, kind: EntityKind, from: number, count: number) {
  const map = headerMap(sheet, kind);
  const values = sheet.getRange(from, 1, count, sheet.getLastColumn()).getValues();
  const contentCols = SHEETS[kind].columns.filter((c) => !isSystemColumn(c) && c.type !== 'checkbox' && map.get(c.key)).map((c) => map.get(c.key)!);
  values.forEach((r, i) => {
    if (contentCols.some((c) => normalizeText(r[c - 1]) !== '')) return;
    if (normalizeText(r[(map.get('display_id') ?? 1) - 1])) return; // 已配發編號的列保留（編號不可回收）
    for (const k of ['created_at', 'updated_at', '_created_at', '_updated_at']) {
      const c = map.get(k);
      if (c) sheet.getRange(from + i, c).clearContent();
    }
  });
}
