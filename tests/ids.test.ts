import { describe, expect, it } from 'vitest';
import { nextDisplayId, reconcileIds, type IdRow } from '../src/core/ids';

let n = 0;
const newUuid = () => `uuid-${++n}`;
const row = (r: Partial<IdRow> & { row: number }): IdRow => ({ internalId: '', displayId: '', idDate: '', hasContent: true, ...r });

describe('nextDisplayId', () => {
  it('issue sequence continues from max', () => {
    expect(nextDisplayId('issue', new Set(['ISS-0001', 'ISS-0015']), '')).toBe('ISS-0016');
    expect(nextDisplayId('rule', new Set(), '')).toBe('RULE-001');
  });
  it('dated ids', () => {
    expect(nextDisplayId('action', new Set(['ACT-20260922-29']), '2026-09-22')).toBe('ACT-20260922-30');
    expect(nextDisplayId('action', new Set(['ACT-20260922-29']), '2026-09-23')).toBe('ACT-20260923-01');
    expect(nextDisplayId('meeting', new Set(['MTG-20260922']), '2026-09-22')).toBe('MTG-20260922-2');
    expect(nextDisplayId('meeting', new Set(), '2026-09-22')).toBe('MTG-20260922');
  });
});

describe('reconcileIds', () => {
  it('assigns ids to new rows, skips blank rows', () => {
    const u = reconcileIds('issue', [row({ row: 2, internalId: 'a', displayId: 'ISS-0001' }), row({ row: 3 }), row({ row: 4, hasContent: false })], {
      newUuid,
      today: '2026-09-26',
    });
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ row: 3, displayId: 'ISS-0002', reason: 'new' });
    expect(u[0]!.internalId).toMatch(/^uuid-/);
  });

  it('copied row: keeps upper row, reissues lower', () => {
    const u = reconcileIds(
      'action',
      [row({ row: 5, internalId: 'x', displayId: 'ACT-20260922-01', idDate: '2026-09-22' }), row({ row: 6, internalId: 'x', displayId: 'ACT-20260922-01', idDate: '2026-09-22' })],
      { newUuid, today: '2026-09-26' },
    );
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ row: 6, displayId: 'ACT-20260922-02', reason: 'duplicate-internal' });
  });

  it('does not reuse reserved (deleted) ids', () => {
    const u = reconcileIds('issue', [row({ row: 2 })], { newUuid, today: '2026-09-26', reserved: ['ISS-0001', 'ISS-0002'] });
    expect(u[0]!.displayId).toBe('ISS-0003');
  });

  it('keeps unique display id when only internal id is missing', () => {
    const u = reconcileIds('issue', [row({ row: 2, displayId: 'ISS-0007' })], { newUuid, today: '2026-09-26' });
    expect(u[0]).toMatchObject({ reason: 'missing-internal' });
    expect(u[0]!.displayId).toBeUndefined();
  });

  it('is independent of row order in input', () => {
    const rows = [row({ row: 9, internalId: 'b', displayId: 'ISS-0001' }), row({ row: 3, internalId: 'a', displayId: 'ISS-0001' })];
    const u = reconcileIds('issue', rows, { newUuid, today: '2026-09-26' });
    expect(u).toEqual([{ row: 9, displayId: 'ISS-0002', reason: 'duplicate-display' }]);
  });
});
