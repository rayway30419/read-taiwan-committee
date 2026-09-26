// 驗證用：把 demo 站的結構化資料經「與 Apps Script 相同」的 mapping + 公開匯出流程，
// 轉成 .cache/demo-dataset.json，再以 DATA_SOURCE=file 建置、與 demo 逐頁比對。
// 來源：DEMO_DIR（本機鏡像）或 DEMO_URL（預設 demo 網址）。輸出只在 .cache（gitignored）。
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mapDemo, parseDemoMeetingIndex, parseDemoMeetingNote, parseDemoRulesIndex } from '../src/core/demo-import';
import { DEFAULT_CATEGORIES, DEFAULT_OWNER_TYPES } from '../src/core/enums';
import { buildPublicDataset, type SheetRow } from '../src/core/export';
import { ENTITY_ORDER } from '../src/core/sheet-schema';
import { formatProblem } from '../src/core/validate';

const DEMO_URL = (process.env.DEMO_URL ?? 'https://zeisshong.github.io/Committee-demo/').replace(/\/?$/, '/');
const DEMO_DIR = process.env.DEMO_DIR;
const OUT = '.cache/demo-dataset.json';

async function get(path: string): Promise<string> {
  if (DEMO_DIR) return readFile(join(DEMO_DIR, path), 'utf8');
  const res = await fetch(DEMO_URL + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}
const json = async (p: string) => JSON.parse(await get(p)) as Record<string, unknown>[];

const [issues, actions, decisions, meetings] = await Promise.all(['issues', 'actions', 'decisions', 'meetings'].map((n) => json(`data/${n}.json`)));
const meetingBadges = parseDemoMeetingIndex(await get('meetings/index.html'));
const meetingNotes: Record<string, string> = {};
for (const id of Object.keys(meetingBadges)) {
  try {
    meetingNotes[id] = parseDemoMeetingNote(await get(`meetings/${id}/index.html`));
  } catch {
    /* 未舉行的會議可能沒有紀錄頁 */
  }
}
const rules = parseDemoRulesIndex(await get('rules/index.html'));
const mapped = mapDemo({ issues: issues!, actions: actions!, decisions: decisions!, meetings: meetings!, meetingBadges, meetingNotes, rules });

const rows: Record<string, SheetRow[]> = {};
for (const kind of ENTITY_ORDER) {
  rows[kind] = mapped[kind].map((r, i) => ({ ...r, _row: i + 2, _internal_id: randomUUID() }));
}
const result = buildPublicDataset({
  rows,
  dictionary: [],
  docs: {},
  options: { categories: DEFAULT_CATEGORIES, owner_types: DEFAULT_OWNER_TYPES },
  settings: { top_banner: 'DEMO 資料轉換預覽：會議與辦法全文需經「預覽並核准」後才會出現。' },
  now: new Date(),
});
for (const w of result.warnings) console.log(`  ⚠ ${formatProblem(w)}`);
if (!result.ok || !result.json) {
  for (const e of result.errors) console.error(`  ✗ ${formatProblem(e)}`);
  process.exit(1);
}
await mkdir('.cache', { recursive: true });
await writeFile(OUT, result.json);
console.log(`✓ ${OUT}`, result.stats.published);
