// Deploy 用：下載 PUBLIC_DATASET_URL → .cache/public-dataset.json，之後以 DATA_SOURCE=file 建置。
// 只寫入 .cache（gitignored），不 commit generated data。
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchDatasetText } from '../src/data/source';

const url = process.env.PUBLIC_DATASET_URL;
const out = process.env.DATASET_FILE ?? '.cache/public-dataset.json';
if (!url) {
  console.error('✗ 未設定 PUBLIC_DATASET_URL（GitHub → Settings → Secrets and variables → Actions → Variables）');
  process.exit(1);
}
try {
  const text = await fetchDatasetText(url);
  await mkdir('.cache', { recursive: true });
  await writeFile(out, text);
  console.log(`✓ 已下載公開資料（${(text.length / 1024).toFixed(1)} KB）→ ${out}`);
} catch (e) {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
