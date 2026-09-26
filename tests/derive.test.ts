import { describe, expect, it } from 'vitest';
import { derive, isMeetingHeld } from '../src/core/derive';
import { validateDataset } from '../src/core/validate';
import { action, decision, envelope, issue, meeting } from './helpers';

function site() {
  const r = validateDataset(
    envelope({
      issues: [
        issue({ display_id: 'ISS-0001', updated_at: '2026-09-23' }),
        issue({ display_id: 'ISS-0002', updated_at: '2026-09-24', category: '財務' }),
        issue({ display_id: 'ISS-0003', status: '已結案', closed_date: '2026-09-24', updated_at: '2026-09-24' }),
        issue({ display_id: 'ISS-0014', updated_at: '2026-09-20' }),
      ],
      actions: [
        action({ display_id: 'ACT-20260922-01', issue_id: 'ISS-0001', source_meeting_id: 'MTG-20260922' }),
        action({ display_id: 'ACT-20260922-02', issue_id: 'ISS-0002', status: '已完成', completed_date: '2026-09-24' }),
      ],
      decisions: [decision({ issue_id: 'ISS-0002', meeting_id: 'MTG-20260922' })],
      meetings: [
        meeting({ display_id: 'MTG-20260922', body_md: '## 議題\n討論 ISS-014 與 ISS-0099' }),
        meeting({ display_id: 'MTG-20261012', date: '2026-10-12', status: '已排程' }),
        meeting({ display_id: 'MTG-20261002', date: '2026-10-02', status: '已排程' }),
      ],
      announcements: [
        { _internal_id: 'ann-0000-a1', display_id: 'ANN-20260920-01', title: '停水', date: '2026-09-20', body: '停水通知', expires_date: '2026-09-21' },
        { _internal_id: 'ann-0000-a2', display_id: 'ANN-20260925-01', title: '大掃除', date: '2026-09-25', body: '大掃除' },
        { _internal_id: 'ann-0000-a3', display_id: 'ANN-20260901-01', title: '規約', date: '2026-09-01', body: '規約', pinned: true },
        { _internal_id: 'ann-0000-a4', display_id: 'ANN-20261001-01', title: '未來', date: '2026-10-01', body: '未來' },
      ],
    }),
  );
  expect(r.errors).toEqual([]);
  return derive(r.dataset!, '2026-09-26');
}

describe('derive', () => {
  it('stats', () => {
    expect(site().stats).toMatchObject({ issuesTracked: 3, actionsTotal: 2, actionsOpen: 1, decisionsTotal: 1, meetingsTotal: 3, meetingsUpcoming: 2 });
  });

  it('recent issues: updated desc, then id', () => {
    expect(site().recentIssues.map((i) => i.display_id)).toEqual(['ISS-0002', 'ISS-0003', 'ISS-0001', 'ISS-0014']);
  });

  it('meeting ↔ issue from body mentions ∪ actions/decisions, ignoring unknown ids', () => {
    const s = site();
    expect(s.rel.meetingIssues.get('MTG-20260922')!.map((i) => i.display_id)).toEqual(['ISS-0001', 'ISS-0002', 'ISS-0014']);
    expect(s.rel.issueMeetings.get('ISS-0014')!.map((m) => m.display_id)).toEqual(['MTG-20260922']);
    expect(s.rel.issueActions.get('ISS-0001')).toHaveLength(1);
    expect(s.rel.issueDecisions.get('ISS-0002')).toHaveLength(1);
  });

  it('latest / upcoming meetings by build date', () => {
    const s = site();
    expect(s.latestMeeting!.display_id).toBe('MTG-20260922');
    expect(s.upcomingMeetings.map((m) => m.display_id)).toEqual(['MTG-20261002', 'MTG-20261012']);
    expect(isMeetingHeld(s.meetingById.get('MTG-20261002')!, '2026-10-03')).toBe(true);
  });

  it('active announcements: pinned first, then newest', () => {
    expect(site().announcements.map((a) => a.display_id)).toEqual(['ANN-20260901-01', 'ANN-20260925-01']);
  });

  it('filter options only include present values, in canonical order', () => {
    const s = site();
    expect(s.filters.issueStatus).toEqual(['進行中', '已結案']);
    expect(s.filters.issueCategory).toEqual(['公設', '財務']);
  });
});
