// 把 apps-script/src + src/core 打包成單一 apps-script/dist/Code.js（不 commit）。
// 部署：clasp push，或把 Code.js 與 appsscript.json 內容貼到 Apps Script 編輯器。
import { build } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const OUT_DIR = 'apps-script/dist';
const OUT = `${OUT_DIR}/Code.js`;

const result = await build({
  entryPoints: ['apps-script/src/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'App',
  target: 'es2020',
  platform: 'neutral',
  charset: 'utf8',
  legalComments: 'none',
  minifyWhitespace: true,
  minifySyntax: true,
  write: false,
  logLevel: 'warning',
});

const code = result.outputFiles[0]!.text;
// iife 的 metafile 不列 exports：另跑一次 esm（不寫檔）取得 export 名稱
const esm = await build({ entryPoints: ['apps-script/src/main.ts'], bundle: true, format: 'esm', platform: 'neutral', metafile: true, write: false, logLevel: 'silent' });
const exports = Object.values(esm.metafile.outputs).flatMap((o) => o.exports);
if (!exports.length) throw new Error('main.ts 沒有 export');

// Apps Script 只認得 top-level function 宣告
const wrappers = exports.map((name) => `function ${name}() { return App.${name}.apply(null, arguments); }`).join('\n');
const banner = `// 由 npm run build:apps-script 產生，請勿直接修改。原始碼：apps-script/src、src/core\n`;
const bundle = `${banner}${code}\n${wrappers}\n`;

// Apps Script 沒有的 Web/Node API：出現就讓 build 失敗
const FORBIDDEN = [/\bstructuredClone\(/, /\bTextEncoder\b/, /\bTextDecoder\b/, /\bcrypto\.(?:randomUUID|getRandomValues|subtle)/, /\bprocess\.env\b/, /\brequire\(/, /(?<![.\w])fetch\(/];
const hits = FORBIDDEN.filter((re) => re.test(code)).map(String);
if (hits.length) {
  console.error(`✗ bundle 使用了 Apps Script 不支援的 API：${hits.join(', ')}`);
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, bundle);
await copyFile('apps-script/appsscript.json', `${OUT_DIR}/appsscript.json`);
const kb = Math.round(Buffer.byteLength(bundle) / 1024);
console.log(`✓ ${OUT}（${kb} KB）functions: ${exports.join(', ')}`);
