// 從 Sheet 讀出匯出所需的設定：選項、網站設定、遮蔽詞庫。
import { DEFAULT_CATEGORIES, DEFAULT_OWNER_TYPES } from '../../src/core/enums';
import { normalizeText } from '../../src/core/normalize';
import { privacyConfigFrom } from '../../src/core/privacy/config';
import type { PrivacyConfig } from '../../src/core/privacy/rules';
import type { DictionaryTerm } from '../../src/core/privacy/sanitize';
import { DICTIONARY_SHEET, OPTIONS_SHEET, SETTINGS_SHEET } from '../../src/core/sheet-schema';
import { ss } from './sheet';

function values(name: string): unknown[][] {
  const sheet = ss().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(1, sheet.getLastColumn())).getValues();
}

export function readOptions(): { categories: string[]; owner_types: string[] } {
  const rows = values(OPTIONS_SHEET);
  const col = (i: number) => [...new Set(rows.map((r) => normalizeText(r[i])).filter(Boolean))];
  const categories = col(0);
  const owner_types = col(1);
  return {
    categories: categories.length ? categories : DEFAULT_CATEGORIES,
    owner_types: owner_types.length ? owner_types : DEFAULT_OWNER_TYPES,
  };
}

/** 「網站設定」：A 欄 key、B 欄說明、C 欄值 */
export function readSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of values(SETTINGS_SHEET)) {
    const key = normalizeText(r[0]);
    if (key) out[key] = normalizeText(r[2]);
  }
  return out;
}

/** 「遮蔽詞庫」：A 欄詞、B 欄遮蔽為（空白 = [姓名已遮蔽]）、C 欄備註。永不匯出。 */
export function readDictionary(): DictionaryTerm[] {
  return values(DICTIONARY_SHEET)
    .map((r) => ({ term: normalizeText(r[0]), mask: normalizeText(r[1]) || undefined }))
    .filter((t) => t.term);
}

export interface PrivacyContext {
  settings: Record<string, string>;
  config: PrivacyConfig;
  dictionary: DictionaryTerm[];
}

export function privacyContext(): PrivacyContext {
  const settings = readSettings();
  return { settings, config: privacyConfigFrom(settings), dictionary: readDictionary() };
}
