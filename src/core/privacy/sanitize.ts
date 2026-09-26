import { activeRules, DEFAULT_CONFIG, type PiiRule, type PrivacyConfig } from './rules';

export const SANITIZER_VERSION = '1';

export interface DictionaryTerm {
  term: string;
  /** 預設 [姓名已遮蔽] */
  mask?: string;
}

export interface SanitizeOptions {
  config?: PrivacyConfig;
  dictionary?: DictionaryTerm[];
}

export interface SanitizeResult {
  text: string;
  /** ruleId → 遮蔽次數；詞庫為 'dictionary' */
  hits: Record<string, number>;
}

export interface Finding {
  ruleId: string;
  label: string;
  /** 前後文，match 本身以 *** 取代，避免把個資寫進 log */
  context: string;
}

const MASK_TOKEN = /\[[^\[\]\n]{1,20}已遮蔽\]/g;
const URL_RE = /https?:\/\/[^\s<>()"'）]+/g;
const PH = '\u0000';

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把不應處理的片段（既有遮蔽標記、URL、例外字串）換成 placeholder。 */
function protect(text: string, allow: string[]) {
  const saved: string[] = [];
  const keep = (m: string) => {
    saved.push(m);
    return `${PH}${saved.length - 1}${PH}`;
  };
  let out = text.replace(MASK_TOKEN, keep).replace(URL_RE, keep);
  for (const a of allow) if (a) out = out.split(a).join(keep(a));
  return {
    text: out,
    restore: (s: string) => s.replace(new RegExp(`${PH}(\\d+)${PH}`, 'g'), (_, i) => saved[Number(i)]!),
  };
}

function applyRule(text: string, rule: PiiRule, onHit: () => void): string {
  return text.replace(rule.pattern, (m: string, ...args: unknown[]) => {
    const offset = args.find((a) => typeof a === 'number') as number;
    if (m.includes(PH)) return m;
    if (rule.accept && !rule.accept(m, { before: text.slice(Math.max(0, offset - 10), offset), after: text.slice(offset + m.length, offset + m.length + 10) })) return m;
    onHit();
    return rule.mask;
  });
}

export function sanitizeText(input: string, opts: SanitizeOptions = {}): SanitizeResult {
  const config = opts.config ?? DEFAULT_CONFIG;
  const hits: Record<string, number> = {};
  if (!input) return { text: input, hits };
  const bump = (id: string) => (hits[id] = (hits[id] ?? 0) + 1);

  const p = protect(input.normalize('NFC'), config.allow);
  let text = p.text;

  const terms = (opts.dictionary ?? [])
    .map((t) => ({ term: t.term.trim(), mask: t.mask?.trim() || '[姓名已遮蔽]' }))
    .filter((t) => t.term.length >= 2)
    .sort((a, b) => b.term.length - a.term.length);
  for (const t of terms) {
    text = text.replace(new RegExp(escapeRe(t.term), 'g'), () => {
      bump('dictionary');
      return t.mask;
    });
  }

  for (const rule of activeRules(config)) text = applyRule(text, rule, () => bump(rule.id));
  return { text: p.restore(text), hits };
}

/** Privacy gate：找出殘留的高信心 PII。應在 sanitize 之後得到空陣列。 */
export function detectPii(input: string, config: PrivacyConfig = DEFAULT_CONFIG): Finding[] {
  if (!input) return [];
  const p = protect(input.normalize('NFC'), config.allow);
  const findings: Finding[] = [];
  // 與 sanitizer 相同：依序套用，已命中的片段換成 placeholder，避免同一段被多條規則重複回報
  let text = p.text;
  const HIT = `${PH}x${PH}`;
  for (const rule of activeRules(config)) {
    text = text.replace(rule.pattern, (s: string, ...args: unknown[]) => {
      const i = args.find((a) => typeof a === 'number') as number;
      if (s.includes(PH)) return s;
      const before = text.slice(Math.max(0, i - 12), i);
      const after = text.slice(i + s.length, i + s.length + 12);
      if (rule.accept && !rule.accept(s, { before, after })) return s;
      if (rule.gate) {
        const ctx = `${before}***${after}`.replace(new RegExp(`${PH}x${PH}`, 'g'), '***');
        findings.push({ ruleId: rule.id, label: rule.label, context: p.restore(ctx).replace(/\s+/g, ' ') });
      }
      return HIT;
    });
  }
  return findings;
}

export function mergeHits(into: Record<string, number>, from: Record<string, number>) {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
  return into;
}
