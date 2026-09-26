// 對話框與訊息。所有顯示給委員的文字都在這裡經過 HTML escape。

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `<style>
  body{font:14px/1.6 system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#1d2733;margin:0;padding:4px 8px}
  h2{font-size:16px;margin:8px 0}
  .ok{color:#1d6b3a}.err{color:#a3261b}.warn{color:#8a5a00}
  ul{padding-left:20px;margin:6px 0}li{margin:3px 0}
  pre{white-space:pre-wrap;word-break:break-word;background:#f6f8fa;border:1px solid #d5dbe1;border-radius:6px;padding:10px;max-height:340px;overflow:auto;font:13px/1.6 ui-monospace,monospace}
  mark{background:#ffe08a;color:#000;padding:0 2px;border-radius:2px}
  .box{border:1px solid #d5dbe1;border-radius:6px;padding:8px 10px;margin:8px 0;background:#fbfcfd}
  button{font:inherit;padding:6px 16px;border-radius:6px;border:1px solid #1f4e79;background:#1f4e79;color:#fff;cursor:pointer}
  button.secondary{background:#fff;color:#1f4e79}
  button:disabled{opacity:.5;cursor:not-allowed}
  button:focus-visible,input:focus-visible{outline:3px solid #f2a900;outline-offset:2px}
  label{display:block;margin:10px 0 2px;font-weight:600}
  input{font:inherit;width:100%;box-sizing:border-box;padding:6px;border:1px solid #9aa7b4;border-radius:4px}
  .hint{color:#56616d;font-size:12px}
  .row{display:flex;gap:8px;margin-top:12px}
</style>`;

export function showDialog(title: string, bodyHtml: string, width = 640, height = 480) {
  const html = HtmlService.createHtmlOutput(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">${STYLE}</head><body>${bodyHtml}</body></html>`)
    .setWidth(width)
    .setHeight(height);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

export function alert(title: string, message: string) {
  SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
}

export function confirm(title: string, message: string): boolean {
  const ui = SpreadsheetApp.getUi();
  return ui.alert(title, message, ui.ButtonSet.OK_CANCEL) === ui.Button.OK;
}

export function toast(message: string, title = '管委會網站') {
  SpreadsheetApp.getActiveSpreadsheet().toast(message, title, 5);
}

export function problemList(items: string[], cls: string, max = 80): string {
  if (!items.length) return '';
  const shown = items.slice(0, max).map((t) => `<li>${esc(t)}</li>`).join('');
  const more = items.length > max ? `<li>……另有 ${items.length - max} 筆，完整內容請見「發布紀錄」分頁</li>` : '';
  return `<ul class="${cls}">${shown}${more}</ul>`;
}
