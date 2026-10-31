export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (t: Date) => `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
export const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
};
export const utc = (iso: string) => {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m, d));
};
export const addDays = (iso: string, n: number) => {
  const t = utc(iso);
  t.setUTCDate(t.getUTCDate() + n);
  return toIso(t);
};
export const addMonths = (iso: string, n: number) => {
  const { y, m, d } = parts(iso);
  const last = new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(y, m + n, Math.min(d, last))));
};
export const diffDays = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
export const weekday = (iso: string) => (utc(iso).getUTCDay() + 6) % 7;
export const monthStart = (iso: string) => iso.slice(0, 8) + "01";
export const monthEnd = (iso: string) => addDays(addMonths(monthStart(iso), 1), -1);

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** A stretch of time in words, rounded to the unit that reads best: "45 minutes", "6 hours", "3 days" */
export function duration(ms: number) {
  const minutes = Math.round(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return plural(hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 60) return plural(days, "day");
  const months = Math.round(days / 30.44);
  return months < 24 ? plural(months, "month") : plural(Math.round(days / 365.25), "year");
}

/** How long a task was open, from when it was made to when it closed. Null while it's open, or when it isn't known */
export function timeToClose(t: { opened?: string | null; closed?: string | null }) {
  if (!t.opened || !t.closed) return null;
  const ms = Date.parse(t.closed) - Date.parse(t.opened);
  return Number.isNaN(ms) ? null : Math.max(0, ms);
}

export function localToday() {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
