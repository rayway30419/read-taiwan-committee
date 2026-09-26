// Apps Script 進入點。build 時（scripts/build-apps-script.ts）每個 export 會產生同名的 top-level function，
// 供選單、trigger 與 google.script.run 呼叫。
import { approveDoc as approveDocImpl, openApproveDialog } from './approve';
import { importDemo as importDemoImpl } from './demo';
import { handleEdit } from './ids';
import { writeLog } from './log';
import { checkData as checkDataImpl, dailyExport as dailyExportImpl, publishSite as publishSiteImpl } from './publish';
import { setupSpreadsheet } from './setup';
import { openTechSettings as openTechImpl, saveTechSettings as saveTechImpl } from './tech';
import { ensureStorageShared, resetStorage } from './storage';
import { installTriggers } from './triggers';
import { alert, problemList, showDialog } from './ui';

const MENU = '管委會網站';

function guarded(action: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      writeLog(action, '失敗', msg);
    } catch {
      /* 發布紀錄分頁可能尚未建立 */
    }
    alert(`${action}失敗`, `${msg}\n\n網站維持上一版。若持續發生，請把這段訊息提供給技術維護者。`);
  }
}

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(MENU)
    .addItem('發布網站', 'publishSite')
    .addItem('檢查資料', 'checkData')
    .addItem('預覽並核准文件（先點選該列）', 'approveSelected')
    .addSeparator()
    .addItem('初始化／修復試算表', 'setup')
    .addItem('匯入 demo 資料（一次性）', 'importDemo')
    .addItem('技術設定', 'techSettings')
    .addToUi();
}

export function setup() {
  guarded('初始化／修復試算表', () => {
    const editors = SpreadsheetApp.getActiveSpreadsheet().getEditors().map((u) => u.getEmail());
    const notes = [...setupSpreadsheet(), ...installTriggers(), ...ensureStorageShared(editors)];
    writeLog('初始化／修復試算表', '成功', notes.join('\n'));
    showDialog('初始化／修復試算表', `<p class="ok"><strong>✓ 完成</strong></p>${problemList(notes, '')}<div class="row"><button onclick="google.script.host.close()">關閉</button></div>`, 520, 360);
  });
}

export const publishSite = () => guarded('發布網站', publishSiteImpl);
export const checkData = () => guarded('檢查資料', checkDataImpl);
export const approveSelected = () => guarded('預覽並核准文件', openApproveDialog);
export const importDemo = () => guarded('匯入 demo 資料', importDemoImpl);
export const techSettings = () => guarded('技術設定', openTechImpl);
export const dailyExport = () => dailyExportImpl();
export const onEditInstalled = (e: GoogleAppsScript.Events.SheetsOnEdit) => handleEdit(e);

// google.script.run（錯誤直接丟回對話框顯示）
export const approveDoc = approveDocImpl;
export const saveTechSettings = saveTechImpl;
export function resetSystemFiles(): string {
  resetStorage();
  writeLog('重新建立系統檔案', '成功', '已清除系統檔案設定；下次發布會建立新的 public-dataset.json，請更新 GitHub variable PUBLIC_DATASET_URL');
  return '已清除。請執行「發布網站」建立新檔案，再到技術設定複製新的公開資料網址，更新到 GitHub variable PUBLIC_DATASET_URL。';
}
