// 由「網站設定」組出 PrivacyConfig。Apps Script 匯出與 CI gate 使用同一份設定，結果一致。

import { normalizeBool } from '../normalize';
import { withDefaults } from '../settings';
import { DEFAULT_CONFIG, type PrivacyConfig } from './rules';

export function privacyConfigFrom(settings: Record<string, unknown> | undefined): PrivacyConfig {
  const s = withDefaults(settings);
  return {
    ...DEFAULT_CONFIG,
    maskMoney: normalizeBool(s.mask_money),
    allow: splitList(s.privacy_allow ?? ''),
  };
}

export function splitList(v: string): string[] {
  return v
    .split(/[、,，\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}
