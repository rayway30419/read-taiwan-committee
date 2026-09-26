// Data source adapter。頁面只透過 src/data/index.ts 取資料，不知道資料來自 Google、檔案或 fixture。
//   DATA_SOURCE=fixture  fixtures/public-dataset.json（CI、開發預設）
//   DATA_SOURCE=file     DATASET_FILE（deploy 先由 scripts/fetch-data.ts 下載）
//   DATA_SOURCE=google   直接從 PUBLIC_DATASET_URL 下載（本機預覽正式資料）

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type SourceKind = 'fixture' | 'file' | 'google';

export const FIXTURE_FILE = 'fixtures/public-dataset.json';

export function sourceKind(env: NodeJS.ProcessEnv = process.env): SourceKind {
  const v = (env.DATA_SOURCE ?? 'fixture').trim();
  if (v === 'fixture' || v === 'file' || v === 'google') return v;
  throw new Error(`DATA_SOURCE 必須是 fixture、file 或 google（目前：${v}）`);
}

export async function fetchDatasetText(url: string): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new Error('PUBLIC_DATASET_URL 必須是 https:// 網址');
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trimStart().startsWith('{')) throw new Error('回應不是 JSON（檔案可能未設為「知道連結的任何人」可檢視）');
      return text;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error(`下載公開資料失敗：${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export async function loadRawDataset(env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const kind = sourceKind(env);
  let text: string;
  if (kind === 'google') {
    const url = env.PUBLIC_DATASET_URL;
    if (!url) throw new Error('DATA_SOURCE=google 需要設定 PUBLIC_DATASET_URL');
    text = await fetchDatasetText(url);
  } else {
    const file = kind === 'fixture' ? FIXTURE_FILE : env.DATASET_FILE;
    if (!file) throw new Error('DATA_SOURCE=file 需要設定 DATASET_FILE');
    text = await readFile(resolve(process.cwd(), file), 'utf8');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('公開資料檔不是有效的 JSON');
  }
}

/** Build 當日（Asia/Taipei）；BUILD_DATE=YYYY-MM-DD 可覆寫以重現某天的建置結果。 */
export function buildDate(env: NodeJS.ProcessEnv = process.env): string {
  if (env.BUILD_DATE && /^\d{4}-\d{2}-\d{2}$/.test(env.BUILD_DATE)) return env.BUILD_DATE;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
