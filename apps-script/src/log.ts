// 「發布紀錄」分頁：每次檢查／匯出／發布／核准都留紀錄，委員可自行查看結果與錯誤。
import { LOG_SHEET } from '../../src/core/sheet-schema';
import { formatProblem, type Problem } from '../../src/core/validate';
import { ss } from './sheet';

export const LOG_HEADERS = ['時間', '動作', '結果', '執行者', '說明'];

export function writeLog(action: string, result: '成功' | '失敗' | '警告' | '略過', detail: string | Problem[]) {
  let sheet = ss().getSheetByName(LOG_SHEET);
  if (!sheet) {
    sheet = ss().insertSheet(LOG_SHEET);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  const text = typeof detail === 'string' ? detail : detail.map(formatProblem).join('\n');
  sheet.insertRowBefore(2);
  sheet
    .getRange(2, 1, 1, LOG_HEADERS.length)
    .setValues([[new Date(), action, result, Session.getActiveUser().getEmail() || '（系統排程）', text.slice(0, 45000)]]);
  // 保留最近 500 筆
  const extra = sheet.getLastRow() - 501;
  if (extra > 0) sheet.deleteRows(502, extra);
}
