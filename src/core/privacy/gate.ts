// Privacy gate：sanitize 之後再掃一次，殘留任何高信心 PII 就讓匯出／build 失敗。
// 訊息只含前後文（match 以 *** 取代），不把個資寫進 log。

import type { EntityKind } from '../refs';
import { DATA_KEY, ENTITY_ORDER, labelOf, SHEETS } from '../sheet-schema';
import type { Problem } from '../validate';
import { detectPii } from './sanitize';
import type { PrivacyConfig } from './rules';

const SKIP_KEYS = new Set(['_internal_id', 'display_id', '_row', 'created_at', 'updated_at']);
const EXTRA_LABELS: Record<string, string> = { body_md: '文件內容', source_filename: '來源檔名' };

export function scanRecord(kind: EntityKind, rec: Record<string, unknown>, config: PrivacyConfig): Problem[] {
  const out: Problem[] = [];
  for (const [key, value] of Object.entries(rec)) {
    if (SKIP_KEYS.has(key) || typeof value !== 'string' || !value) continue;
    for (const f of detectPii(value, config)) {
      out.push({
        level: 'error',
        sheet: SHEETS[kind].sheet,
        row: typeof rec._row === 'number' ? rec._row : undefined,
        id: typeof rec.display_id === 'string' ? rec.display_id : undefined,
        field: EXTRA_LABELS[key] ?? labelOf(kind, key),
        message: `疑似${f.label}未遮蔽：「${f.context}」。請修改內容，或將公開資訊加入「網站設定 → 不遮蔽的公開資訊」`,
      });
    }
  }
  return out;
}

export function scanDataset(
  data: Partial<Record<(typeof DATA_KEY)[EntityKind], unknown[]>>,
  settings: Record<string, string>,
  config: PrivacyConfig,
): Problem[] {
  const out: Problem[] = [];
  for (const kind of ENTITY_ORDER) {
    for (const rec of data[DATA_KEY[kind]] ?? []) out.push(...scanRecord(kind, rec as Record<string, unknown>, config));
  }
  for (const [key, value] of Object.entries(settings)) {
    for (const f of detectPii(value, config)) {
      out.push({ level: 'error', sheet: '網站設定', field: key, message: `疑似${f.label}未遮蔽：「${f.context}」` });
    }
  }
  return out;
}
