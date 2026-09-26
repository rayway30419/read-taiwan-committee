// 本程式在 Drive 建立的檔案（由網站管理者執行「初始化／修復試算表」建立，並分享給試算表編輯者）：
//   管委會網站（系統檔案）/
//     public-dataset.json   ← 唯一公開的檔案（知道連結的任何人可檢視；內容已遮蔽）
//     已核准文件快取（私有）/  ← 核准時遮蔽後的會議紀錄／辦法全文
//     公開資料歷史版本（私有）/ ← 最近 30 份 public-dataset 快照，可用來回復
// 已設定的系統檔案無法寫入時一律報錯，不自動另建（否則 GitHub 讀到的仍是舊檔）。
import { createFile, createFolder, deleteFile, DriveError, getMeta, listChildren, shareAnyoneReader, shareWriter } from './drive';
import { getProp, PROP, setProp } from './props';

const ROOT_NAME = '管委會網站（系統檔案）';
const ROOT = 'ROOT_FOLDER_ID';
const KEEP_SNAPSHOTS = 30;
const FOLDER = 'application/vnd.google-apps.folder';

export class StorageError extends Error {}

function check(id: string, what: string) {
  let ok = false;
  try {
    const m = getMeta(id);
    ok = !m.trashed && m.capabilities?.canEdit !== false && (m.mimeType !== FOLDER || m.capabilities?.canAddChildren !== false);
  } catch (e) {
    if (!(e instanceof DriveError)) throw e;
  }
  if (!ok) {
    throw new StorageError(
      `無法寫入網站系統檔案（${what}）。請網站管理者執行「初始化／修復試算表」把系統資料夾分享給你；若已移交擁有權，請在「技術設定」按「重新建立系統檔案」。`,
    );
  }
}

function ensure(prop: string, what: string, create: () => string): string {
  const id = getProp(prop);
  if (id) {
    check(id, what);
    return id;
  }
  const created = create();
  setProp(prop, created);
  return created;
}

const rootFolder = () => ensure(ROOT, ROOT_NAME, () => createFolder(ROOT_NAME));
export const cacheFolder = () => ensure(PROP.CACHE_FOLDER_ID, '已核准文件快取', () => createFolder('已核准文件快取（私有）', rootFolder()));
export const snapshotFolder = () => ensure(PROP.SNAPSHOT_FOLDER_ID, '公開資料歷史版本', () => createFolder('公開資料歷史版本（私有）', rootFolder()));

/** 取得（必要時建立並公開分享）public-dataset.json 的 file ID */
export function ensurePublicFile(initial: string): { id: string; created: boolean } {
  let created = false;
  const id = ensure(PROP.PUBLIC_FILE_ID, 'public-dataset.json', () => {
    const meta = createFile('public-dataset.json', initial, 'application/json', rootFolder());
    shareAnyoneReader(meta.id);
    created = true;
    return meta.id;
  });
  return { id, created };
}

export function saveSnapshot(json: string, stamp: string) {
  const folder = snapshotFolder();
  createFile(`public-dataset-${stamp}.json`, json, 'application/json', folder);
  const files = listChildren(folder).filter((f) => f.name.startsWith('public-dataset-'));
  for (const f of files.slice(KEEP_SNAPSHOTS)) deleteFile(f.id);
}

/** setup：建立系統資料夾並分享給試算表所有編輯者（不寄通知信） */
export function ensureStorageShared(editors: string[]): string[] {
  rootFolder();
  cacheFolder();
  snapshotFolder();
  const me = Session.getEffectiveUser().getEmail();
  const shared: string[] = [];
  for (const email of editors) {
    if (!email || email === me) continue;
    try {
      shareWriter(getProp(ROOT), email);
      shared.push(email);
    } catch {
      /* 已分享或網域限制；發布時會給出明確錯誤 */
    }
  }
  return shared.length ? [`系統資料夾已分享給 ${shared.length} 位試算表編輯者`] : [];
}

/** 移交擁有權：清除系統檔案設定，下次發布時以目前使用者重新建立 */
export function resetStorage() {
  for (const k of [ROOT, PROP.CACHE_FOLDER_ID, PROP.SNAPSHOT_FOLDER_ID, PROP.PUBLIC_FILE_ID]) PropertiesService.getScriptProperties().deleteProperty(k);
}
