// 狀態 enum 固定在程式中：badge 顏色、統計（例如「追蹤中」= 非已結案）都依賴這些語意。
// 可由委員自行增減的選項（分類、負責單位）放在 Sheet「選項」分頁。

export type Tone = 'info' | 'wait' | 'done' | 'neutral' | 'alert';

export const ISSUE_STATUS = ['待排程', '討論中', '進行中', '受阻', '持續觀察', '已結案'] as const;
export const ACTION_STATUS = ['待處理', '已排程', '進行中', '受阻', '已完成', '已取消'] as const;
export const DECISION_STATUS = ['有效', '已修正', '已廢止'] as const;
export const MEETING_STATUS = ['已排程', '紀錄整理中', '紀錄確認中', '已確認', '已取消'] as const;
export const MEETING_TYPE = ['正式委員會', '工作會議', '區分所有權人會議', '臨時會議', '其他'] as const;
export const RULE_STATUS = ['草案', '現有文件・效力待確認', '修訂版本・效力待確認', '已生效', '已廢止'] as const;
export const PRIORITY = ['P1', 'P2', 'P3'] as const;

/** 議題的公開範圍；待辦、決議另有「依議題設定」。 */
export const ISSUE_VISIBILITY = ['完整公開', '內容遮蔽'] as const;
export const CHILD_VISIBILITY = ['依議題設定', '完整公開', '內容遮蔽'] as const;

export type IssueStatus = (typeof ISSUE_STATUS)[number];
export type ActionStatus = (typeof ACTION_STATUS)[number];
export type DecisionStatus = (typeof DECISION_STATUS)[number];
export type MeetingStatus = (typeof MEETING_STATUS)[number];
export type MeetingType = (typeof MEETING_TYPE)[number];
export type RuleStatus = (typeof RULE_STATUS)[number];
export type Priority = (typeof PRIORITY)[number];

const TONES: Record<string, Tone> = {
  // 議題
  待排程: 'neutral',
  討論中: 'wait',
  進行中: 'info',
  受阻: 'alert',
  持續觀察: 'neutral',
  已結案: 'done',
  // 待辦
  待處理: 'wait',
  已排程: 'neutral',
  已完成: 'done',
  已取消: 'neutral',
  // 決議
  有效: 'done',
  已修正: 'neutral',
  已廢止: 'neutral',
  // 會議
  紀錄整理中: 'wait',
  紀錄確認中: 'info',
  已確認: 'done',
  // 管理辦法
  草案: 'wait',
  '現有文件・效力待確認': 'info',
  '修訂版本・效力待確認': 'info',
  已生效: 'done',
};

export function toneOf(status: string): Tone {
  return TONES[status] ?? 'neutral';
}

export const DEFAULT_CATEGORIES = ['行政', '物業', '點交', '門禁', '公設', '住戶服務', '保固', '外觀', '財務', '安全'];
export const DEFAULT_OWNER_TYPES = ['管委會', '物業', '建商', '待指定'];
