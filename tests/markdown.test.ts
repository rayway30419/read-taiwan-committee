import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown';

const opts = { knownIds: new Set(['ISS-0001', 'ACT-20260922-01']), hrefFor: (id: string) => `/x/${id}/` };

describe('renderMarkdown', () => {
  it('strips scripts, event handlers, javascript: links and images', () => {
    const { html } = renderMarkdown(
      '<script>alert(1)</script>\n\n<a href="javascript:alert(1)" onclick="x()">x</a>\n\n![img](https://evil/x.png)\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil"></iframe>',
      opts,
    );
    expect(html).not.toMatch(/<script|onclick|onerror|javascript:|<img|<iframe/i);
  });

  it('autolinks known ids including legacy ISS-001 format, not unknown ones', () => {
    const { html } = renderMarkdown('見 ISS-001 與 ISS-0099，以及 `ACT-20260922-01`\n\n| 編號 | 事項 |\n|---|---|\n| ACT-20260922-01 | 報備 |', opts);
    expect(html).toContain('<a href="/x/ISS-0001/" class="id-link">ISS-001</a>');
    expect(html).not.toContain('/x/ISS-0099/');
    expect(html).toContain('<code><a href="/x/ACT-20260922-01/" class="id-link">ACT-20260922-01</a></code>');
    expect(html).toContain('<td><a href="/x/ACT-20260922-01/"');
  });

  it('builds TOC and wraps tables in a focusable region', () => {
    const { html, toc } = renderMarkdown('# 標題\n\n## 一、出席\n\n### 1.1 列席\n\n#### 細項\n\n| a |\n|---|\n| b |', opts);
    expect(toc).toEqual([
      { id: 'section-2', depth: 2, text: '一、出席' },
      { id: 'section-3', depth: 3, text: '1.1 列席' },
    ]);
    expect(html).toContain('<h2 id="section-2">');
    expect(html).toMatch(/<div class="table-scroll" tabindex="0" role="region" aria-label="表格 1（可左右捲動）"><table>/);
  });

  it('external links open safely', () => {
    expect(renderMarkdown('[a](https://example.com)', opts).html).toContain('rel="noopener noreferrer" target="_blank"');
  });
});
