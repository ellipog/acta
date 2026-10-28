import "server-only";
import { createClient } from "@/lib/supabase/server";
import { siteHost } from "@/lib/slugs";
import { ownerRanges, ranges, type OwnerRangeId, type OwnerReport, type RangeId, type Report } from "./report";

export async function loadReport(range: RangeId, dev: boolean) {
  const now = Date.now();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("analytics_report", {
    from_at: new Date(now - ranges[range].hours * 3_600_000).toISOString(),
    to_at: new Date(now + 60_000).toISOString(),
    bucket: ranges[range].bucket,
    include_dev: dev,
  });
  return error || !data ? null : (data as Report);
}

export async function loadOwnerReport(range: OwnerRangeId, includeMe: boolean) {
  const now = Date.now();
  const { hours, bucket } = ownerRanges[range];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("owner_report", {
    from_at: hours === null ? null : new Date(now - hours * 3_600_000).toISOString(),
    to_at: new Date(now + 60_000).toISOString(),
    bucket,
    include_me: includeMe,
    site_host: siteHost,
  });
  return error || !data ? null : (data as OwnerReport);
}
