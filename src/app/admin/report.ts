export type Totals = { visitors: number; pageviews: number; visits: number; bounce: number; duration: number };
export type Row = { label: string; value: number; views?: number; visitors?: number };
export type Slot = { t: string; visitors: number; pageviews: number };

export type Report = {
  totals: Totals;
  previous: Totals;
  live: number;
  series: Slot[];
  pages: Row[];
  entries: Row[];
  referrers: Row[];
  campaigns: Row[];
  countries: Row[];
  devices: Row[];
  browsers: Row[];
  systems: Row[];
  hosts: Row[];
  events: Row[];
};

export const ranges = {
  "24h": { label: "24 hours", hours: 24, bucket: "hour" },
  "7d": { label: "7 days", hours: 24 * 7, bucket: "day" },
  "30d": { label: "30 days", hours: 24 * 30, bucket: "day" },
  "90d": { label: "90 days", hours: 24 * 90, bucket: "week" },
  "12mo": { label: "12 months", hours: 24 * 365, bucket: "month" },
} as const;

export type RangeId = keyof typeof ranges;
