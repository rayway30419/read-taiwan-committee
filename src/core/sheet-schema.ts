// Sheet 欄位定義：Apps Script setup、匯出 allowlist、validation 錯誤訊息、demo 匯入共用。
// 新增或修改欄位：改這裡 → 更新 schema.ts / 頁面 → `npm run build:apps-script` → 在 Sheet 執行「初始化/修復試算表」。

import {
  ACTION_STATUS,
  CHILD_VISIBILITY,
  DECISION_STATUS,
  ISSUE_STATUS,
  ISSUE_VISIBILITY,
  MEETING_STATUS,
  MEETING_TYPE,
  PRIORITY,
  RULE_STATUS,
} from './enums';
import type { EntityKind } from './refs';

export type ColumnType =
  | 'text'
  | 'longtext'
  | 'date'
  | 'time'
  | 'checkbox'
  | 'enum'
  | 'option' // 來源為「選項」分頁
  | 'ref'
  | 'url'
  | 'auto' // script 寫入、可見、受保護
  | 'hidden'; // script 寫入、隱藏、受保護

export interface Column {
  /** public dataset 欄位名（英文）。以 _ 開頭者為技術欄位 */
  key: string;
  /** Sheet 上看到的中文欄名 */
  label: string;
  type: ColumnType;
  required?: boolean;
  options?: readonly string[];
  /** option 欄位：「選項」分頁的哪一欄 */
  optionList?: 'categories' | 'owner_types';
  /** ref 欄位指向的實體 */
  ref?: EntityKind;
  /**
   * 是否進入 public dataset（allowlist）。未標 true 的欄位一律不匯出。
   * 'sanitize' = 匯出前經 PII sanitizer；'as-is' = 受控值（enum、日期、ID）直接匯出
   */
  public?: 'sanitize' | 'as-is';
  /** 「公開範圍 = 內容遮蔽」時要被整欄取代的欄位 */
  maskable?: boolean;
  width?: number;
  note?: string;
}

export interface SheetDef {
  kind: EntityKind;
  sheet: string;
  /** 顯示用的實體名稱（錯誤訊息、搜尋類型） */
  noun: string;
  /** 產生日期型編號時使用的欄位 key */
  idDateKey?: string;
  titleKey: string;
  columns: Column[];
}

const id: Column = { key: 'display_id', label: '編號', type: 'auto', public: 'as-is', width: 140, note: '自動產生，請勿修改' };
const tech: Column[] = [
  { key: '_internal_id', label: '_internal_id', type: 'hidden', public: 'as-is' },
  { key: '_created_at', label: '_created_at', type: 'hidden' },
  { key: '_updated_at', label: '_updated_at', type: 'hidden' },
];
const docTech: Column[] = [
  { key: '_approved_revision', label: '_approved_revision', type: 'hidden' },
  { key: '_approved_cache_id', label: '_approved_cache_id', type: 'hidden' },
  { key: '_approved_hash', label: '_approved_hash', type: 'hidden' },
];
const published: Column = { key: 'published', label: '公開', type: 'checkbox', width: 60, note: '勾選後才會出現在網站' };
const created: Column = { key: 'created_at', label: '建立日期', type: 'auto', public: 'as-is', width: 100 };
const updated: Column = { key: 'updated_at', label: '更新日期', type: 'auto', public: 'as-is', width: 100 };
const docApproval: Column = {
  key: 'doc_approval',
  label: '文件核准狀態',
  type: 'auto',
  width: 200,
  note: '由「管委會網站 → 預覽並核准文件」寫入',
};

