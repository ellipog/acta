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

const lookSent = "acta-look-sent";

// Once a day, how this browser has Acta looking, so the owner can see which themes, icons and accents people pick.
// Public roadmaps wear their owner's look and say nothing about the visitor's
function sendLook(pathname: string) {
  if (pathname.startsWith("/p/") || ignored()) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(lookSent) === today) return;
    localStorage.setItem(lookSent, today);
    const root = document.documentElement;
    const look = JSON.parse(localStorage.getItem("acta-appearance") ?? "{}") as Record<string, unknown>;
    const pick = (key: string, fallback: string) => (typeof look[key] === "string" ? (look[key] as string) : fallback);
    track("appearance", {
      theme: root.getAttribute("data-theme") === "dark" ? "dark" : "light",
      system: (localStorage.getItem("theme") ?? "light") === "system",
      icons: pick("icons", "line"),
      accent: pick("accent", "lapis"),
      size: pick("size", "md"),
      font: pick("font", "geist"),
    });
  } catch {}
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
    // After the theme has settled on the page
    setTimeout(() => sendLook(pathname), 3000);
  }, [pathname]);

  return null;
}
