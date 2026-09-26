import type { EntityKind } from '../core/refs';
import { kindOfId } from '../core/refs';

export const ROUTE: Record<EntityKind, string> = {
  issue: 'issues',
  action: 'actions',
  decision: 'decisions',
  meeting: 'meetings',
  rule: 'rules',
  announcement: 'announcements',
};

const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');

/** 站內網址（含 BASE_PATH）。path 不以 / 開頭。 */
export function url(path = ''): string {
  return base + path.replace(/^\//, '');
}

export function hrefFor(id: string): string {
  const kind = kindOfId(id);
  return kind ? url(`${ROUTE[kind]}/${id}/`) : url();
}
