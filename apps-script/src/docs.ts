// 讀取會議紀錄／管理辦法原始文件 → 乾淨的 Markdown（尚未遮蔽）。
// 支援：Google 文件、.docx（上傳成暫存 Google 文件轉檔後刪除）、.md／.txt。
import { cleanExportedMarkdown } from '../../src/core/doc-clean';
import { createFile, deleteFile, download, downloadText, DOCX, exportGoogleDoc, getMeta, GOOGLE_DOC, type DriveMeta } from './drive';
import { cacheFolder } from './storage';

export interface SourceDoc {
  meta: DriveMeta;
  /** 文件版本識別：fileId@modifiedTime，用來判斷核准後是否被修改 */
  revision: string;
  markdown: string;
  format: 'markdown' | 'plain';
}

export const revisionOf = (m: DriveMeta) => `${m.id}@${m.modifiedTime}`;

export function readSourceDoc(fileId: string): SourceDoc {
  const meta = getMeta(fileId);
  if (meta.trashed) throw new Error(`文件「${meta.name}」已在垃圾桶`);
  let raw: { text: string; format: 'markdown' | 'plain' };
  if (meta.mimeType === GOOGLE_DOC) {
    raw = exportGoogleDoc(fileId);
  } else if (meta.mimeType === DOCX || /\.docx$/i.test(meta.name)) {
    // drive.file scope 只能管理本程式建立的檔案：下載 → 上傳成暫存 Google 文件 → 匯出 → 刪除暫存
    const tmp = createFile(`_轉檔暫存_${meta.name}`, download(fileId), DOCX, cacheFolder(), GOOGLE_DOC);
    try {
      raw = exportGoogleDoc(tmp.id);
    } finally {
      deleteFile(tmp.id);
    }
  } else if (/^text\/(markdown|plain)$/.test(meta.mimeType) || /\.(md|txt)$/i.test(meta.name)) {
    raw = { text: downloadText(fileId), format: /\.md$/i.test(meta.name) || meta.mimeType === 'text/markdown' ? 'markdown' : 'plain' };
  } else {
    throw new Error(`不支援的檔案類型（${meta.name}）。請使用 Google 文件或 Word .docx`);
  }
  const text = raw.format === 'plain' ? raw.text.replace(/\r\n?/g, '\n').trim() + '\n' : cleanExportedMarkdown(raw.text);
  return { meta, revision: revisionOf(meta), markdown: text, format: raw.format };
}

export function sha256(text: string): string {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map((b) => ((b + 256) % 256).toString(16).padStart(2, '0'))
    .join('');
}
