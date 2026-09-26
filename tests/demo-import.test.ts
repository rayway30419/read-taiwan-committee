import { describe, expect, it } from 'vitest';
import { mapDemo, parseDemoMeetingIndex, parseDemoMeetingNote, parseDemoRulesIndex } from '../src/core/demo-import';

describe('demo import mapping', () => {
  const out = mapDemo({
    issues: [
      { 'Issue ID': 'ISS-0011', Title: '建商財務交接', Problem: '[財務內容已遮蔽]', Goal: '[財務內容已遮蔽]', Category: '財務', Priority: 'P1', Status: '進行中', Lead: '待指定', 'Next Action': '[財務內容已遮蔽]', Created: '2026-09-22', Updated: '2026-09-23', Target: '', 'Closed Date': '', 優先理由: '[財務內容已遮蔽]' },
      { 'Issue ID': 'ISS-0001', Title: '管委會成立', Problem: '須辦理報備', Category: '行政', Status: '進行中', Created: '2026-09-22', Updated: '2026-09-23' },
    ],
    actions: [
      { 'Action ID': 'ACT-20260922-01', Action: '辦理報備', 'Issue ID': 'ISS-0001', 'Owner Type': '物業', Owner: '物業', Status: '進行中', 'Source Meeting': 'MTG-20260922', Created: '2026-09-22', 時程說明: '儘速' },
      { 'Action ID': 'ACT-20260922-04', Action: '提供權責', 'Issue ID': 'ISS-0002', 'Owner Type': '物業', Owner: '[姓名已遮蔽]／安杰', Status: '已完成', Completed: '2026-09-24', Created: '2026-09-22' },
    ],
    decisions: [{ 'Decision ID': 'DEC-20260922-01', Decision: '公開徵求', 'Issue ID': 'ISS-0002', Date: '2026-09-22', Meeting: 'MTG-20260922', Status: '有效' }],
    meetings: [
      { 'Meeting ID': 'MTG-20260922', 日期: '2026-09-22', 時間: '20:30', 類型: '正式委員會', 名稱: '第一屆第一次委員會議', Status: '草稿' },
      { 'Meeting ID': 'MTG-20261002', 日期: '2026-10-02', 時間: '19:00', 類型: '工作會議', 名稱: '委員工作會議', Status: '已排程' },
    ],
    meetingBadges: { 'MTG-20260922': '主委已確認・委員確認中', 'MTG-20261002': '已排程' },
    meetingNotes: { 'MTG-20260922': '主委已確認，其他委員確認中。本文以 v0.2 為來源' },
    rules: [{ id: 'RULE-001', title: '社區規約', status: '修訂版本・效力待確認', filename: '規約.docx' }],
  });

  it('issues', () => {
    expect(out.issue[0]).toMatchObject({ display_id: 'ISS-0011', visibility: '內容遮蔽', priority_confirmed: false, published: true, created_at: '2026-09-22' });
    expect(out.issue[1]).toMatchObject({ visibility: '完整公開', priority: '' });
  });
  it('actions: owner equal to owner type becomes blank', () => {
    expect(out.action[0]).toMatchObject({ owner_type: '物業', owner: '', source_meeting_id: 'MTG-20260922', schedule_note: '儘速', visibility: '依議題設定' });
    expect(out.action[1]).toMatchObject({ owner: '[姓名已遮蔽]／安杰', completed_date: '2026-09-24', updated_at: '2026-09-24' });
  });
  it('meetings: 草稿 → 紀錄確認中 with confirmation note and version', () => {
    expect(out.meeting[0]).toMatchObject({ status: '紀錄確認中', confirmation_note: '主委已確認・委員確認中', record_version: 'v0.2', time: '20:30' });
    expect(out.meeting[1]).toMatchObject({ status: '已排程', confirmation_note: '' });
  });
  it('rules metadata', () => {
    expect(out.rule[0]).toMatchObject({ display_id: 'RULE-001', status: '修訂版本・效力待確認', note: '來源文件：規約.docx' });
  });
});

describe('demo html parsers', () => {
  it('rules index', () => {
    const html = `<article class="card"><div class="card-top"><span class="badge wait">草案</span><span class="id">RULE-003</span></div><h3><a href="RULE-003/index.html">行政相關辦法</a></h3><div class="meta">行政相關辦法(初稿).docx</div></article>`;
    expect(parseDemoRulesIndex(html)).toEqual([{ id: 'RULE-003', title: '行政相關辦法', status: '草案', filename: '行政相關辦法(初稿).docx' }]);
  });
  it('meeting index and note', () => {
    expect(parseDemoMeetingIndex(`<article class="card"><span class="badge ">主委已確認・委員確認中</span><span class="id">MTG-20260922</span></article>`)).toEqual({ 'MTG-20260922': '主委已確認・委員確認中' });
    expect(parseDemoMeetingNote(`<div class="reading-note" style="x">個人識別資訊已遮蔽</div><div class="reading-note">本文以 v0.2 為來源</div>`)).toBe('本文以 v0.2 為來源');
  });
});
