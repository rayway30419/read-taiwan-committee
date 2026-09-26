// Pagefind 對繁體中文的斷詞不穩定：同一個詞有時切成單字（電 梯）、有時成詞（公共），
// 查詢「電梯」又被當成一個詞，導致漏找或亂找。做法：
//  - 建置時：每個詳細頁附一段「中文逐字以空白分隔」的隱藏文字（spacedText），索引內一定有單字 token
//  - 查詢時：中文改寫成逐字 phrase（"電 梯"），只命中連續出現的字 = 子字串搜尋語意

import { normalizeId } from '../core/refs';

const CJK = /[㐀-䶿一-鿿豈-﫿]+/g;

export function spacedText(texts: (string | null | undefined)[]): string {
  return texts
    .filter(Boolean)
    .join('\n')
    .replace(CJK, (run) => ` ${[...run].join(' ')} `)
    .replace(/\s+/g, ' ')
    .trim();
}

/** excerpt 落在逐字文字時（例如「電 梯 裝 潢」）改顯示摘要 */
export const SPACED_EXCERPT_RE = /(?:[㐀-鿿](?:<\/?mark>)* (?:<\/?mark>)*){4,}/;

export function pagefindQuery(input: string): string {
  const q = input.normalize('NFKC').replace(/["“”]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return '';
  const id = normalizeId(q);
  if (id) return id;
  return q.replace(CJK, (run) => (run.length > 1 ? ` "${[...run].join(' ')}" ` : ` ${run} `)).replace(/\s+/g, ' ').trim();
}
