// Drive REST v3（UrlFetch + ScriptApp.getOAuthToken）。
// manifest 宣告 Advanced Drive Service 只為了在預設 GCP project 啟用 Drive API（否則 403 accessNotConfigured）；程式不呼叫 Drive.*。
// 使用 drive scope（而非 drive.file）：系統資料夾由網站管理者建立並分享給試算表編輯者，
// 任何委員按「發布網站」都寫入同一份 public-dataset.json；drive.file 只允許建立者本人寫入。

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export const GOOGLE_DOC = 'application/vnd.google-apps.document';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const JSON_MIME = 'application/json';

export interface DriveMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  trashed?: boolean;
  capabilities?: { canEdit?: boolean; canAddChildren?: boolean };
}

export class DriveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function call(url: string, opts: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {}): GoogleAppsScript.URL_Fetch.HTTPResponse {
  const res = UrlFetchApp.fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}`, ...(opts.headers ?? {}) },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code >= 400) {
    const reason =
      code === 404 ? '找不到檔案，或你沒有檢視權限' : code === 403 ? '沒有權限（檔案可能未分享給你，或網域禁止此操作）' : `Drive 錯誤 ${code}`;
    let detail = '';
    try {
      const err = (JSON.parse(res.getContentText()) as { error?: { message?: string; errors?: { reason?: string }[] } }).error;
      detail = [err?.errors?.[0]?.reason, err?.message].filter(Boolean).join(': ');
    } catch {
      // 非 JSON 回應
    }
    throw new DriveError(detail ? `${reason}（${detail}）` : reason, code);
  }
  return res;
}

const q = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

export function getMeta(fileId: string): DriveMeta {
  const res = call(`${API}/files/${fileId}?${q({ fields: 'id,name,mimeType,modifiedTime,trashed,capabilities(canEdit,canAddChildren)', supportsAllDrives: 'true' })}`);
  return JSON.parse(res.getContentText()) as DriveMeta;
}

/** 檔案是否分享給「知道連結的任何人」；無法讀取權限時回傳 null。 */
export function isAnyoneWithLink(fileId: string): boolean | null {
  try {
    const res = call(`${API}/files/${fileId}?${q({ fields: 'permissions(type,role)', supportsAllDrives: 'true' })}`);
    const perms = (JSON.parse(res.getContentText()) as { permissions?: { type: string }[] }).permissions;
    if (!perms) return null;
    return perms.some((p) => p.type === 'anyone');
  } catch {
    return null;
  }
}

export function download(fileId: string): GoogleAppsScript.Base.Blob {
  return call(`${API}/files/${fileId}?${q({ alt: 'media', supportsAllDrives: 'true' })}`).getBlob();
}

export function downloadText(fileId: string): string {
  return call(`${API}/files/${fileId}?${q({ alt: 'media', supportsAllDrives: 'true' })}`).getContentText('UTF-8');
}

function exportAs(fileId: string, mimeType: string): string {
  return call(`${API}/files/${fileId}/export?${q({ mimeType })}`).getContentText('UTF-8');
}

/** Google 文件 → Markdown；不支援 text/markdown 時退回純文字。 */
export function exportGoogleDoc(fileId: string): { text: string; format: 'markdown' | 'plain' } {
  try {
    return { text: exportAs(fileId, 'text/markdown'), format: 'markdown' };
  } catch (e) {
    if (e instanceof DriveError && e.status === 403) throw e;
    return { text: exportAs(fileId, 'text/plain'), format: 'plain' };
  }
}

function multipart(metadata: object, content: GoogleAppsScript.Base.Blob | string, contentType: string) {
  const boundary = `----b${Utilities.getUuid()}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const bytes = typeof content === 'string' ? Utilities.newBlob(content, contentType).getBytes() : content.getBytes();
  const payload = [...Utilities.newBlob(head).getBytes(), ...bytes, ...Utilities.newBlob(tail).getBytes()];
  return { payload, contentType: `multipart/related; boundary=${boundary}` };
}

export function createFile(name: string, content: string | GoogleAppsScript.Base.Blob, contentType: string, parentId?: string, convertTo?: string): DriveMeta {
  const meta: Record<string, unknown> = { name, mimeType: convertTo ?? contentType };
  if (parentId) meta.parents = [parentId];
  const body = multipart(meta, content, contentType);
  const res = call(`${UPLOAD}/files?${q({ uploadType: 'multipart', fields: 'id,name,mimeType,modifiedTime', supportsAllDrives: 'true' })}`, {
    method: 'post',
    contentType: body.contentType,
    payload: body.payload,
  });
  return JSON.parse(res.getContentText()) as DriveMeta;
}

export function updateFileContent(fileId: string, content: string, contentType = JSON_MIME) {
  call(`${UPLOAD}/files/${fileId}?${q({ uploadType: 'media', supportsAllDrives: 'true' })}`, {
    method: 'patch',
    contentType,
    payload: Utilities.newBlob(content, contentType).getBytes(),
  });
}

export function createFolder(name: string, parentId?: string): string {
  const meta: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const res = call(`${API}/files?${q({ fields: 'id', supportsAllDrives: 'true' })}`, {
    method: 'post',
    contentType: JSON_MIME,
    payload: JSON.stringify(meta),
  });
  return (JSON.parse(res.getContentText()) as { id: string }).id;
}

export function deleteFile(fileId: string) {
  call(`${API}/files/${fileId}?${q({ supportsAllDrives: 'true' })}`, { method: 'delete' });
}

export function shareAnyoneReader(fileId: string) {
  call(`${API}/files/${fileId}/permissions?${q({ supportsAllDrives: 'true' })}`, {
    method: 'post',
    contentType: JSON_MIME,
    payload: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
  });
}

export function shareWriter(fileId: string, email: string) {
  call(`${API}/files/${fileId}/permissions?${q({ supportsAllDrives: 'true', sendNotificationEmail: 'false' })}`, {
    method: 'post',
    contentType: JSON_MIME,
    payload: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
  });
}

export function listChildren(folderId: string): DriveMeta[] {
  const res = call(
    `${API}/files?${q({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime)',
      orderBy: 'name desc',
      pageSize: '200',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    })}`,
  );
  return (JSON.parse(res.getContentText()) as { files: DriveMeta[] }).files;
}

/** 公開資料檔的直接下載網址（GitHub Actions 讀取用） */
export const publicDownloadUrl = (fileId: string) => `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
