// 讀寫實體分頁：依「標題列文字」找欄位，委員調整欄位順序不影響程式。
import type { SheetRow } from '../../src/core/export';
import type { EntityKind } from '../../src/core/refs';
import { SHEETS, type Column } from '../../src/core/sheet-schema';

export const ss = () => SpreadsheetApp.getActiveSpreadsheet();
export const tz = () => ss().getSpreadsheetTimeZone() || 'Asia/Taipei';
export const todayStr = () => Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');

export function sheetOf(kind: EntityKind): GoogleAppsScript.Spreadsheet.Sheet | null {
  return ss().getSheetByName(SHEETS[kind].sheet);
}

export function kindOfSheet(name: string): EntityKind | null {
  const hit = (Object.keys(SHEETS) as EntityKind[]).find((k) => SHEETS[k].sheet === name);
  return hit ?? null;
}

/** key → 1-based column index */
export function headerMap(sheet: GoogleAppsScript.Spreadsheet.Sheet, kind: EntityKind): Map<string, number> {
  const lastCol = sheet.getLastColumn();
  const map = new Map<string, number>();
  if (lastCol === 0) return map;
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];
  const byLabel = new Map(SHEETS[kind].columns.map((c) => [c.label, c.key]));
  header.forEach((h, i) => {
    const key = byLabel.get(String(h).trim());
    if (key && !map.has(key)) map.set(key, i + 1);
  });
  return map;
}

export function readRows(kind: EntityKind): SheetRow[] {
  const sheet = sheetOf(kind);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const map = headerMap(sheet, kind);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values.map((row, i) => {
    const rec: SheetRow = { _row: i + 2 };
    for (const [key, col] of map) rec[key] = row[col - 1];
    return rec;
  });
}

export function writeCell(sheet: GoogleAppsScript.Spreadsheet.Sheet, row: number, col: number | undefined, value: unknown) {
  if (!col) return;
  sheet.getRange(row, col).setValue(value);
}

export function columnLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function isSystemColumn(c: Column) {
  return c.type === 'auto' || c.type === 'hidden';
}
