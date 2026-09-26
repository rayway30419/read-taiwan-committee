// Public dataset schema（Apps Script 匯出 → CI → Astro）。
// 錯誤訊息直接寫中文，validate.ts 再組成「分頁 第 N 列（編號）：「欄位」…」。

import { z } from 'zod';
import {
  ACTION_STATUS,
  DECISION_STATUS,
  ISSUE_STATUS,
  MEETING_STATUS,
  MEETING_TYPE,
  PRIORITY,
  RULE_STATUS,
} from './enums';

export const SCHEMA_VERSION = 1;

const oneOf = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values, { error: () => `必須是以下其中之一：${values.join('、')}` });

const req = z.string({ error: '必填' }).trim().min(1, '必填');
const text = z.string().default('');
const date = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, '日期格式應為 YYYY-MM-DD')
  .default('');
const reqDate = z.string({ error: '必填' }).regex(/^\d{4}-\d{2}-\d{2}$/, '必填，日期格式應為 YYYY-MM-DD');
const time = z
  .string()
  .regex(/^(\d{1,2}:\d{2})?$/, '時間格式應為 HH:MM')
  .default('');
const url = z
  .string()
  .regex(/^(https:\/\/\S+)?$/, '必須是 https:// 開頭的網址')
  .default('');
const ref = z
  .string()
  .default('');
const priority = z.union([z.literal(''), oneOf(PRIORITY)]).default('');

const base = {
  _internal_id: z.string({ error: '缺少內部編號，請執行「管委會網站 → 檢查資料」補齊' }).min(8, '內部編號無效'),
  display_id: req,
  _row: z.number().int().optional(),
  created_at: date,
  updated_at: date,
};

export const IssueSchema = z.object({
  ...base,
  title: req,
  category: req,
  status: oneOf(ISSUE_STATUS),
  priority,
  priority_reason: text,
  priority_confirmed: z.boolean().default(false),
  lead: text,
  problem: req,
  goal: text,
  next_action: text,
  close_criteria: text,
  target_date: date,
  closed_date: date,
  content_masked: z.boolean().default(false),
});

export const ActionSchema = z.object({
  ...base,
  title: req,
  issue_id: z.string({ error: '必填' }).min(1, '必填'),
  source_meeting_id: ref,
  owner_type: text,
  owner: text,
  support: text,
  status: oneOf(ACTION_STATUS),
  priority,
  due_date: date,
  schedule_note: text,
  completed_date: date,
  content_masked: z.boolean().default(false),
});

export const DecisionSchema = z.object({
  ...base,
  title: req,
  issue_id: ref,
  meeting_id: z.string({ error: '必填' }).min(1, '必填'),
  date: date,
  status: oneOf(DECISION_STATUS),
  note: text,
  content_masked: z.boolean().default(false),
});

export const MeetingSchema = z.object({
  ...base,
  title: req,
  type: oneOf(MEETING_TYPE),
  date: reqDate,
  time,
  location: text,
  status: oneOf(MEETING_STATUS),
  confirmation_note: text,
  record_version: text,
  public_file_url: url,
  body_md: z.string().nullable().default(null),
  source_filename: text,
  body_stale: z.boolean().default(false),
});

export const RuleSchema = z.object({
  ...base,
  title: req,
  status: oneOf(RULE_STATUS),
  effective_date: date,
  note: text,
  public_file_url: url,
  body_md: z.string().nullable().default(null),
  source_filename: text,
  body_stale: z.boolean().default(false),
});

export const AnnouncementSchema = z.object({
  ...base,
  title: req,
  date: reqDate,
  body: req,
  attachment_url: url,
  issue_id: ref,
  pinned: z.boolean().default(false),
  expires_date: date,
});

export const DatasetEnvelopeSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION, { error: `schema_version 必須是 ${SCHEMA_VERSION}` }),
  generated_at: z.string().min(1),
  settings: z.record(z.string(), z.string()).default({}),
  options: z
    .object({ categories: z.array(z.string()).default([]), owner_types: z.array(z.string()).default([]) })
    .default({ categories: [], owner_types: [] }),
  privacy: z
    .object({ sanitizer_version: z.string().default(''), masked_counts: z.record(z.string(), z.number()).default({}) })
    .default({ sanitizer_version: '', masked_counts: {} }),
  data: z.object({
    issues: z.array(z.unknown()).default([]),
    actions: z.array(z.unknown()).default([]),
    decisions: z.array(z.unknown()).default([]),
    meetings: z.array(z.unknown()).default([]),
    rules: z.array(z.unknown()).default([]),
    announcements: z.array(z.unknown()).default([]),
  }),
});

export type Issue = z.output<typeof IssueSchema>;
export type Action = z.output<typeof ActionSchema>;
export type Decision = z.output<typeof DecisionSchema>;
export type Meeting = z.output<typeof MeetingSchema>;
export type Rule = z.output<typeof RuleSchema>;
export type Announcement = z.output<typeof AnnouncementSchema>;
export type DatasetEnvelope = z.output<typeof DatasetEnvelopeSchema>;

export interface Dataset {
  schema_version: number;
  generated_at: string;
  settings: Record<string, string>;
  options: { categories: string[]; owner_types: string[] };
  privacy: { sanitizer_version: string; masked_counts: Record<string, number> };
  data: {
    issues: Issue[];
    actions: Action[];
    decisions: Decision[];
    meetings: Meeting[];
    rules: Rule[];
    announcements: Announcement[];
  };
}

export const ENTITY_SCHEMAS = {
  issue: IssueSchema,
  action: ActionSchema,
  decision: DecisionSchema,
  meeting: MeetingSchema,
  rule: RuleSchema,
  announcement: AnnouncementSchema,
} as const;
