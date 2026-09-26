// 「初始化／修復試算表」：非破壞性。只建立缺少的分頁與欄位，重新套用下拉選單、格式與保護；不刪除、不覆寫委員資料。
import { DEFAULT_CATEGORIES, DEFAULT_OWNER_TYPES } from '../../src/core/enums';
import type { EntityKind } from '../../src/core/refs';
import { SETTINGS } from '../../src/core/settings';
import {
  DICTIONARY_SHEET,
  ENTITY_ORDER,
  GUIDE_SHEET,
  LOG_SHEET,
  OPTION_LISTS,
  OPTIONS_SHEET,
  SETTINGS_SHEET,
  SHEETS,
  type Column,
} from '../../src/core/sheet-schema';
import { LOG_HEADERS } from './log';
import { columnLetter, headerMap, isSystemColumn, ss } from './sheet';

export const REFS_SHEET = '_refs';
const PROTECT_DESC = '網站系統欄位（由程式自動填寫，請勿修改）';
const REF_KINDS: EntityKind[] = ['issue', 'meeting'];
const MAX_ROWS = 1000;

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

function ensureSheet(name: string, index?: number): { sheet: Sheet; created: boolean } {
  const existing = ss().getSheetByName(name);
  if (existing) return { sheet: existing, created: false };
  const sheet = index === undefined ? ss().insertSheet(name) : ss().insertSheet(name, index);
  return { sheet, created: true };
}

function ensureRows(sheet: Sheet, rows: number) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
}

/** 缺少的欄位加在最右邊；已存在的欄位不移動 */
function ensureColumns(sheet: Sheet, kind: EntityKind): string[] {
  const added: string[] = [];
  const map = headerMap(sheet, kind);
  let next = sheet.getLastColumn() + 1;
  for (const c of SHEETS[kind].columns) {
    if (map.has(c.key)) continue;
    if (sheet.getMaxColumns() < next) sheet.insertColumnsAfter(sheet.getMaxColumns(), next - sheet.getMaxColumns());
    sheet.getRange(1, next).setValue(c.label);
    added.push(c.label);
    next++;
  }
  return added;
}

function refRange(kind: EntityKind): GoogleAppsScript.Spreadsheet.Range {
  const refs = ss().getSheetByName(REFS_SHEET)!;
  const col = REF_KINDS.indexOf(kind) + 1;
  return refs.getRange(2, col, MAX_ROWS, 1);
}

function applyColumn(sheet: Sheet, c: Column, col: number) {
  const body = sheet.getRange(2, col, MAX_ROWS - 1, 1);
  const header = sheet.getRange(1, col);
  if (c.width) sheet.setColumnWidth(col, c.width);
  const help = [c.required ? '必填' : '', c.note ?? ''].filter(Boolean).join('。');
  header.setNote(help || null);
  header.setFontWeight('bold').setBackground(c.required ? '#dbe7f3' : '#eef2f6');
  let rule: GoogleAppsScript.Spreadsheet.DataValidation | null = null;
  const dv = () => SpreadsheetApp.newDataValidation();
  switch (c.type) {
    case 'enum':
      rule = dv().requireValueInList([...(c.options ?? [])], true).setAllowInvalid(false).setHelpText(`請從選單選擇：${(c.options ?? []).join('、')}`).build();
      break;
    case 'option': {
      const idx = OPTION_LISTS.findIndex((o) => o.key === c.optionList) + 1;
      const opt = ss().getSheetByName(OPTIONS_SHEET)!.getRange(2, idx, MAX_ROWS, 1);
      rule = dv().requireValueInRange(opt, true).setAllowInvalid(false).setHelpText('選項可在「選項」分頁新增').build();
      break;
    }
    case 'ref':
      rule = dv().requireValueInRange(refRange(c.ref!), true).setAllowInvalid(true).setHelpText(`從選單選擇${SHEETS[c.ref!].noun}，或輸入編號`).build();
      break;
    case 'checkbox':
      rule = dv().requireCheckbox().build();
      break;
    case 'date':
      rule = dv().requireDate().setAllowInvalid(false).setHelpText('請輸入日期，例如 2026/10/12').build();
      body.setNumberFormat('yyyy-mm-dd');
      break;
    case 'time':
      body.setNumberFormat('@'); // 以文字保存（例如 19:30），避免時區換算
      break;
    case 'url':
      rule = dv().requireTextIsUrl().setAllowInvalid(false).setHelpText('請貼上完整網址（https://…）').build();
      break;
    case 'text':
      body.setNumberFormat('@'); // 避免「10/2」被自動轉成日期
      break;
    case 'longtext':
      body.setNumberFormat('@').setWrap(true);
      break;
    case 'auto':
      body.setBackground('#f3f4f6').setFontColor('#4b5563');
      if (c.key !== 'display_id' && c.key !== 'doc_approval') body.setNumberFormat('yyyy-mm-dd');
      break;
  }
  if (c.type === 'checkbox') body.insertCheckboxes();
  else if (!isSystemColumn(c)) body.setDataValidation(rule);
  if (c.type === 'hidden') sheet.hideColumns(col);
}

