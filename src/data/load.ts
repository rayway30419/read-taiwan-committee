// 讀取 → 驗證 → privacy gate → derive。check-data script 與 Astro 共用。

import { derive, type SiteData } from '../core/derive';
import { privacyConfigFrom } from '../core/privacy/config';
import { scanDataset } from '../core/privacy/gate';
import { formatProblem, validateDataset, type Problem } from '../core/validate';
import { buildDate, loadRawDataset } from './source';

export class DataError extends Error {
  constructor(public problems: Problem[]) {
    super(`資料檢查失敗（${problems.length} 項）：\n${problems.map((p) => `  • ${formatProblem(p)}`).join('\n')}`);
    this.name = 'DataError';
  }
}

export interface Checked {
  site: SiteData;
  warnings: Problem[];
}

export function checkDataset(raw: unknown, today: string): Checked {
  const v = validateDataset(raw);
  if (!v.ok || !v.dataset) throw new DataError(v.errors);
  const gate = scanDataset(v.dataset.data, v.dataset.settings, privacyConfigFrom(v.dataset.settings));
  if (gate.length) throw new DataError(gate);
  return { site: derive(v.dataset, today), warnings: v.warnings };
}

export async function loadChecked(env: NodeJS.ProcessEnv = process.env): Promise<Checked> {
  return checkDataset(await loadRawDataset(env), buildDate(env));
}
