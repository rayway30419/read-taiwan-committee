// Build 後檢查：每筆資料都有頁面、Pagefind 索引存在、dist 內沒有 PII 或私有連結殘留。
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { privacyConfigFrom } from '../src/core/privacy/config';
import { detectPii } from '../src/core/privacy/sanitize';
import { DataError, loadChecked } from '../src/data/load';
import { ROUTE } from '../src/lib/urls';

const DIST = 'dist';
const failures: string[] = [];
const fail = (m: string) => failures.push(m);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const htmlText = (html: string) =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ');

// 私有來源網址不得出現在網站：Sheet、Apps Script、public dataset 本身
const PRIVATE_URL_RE = /docs\.google\.com\/spreadsheets|script\.google\.com|googleusercontent\.com\/macros|drive\.google\.com\/uc\?|drive\.usercontent\.google\.com/i;
const SECRET_RE = /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|"private_key"\s*:/;

try {
  if (!existsSync(DIST)) throw new Error('找不到 dist/，請先 npm run build');
  const { site } = await loadChecked();

  const pages = ['index.html', '404.html', 'search/index.html', ...Object.values(ROUTE).map((r) => `${r}/index.html`)];
  const lists = { issue: site.issues, action: site.actions, decision: site.decisions, meeting: site.meetings, rule: site.rules, announcement: site.announcements } as const;
  for (const [kind, items] of Object.entries(lists)) {
    for (const x of items) pages.push(`${ROUTE[kind as keyof typeof ROUTE]}/${x.display_id}/index.html`);
  }
  for (const p of pages) if (!existsSync(join(DIST, p))) fail(`缺少頁面 ${p}`);

  for (const f of ['pagefind/pagefind.js', 'pagefind/pagefind-entry.json']) if (!existsSync(join(DIST, f))) fail(`缺少搜尋索引 ${f}`);
  if (existsSync(join(DIST, 'pagefind/pagefind-entry.json'))) {
    const entry = JSON.parse(await readFile(join(DIST, 'pagefind/pagefind-entry.json'), 'utf8')) as { languages: Record<string, { page_count: number }> };
    const indexed = Object.values(entry.languages).reduce((n, l) => n + l.page_count, 0);
    const expected = pages.length - 3 - Object.keys(ROUTE).length;
    if (indexed !== expected) fail(`搜尋索引頁數 ${indexed}，預期 ${expected}（每筆資料詳細頁）`);
  }

  const config = privacyConfigFrom(site.settings);
  let scanned = 0;
  for (const file of await walk(DIST)) {
    if (!/\.(html|js|json|css|xml|txt)$/.test(file) || file.includes(`${DIST}/pagefind/`)) continue;
    const raw = await readFile(file, 'utf8');
    scanned++;
    if (PRIVATE_URL_RE.test(raw)) fail(`${file}：含私有來源網址`);
    if (SECRET_RE.test(raw)) fail(`${file}：疑似含 token／金鑰`);
    if (file.endsWith('.html')) {
      for (const f of detectPii(htmlText(raw), config)) fail(`${file}：疑似${f.label}未遮蔽「${f.context}」`);
    }
  }

  if (failures.length) {
    console.error(`✗ Smoke check 失敗（${failures.length} 項）：`);
    for (const m of failures) console.error(`  • ${m}`);
    if (process.env.GITHUB_ACTIONS) for (const m of failures) console.log(`::error title=Smoke check::${m}`);
    process.exit(1);
  }
  console.log(`✓ Smoke check 通過：${pages.length} 個頁面、搜尋索引、${scanned} 個檔案 PII／私有連結掃描`);
} catch (e) {
  console.error(`✗ ${e instanceof DataError ? e.message : e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
