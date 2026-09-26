// Installable triggers：以安裝者（網站管理者）身分執行。重複安裝會先移除舊的。
const HANDLERS = ['onEditInstalled', 'dailyExport'];

export function installTriggers(): string[] {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  for (const t of ScriptApp.getProjectTriggers()) if (HANDLERS.includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('dailyExport').timeBased().everyDays(1).atHour(3).inTimezone('Asia/Taipei').create();
  return ['已設定：編輯時自動配發編號、每日 03:00 自動匯出公開資料'];
}
