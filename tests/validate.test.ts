import { describe, expect, it } from 'vitest';
import { formatProblem, validateDataset } from '../src/core/validate';
import { action, decision, envelope, issue, meeting } from './helpers';

const messages = (raw: unknown) => validateDataset(raw).errors.map(formatProblem);

describe('validateDataset', () => {
  it('accepts a valid dataset and fills defaults', () => {
    const r = validateDataset(envelope({ issues: [issue()], actions: [action()], decisions: [decision()], meetings: [meeting()] }));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.dataset!.data.issues[0]).toMatchObject({ goal: '', priority_confirmed: false, content_masked: false });
    expect(r.dataset!.data.meetings[0]!.body_md).toBeNull();
  });

  it('broken relationship → row-mapped Chinese error', () => {
    const m = messages(envelope({ issues: [issue()], actions: [action({ _row: 17, display_id: 'ACT-20260922-05', issue_id: 'ISS-0099' })] }));
    expect(m).toEqual(['待辦 第 17 列（ACT-20260922-05）：「相關議題」= ISS-0099，找不到對應議題（可能不存在、未勾選公開，或已刪除）']);
  });

  it('required / enum / date errors show field label and current value', () => {
    const m = messages(envelope({ issues: [issue({ _row: 3, title: '', status: '處理中', target_date: '十月' })] }));
    expect(m).toContain('議題 第 3 列（ISS-0001）：「標題」必填');
    expect(m.some((x) => x.includes('「狀態」必須是以下其中之一') && x.includes('目前值：處理中'))).toBe(true);
    expect(m.some((x) => x.includes('「目標日期」日期格式應為 YYYY-MM-DD'))).toBe(true);
  });

  it('duplicate display and internal ids', () => {
    const a = issue({ _row: 2 });
    const m = messages(envelope({ issues: [a, issue({ _row: 5 }), { ...issue({ _row: 6, display_id: 'ISS-0002' }), _internal_id: a._internal_id }] }));
    expect(m[0]).toContain('議題 第 5 列（ISS-0001）：「編號」與第 2 列重複');
    expect(m[1]).toContain('內部編號與 議題 第 2 列（ISS-0001）重複');
  });

  it('wrong id prefix for sheet', () => {
    expect(messages(envelope({ issues: [issue({ display_id: 'ACT-20260922-01' })] }))[0]).toContain('不是議題的編號格式');
  });

  it('status consistency is a warning, not an error', () => {
    const r = validateDataset(envelope({ issues: [issue({ status: '已結案' })] }));
    expect(r.ok).toBe(true);
    expect(r.warnings.map(formatProblem)[0]).toContain('未填結案日期');
  });

  it('schema version mismatch', () => {
    expect(messages({ ...envelope({}), schema_version: 99 })[0]).toContain('版本不符');
  });
});
