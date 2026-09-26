// Script Properties：技術設定與 secret。只有能編輯 Apps Script 專案的人看得到；不寫進 Sheet、不進 Git。
export const PROP = {
  GITHUB_TOKEN: 'GITHUB_TOKEN',
  GITHUB_REPO: 'GITHUB_REPO',
  GITHUB_WORKFLOW: 'GITHUB_WORKFLOW',
  PUBLIC_FILE_ID: 'PUBLIC_FILE_ID',
  CACHE_FOLDER_ID: 'CACHE_FOLDER_ID',
  SNAPSHOT_FOLDER_ID: 'SNAPSHOT_FOLDER_ID',
} as const;

export const getProp = (k: string): string => PropertiesService.getScriptProperties().getProperty(k) ?? '';
export const setProp = (k: string, v: string) => PropertiesService.getScriptProperties().setProperty(k, v);

/** 曾經配發過的 display_id（刪除列後也不重複使用） */
export function reservedIds(kind: string): string[] {
  const raw = PropertiesService.getDocumentProperties().getProperty(`RESERVED_${kind}`);
  return raw ? (JSON.parse(raw) as string[]) : [];
}
export function addReservedIds(kind: string, ids: string[]) {
  if (!ids.length) return;
  const set = new Set(reservedIds(kind));
  for (const id of ids) set.add(id);
  PropertiesService.getDocumentProperties().setProperty(`RESERVED_${kind}`, JSON.stringify([...set]));
}
