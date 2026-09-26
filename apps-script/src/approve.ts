// 「預覽並核准文件」：選取會議或管理辦法的一列 → 讀原始文件 → 去圖片 → 遮蔽 → 預覽（高亮遮蔽處）→ 核准。
// 核准後，遮蔽過的版本存到私有快取；之後匯出只使用快取，原始文件永遠不公開。
import { driveFileId } from '../../src/core/doc-clean';
import { normalizeText } from '../../src/core/normalize';
import { detectPii, sanitizeText } from '../../src/core/privacy/sanitize';
import type { EntityKind } from '../../src/core/refs';
import { SHEETS } from '../../src/core/sheet-schema';
import { privacyContext } from './context';
import { readSourceDoc, sha256 } from './docs';
import { createFile, isAnyoneWithLink, updateFileContent } from './drive';
import type { CachedDoc } from './exporter';
import { writeLog } from './log';
import { cacheFolder } from './storage';
import { headerMap, kindOfSheet, ss, todayStr } from './sheet';
import { alert, esc, showDialog } from './ui';

interface Target {
  kind: EntityKind;
  row: number;
  displayId: string;
  internalId: string;
  fileId: string;
  cacheId: string;
  publicFileUrl: string;
}

const RULE_LABEL: Record<string, string> = {
  dictionary: '遮蔽詞庫',
  email: 'Email',
  'national-id': '身分證／居留證',
  mobile: '手機',
  landline: '電話',
  account: '帳號',
  plate: '車牌',
  address: '地址',
  money: '金額',
  visibility: '整欄遮蔽',
};

function targetAt(kind: EntityKind, row: number): Target {
  const sheet = ss().getSheetByName(SHEETS[kind].sheet)!;
  const map = headerMap(sheet, kind);
  const v = (k: string) => (map.get(k) ? normalizeText(sheet.getRange(row, map.get(k)!).getValue()) : '');
  const docLabel = SHEETS[kind].columns.find((c) => c.key === 'doc_url')!.label;
  const url = v('doc_url');
  if (!url) throw new Error(`這一列的「${docLabel}」是空的，請先貼上 Google 文件或 Word 檔的 Drive 連結`);
  const fileId = driveFileId(url);
  if (!fileId) throw new Error(`「${docLabel}」不是 Google Drive 連結：${url}`);
  const internalId = v('_internal_id');
  const displayId = v('display_id');
  if (!internalId || !displayId) throw new Error('這一列尚未配發編號，請先執行「檢查資料」');
  return { kind, row, displayId, internalId, fileId, cacheId: v('_approved_cache_id'), publicFileUrl: v('public_file_url') };
}

function prepare(t: Target) {
  const src = readSourceDoc(t.fileId);
  const ctx = privacyContext();
  const opts = { config: ctx.config, dictionary: ctx.dictionary };
  const body = sanitizeText(src.markdown, opts);
  const filename = sanitizeText(src.meta.name, opts).text;
  const residual = detectPii(body.text, ctx.config);
  const hash = sha256(body.text + '\u0000' + filename);
  return { src, body, filename, residual, hash };
}

function highlight(md: string): string {
  return esc(md).replace(/\[[^\[\]\n]{1,20}已遮蔽\]/g, (m) => `<mark>${m}</mark>`);
}

