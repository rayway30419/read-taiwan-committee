// Deterministic PII rules。集中管理、可測試；Apps Script 匯出與 CI privacy gate 共用。
// 原則：只處理能可靠 pattern-match 的資料；中文姓名不用 regex，改用「遮蔽詞庫」。

import { ID_PREFIXES } from '../refs';

export interface PiiRule {
  id: string;
  label: string;
  /** 取代文字 */
  mask: string;
  /** 必須是 global regex */
  pattern: RegExp;
  /** 回傳 false 表示這個 match 不遮蔽（例如 ISS-0001 不是車牌） */
  accept?: (match: string, context: { before: string; after: string }) => boolean;
  /** privacy gate 是否把殘留當成 error（金額類只在 sanitizer 使用） */
  gate: boolean;
}

const notSiteId = (m: string) => !ID_PREFIXES.includes(m.split('-')[0]!.toUpperCase());

/** 內建規則，順序即套用順序（較具體的在前）。 */
export const BUILTIN_RULES: PiiRule[] = [
  {
    id: 'email',
    label: 'Email',
    mask: '[Email 已遮蔽]',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
    gate: true,
  },
  {
    id: 'national-id',
    label: '身分證／居留證',
    mask: '[身分證已遮蔽]',
    // 身分證 A123456789；新式居留證 A800000014；舊式居留證 AB12345678
    pattern: /(?<![A-Za-z0-9])[A-Z][1289A-D]\d{8}(?![A-Za-z0-9])/g,
    gate: true,
  },
  {
    id: 'mobile',
    label: '手機',
    mask: '[手機已遮蔽]',
    pattern: /(?<![\d-])(?:\+?886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?![\d-])/g,
    gate: true,
  },
  {
    id: 'landline',
    label: '市話',
    mask: '[電話已遮蔽]',
    pattern: /(?<![\d-])(?:\(0\d{1,2}\)\s?|0\d{1,2}[-\s])\d{3,4}[-\s]?\d{4}(?:\s?(?:#|分機|ext\.?)\s?\d{1,5})?(?![\d-])/g,
    gate: true,
  },
  {
    id: 'account',
    label: '帳號',
    mask: '[帳號已遮蔽]',
    // 10–16 位數字（可含 - 分段），或關鍵字後的 6 位以上數字
    pattern: /(?<![\dA-Za-z-])\d(?:-?\d){9,15}(?![\d-])|(?<=(?:帳號|帳戶|戶號|卡號|account)[：:\s]*)\d[\d-]{4,}\d/gi,
    gate: true,
  },
  {
    id: 'plate',
    label: '車牌',
    mask: '[車牌已遮蔽]',
    pattern: /(?<![A-Za-z0-9-])(?:[A-Z]{2,3}-\d{4}|\d{4}-[A-Z]{2}|[A-Z]{3}-\d{3}|\d{3}-[A-Z]{3})(?![A-Za-z0-9-])/g,
    accept: notSiteId,
    gate: true,
  },
  {
    id: 'address',
    label: '地址',
    mask: '[地址已遮蔽]',
    pattern:
      /(?:(?![市縣區鄉鎮里村])[一-鿿]){1,6}(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?\d+(?:之\d+)?號(?:之\d+)?(?:\d+樓(?:之\d+)?)?/g,
    gate: true,
  },
  {
    id: 'money',
    label: '金額',
    mask: '[金額已遮蔽]',
    pattern: /(?:新[臺台]幣|NT\$?|\$)\s*\d[\d,]*(?:\.\d+)?\s*(?:萬|千)?\s*元?|\d[\d,]*(?:\.\d+)?\s*(?:萬元|仟元|千元|元)/g,
    gate: false,
  },
];

export interface PrivacyConfig {
  /** 金額是否遮蔽（demo 行為：遮蔽財務細節） */
  maskMoney: boolean;
  /** 社區特有的戶別、車位等 pattern */
  unitPatterns: RegExp[];
  /** 不應遮蔽的例外字串（例如公開的物業服務中心電話） */
  allow: string[];
}

/**
 * 閱讀台灣社區的戶別寫法。新社區請依實際戶別編碼調整並補測試。
 * 例：A棟12樓之3、12樓之3、A5-3、A12-1、B2-15（地下車位）
 */
export const DEFAULT_CONFIG: PrivacyConfig = {
  maskMoney: true,
  unitPatterns: [
    /[A-Z]\s?棟\s?\d{1,2}\s?(?:樓|F)(?:\s?之\s?\d{1,2})?/g,
    /(?<![\d/])\d{1,2}\s?樓\s?之\s?\d{1,2}/g,
    /(?<![A-Za-z0-9-])[A-H]\d{1,2}-\d{1,2}(?![\d-])/g,
    /(?<![A-Za-z0-9])\d{1,2}F-\d{1,2}(?!\d)/g,
  ],
  allow: [],
};

export function unitRule(pattern: RegExp, i: number): PiiRule {
  return { id: `unit-${i}`, label: '戶別', mask: '[戶別已遮蔽]', pattern, gate: true };
}

export function activeRules(config: PrivacyConfig = DEFAULT_CONFIG): PiiRule[] {
  const rules = BUILTIN_RULES.filter((r) => r.id !== 'money' || config.maskMoney);
  // 戶別在地址之後、金額之前
  const idx = rules.findIndex((r) => r.id === 'money');
  const units = config.unitPatterns.map(unitRule);
  if (idx === -1) return [...rules, ...units];
  return [...rules.slice(0, idx), ...units, ...rules.slice(idx)];
}
