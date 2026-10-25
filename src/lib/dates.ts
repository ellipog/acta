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

export function localToday() {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
