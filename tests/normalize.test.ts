import { describe, expect, it } from 'vitest';
import { normalizeBool, normalizeDate, normalizeRecord, normalizeTime } from '../src/core/normalize';

describe('normalize', () => {
  it('dates', () => {
    expect(normalizeDate('2026/9/2')).toBe('2026-09-02');
    expect(normalizeDate('2026.09.22')).toBe('2026-09-22');
    expect(normalizeDate('2026年9月22日')).toBe('2026-09-22');
    expect(normalizeDate(new Date('2026-09-21T17:00:00Z'))).toBe('2026-09-22');
    expect(normalizeDate('下週')).toBe('下週');
    expect(normalizeDate('')).toBe('');
  });
  it('times and bools', () => {
    expect(normalizeTime('9:30')).toBe('09:30');
    expect(normalizeTime('19：00')).toBe('19:00');
    expect(normalizeBool('TRUE')).toBe(true);
    expect(normalizeBool('是')).toBe(true);
    expect(normalizeBool('')).toBe(false);
  });
  it('record by column type', () => {
    const r = normalizeRecord('action', {
      display_id: 'act-20260922-1',
      issue_id: 'ISS-0002 物業服務',
      source_meeting_id: '',
      due_date: '2026/10/2',
      title: '  補齊報價\r\n ',
    });
    expect(r).toMatchObject({ display_id: 'ACT-20260922-01', issue_id: 'ISS-0002', source_meeting_id: '', due_date: '2026-10-02', title: '補齊報價' });
  });
});
