import { describe, expect, it } from 'vitest';
import positive from './fixtures/pii/positive.json';
import negative from './fixtures/pii/negative.json';
import { DEFAULT_CONFIG } from '../src/core/privacy/rules';
import { detectPii, sanitizeText } from '../src/core/privacy/sanitize';

describe('sanitizer regression fixtures', () => {
  it.each(positive)('masks: $input', ({ input, expected }) => {
    expect(sanitizeText(input).text).toBe(expected);
    expect(detectPii(sanitizeText(input).text)).toEqual([]);
  });

  it.each(negative)('keeps: %s', (input) => {
    expect(sanitizeText(input).text).toBe(input);
    expect(detectPii(input)).toEqual([]);
  });
});

describe('dictionary and config', () => {
  it('masks dictionary names, longest first, with custom masks', () => {
    const r = sanitizeText('王小明與王小明太太、安杰物業林經理', {
      dictionary: [{ term: '王小明' }, { term: '王小明太太', mask: '[住戶已遮蔽]' }, { term: '林經理' }, { term: '王' }],
    });
    expect(r.text).toBe('[姓名已遮蔽]與[住戶已遮蔽]、安杰物業[姓名已遮蔽]');
    expect(r.hits.dictionary).toBe(3);
  });

  it('allow list keeps public numbers', () => {
    const config = { ...DEFAULT_CONFIG, allow: ['02-2345-6789'] };
    expect(sanitizeText('服務中心 02-2345-6789，住戶 0912345678', { config }).text).toBe('服務中心 02-2345-6789，住戶 [手機已遮蔽]');
    expect(detectPii('服務中心 02-2345-6789', config)).toEqual([]);
  });

  it('maskMoney=false keeps amounts; money never gates', () => {
    const config = { ...DEFAULT_CONFIG, maskMoney: false };
    expect(sanitizeText('35萬元', { config }).text).toBe('35萬元');
    expect(detectPii('35萬元')).toEqual([]);
  });

  it('is idempotent', () => {
    const once = sanitizeText('0912-345-678 A棟12樓之3 NT$500').text;
    expect(sanitizeText(once).text).toBe(once);
  });

  it('findings never contain the raw value', () => {
    const f = detectPii('請撥 0912-345-678 找我');
    expect(f).toHaveLength(1);
    expect(f[0]!.context).not.toContain('0912');
    expect(f[0]!.context).toContain('***');
  });
});