function protect(range: GoogleAppsScript.Spreadsheet.Range) {
  // warning-only：手動修改時跳出警告；程式（由任何委員執行選單）仍可寫入
  const p = range.protect().setDescription(PROTECT_DESC);
  p.setWarningOnly(true);
}

function clearOwnProtections(sheet: Sheet) {
  for (const p of sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)) if (p.getDescription() === PROTECT_DESC) p.remove();
  for (const p of sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)) if (p.getDescription() === PROTECT_DESC) p.remove();
}

function setupEntity(kind: EntityKind, index: number): string[] {
  const def = SHEETS[kind];
  const { sheet, created } = ensureSheet(def.sheet, index);
  ensureRows(sheet, MAX_ROWS);
  const added = ensureColumns(sheet, kind);
  sheet.setFrozenRows(1);
  const map = headerMap(sheet, kind);
  clearOwnProtections(sheet);
  protect(sheet.getRange(1, 1, 1, sheet.getLastColumn()));
  for (const c of def.columns) {
    const col = map.get(c.key)!;
    applyColumn(sheet, c, col);
    if (isSystemColumn(c)) protect(sheet.getRange(2, col, sheet.getMaxRows() - 1, 1));
  }
  const idCol = map.get('display_id');
  if (idCol) sheet.setFrozenColumns(Math.min(idCol + 1, 2));
  applyConditionalFormats(sheet, kind, map);
  return created ? [`建立分頁「${def.sheet}」`] : added.length ? [`「${def.sheet}」新增欄位：${added.join('、')}`] : [];
}

