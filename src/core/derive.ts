// Build-time derived views：統計、最近更新、會議排程、所有反向關聯。
// 這些都不需要委員維護第二份資料。

import { ACTION_STATUS, DECISION_STATUS, ISSUE_STATUS, MEETING_STATUS, RULE_STATUS } from './enums';
import { extractIds } from './refs';
import type { Action, Announcement, Dataset, Decision, Issue, Meeting, Rule } from './schema';
import { withDefaults, type Settings } from './settings';

export interface SiteData {
  generatedAt: string;
  today: string;
  settings: Settings;
  issues: Issue[];
  actions: Action[];
  decisions: Decision[];
  meetings: Meeting[];
  rules: Rule[];
  /** 已到發布日、未過下架日；置頂優先，再依日期新到舊 */
  announcements: Announcement[];
  issueById: Map<string, Issue>;
  actionById: Map<string, Action>;
  decisionById: Map<string, Decision>;
  meetingById: Map<string, Meeting>;
  ruleById: Map<string, Rule>;
  announcementById: Map<string, Announcement>;
  rel: {
    issueActions: Map<string, Action[]>;
    issueDecisions: Map<string, Decision[]>;
    issueMeetings: Map<string, Meeting[]>;
    issueAnnouncements: Map<string, Announcement[]>;
    meetingIssues: Map<string, Issue[]>;
    meetingActions: Map<string, Action[]>;
    meetingDecisions: Map<string, Decision[]>;
  };
  stats: {
    issuesTracked: number;
    issuesTotal: number;
    actionsTotal: number;
    actionsOpen: number;
    decisionsTotal: number;
    meetingsTotal: number;
    meetingsUpcoming: number;
  };
  recentIssues: Issue[];
  latestMeeting: Meeting | undefined;
  upcomingMeetings: Meeting[];
  filters: {
    issueStatus: string[];
    issueCategory: string[];
    actionStatus: string[];
    actionOwnerType: string[];
    decisionStatus: string[];
    meetingStatus: string[];
    ruleStatus: string[];
  };
  /** 所有公開頁面存在的 ID（markdown 自動連結用） */
  knownIds: Set<string>;
}

const byId = <T extends { display_id: string }>(a: T, b: T) => a.display_id.localeCompare(b.display_id);
const index = <T extends { display_id: string }>(xs: T[]) => new Map(xs.map((x) => [x.display_id, x]));

function group<T, K>(xs: T[], key: (x: T) => K | '' | undefined): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!k) continue;
    const arr = m.get(k as K) ?? [];
    arr.push(x);
    m.set(k as K, arr);
  }
  return m;
}

function present(order: readonly string[], values: string[]): string[] {
  const set = new Set(values.filter(Boolean));
  const known = order.filter((v) => set.has(v));
  const extra = [...set].filter((v) => !order.includes(v)).sort();
  return [...known, ...extra];
}

export function isMeetingHeld(m: Meeting, today: string): boolean {
  return m.date < today || m.body_md !== null;
}

export function meetingBadge(m: Meeting, today: string): string {
  if (m.status === '已取消') return '已取消';
  if (!isMeetingHeld(m, today)) return '已排程';
  if (m.status === '已排程') return '紀錄整理中';
  return m.confirmation_note || m.status;
}

export const OPEN_ACTION = (a: Action) => a.status !== '已完成' && a.status !== '已取消';

export function derive(ds: Dataset, today: string): SiteData {
  const { issues, actions, decisions, meetings, rules } = ds.data;
  issues.sort(byId);
  actions.sort(byId);
  decisions.sort(byId);
  meetings.sort((a, b) => a.date.localeCompare(b.date) || byId(a, b));
  rules.sort(byId);

  const announcements = ds.data.announcements
    .filter((a) => a.date <= today && (!a.expires_date || a.expires_date >= today))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date) || byId(a, b));

  const issueById = index(issues);
  const meetingById = index(meetings);

  const issueActions = group(actions, (a) => a.issue_id);
  const issueDecisions = group(decisions, (d) => d.issue_id);
  const issueAnnouncements = group(announcements, (a) => a.issue_id);
  const meetingActions = group(actions, (a) => a.source_meeting_id);
  const meetingDecisions = group(decisions, (d) => d.meeting_id);

  // Meeting ↔ Issue：會議全文提及 ∪ 該會議產生的待辦／決議所屬議題
  const meetingIssueIds = new Map<string, Set<string>>();
  for (const m of meetings) {
    const ids = new Set(extractIds(m.body_md ?? '', 'issue'));
    for (const a of meetingActions.get(m.display_id) ?? []) ids.add(a.issue_id);
    for (const d of meetingDecisions.get(m.display_id) ?? []) if (d.issue_id) ids.add(d.issue_id);
    meetingIssueIds.set(m.display_id, new Set([...ids].filter((id) => issueById.has(id))));
  }
  const meetingIssues = new Map<string, Issue[]>();
  const issueMeetings = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const list = [...meetingIssueIds.get(m.display_id)!].map((id) => issueById.get(id)!).sort(byId);
    meetingIssues.set(m.display_id, list);
    for (const i of list) issueMeetings.set(i.display_id, [...(issueMeetings.get(i.display_id) ?? []), m]);
  }

  const upcomingMeetings = meetings.filter((m) => !isMeetingHeld(m, today) && m.status !== '已取消');
  const held = meetings.filter((m) => isMeetingHeld(m, today) && m.status !== '已取消');
  const latestMeeting = held.at(-1);

  const recentIssues = [...issues]
    .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at) || byId(a, b))
    .slice(0, 5);

  const knownIds = new Set<string>([
    ...issues.map((x) => x.display_id),
    ...actions.map((x) => x.display_id),
    ...decisions.map((x) => x.display_id),
    ...meetings.map((x) => x.display_id),
    ...rules.map((x) => x.display_id),
    ...announcements.map((x) => x.display_id),
  ]);

  return {
    generatedAt: ds.generated_at,
    today,
    settings: withDefaults(ds.settings),
    issues,
    actions,
    decisions,
    meetings,
    rules,
    announcements,
    issueById,
    actionById: index(actions),
    decisionById: index(decisions),
    meetingById,
    ruleById: index(rules),
    announcementById: index(announcements),
    rel: { issueActions, issueDecisions, issueMeetings, issueAnnouncements, meetingIssues, meetingActions, meetingDecisions },
    stats: {
      issuesTracked: issues.filter((i) => i.status !== '已結案').length,
      issuesTotal: issues.length,
      actionsTotal: actions.length,
      actionsOpen: actions.filter(OPEN_ACTION).length,
      decisionsTotal: decisions.length,
      meetingsTotal: meetings.length,
      meetingsUpcoming: upcomingMeetings.length,
    },
    recentIssues,
    latestMeeting,
    upcomingMeetings,
    filters: {
      issueStatus: present(ISSUE_STATUS, issues.map((i) => i.status)),
      issueCategory: present(ds.options.categories, issues.map((i) => i.category)),
      actionStatus: present(ACTION_STATUS, actions.map((a) => a.status)),
      actionOwnerType: present(ds.options.owner_types, actions.map((a) => a.owner_type)),
      decisionStatus: present(DECISION_STATUS, decisions.map((d) => d.status)),
      meetingStatus: present(MEETING_STATUS, meetings.map((m) => m.status)),
      ruleStatus: present(RULE_STATUS, rules.map((r) => r.status)),
    },
    knownIds,
  };
}
