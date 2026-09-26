import { describe, expect, it } from 'vitest';
import { buildPublicDataset, type ExportInput, type SheetRow } from '../src/core/export';
import { formatProblem } from '../src/core/validate';
import { uuid } from './helpers';

const base = (rows: ExportInput['rows'], extra: Partial<ExportInput> = {}): ExportInput => ({
  rows,
  dictionary: [{ term: '王小明' }],
  docs: {},
  options: { categories: ['公設', '財務'], owner_types: ['管委會'] },
  settings: {},
  now: new Date('2026-09-26T00:00:00Z'),
  ...extra,
});

const iss = (o: Record<string, unknown> = {}): SheetRow => ({
  _row: 2, _internal_id: uuid(), display_id: 'ISS-0001', title: '電梯異音', category: '公設', status: '進行中',
  problem: '王小明反映 A棟12樓之3 電梯異音，電話 0912-345-678', published: true, visibility: '完整公開',
  _created_at: '2026-09-22T10:00:00Z', created_at: '2026-09-22', updated_at: '2026-09-23', ...o,
});
const act = (o: Record<string, unknown> = {}): SheetRow => ({
  _row: 2, _internal_id: uuid(), display_id: 'ACT-20260922-01', title: '請廠商到場', issue_id: 'ISS-0001 電梯異音',
  status: '待處理', schedule_note: '10/2 前', published: true, visibility: '依議題設定', created_at: '2026-09-22', ...o,
});

const parse = (r: ReturnType<typeof buildPublicDataset>) => JSON.parse(r.json!);

describe('buildPublicDataset', () => {
  it('sanitizes, keeps allowlisted fields only', () => {
    const r = buildPublicDataset(base({ issue: [iss({ secret_col: 'x' })] }));
    expect(r.errors.map(formatProblem)).toEqual([]);
    const out = parse(r).data.issues[0];
    expect(out.problem).toBe('[姓名已遮蔽]反映 [戶別已遮蔽] 電梯異音，電話 [手機已遮蔽]');
    expect(out).not.toHaveProperty('secret_col');
    expect(out).not.toHaveProperty('published');
    expect(out).not.toHaveProperty('_created_at');
    expect(r.json).not.toContain('王小明');
    expect(parse(r).privacy.masked_counts).toMatchObject({ dictionary: 1, mobile: 1 });
  });

  it('never exports the private dictionary or doc_url', () => {
    const r = buildPublicDataset(
      base({ meeting: [{ _row: 2, _internal_id: 'meeting-0001', display_id: 'MTG-20260922', title: '會議', type: '正式委員會', date: '2026-09-22', status: '已確認', published: true, doc_url: 'https://docs.google.com/document/d/PRIVATE123/edit' }] }),
    );
    expect(r.ok).toBe(true);
    expect(r.json).not.toContain('PRIVATE123');
    expect(r.warnings.map(formatProblem)[0]).toContain('尚未核准');
  });

  it('skips unpublished rows and reports references to them', () => {
    const r = buildPublicDataset(base({ issue: [iss({ published: false })], action: [act({ _row: 7 })] }));
    expect(r.ok).toBe(false);
    expect(r.json).toBeUndefined();
    expect(r.stats.skipped['議題']).toBe(1);
    expect(r.errors.map(formatProblem)[0]).toContain('待辦 第 7 列（ACT-20260922-01）：「相關議題」= ISS-0001，找不到對應議題');
  });

  it('content masking with inheritance', () => {
    const r = buildPublicDataset(
      base({
        issue: [iss({ category: '財務', visibility: '內容遮蔽', priority_reason: '公基金 35萬元' })],
        action: [act({ title: '確認帳戶' }), act({ display_id: 'ACT-20260922-02', title: '公開事項', visibility: '完整公開' })],
      }),
    );
    expect(r.errors).toEqual([]);
    const ds = parse(r);
    expect(ds.data.issues[0]).toMatchObject({ title: '電梯異音', problem: '[財務內容已遮蔽]', priority_reason: '[財務內容已遮蔽]', goal: '', content_masked: true });
    expect(ds.data.actions[0]).toMatchObject({ title: '[財務待辦內容已遮蔽]', schedule_note: '[財務內容已遮蔽]', content_masked: true });
    expect(ds.data.actions[1]).toMatchObject({ title: '公開事項', content_masked: false });
    expect(r.json).not.toContain('35萬');
  });

  it('unknown visibility fails safe', () => {
    const r = buildPublicDataset(base({ issue: [iss({ visibility: '半公開' })] }));
    expect(r.ok).toBe(false);
    expect(r.errors.map(formatProblem)[0]).toContain('「公開範圍」無法辨識「半公開」');
  });

  it('decision date falls back to meeting date', () => {
    const r = buildPublicDataset(
      base({
        issue: [iss()],
        meeting: [{ _row: 2, _internal_id: 'meeting-0001', display_id: 'MTG-20260922', title: '會議', type: '正式委員會', date: '2026/9/22', status: '已確認', published: true }],
        decision: [{ _row: 2, _internal_id: 'decision-0001', display_id: 'DEC-20260922-01', title: '通過', meeting_id: 'MTG-20260922 會議', status: '有效', published: true }],
      }),
    );
    expect(r.errors).toEqual([]);
    expect(parse(r).data.decisions[0].date).toBe('2026-09-22');
  });

  it('approved docs are attached and re-sanitized', () => {
    const r = buildPublicDataset(
      base(
        { meeting: [{ _row: 2, _internal_id: 'meeting-0001', display_id: 'MTG-20260922', title: '會議', type: '正式委員會', date: '2026-09-22', status: '已確認', published: true }] },
        { docs: { 'meeting-0001': { body_md: '## 出席\n王小明、住戶 0912345678', source_filename: '會議紀錄v0.2.docx', stale: true } } },
      ),
    );
    const m = parse(r).data.meetings[0];
    expect(m.body_md).toBe('## 出席\n[姓名已遮蔽]、住戶 [手機已遮蔽]');
    expect(m.body_stale).toBe(true);
    expect(r.warnings.map(formatProblem)[0]).toContain('核准後被修改');
  });

  it('blank rows are ignored; settings are sanitized; allow list honored', () => {
    const r = buildPublicDataset(
      base({ issue: [iss(), { _row: 3, published: false }] }, { settings: { footer_note: '服務中心 02-2345-6789；主委 0912-345-678', privacy_allow: '02-2345-6789' } }),
    );
    expect(r.stats.skipped['議題']).toBe(0);
    expect(parse(r).settings.footer_note).toBe('服務中心 02-2345-6789；主委 [手機已遮蔽]');
  });
});
