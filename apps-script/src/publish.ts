// 「檢查資料」與「發布網站」選單動作。
// 發布 = 配發編號 → 驗證 → 匯出 public-dataset.json → 觸發 GitHub Actions（workflow_dispatch）。
// GitHub token 存在 Script Properties（技術設定），不寫在 Sheet 或程式碼。
import { sweepAll } from './ids';
import { buildFromSheet, exportPublic, summarize } from './exporter';
import { writeLog } from './log';
import { getProp, PROP } from './props';
import { esc, problemList, showDialog, toast } from './ui';

const DEFAULT_WORKFLOW = 'deploy.yml';

function resultHtml(errors: string[], warnings: string[], sweepNotes: string[], stats: string, extra = ''): string {
  const head = errors.length
    ? `<p class="err"><strong>✗ 有 ${errors.length} 個問題需要修正</strong>，網站維持上一版，不會更新。</p>`
    : '<p class="ok"><strong>✓ 資料檢查通過</strong></p>';
  return `${head}${extra}
    ${problemList(errors, 'err')}
    ${warnings.length ? `<h2 class="warn">提醒（不影響發布）</h2>${problemList(warnings, 'warn')}` : ''}
    ${sweepNotes.length ? `<h2>自動修正</h2>${problemList(sweepNotes, '')}` : ''}
    <p class="hint">公開筆數：${esc(stats)}</p>
    <div class="row"><button onclick="google.script.host.close()">關閉</button></div>`;
}

export function checkData() {
  toast('檢查中…');
  const sweep = sweepAll();
  const run = buildFromSheet();
  const s = summarize(run);
  writeLog('檢查資料', s.errors.length ? '失敗' : s.warnings.length ? '警告' : '成功', [...s.errors, ...s.warnings, ...sweep.notes].join('\n') || s.stats);
  showDialog('檢查資料', resultHtml(s.errors, s.warnings, sweep.notes, s.stats));
}

function dispatchWorkflow(): { ok: boolean; message: string; url?: string } {
  const token = getProp(PROP.GITHUB_TOKEN);
  const repo = getProp(PROP.GITHUB_REPO);
  const workflow = getProp(PROP.GITHUB_WORKFLOW) || DEFAULT_WORKFLOW;
  if (!token || !repo) return { ok: false, message: '尚未設定 GitHub 連線（管委會網站 → 技術設定）。公開資料已更新，網站會在每日自動建置時（約清晨 4 點）更新。' };
  const res = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const url = `https://github.com/${repo}/actions/workflows/${workflow}`;
  if (code === 204) return { ok: true, message: '已通知 GitHub 開始建置網站，約 3–5 分鐘後更新。', url };
  const reason =
    code === 401 ? 'GitHub token 無效或已過期，請技術維護者更新（技術設定）' : code === 403 || code === 404 ? 'GitHub token 權限不足或 repo 名稱錯誤' : `GitHub 回應 ${code}`;
  return { ok: false, message: `公開資料已更新，但無法觸發網站建置：${reason}。網站會在每日自動建置時更新。`, url };
}

export function publishSite() {
  toast('發布中：檢查資料…');
  const sweep = sweepAll();
  const run = exportPublic('發布網站');
  const s = summarize(run);
  if (!run.result.ok) {
    showDialog('發布網站', resultHtml(s.errors, s.warnings, sweep.notes, s.stats));
    return;
  }
  toast('公開資料已更新，通知 GitHub 建置…');
  const d = dispatchWorkflow();
  writeLog('觸發網站建置', d.ok ? '成功' : '警告', d.message);
  const extra = `<p class="${d.ok ? 'ok' : 'warn'}">${esc(d.message)}</p>${d.url ? `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">查看建置進度（GitHub）</a></p>` : ''}`;
  showDialog('發布網站', resultHtml([], s.warnings, sweep.notes, s.stats, extra));
}

/** 每日排程：只匯出公開資料；GitHub Actions 的每日排程會讀取並建置。 */
export function dailyExport() {
  try {
    sweepAll();
    exportPublic('每日自動匯出');
  } catch (e) {
    writeLog('每日自動匯出', '失敗', e instanceof Error ? e.message : String(e));
  }
}
