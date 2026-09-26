// 搜尋頁：Pagefind JS API + 類型 filter + 編號正規化（ISS-012 → ISS-0012，完全比對排最前）。
import { normalizeId } from '../core/refs';
import { pagefindQuery, SPACED_EXCERPT_RE } from '../lib/search-query';

interface IdEntry { id: string; title: string; type: string; badge: string; url: string }
interface Hit { id: string; title: string; type: string; badge: string; url: string; excerpt: string }
interface PagefindResult {
  data: () => Promise<{ url: string; excerpt: string; meta: Record<string, string>; filters: Record<string, string[]> }>;
}
interface Pagefind {
  init?: () => Promise<void>;
  search: (q: string, opts?: { filters?: Record<string, string> }) => Promise<{ results: PagefindResult[] }>;
}

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
let pagefind: Pagefind | null | undefined;

async function loadPagefind(): Promise<Pagefind | null> {
  if (pagefind !== undefined) return pagefind;
  try {
    const path = `${BASE}pagefind/pagefind.js`;
    pagefind = (await import(/* @vite-ignore */ path)) as Pagefind;
    await pagefind.init?.();
  } catch {
    pagefind = null;
  }
  return pagefind;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Pagefind excerpt 已跳脫，只保留 <mark>
const safeExcerpt = (s: string) => esc(s).replace(/&#60;(\/?)mark&#62;/g, '<$1mark>');

function render(list: HTMLElement, hits: Hit[]) {
  list.innerHTML = hits
    .map(
      (h) => `<li><article class="card">
  <div class="card-top">${h.badge ? `<span class="badge">${esc(h.badge)}</span>` : ''}<span class="id">${esc(h.id)}</span><span class="meta">${esc(h.type)}</span></div>
  <h2 class="card-title"><a href="${esc(h.url)}">${esc(h.title)}</a></h2>
  ${h.excerpt ? `<p class="result-snippet">${safeExcerpt(h.excerpt)}</p>` : ''}
</article></li>`,
    )
    .join('');
}

export function initSearch() {
  const input = document.querySelector<HTMLInputElement>('input[name="q"]');
  const list = document.querySelector<HTMLElement>('[data-search-results]');
  const status = document.querySelector<HTMLElement>('[data-search-status]');
  const typeGroup = document.querySelector<HTMLElement>('[data-search-types]');
  if (!input || !list || !status || !typeGroup) return;
  const idIndex = JSON.parse(document.getElementById('id-index')?.textContent || '[]') as IdEntry[];

  const params = new URLSearchParams(location.search);
  let type = params.get('type') ?? '';
  input.value = params.get('q') ?? '';
  const buttons = [...typeGroup.querySelectorAll<HTMLButtonElement>('button')];
  const syncButtons = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.type ?? '') === type)));
  syncButtons();

  let seq = 0;
  async function run() {
    const q = input!.value.trim();
    const my = ++seq;
    const u = new URL(location.href);
    q ? u.searchParams.set('q', q) : u.searchParams.delete('q');
    type ? u.searchParams.set('type', type) : u.searchParams.delete('type');
    history.replaceState(null, '', u);

    if (!q) {
      list!.innerHTML = '';
      status!.textContent = '輸入關鍵字或編號開始搜尋。';
      return;
    }
    status!.textContent = '搜尋中…';

    const hits: Hit[] = [];
    const exactId = normalizeId(q);
    const exact = exactId ? idIndex.find((e) => e.id === exactId) : undefined;
    if (exact && (!type || exact.type === type)) hits.push({ ...exact, excerpt: '' });

    const pf = await loadPagefind();
    if (my !== seq) return;
    if (!pf) {
      render(list!, hits);
      status!.textContent = hits.length
        ? `找到編號 ${exact!.id}。全文搜尋索引尚未建立（開發模式請執行 npm run build 後用 npm run preview）。`
        : '全文搜尋索引尚未建立。開發模式請執行 npm run build 後用 npm run preview。';
      return;
    }
    const opts = type ? { filters: { type } } : undefined;
    const res = await pf.search(pagefindQuery(q), opts);
    const data = await Promise.all(res.results.slice(0, 50).map((r) => r.data()));
    if (my !== seq) return;
    const lower = q.toLowerCase();
    const found: (Hit & { titleHit: boolean })[] = data.map((d) => ({
      id: d.meta.id ?? '',
      title: d.meta.title ?? d.url,
      type: d.filters.type?.[0] ?? '',
      badge: d.meta.badge ?? '',
      url: d.url,
      excerpt: !d.excerpt || SPACED_EXCERPT_RE.test(d.excerpt) ? (d.meta.summary ?? '') : d.excerpt,
      titleHit: (d.meta.title ?? '').toLowerCase().includes(lower),
    }));
    // 標題命中排前（stable sort 保留 Pagefind 相關度順序）
    found.sort((a, b) => Number(b.titleHit) - Number(a.titleHit));
    for (const f of found) if (!hits.some((h) => h.id === f.id)) hits.push(f);

    render(list!, hits);
    status!.textContent = hits.length ? `找到 ${hits.length} 筆結果` : `找不到「${q}」的結果。可以試試較短的關鍵字或編號。`;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  });
  input.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    run();
  });
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      type = b.dataset.type ?? '';
      syncButtons();
      run();
    }),
  );
  run();
}
