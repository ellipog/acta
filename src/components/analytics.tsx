"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const ignoreKey = "acta-analytics-ignore";
const untracked = /^\/(admin|auth|join)(\/|$)/;
const seen = { path: "", at: 0, landed: false };

function ignored() {
  try {
    return localStorage.getItem(ignoreKey) === "1" || navigator.webdriver;
  } catch {
    return false;
  }
}

function send(body: Record<string, unknown>) {
  if (ignored()) return;
  const data = JSON.stringify({ ...body, width: window.innerWidth });
  if (navigator.sendBeacon?.("/api/collect", data)) return;
  fetch("/api/collect", { method: "POST", body: data, keepalive: true }).catch(() => {});
}

export function track(name: string, props?: Record<string, string | number | boolean>) {
  send({ kind: "event", name, path: window.location.pathname, props });
}

function landing() {
  const extra: Record<string, string> = {};
  try {
    const from = document.referrer ? new URL(document.referrer) : null;
    if (from && from.host !== window.location.host) extra.referrer = from.hostname;
  } catch {}
  const query = new URLSearchParams(window.location.search);
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    const value = query.get(key);
    if (value) extra[key] = value;
  }
  if (!extra.utm_source && query.get("ref")) extra.utm_source = query.get("ref")!;
  return extra;
}

export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (untracked.test(pathname)) return;
    const now = Date.now();
    if (seen.path === pathname && now - seen.at < 1500) return;
    seen.path = pathname;
    seen.at = now;
    const extra = seen.landed ? {} : landing();
    seen.landed = true;
    send({ kind: "pageview", path: pathname, ...extra });
  }, [pathname]);

  return null;
}
