// Build 前的資料關卡：schema、關聯、privacy gate。有 error 就讓 build 失敗（production 保留上一版）。
import { formatProblem } from '../src/core/validate';
import { DataError, loadChecked } from '../src/data/load';
import { sourceKind } from '../src/data/source';

try {
  const { site, warnings } = await loadChecked();
  const s = site.stats;
  console.log(`✓ 資料檢查通過（來源：${sourceKind()}，資料時間：${site.generatedAt}，建置日：${site.today}）`);
  console.log(`  議題 ${s.issuesTotal}（追蹤中 ${s.issuesTracked}）・待辦 ${s.actionsTotal}・決議 ${s.decisionsTotal}・會議 ${s.meetingsTotal}・管理辦法 ${site.rules.length}・公告 ${site.announcements.length}`);
  for (const w of warnings) console.log(`  ⚠ ${formatProblem(w)}`);
  if (process.env.GITHUB_ACTIONS) for (const w of warnings) console.log(`::warning title=資料提醒::${formatProblem(w)}`);
} catch (e) {
  if (e instanceof DataError) {
    console.error(`✗ ${e.message}`);
    if (process.env.GITHUB_ACTIONS) for (const p of e.problems) console.log(`::error title=資料錯誤::${formatProblem(p)}`);
  } else {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  }
  process.exit(1);
}
