// 「網站設定」分頁：key / 說明 / 值。委員可改網站文案而不需動程式。

export interface SettingDef {
  key: string;
  label: string;
  default: string;
}

export const SETTINGS = [
  { key: 'site_name', label: '網站名稱', default: '閱讀台灣' },
  { key: 'site_subtitle', label: '網站副標', default: '社區治理資訊網' },
  { key: 'term_label', label: '屆別（右上角）', default: '第一屆管理委員會' },
  { key: 'home_heading', label: '首頁標題', default: '關心的事，現在到哪裡？' },
  { key: 'home_lead', label: '首頁說明', default: '查詢議題進度、決議與會議紀錄。' },
  { key: 'top_banner', label: '頂部提示（空白則不顯示）', default: '' },
  {
    key: 'privacy_note',
    label: '隱私說明',
    default: '個人識別資訊、帳戶與財務細節已遮蔽；本網站不代替完整正式文件。',
  },
  { key: 'search_examples', label: '搜尋提示範例（以、分隔）', default: '電梯、公共冰箱' },
  { key: 'footer_note', label: '頁尾附註', default: '' },
  { key: 'noindex', label: '禁止搜尋引擎收錄（是／否）', default: '是' },
  { key: 'mask_money', label: '遮蔽金額（是／否）', default: '是' },
  { key: 'privacy_allow', label: '不遮蔽的公開資訊（以、分隔，例如物業服務中心電話）', default: '' },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTINGS)[number]['key'];
export type Settings = Record<SettingKey, string>;

export function withDefaults(raw: Record<string, unknown> | undefined): Settings {
  const out = {} as Settings;
  for (const s of SETTINGS) {
    const v = raw?.[s.key];
    out[s.key] = typeof v === 'string' ? v.trim() : s.default;
  }
  return out;
}
