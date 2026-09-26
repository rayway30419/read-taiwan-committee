// 「匯入 demo 資料」：一次性遷移。只讀 demo 站的結構化 JSON 與列表頁 metadata（見 src/core/demo-import.ts）。
// 會議與辦法全文不擷取；請把原始文件放 Drive 後走「預覽並核准文件」。
import { mapDemo, parseDemoMeetingIndex, parseDemoMeetingNote, parseDemoRulesIndex, type ImportRow } from '../../src/core/demo-import';
import type { EntityKind } from '../../src/core/refs';
import { ENTITY_ORDER, SHEETS } from '../../src/core/sheet-schema';
import { sweepAll } from './ids';
import { writeLog } from './log';
import { headerMap, readRows, sheetOf } from './sheet';
import { setupSpreadsheet } from './setup';
import { alert, confirm, toast } from './ui';

const DEMO_URL = 'https://zeisshong.github.io/Committee-demo/';

function get(path: string): string {
  const res = UrlFetchApp.fetch(DEMO_URL + path, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() !== 200) throw new Error(`${path}: HTTP ${res.getResponseCode()}`);
  return res.getContentText('UTF-8');
}

function hasData(kind: EntityKind): boolean {
  return readRows(kind).some((r) => String(r.title ?? '').trim() !== '');
}

export function importDemo() {
  const busy = ENTITY_ORDER.filter(hasData).map((k) => SHEETS[k].sheet);
  if (busy.length) {
    alert('匯入 demo 資料', `以下分頁已有資料，為避免重複不會匯入：${busy.join('、')}。\n如需重新匯入，請先清空這些分頁的資料列（保留第一列標題）。`);
    return;
  }
  if (!confirm('匯入 demo 資料', `將從 ${DEMO_URL} 匯入議題、待辦、決議、會議與管理辦法（只含名稱與狀態）。會議與辦法全文需另外上傳文件後核准。繼續？`)) return;

  toast('下載 demo 資料…');
  setupSpreadsheet();
  const json = (n: string) => JSON.parse(get(`data/${n}.json`)) as Record<string, unknown>[];
  const meetingBadges = parseDemoMeetingIndex(get('meetings/index.html'));
  const meetingNotes: Record<string, string> = {};
  for (const id of Object.keys(meetingBadges)) {
    try {
      meetingNotes[id] = parseDemoMeetingNote(get(`meetings/${id}/index.html`));
    } catch {
      /* 未舉行的會議沒有紀錄頁 */
    }
  }
  const mapped = mapDemo({
    issues: json('issues'),
    actions: json('actions'),
    decisions: json('decisions'),
    meetings: json('meetings'),
    meetingBadges,
    meetingNotes,
    rules: parseDemoRulesIndex(get('rules/index.html')),
  });

  // ref 欄位寫成下拉選單的「編號 標題」格式
  const labels = new Map<string, string>();
  for (const kind of ['issue', 'meeting'] as EntityKind[]) {
    for (const r of mapped[kind]) labels.set(String(r.display_id), `${r.display_id} ${r.title}`);
  }

  const counts: string[] = [];
  for (const kind of ENTITY_ORDER) {
    const rows = mapped[kind];
    if (!rows.length) continue;
    const sheet = sheetOf(kind)!;
    const map = headerMap(sheet, kind);
    const width = sheet.getLastColumn();
    const values = rows.map((r: ImportRow) => {
      const line: unknown[] = Array.from({ length: width }, () => '');
      for (const c of SHEETS[kind].columns) {
        const col = map.get(c.key);
        if (!col || !(c.key in r)) continue;
        let v = r[c.key]!;
        if (c.type === 'ref' && typeof v === 'string' && v) v = labels.get(v) ?? v;
        line[col - 1] = v;
      }
      return line;
    });
    sheet.getRange(2, 1, values.length, width).setValues(values);
    counts.push(`${SHEETS[kind].sheet} ${rows.length}`);
  }
  SpreadsheetApp.flush();
  const sweep = sweepAll();
  writeLog('匯入 demo 資料', '成功', [counts.join('・'), ...sweep.notes].join('\n'));
  alert('匯入完成', `${counts.join('、')} 筆。\n下一步：執行「檢查資料」，確認無誤後「發布網站」。`);
}
