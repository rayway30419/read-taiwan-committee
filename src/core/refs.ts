// display_id 格式、解析與正規化。
// 會議紀錄內常見舊寫法 `ISS-001`，網站統一成 `ISS-0001`。

export type EntityKind = 'issue' | 'action' | 'decision' | 'meeting' | 'rule' | 'announcement';

export const ID_PREFIX: Record<EntityKind, string> = {
  issue: 'ISS',
  action: 'ACT',
  decision: 'DEC',
  meeting: 'MTG',
  rule: 'RULE',
  announcement: 'ANN',
};

export const ID_PREFIXES = Object.values(ID_PREFIX);

/** 符合任何實體 display_id 的 pattern（全域）。 */
export const ANY_ID_RE =
  /\b(?:ISS-\d{1,4}|(?:ACT|DEC|ANN)-\d{8}-\d{1,3}|MTG-\d{8}(?:-\d{1,2})?|RULE-\d{1,3})\b/gi;

/** 將使用者或文件內的 ID 寫法正規化：大寫、ISS/RULE 補零。無法辨識時回傳 null。 */
export function normalizeId(raw: string): string | null {
  const s = raw.normalize('NFKC').trim().toUpperCase();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^ISS-?(\d{1,4})$/))) return `ISS-${m[1]!.padStart(4, '0')}`;
  if ((m = s.match(/^RULE-?(\d{1,3})$/))) return `RULE-${m[1]!.padStart(3, '0')}`;
  if ((m = s.match(/^(ACT|DEC|ANN)-?(\d{8})-(\d{1,3})$/))) return `${m[1]}-${m[2]}-${m[3]!.padStart(2, '0')}`;
  if ((m = s.match(/^MTG-?(\d{8})(?:-(\d{1,2}))?$/))) return m[2] ? `MTG-${m[1]}-${m[2]}` : `MTG-${m[1]}`;
  return null;
}

/**
 * 從 dropdown 值（例如「ISS-0002 物業服務與後續招標」）或純 ID 取出正規化 ID。
 * 空值回傳 ''；無法辨識回傳 null（交給 validation 報錯）。
 */
export function parseRef(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const head = s.split(/[\s｜|]/)[0] ?? '';
  return normalizeId(head);
}

export function kindOfId(id: string): EntityKind | null {
  const prefix = id.split('-')[0];
  const found = (Object.entries(ID_PREFIX) as [EntityKind, string][]).find(([, p]) => p === prefix);
  return found ? found[0] : null;
}

/** 搜尋用別名：`ISS-0012` → `ISS-0012 ISS-012 ISS0012 ISS12`。 */
export function idAliases(id: string): string[] {
  const out = new Set([id, id.replace(/-/g, '')]);
  const m = id.match(/^(ISS|RULE)-(\d+)$/);
  if (m) {
    const n = String(Number(m[2]));
    out.add(`${m[1]}-${n.padStart(3, '0')}`);
    out.add(`${m[1]}-${n}`);
    out.add(`${m[1]}${n}`);
  }
  return [...out];
}

/** 從文字中找出所有提及的 ID（正規化、去重、保留出現順序）。 */
export function extractIds(text: string, kind?: EntityKind): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(ANY_ID_RE)) {
    const id = normalizeId(m[0]);
    if (!id) continue;
    if (kind && kindOfId(id) !== kind) continue;
    seen.add(id);
  }
  return [...seen];
}
