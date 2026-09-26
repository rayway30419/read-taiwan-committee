import { describe, expect, it } from 'vitest';
import { cleanExportedMarkdown, driveFileId } from '../src/core/doc-clean';

describe('driveFileId', () => {
  it('支援常見 Drive / Docs 網址', () => {
    expect(driveFileId('https://docs.google.com/document/d/1AbCdEfGhIjKlMn_op-Q/edit?usp=sharing')).toBe('1AbCdEfGhIjKlMn_op-Q');
    expect(driveFileId('https://drive.google.com/file/d/1AbCdEfGhIjKlMn/view')).toBe('1AbCdEfGhIjKlMn');
    expect(driveFileId('https://drive.google.com/open?id=1AbCdEfGhIjKlMn')).toBe('1AbCdEfGhIjKlMn');
    expect(driveFileId('https://docs.google.com/document/u/0/d/1AbCdEfGhIjKlMn/edit')).toBe('1AbCdEfGhIjKlMn');
  });
  it('非 Drive 網址回傳 null', () => {
    expect(driveFileId('https://example.com/d/1AbCdEfGhIjKlMn')).toBeNull();
    expect(driveFileId('')).toBeNull();
  });
});

describe('cleanExportedMarkdown', () => {
  it('去除圖片與 base64', () => {
    const md = '# 標題\n\n![][image1]\n\n內文 ![圖](https://x/y.png) 結束\n\n[image1]: <data:image/png;base64,iVBORw0KGgo=>\n';
    const out = cleanExportedMarkdown(md);
    expect(out).not.toMatch(/image1|base64|!\[/);
    expect(out).toContain('內文  結束');
  });
  it('移除 Docs 匯出的跳脫字元但保留表格', () => {
    expect(cleanExportedMarkdown('1\\. 第一點 \\- 說明\n\n| a \\| b | c |')).toBe('1. 第一點 - 說明\n\n| a \\| b | c |\n');
  });
});