export function openApproveDialog() {
  const sheet = ss().getActiveSheet();
  const kind = kindOfSheet(sheet.getName());
  const row = sheet.getActiveRange()?.getRow() ?? 0;
  if ((kind !== 'meeting' && kind !== 'rule') || row < 2) {
    alert('預覽並核准文件', '請先到「會議」或「管理辦法」分頁，點選要核准的那一列，再執行一次。');
    return;
  }
  let t: Target;
  let p: ReturnType<typeof prepare>;
  try {
    t = targetAt(kind, row);
    p = prepare(t);
  } catch (e) {
    alert('無法讀取文件', e instanceof Error ? e.message : String(e));
    return;
  }

  const hits = Object.entries(p.body.hits)
    .map(([k, n]) => `${RULE_LABEL[k] ?? (k.startsWith('unit-') ? '戶別' : k)} ${n} 處`)
    .join('、');
  const publicWarn =
    t.publicFileUrl && driveFileId(t.publicFileUrl) && isAnyoneWithLink(driveFileId(t.publicFileUrl)!)
      ? '<p class="warn">⚠「公開檔案連結」指向的原始檔已設為「知道連結的任何人」可檢視。原始檔<strong>未經遮蔽</strong>，請確認內容可以公開。</p>'
      : '';
  const blocked = p.residual.length > 0;
  const payload = JSON.stringify({ kind: t.kind, row: t.row, internalId: t.internalId, revision: p.src.revision, hash: p.hash });

  const html = `
  <h2>${esc(t.displayId)}｜${esc(p.filename)}</h2>
  <div class="box">
    <div>文件最後修改：${esc(Utilities.formatDate(new Date(p.src.meta.modifiedTime), 'Asia/Taipei', 'yyyy-MM-dd HH:mm'))}</div>
    <div>自動遮蔽：${hits ? esc(hits) : '沒有找到需要遮蔽的內容'}（下方以<mark>黃色</mark>標示）</div>
    <div class="hint">文件內的圖片不會公開。${p.src.format === 'plain' ? '此文件以純文字匯出，表格與標題格式可能不完整。' : ''}</div>
  </div>
  ${publicWarn}
  ${
    blocked
      ? `<p class="err">✗ 仍有疑似個資未能自動遮蔽，無法核准。請修改原始文件或把人名加入「遮蔽詞庫」後重新預覽：</p><ul class="err">${p.residual
          .map((f) => `<li>${esc(f.label)}：「${esc(f.context)}」</li>`)
          .join('')}</ul>`
      : '<p>請從頭到尾看過一次，確認沒有不應公開的內容（例如住戶姓名、爭議細節）。人名請加入「遮蔽詞庫」。</p>'
  }
  <pre tabindex="0" aria-label="遮蔽後內容預覽">${highlight(p.body.text.slice(0, 200000))}</pre>
  <div class="row">
    <button id="ok" ${blocked ? 'disabled' : ''}>核准，網站使用此版本</button>
    <button class="secondary" onclick="google.script.host.close()">取消</button>
  </div>
  <p id="msg" role="status" aria-live="polite"></p>
  <script>
    const data = ${payload.replace(/</g, '\\u003c')};
    const ok = document.getElementById('ok');
    const msg = document.getElementById('msg');
    ok && ok.addEventListener('click', () => {
      ok.disabled = true;
      msg.textContent = '核准中…';
      google.script.run
        .withSuccessHandler((m) => { msg.className = 'ok'; msg.textContent = m; setTimeout(() => google.script.host.close(), 2500); })
        .withFailureHandler((e) => { msg.className = 'err'; msg.textContent = e.message || String(e); ok.disabled = false; })
        .approveDoc(data);
    });
  </script>`;
  showDialog('預覽並核准文件', html, 820, 620);
}

export function approveDoc(data: { kind: EntityKind; row: number; internalId: string; revision: string; hash: string }): string {
  if (data.kind !== 'meeting' && data.kind !== 'rule') throw new Error('資料錯誤');
  const t = targetAt(data.kind, data.row);
  if (t.internalId !== data.internalId) throw new Error('這一列在預覽後被移動或修改，請重新預覽');
  const p = prepare(t);
  if (p.src.revision !== data.revision || p.hash !== data.hash) throw new Error('文件或遮蔽詞庫在預覽後有變動，請關閉後重新預覽');
  if (p.residual.length) throw new Error('仍有疑似個資未遮蔽，無法核准');

  const now = new Date();
  const cached: CachedDoc = {
    body_md: p.body.text,
    source_filename: p.filename,
    revision: p.src.revision,
    hash: p.hash,
    approved_at: Utilities.formatDate(now, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    approved_by: Session.getActiveUser().getEmail(),
  };
  const content = JSON.stringify(cached);
  let cacheId = t.cacheId;
  let updated = false;
  if (cacheId) {
    try {
      updateFileContent(cacheId, content);
      updated = true;
    } catch {
      cacheId = '';
    }
  }
  if (!updated) cacheId = createFile(`${t.displayId}-${t.internalId}.json`, content, 'application/json', cacheFolder()).id;

  const sheet = ss().getSheetByName(SHEETS[data.kind].sheet)!;
  const map = headerMap(sheet, data.kind);
  const set = (k: string, v: string) => map.get(k) && sheet.getRange(data.row, map.get(k)!).setValue(v);
  set('_approved_cache_id', cacheId);
  set('_approved_revision', p.src.revision);
  set('_approved_hash', p.hash);
  set('doc_approval', `已核准 ${todayStr()}`);
  writeLog('核准文件', '成功', `${t.displayId}：${p.filename}`);
  return `已核准 ${t.displayId}。下次「發布網站」時網站會顯示這個版本。`;
}
