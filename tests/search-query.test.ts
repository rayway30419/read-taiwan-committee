import { describe, expect, it } from 'vitest';
import { pagefindQuery, SPACED_EXCERPT_RE, spacedText } from '../src/lib/search-query';

describe('pagefindQuery', () => {
  it('中文改寫成逐字 phrase', () => {
    expect(pagefindQuery('電梯')).toBe('"電 梯"');
    expect(pagefindQuery('公共冰箱 B2')).toBe('"公 共 冰 箱" B2');
  });
  it('編號正規化', () => {
    expect(pagefindQuery('iss-012')).toBe('ISS-0012');
    expect(pagefindQuery(' ACT-20260922-1 ')).toBe('ACT-20260922-01');
  });
  it('英數與單字不改寫；使用者輸入的引號移除', () => {
    expect(pagefindQuery('Wi-Fi')).toBe('Wi-Fi');
    expect(pagefindQuery('"門禁"')).toBe('"門 禁"');
    expect(pagefindQuery('   ')).toBe('');
  });
});

describe('spacedText', () => {
  it('中文逐字分隔，英數保留', () => {
    expect(spacedText(['大廳及電梯', null, 'B2 車位'])).toBe('大 廳 及 電 梯 B2 車 位');
  });
  it('偵測逐字 excerpt', () => {
    expect(SPACED_EXCERPT_RE.test('大 廳 及 <mark>電</mark> <mark>梯</mark> 裝 潢')).toBe(true);
    expect(SPACED_EXCERPT_RE.test('原則上延後大廳及<mark>電梯</mark>裝潢保護拆除')).toBe(false);
  });
});
