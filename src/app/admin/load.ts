import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ranges, type RangeId, type Report } from "./report";

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
