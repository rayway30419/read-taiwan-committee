// 會議紀錄／管理辦法全文 → 安全 HTML。
// - GFM 表格、清單、引言
// - rehype-sanitize（預設 GitHub schema）：移除 script、事件屬性、javascript: 連結
// - 去除圖片（文件內圖片不重現，避免未審核影像外流）
// - heading 產生穩定 id（section-N）與 TOC
// - 內文出現的 ID（含舊寫法 ISS-001）自動連到站內頁面
// - 表格包在可鍵盤捲動的 region 內

import type { Element, ElementContent, Root, Text } from 'hast';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import { ANY_ID_RE, normalizeId } from '../core/refs';

export interface TocItem {
  id: string;
  depth: number;
  text: string;
}

export interface RenderOptions {
  /** 站內存在的 ID；不存在的不連結 */
  knownIds: Set<string>;
  /** display_id → 站內網址 */
  hrefFor: (id: string) => string;
}

export interface Rendered {
  html: string;
  toc: TocItem[];
}

// sanitize 在自訂 plugin 之前執行；之後加上的 id／role／tabIndex 由本程式產生，不來自文件
const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => t !== 'img' && t !== 'picture' && t !== 'source'),
};

const textOf = (n: ElementContent | Root): string =>
  n.type === 'text' ? n.value : 'children' in n ? n.children.map((c) => textOf(c as ElementContent)).join('') : '';

function linkIds(opts: RenderOptions) {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const p = parent as Element;
      if (p.type === 'element' && (p.tagName === 'a' || p.tagName === 'pre')) return;
      const value = node.value;
      const parts: ElementContent[] = [];
      let last = 0;
      for (const m of value.matchAll(new RegExp(ANY_ID_RE.source, 'gi'))) {
        const id = normalizeId(m[0]);
        if (!id || !opts.knownIds.has(id)) continue;
        const i = m.index ?? 0;
        if (i > last) parts.push({ type: 'text', value: value.slice(last, i) });
        parts.push({
          type: 'element',
          tagName: 'a',
          properties: { href: opts.hrefFor(id), className: ['id-link'] },
          children: [{ type: 'text', value: m[0] }],
        });
        last = i + m[0].length;
      }
      if (!parts.length) return;
      if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
      p.children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}

function structure(toc: TocItem[]) {
  return (tree: Root) => {
    let n = 0;
    let tables = 0;
    visit(tree, 'element', (node: Element, index, parent) => {
      if (/^h[1-4]$/.test(node.tagName)) {
        const id = `section-${++n}`;
        node.properties = { ...node.properties, id };
        const depth = Number(node.tagName[1]);
        if (depth >= 2 && depth <= 3) toc.push({ id, depth, text: textOf(node).trim() });
      }
      if (node.tagName === 'table' && parent && index !== undefined) {
        const label = `表格 ${++tables}（可左右捲動）`;
        (parent as Element).children[index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-scroll'], tabIndex: 0, role: 'region', ariaLabel: label },
          children: [node],
        };
        return SKIP;
      }
      if (node.tagName === 'a') {
        const href = String(node.properties?.href ?? '');
        if (/^https?:/i.test(href)) node.properties = { ...node.properties, rel: ['noopener', 'noreferrer'], target: '_blank' };
      }
    });
  };
}

export function renderMarkdown(md: string, opts: RenderOptions): Rendered {
  const toc: TocItem[] = [];
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(() => linkIds(opts))
    .use(() => structure(toc))
    .use(rehypeStringify)
    .processSync(md);
  return { html: String(file), toc };
}
