import { SCHEMA_VERSION } from '../src/core/schema';

let seq = 0;
export const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

export function issue(o: Record<string, unknown> = {}) {
  return { _internal_id: uuid(), display_id: 'ISS-0001', title: '電梯異音', category: '公設', status: '進行中', problem: '電梯運轉有異音', created_at: '2026-09-22', updated_at: '2026-09-22', ...o };
}
export function action(o: Record<string, unknown> = {}) {
  return { _internal_id: uuid(), display_id: 'ACT-20260922-01', title: '請廠商檢查', issue_id: 'ISS-0001', status: '待處理', created_at: '2026-09-22', ...o };
}
export function decision(o: Record<string, unknown> = {}) {
  return { _internal_id: uuid(), display_id: 'DEC-20260922-01', title: '委請廠商', issue_id: 'ISS-0001', meeting_id: 'MTG-20260922', status: '有效', date: '2026-09-22', ...o };
}
export function meeting(o: Record<string, unknown> = {}) {
  return { _internal_id: uuid(), display_id: 'MTG-20260922', title: '第一次委員會議', type: '正式委員會', date: '2026-09-22', status: '紀錄確認中', ...o };
}

export function envelope(data: Record<string, unknown[]>, extra: Record<string, unknown> = {}) {
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: '2026-09-26T00:00:00.000Z',
    settings: {},
    options: { categories: ['公設', '財務'], owner_types: ['管委會', '物業'] },
    privacy: { sanitizer_version: '1', masked_counts: {} },
    data: { issues: [], actions: [], decisions: [], meetings: [], rules: [], announcements: [], ...data },
    ...extra,
  };
}