export const SHEETS: Record<EntityKind, SheetDef> = {
  issue: {
    kind: 'issue',
    sheet: '議題',
    noun: '議題',
    titleKey: 'title',
    columns: [
      id,
      { key: 'title', label: '標題', type: 'text', required: true, public: 'sanitize', width: 240 },
      { key: 'category', label: '分類', type: 'option', optionList: 'categories', required: true, public: 'as-is', width: 90 },
      { key: 'status', label: '狀態', type: 'enum', options: ISSUE_STATUS, required: true, public: 'as-is', width: 90 },
      { key: 'priority', label: '優先程度', type: 'enum', options: PRIORITY, public: 'as-is', width: 80 },
      { key: 'priority_reason', label: '優先理由', type: 'longtext', public: 'sanitize', maskable: true, width: 220 },
      { key: 'priority_confirmed', label: '優先已確認', type: 'checkbox', public: 'as-is', width: 80, note: '未勾選時網站顯示「目前為初始化建議，尚非正式決議」' },
      { key: 'lead', label: '負責窗口', type: 'text', public: 'sanitize', width: 110 },
      { key: 'problem', label: '問題說明', type: 'longtext', required: true, public: 'sanitize', maskable: true, width: 320 },
      { key: 'goal', label: '希望達成的目標', type: 'longtext', public: 'sanitize', maskable: true, width: 280 },
      { key: 'next_action', label: '下一步', type: 'longtext', public: 'sanitize', maskable: true, width: 240 },
      { key: 'close_criteria', label: '結案條件', type: 'longtext', public: 'sanitize', maskable: true, width: 200 },
      { key: 'target_date', label: '目標日期', type: 'date', public: 'as-is', width: 100 },
      { key: 'closed_date', label: '結案日期', type: 'date', public: 'as-is', width: 100 },
      published,
      { key: 'visibility', label: '公開範圍', type: 'enum', options: ISSUE_VISIBILITY, public: 'as-is', width: 100, note: '內容遮蔽：網站只顯示標題、分類與狀態（例如財務議題）' },
      created,
      updated,
      ...tech,
    ],
  },
  action: {
    kind: 'action',
    sheet: '待辦',
    noun: '待辦',
    idDateKey: 'created_at',
    titleKey: 'title',
    columns: [
      id,
      { key: 'title', label: '待辦事項', type: 'text', required: true, public: 'sanitize', maskable: true, width: 260 },
      { key: 'issue_id', label: '相關議題', type: 'ref', ref: 'issue', required: true, public: 'as-is', width: 220 },
      { key: 'source_meeting_id', label: '來源會議', type: 'ref', ref: 'meeting', public: 'as-is', width: 200 },
      { key: 'owner_type', label: '負責單位', type: 'option', optionList: 'owner_types', public: 'as-is', width: 90 },
      { key: 'owner', label: '負責人', type: 'text', public: 'sanitize', width: 140, note: '個人姓名請加入「遮蔽詞庫」' },
      { key: 'support', label: '協作單位', type: 'text', public: 'sanitize', width: 120 },
      { key: 'status', label: '狀態', type: 'enum', options: ACTION_STATUS, required: true, public: 'as-is', width: 90 },
      { key: 'priority', label: '優先程度', type: 'enum', options: PRIORITY, public: 'as-is', width: 80 },
      { key: 'due_date', label: '到期日', type: 'date', public: 'as-is', width: 100 },
      { key: 'schedule_note', label: '時程說明', type: 'text', public: 'sanitize', maskable: true, width: 120, note: '例如「10/12 前」、「儘速」' },
      { key: 'completed_date', label: '完成日期', type: 'date', public: 'as-is', width: 100 },
      published,
      { key: 'visibility', label: '公開範圍', type: 'enum', options: CHILD_VISIBILITY, public: 'as-is', width: 110 },
      created,
      updated,
      ...tech,
    ],
  },
  decision: {
    kind: 'decision',
    sheet: '決議',
    noun: '決議',
    idDateKey: 'date',
    titleKey: 'title',
    columns: [
      id,
      { key: 'title', label: '決議內容', type: 'longtext', required: true, public: 'sanitize', maskable: true, width: 320 },
      { key: 'issue_id', label: '相關議題', type: 'ref', ref: 'issue', public: 'as-is', width: 220 },
      { key: 'meeting_id', label: '會議', type: 'ref', ref: 'meeting', required: true, public: 'as-is', width: 200 },
      { key: 'date', label: '決議日期', type: 'date', public: 'as-is', width: 100, note: '空白時使用會議日期' },
      { key: 'status', label: '狀態', type: 'enum', options: DECISION_STATUS, required: true, public: 'as-is', width: 80 },
      { key: 'note', label: '補充說明', type: 'longtext', public: 'sanitize', maskable: true, width: 260 },
      published,
      { key: 'visibility', label: '公開範圍', type: 'enum', options: CHILD_VISIBILITY, public: 'as-is', width: 110 },
      created,
      updated,
      ...tech,
    ],
  },
  meeting: {
    kind: 'meeting',
    sheet: '會議',
    noun: '會議紀錄',
    idDateKey: 'date',
    titleKey: 'title',
    columns: [
      id,
      { key: 'title', label: '會議名稱', type: 'text', required: true, public: 'sanitize', width: 220 },
      { key: 'type', label: '類型', type: 'enum', options: MEETING_TYPE, required: true, public: 'as-is', width: 110 },
      { key: 'date', label: '日期', type: 'date', required: true, public: 'as-is', width: 100 },
      { key: 'time', label: '時間', type: 'time', public: 'as-is', width: 70 },
      { key: 'location', label: '地點', type: 'text', public: 'sanitize', width: 120 },
      { key: 'status', label: '狀態', type: 'enum', options: MEETING_STATUS, required: true, public: 'as-is', width: 100 },
      { key: 'confirmation_note', label: '確認說明', type: 'text', public: 'sanitize', width: 200, note: '例如「主委已確認・委員確認中」' },
      { key: 'record_version', label: '紀錄版本', type: 'text', public: 'sanitize', width: 80 },
      { key: 'doc_url', label: '紀錄文件', type: 'url', width: 220, note: 'Google 文件或 .docx 的 Drive 連結；可為私人檔案，需核准後才會公開遮蔽後內容' },
      { key: 'public_file_url', label: '公開檔案連結', type: 'url', public: 'as-is', width: 220, note: '已確認可公開的原始檔（知道連結的任何人可檢視）' },
      published,
      docApproval,
      created,
      updated,
      ...tech,
      ...docTech,
    ],
  },
  rule: {
    kind: 'rule',
    sheet: '管理辦法',
    noun: '管理辦法',
    titleKey: 'title',
    columns: [
      id,
      { key: 'title', label: '名稱', type: 'text', required: true, public: 'sanitize', width: 240 },
      { key: 'status', label: '狀態', type: 'enum', options: RULE_STATUS, required: true, public: 'as-is', width: 170 },
      { key: 'effective_date', label: '生效日期', type: 'date', public: 'as-is', width: 100 },
      { key: 'note', label: '說明', type: 'longtext', public: 'sanitize', width: 240 },
      { key: 'doc_url', label: '內文文件', type: 'url', width: 220, note: 'Google 文件或 .docx 的 Drive 連結' },
      { key: 'public_file_url', label: '公開檔案連結', type: 'url', public: 'as-is', width: 220 },
      published,
      docApproval,
      created,
      updated,
      ...tech,
      ...docTech,
    ],
  },
  announcement: {
    kind: 'announcement',
    sheet: '公告',
    noun: '公告',
    idDateKey: 'date',
    titleKey: 'title',
    columns: [
      id,
      { key: 'title', label: '標題', type: 'text', required: true, public: 'sanitize', width: 240 },
      { key: 'date', label: '發布日期', type: 'date', required: true, public: 'as-is', width: 100 },
      { key: 'body', label: '內容', type: 'longtext', required: true, public: 'sanitize', width: 360 },
      { key: 'attachment_url', label: '附件連結', type: 'url', public: 'as-is', width: 220 },
      { key: 'issue_id', label: '相關議題', type: 'ref', ref: 'issue', public: 'as-is', width: 220 },
      { key: 'pinned', label: '置頂', type: 'checkbox', public: 'as-is', width: 60 },
      { key: 'expires_date', label: '下架日期', type: 'date', public: 'as-is', width: 100 },
      published,
      created,
      updated,
      ...tech,
    ],
  },
};

export const ENTITY_ORDER: EntityKind[] = ['issue', 'action', 'decision', 'meeting', 'rule', 'announcement'];

export const DATA_KEY: Record<EntityKind, 'issues' | 'actions' | 'decisions' | 'meetings' | 'rules' | 'announcements'> = {
  issue: 'issues',
  action: 'actions',
  decision: 'decisions',
  meeting: 'meetings',
  rule: 'rules',
  announcement: 'announcements',
};

export const OPTIONS_SHEET = '選項';
export const OPTION_LISTS = [
  { key: 'categories', label: '分類' },
  { key: 'owner_types', label: '負責單位' },
] as const;
export const SETTINGS_SHEET = '網站設定';
export const DICTIONARY_SHEET = '遮蔽詞庫';
export const LOG_SHEET = '發布紀錄';
export const GUIDE_SHEET = '使用說明';

export function columnByKey(kind: EntityKind, key: string): Column | undefined {
  return SHEETS[kind].columns.find((c) => c.key === key);
}

export function labelOf(kind: EntityKind, key: string): string {
  return columnByKey(kind, key)?.label ?? key;
}