function applyConditionalFormats(sheet: Sheet, kind: EntityKind, map: Map<string, number>) {
  const rules: GoogleAppsScript.Spreadsheet.ConditionalFormatRule[] = [];
  const status = map.get('status');
  if (status) {
    const r = sheet.getRange(2, status, MAX_ROWS - 1, 1);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('受阻').setBackground('#f8d7d3').setRanges([r]).build());
    for (const done of ['已結案', '已完成', '已確認', '已生效']) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(done).setBackground('#d8efe0').setRanges([r]).build());
    }
  }
  const due = map.get(kind === 'action' ? 'due_date' : 'target_date');
  if (status && due && (kind === 'action' || kind === 'issue')) {
    const L = columnLetter(due);
    const S = columnLetter(status);
    const done = kind === 'action' ? '"已完成","已取消"' : '"已結案"';
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=AND($${L}2<>"",$${L}2<TODAY(),ISNA(MATCH($${S}2,{${done}},0)))`)
        .setFontColor('#a3261b')
        .setBold(true)
        .setRanges([sheet.getRange(2, due, MAX_ROWS - 1, 1)])
        .build(),
    );
  }
  const approval = map.get('doc_approval');
  if (approval) {
    rules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextStartsWith('⚠')
        .setBackground('#fff1c2')
        .setRanges([sheet.getRange(2, approval, MAX_ROWS - 1, 1)])
        .build(),
    );
  }
  sheet.setConditionalFormatRules(rules);
}

function setupRefs() {
  const { sheet } = ensureSheet(REFS_SHEET);
  ensureRows(sheet, MAX_ROWS + 1);
  REF_KINDS.forEach((kind, i) => {
    const src = ss().getSheetByName(SHEETS[kind].sheet)!;
    const map = headerMap(src, kind);
    const idL = columnLetter(map.get('display_id')!);
    const tL = columnLetter(map.get(SHEETS[kind].titleKey)!);
    const n = `'${SHEETS[kind].sheet}'`;
    sheet.getRange(1, i + 1).setValue(SHEETS[kind].noun);
    sheet.getRange(2, i + 1).setFormula(`=IFERROR(FILTER(${n}!${idL}2:${idL}&" "&${n}!${tL}2:${tL},${n}!${idL}2:${idL}<>""),"")`);
  });
  clearOwnProtections(sheet);
  sheet.protect().setDescription(PROTECT_DESC).setWarningOnly(true);
  sheet.hideSheet();
}

function setupOptions(): string[] {
  const { sheet, created } = ensureSheet(OPTIONS_SHEET);
  if (created) {
    sheet.getRange(1, 1, 1, OPTION_LISTS.length).setValues([OPTION_LISTS.map((o) => o.label)]).setFontWeight('bold');
    const n = Math.max(DEFAULT_CATEGORIES.length, DEFAULT_OWNER_TYPES.length);
    const rows = Array.from({ length: n }, (_, i) => [DEFAULT_CATEGORIES[i] ?? '', DEFAULT_OWNER_TYPES[i] ?? '']);
    sheet.getRange(2, 1, n, 2).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1).setNote('分類：議題的「分類」下拉選單。新增後即可選用；改名會讓既有資料對不上，請同時修改議題。');
    sheet.getRange(1, 2).setNote('負責單位：待辦的「負責單位」下拉選單。');
  }
  return created ? ['建立分頁「選項」'] : [];
}

function setupSettings(): string[] {
  const { sheet, created } = ensureSheet(SETTINGS_SHEET);
  if (created) {
    sheet.getRange(1, 1, 1, 3).setValues([['key', '項目', '內容']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140).setColumnWidth(2, 260).setColumnWidth(3, 420);
  }
  const existing = new Set(
    sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map((r) => String(r[0]).trim()) : [],
  );
  const missing = SETTINGS.filter((s) => !existing.has(s.key));
  if (missing.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing.map((s) => [s.key, s.label, s.default]));
  }
  sheet.hideColumns(1);
  sheet.getRange(2, 3, Math.max(1, sheet.getLastRow() - 1), 1).setWrap(true).setNumberFormat('@');
  clearOwnProtections(sheet);
  protect(sheet.getRange(1, 1, sheet.getMaxRows(), 2));
  return created ? ['建立分頁「網站設定」'] : missing.length ? [`「網站設定」新增項目：${missing.map((m) => m.label).join('、')}`] : [];
}

function setupDictionary(): string[] {
  const { sheet, created } = ensureSheet(DICTIONARY_SHEET);
  if (created) {
    sheet.getRange(1, 1, 1, 3).setValues([['要遮蔽的詞（姓名、公司人員等）', '遮蔽為（空白 = [姓名已遮蔽]）', '備註（不會公開）']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 240).setColumnWidth(2, 220).setColumnWidth(3, 300);
    sheet.setTabColor('#a3261b');
    sheet.getRange(1, 1).setNote('此分頁永遠不會匯出到網站。每列一個詞，至少 2 個字。常見寫法（例如「王小明」「王先生」）請分別列出。');
  }
  return created ? ['建立分頁「遮蔽詞庫」'] : [];
}

function setupLog() {
  const { sheet, created } = ensureSheet(LOG_SHEET);
  if (created) {
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150).setColumnWidth(5, 600);
  }
  sheet.getRange(2, 5, Math.max(1, sheet.getMaxRows() - 1), 1).setWrap(true);
  clearOwnProtections(sheet);
  sheet.protect().setDescription(PROTECT_DESC).setWarningOnly(true);
}

const GUIDE = [
  ['管委會網站：使用說明'],
  [''],
  ['日常更新'],
  ['1. 在「議題」「待辦」「決議」「會議」「管理辦法」「公告」分頁新增或修改一列。編號、建立日期、更新日期會自動填寫（灰色欄位，請勿修改）。'],
  ['2. 勾選「公開」的資料才會出現在網站。財務等敏感議題可把「公開範圍」設為「內容遮蔽」，網站只顯示標題與狀態。'],
  ['3. 「相關議題」「來源會議」請從下拉選單選擇。'],
  ['4. 完成後點上方選單「管委會網站 → 發布網站」。約 3–5 分鐘後網站更新；結果寫在「發布紀錄」分頁。'],
  [''],
  ['會議紀錄與管理辦法全文'],
  ['1. 把 Google 文件或 Word 檔放在 Drive（可維持私人，不需公開）。'],
  ['2. 把連結貼到「紀錄文件」或「內文文件」欄。'],
  ['3. 點選該列 → 「管委會網站 → 預覽並核准文件」，確認黃色遮蔽處與全文內容後按「核准」。'],
  ['4. 文件之後再修改，網站仍顯示上次核准的版本，「文件核准狀態」會出現 ⚠，重新核准即可。'],
  [''],
  ['個資保護'],
  ['電話、Email、身分證、車牌、帳號、戶別、金額會自動遮蔽。人名無法自動辨識，請加入「遮蔽詞庫」分頁（此分頁永不公開）。'],
  ['若發布時出現「疑似個資未遮蔽」，請依「發布紀錄」指出的分頁與列修改內容。'],
  [''],
  ['出問題時'],
  ['先執行「管委會網站 → 檢查資料」，依訊息修正。不小心刪掉欄位或下拉選單壞掉，執行「初始化／修復試算表」即可復原（不會刪除資料）。'],
  ['發布失敗時網站會保持上一版，不會壞掉。'],
];

function setupGuide(): string[] {
  const { sheet, created } = ensureSheet(GUIDE_SHEET, 0);
  sheet.clear();
  sheet.getRange(1, 1, GUIDE.length, 1).setValues(GUIDE).setWrap(true).setVerticalAlignment('top');
  sheet.setColumnWidth(1, 900);
  sheet.getRange(1, 1).setFontSize(16).setFontWeight('bold');
  for (const r of [3, 9, 15, 19]) sheet.getRange(r, 1).setFontWeight('bold').setBackground('#eef2f6');
  return created ? ['建立分頁「使用說明」'] : [];
}

export function setupSpreadsheet(): string[] {
  const book = ss();
  book.setSpreadsheetTimeZone('Asia/Taipei');
  const notes: string[] = [];
  notes.push(...setupGuide());
  notes.push(...setupOptions());
  // 實體分頁先建立（_refs 公式需要欄位位置），再套用驗證
  ENTITY_ORDER.forEach((kind, i) => {
    const def = SHEETS[kind];
    const { sheet, created } = ensureSheet(def.sheet, i + 1);
    if (created) notes.push(`建立分頁「${def.sheet}」`);
    const added = ensureColumns(sheet, kind);
    if (!created && added.length) notes.push(`「${def.sheet}」新增欄位：${added.join('、')}`);
  });
  setupRefs();
  ENTITY_ORDER.forEach((kind, i) => setupEntity(kind, i + 1));
  notes.push(...setupSettings());
  notes.push(...setupDictionary());
  setupLog();
  // 刪除新試算表預設的空白「工作表1」
  for (const name of ['工作表1', 'Sheet1']) {
    const s = book.getSheetByName(name);
    if (s && s.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(s);
  }
  return notes;
}
