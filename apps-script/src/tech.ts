// 「技術設定」：只給技術維護者。GitHub token 只寫入、不回顯。
import { publicDownloadUrl } from './drive';
import { writeLog } from './log';
import { getProp, PROP, setProp } from './props';
import { esc, showDialog } from './ui';

export function openTechSettings() {
  const fileId = getProp(PROP.PUBLIC_FILE_ID);
  const html = `
  <p class="hint">這些設定存在 Apps Script 的 Script Properties，不會出現在試算表或網站。</p>
  <form id="f">
    <label for="repo">GitHub repo（owner/name）</label>
    <input id="repo" name="repo" value="${esc(getProp(PROP.GITHUB_REPO))}" placeholder="例如 my-org/committee-site" autocomplete="off">
    <label for="token">GitHub fine-grained token</label>
    <input id="token" name="token" type="password" autocomplete="off" placeholder="${getProp(PROP.GITHUB_TOKEN) ? '已設定（留空則不變更）' : '尚未設定'}">
    <div class="hint">只需此 repo 的「Actions: Read and write」權限。</div>
    <label for="wf">Workflow 檔名</label>
    <input id="wf" name="wf" value="${esc(getProp(PROP.GITHUB_WORKFLOW) || 'deploy.yml')}">
    <div class="row"><button type="submit">儲存</button><button type="button" class="secondary" onclick="google.script.host.close()">關閉</button></div>
  </form>
  <p id="msg" role="status" aria-live="polite"></p>
  <div class="box">
    <div><strong>公開資料網址</strong>（設為 GitHub repo variable <code>PUBLIC_DATASET_URL</code>）</div>
    <div>${fileId ? `<input readonly value="${esc(publicDownloadUrl(fileId))}" aria-label="公開資料網址" onfocus="this.select()">` : '尚未建立：請先執行一次「發布網站」。'}</div>
  </div>
  <div class="box">
    <div><strong>重新建立系統檔案</strong>（移交擁有權後使用）</div>
    <div class="hint">清除後下次發布會以你的帳號建立新的系統資料夾與 public-dataset.json，公開資料網址會改變。</div>
    <div class="row"><button type="button" class="secondary" id="reset">重新建立系統檔案</button></div>
  </div>
  <script>
    document.getElementById('reset').addEventListener('click', () => {
      if (!confirm('確定要重新建立系統檔案？公開資料網址會改變，需要更新 GitHub 設定。')) return;
      const msg = document.getElementById('msg');
      google.script.run
        .withSuccessHandler((m) => { msg.className = 'ok'; msg.textContent = m; })
        .withFailureHandler((err) => { msg.className = 'err'; msg.textContent = err.message || String(err); })
        .resetSystemFiles();
    });
    document.getElementById('f').addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = document.getElementById('msg');
      msg.textContent = '儲存中…';
      google.script.run
        .withSuccessHandler((m) => { msg.className = 'ok'; msg.textContent = m; document.getElementById('token').value = ''; })
        .withFailureHandler((err) => { msg.className = 'err'; msg.textContent = err.message || String(err); })
        .saveTechSettings({ repo: repo.value, token: token.value, workflow: wf.value });
    });
  </script>`;
  showDialog('技術設定', html, 560, 640);
}

export function saveTechSettings(input: { repo: string; token: string; workflow: string }): string {
  const repo = String(input.repo ?? '').trim();
  const workflow = String(input.workflow ?? '').trim() || 'deploy.yml';
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('repo 格式應為 owner/name');
  if (!/^[\w.-]+\.ya?ml$/.test(workflow)) throw new Error('Workflow 檔名應為 xxx.yml');
  setProp(PROP.GITHUB_REPO, repo);
  setProp(PROP.GITHUB_WORKFLOW, workflow);
  const token = String(input.token ?? '').trim();
  if (token) {
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) throw new Error('token 格式不正確');
    setProp(PROP.GITHUB_TOKEN, token);
  }
  writeLog('技術設定', '成功', `repo=${repo} workflow=${workflow}${token ? '（已更新 token）' : ''}`);
  return '已儲存';
}
