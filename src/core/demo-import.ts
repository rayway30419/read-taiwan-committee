// 一次性遷移：把 demo 站的結構化資料（data/*.json + 列表頁 metadata）轉成 Sheet 列。
// 只取結構化欄位；會議全文與管理辦法全文不從 demo HTML 擷取，由委員上傳原始文件後走「預覽並核准」。
// 已遮蔽的值（[姓名已遮蔽] 等）照原樣匯入。

import { normalizeDate, normalizeTime, normalizeText } from './normalize';
import { normalizeId, type EntityKind } from './refs';

type Json = Record<string, unknown>;
export type ImportRow = Record<string, string | boolean>;

export interface DemoSource {
  issues: Json[];
  actions: Json[];
  decisions: Json[];
  meetings: Json[];
  /** meetings/index.html 的 badge 文字（例如「主委已確認・委員確認中」） */
  meetingBadges?: Record<string, string>;
  /** 各會議詳細頁 reading-note（用來取紀錄版本） */
  meetingNotes?: Record<string, string>;
  rules?: DemoRule[];
}

export interface DemoRule {
  id: string;
  title: string;
  status: string;
  filename: string;
}

const t = (v: unknown) => normalizeText(v);
const id = (v: unknown) => normalizeId(t(v)) ?? t(v);
const MASK_RE = /^\[[^\]]*內容已遮蔽\]$/;

const MEETING_STATUS_MAP: Record<string, string> = {
  草稿: '紀錄確認中',
  已排程: '已排程',
  已確認: '已確認',
};

export function mapDemo(src: DemoSource): Record<EntityKind, ImportRow[]> {
  const issues = src.issues.map((r): ImportRow => {
    const masked = ['Problem', 'Goal', 'Next Action'].some((k) => MASK_RE.test(t(r[k])));
    return {
      display_id: id(r['Issue ID']),
      title: t(r.Title),
      category: t(r.Category),
      status: t(r.Status),
      priority: t(r.Priority),
      priority_reason: t(r['優先理由']),
      priority_confirmed: false,
      lead: t(r.Lead),
      problem: t(r.Problem),
      goal: t(r.Goal),
      next_action: t(r['Next Action']),
      close_criteria: t(r['Close Criteria']),
      target_date: normalizeDate(r.Target),
      closed_date: normalizeDate(r['Closed Date']),
      published: true,
      visibility: masked ? '內容遮蔽' : '完整公開',
      created_at: normalizeDate(r.Created),
      updated_at: normalizeDate(r.Updated),
    };
  });

  const actions = src.actions.map((r): ImportRow => {
    const ownerType = t(r['Owner Type']);
    const owner = t(r.Owner);
    return {
      display_id: id(r['Action ID']),
      title: t(r.Action),
      issue_id: id(r['Issue ID']),
      source_meeting_id: id(r['Source Meeting']),
      owner_type: ownerType,
      owner: owner === ownerType ? '' : owner,
      support: t(r.Support),
      status: t(r.Status),
      priority: t(r.Priority),
      due_date: normalizeDate(r.Due),
      schedule_note: t(r['時程說明']),
      completed_date: normalizeDate(r.Completed),
      published: true,
      visibility: '依議題設定',
      created_at: normalizeDate(r.Created),
      updated_at: normalizeDate(r.Completed) || normalizeDate(r.Created),
    };
  });

  const decisions = src.decisions.map(
    (r): ImportRow => ({
      display_id: id(r['Decision ID']),
      title: t(r.Decision),
      issue_id: id(r['Issue ID']),
      meeting_id: id(r.Meeting),
      date: normalizeDate(r.Date),
      status: t(r.Status) || '有效',
      note: '',
      published: true,
      visibility: '依議題設定',
      created_at: normalizeDate(r.Date),
      updated_at: normalizeDate(r.Date),
    }),
  );

  const meetings = src.meetings.map((r): ImportRow => {
    const mid = id(r['Meeting ID']);
    const status = MEETING_STATUS_MAP[t(r.Status)] ?? t(r.Status);
    const badge = t(src.meetingBadges?.[mid]);
    const version = t(src.meetingNotes?.[mid]).match(/v\d+(?:\.\d+)*/i)?.[0] ?? '';
    return {
      display_id: mid,
      title: t(r['名稱']),
      type: t(r['類型']),
      date: normalizeDate(r['日期']),
      time: normalizeTime(r['時間']),
      location: '',
      status,
      confirmation_note: badge && badge !== status && badge !== t(r.Status) ? badge : '',
      record_version: version,
      published: true,
      created_at: normalizeDate(r['日期']),
      updated_at: normalizeDate(r['日期']),
    };
  });

  const rules = (src.rules ?? []).map(
    (r): ImportRow => ({
      display_id: id(r.id),
      title: r.title,
      status: r.status,
      effective_date: '',
      note: r.filename ? `來源文件：${r.filename}` : '',
      published: true,
    }),
  );

  return { issue: issues, action: actions, decision: decisions, meeting: meetings, rule: rules, announcement: [] };
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

function cards(html: string): string[] {
  return html.split(/<article\b[^>]*class="[^"]*\bcard\b[^"]*"[^>]*>/).slice(1).map((c) => c.split('</article>')[0] ?? '');
}

/** meetings/index.html → { MTG-20260922: '主委已確認・委員確認中', … } */
export function parseDemoMeetingIndex(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cards(html)) {
    const mid = c.match(/<span class="id">([^<]+)<\/span>/)?.[1];
    const badge = c.match(/<span class="badge[^"]*">([\s\S]*?)<\/span>/)?.[1];
    if (mid && badge) out[id(mid)] = stripTags(badge);
  }
  return out;
}

/** 會議詳細頁的 reading-note（第一個以外的；第一個是全站隱私說明） */
export function parseDemoMeetingNote(html: string): string {
  const notes = [...html.matchAll(/<div class="reading-note"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1]!));
  return notes.find((n) => /v\d/i.test(n)) ?? '';
}

/** rules/index.html → 管理辦法 metadata */
export function parseDemoRulesIndex(html: string): DemoRule[] {
  const out: DemoRule[] = [];
  for (const c of cards(html)) {
    const rid = c.match(/<span class="id">([^<]+)<\/span>/)?.[1];
    const status = c.match(/<span class="badge[^"]*">([\s\S]*?)<\/span>/)?.[1];
    const title = c.match(/<h3>[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/)?.[1];
    const filename = c.match(/<div class="meta">([\s\S]*?)<\/div>/)?.[1];
    if (rid && title) out.push({ id: id(rid), title: stripTags(title), status: stripTags(status ?? ''), filename: stripTags(filename ?? '') });
  }
  return out;
}
