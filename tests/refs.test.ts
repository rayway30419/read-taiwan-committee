import { describe, expect, it } from 'vitest';
import { extractIds, idAliases, kindOfId, normalizeId, parseRef } from '../src/core/refs';

describe('normalizeId', () => {
  it.each([
    ['iss-001', 'ISS-0001'],
    ['ISS-12', 'ISS-0012'],
    ['ISS0012', 'ISS-0012'],
    ['ｉｓｓ－００１２', 'ISS-0012'],
    ['rule-1', 'RULE-001'],
    ['act-20260922-1', 'ACT-20260922-01'],
    ['MTG-20260922', 'MTG-20260922'],
    ['mtg-20260922-2', 'MTG-20260922-2'],
  ])('%s → %s', (raw, id) => expect(normalizeId(raw)).toBe(id));

  it('rejects garbage', () => {
    expect(normalizeId('hello')).toBeNull();
    expect(normalizeId('ISS-')).toBeNull();
  });
});

describe('parseRef', () => {
  it('takes the leading id from a dropdown label', () => {
    expect(parseRef('ISS-0002 物業服務與後續招標')).toBe('ISS-0002');
    expect(parseRef('ISS-0002｜物業')).toBe('ISS-0002');
    expect(parseRef('')).toBe('');
    expect(parseRef(undefined)).toBe('');
    expect(parseRef('物業服務')).toBeNull();
  });
});

describe('extractIds / aliases', () => {
  it('extracts normalized, deduped ids', () => {
    const text = '討論 ISS-001、ISS-0001 與 ISS-12；見 ACT-20260922-03 與 MTG-20260922';
    expect(extractIds(text)).toEqual(['ISS-0001', 'ISS-0012', 'ACT-20260922-03', 'MTG-20260922']);
    expect(extractIds(text, 'issue')).toEqual(['ISS-0001', 'ISS-0012']);
  });
  it('aliases', () => {
    expect(idAliases('ISS-0012')).toEqual(expect.arrayContaining(['ISS-0012', 'ISS0012', 'ISS-012', 'ISS-12', 'ISS12']));
    expect(kindOfId('DEC-20260922-01')).toBe('decision');
    expect(kindOfId('XYZ-1')).toBeNull();
  });
});
