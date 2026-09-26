const TZ = 'Asia/Taipei';

/** 2026-09-22 → 2026/09/22（週二） */
export function formatDate(d: string, withWeekday = false): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const base = `${y}/${m}/${day}`;
  if (!withWeekday) return base;
  const wd = new Intl.DateTimeFormat('zh-TW', { timeZone: TZ, weekday: 'short' }).format(new Date(`${d}T12:00:00+08:00`));
  return `${base}（${wd.replace('週', '')}）`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}/${g('month')}/${g('day')} ${g('hour')}:${g('minute')}`;
}
