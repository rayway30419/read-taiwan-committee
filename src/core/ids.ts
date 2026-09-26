// Stable identity：_internal_id（UUID）與 display_id（人看得懂的編號）。
// 這裡只有 pure function；Apps Script 負責讀寫 Sheet 與 UUID 產生。
// 規則：
//  - 不依賴列號；排序、插入列不影響 ID
//  - display_id 一經指派不變（改會議日期不會改 MTG 編號）
//  - 曾經使用過的 display_id（reserved）不再重複配發，避免已分享的連結指向別的資料
//  - 複製整列造成重複時，保留較上方的列，下方列重新配發

import { ID_PREFIX, type EntityKind } from './refs';

export interface IdRow {
  row: number;
  internalId: string;
  displayId: string;
  /** 用於日期型編號的日期（YYYY-MM-DD）；空白時用 today。 */
  idDate: string;
  hasContent: boolean;
}

export interface IdUpdate {
  row: number;
  internalId?: string;
  displayId?: string;
  reason: 'new' | 'duplicate-internal' | 'duplicate-display' | 'missing-internal';
}

const compact = (date: string) => date.replace(/-/g, '');

export function nextDisplayId(kind: EntityKind, used: Set<string>, idDate: string): string {
  const prefix = ID_PREFIX[kind];
  if (kind === 'issue' || kind === 'rule') {
    const width = kind === 'issue' ? 4 : 3;
    let max = 0;
    for (const id of used) {
      const m = id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `${prefix}-${String(max + 1).padStart(width, '0')}`;
  }
  const d = compact(idDate);
  if (kind === 'meeting') {
    if (!used.has(`MTG-${d}`)) return `MTG-${d}`;
    let n = 2;
    while (used.has(`MTG-${d}-${n}`)) n++;
    return `MTG-${d}-${n}`;
  }
  let max = 0;
  for (const id of used) {
    const m = id.match(new RegExp(`^${prefix}-${d}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${d}-${String(max + 1).padStart(2, '0')}`;
}

export function reconcileIds(
  kind: EntityKind,
  rows: IdRow[],
  opts: { newUuid: () => string; today: string; reserved?: Iterable<string> },
): IdUpdate[] {
  const updates: IdUpdate[] = [];
  const seenInternal = new Set<string>();
  const seenDisplay = new Set<string>();
  const used = new Set<string>(opts.reserved ?? []);
  for (const r of rows) if (r.displayId) used.add(r.displayId);

  for (const r of [...rows].sort((a, b) => a.row - b.row)) {
    if (!r.hasContent) continue;
    const u: IdUpdate = { row: r.row, reason: 'new' };
    let internal = r.internalId;
    if (!internal) {
      internal = opts.newUuid();
      u.internalId = internal;
      u.reason = r.displayId ? 'missing-internal' : 'new';
    } else if (seenInternal.has(internal)) {
      internal = opts.newUuid();
      u.internalId = internal;
      u.reason = 'duplicate-internal';
    }
    seenInternal.add(internal);

    let display = r.displayId;
    const duplicateDisplay = display && seenDisplay.has(display);
    if (!display || duplicateDisplay) {
      display = nextDisplayId(kind, used, r.idDate || opts.today);
      used.add(display);
      u.displayId = display;
      if (duplicateDisplay && !u.internalId) u.reason = 'duplicate-display';
    }
    if (display) seenDisplay.add(display);
    if (u.internalId || u.displayId) updates.push(u);
  }
  return updates;
}
