"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// HTML a page's owner wrote, in a frame of its own. The sandbox gives it no origin, so its scripts run without
// reaching the page around it, the visitor's session or Acta's cookies, and links open in a new tab. It tells the
// page how tall it is, and grows to fit
export function PageFrame({ html, label, className }: { html: string; label: string; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const [look, setLook] = useState({ color: "inherit", font: "system-ui, sans-serif", scheme: "light dark" });

  // The frame starts with the page's own text colour and font, so plain HTML fits in
  useLayoutEffect(() => {
    if (!ref.current) return;
    const style = getComputedStyle(ref.current);
    const dark = ref.current.closest("[data-theme=dark]") || document.documentElement.dataset.theme === "dark";
    setLook({ color: style.color, font: style.fontFamily, scheme: dark ? "dark" : "light" });
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const h = (e.data as { actaHeight?: unknown } | null)?.actaHeight;
      if (typeof h === "number" && Number.isFinite(h)) setHeight(Math.max(0, Math.min(Math.ceil(h), 4000)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const doc =
    `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">` +
    `<style>html{color-scheme:${look.scheme}}body{margin:0;color:${look.color};font-family:${look.font.replace(/[<>]/g, "")}}</style>` +
    `<script>(function(){var s=function(){parent.postMessage({actaHeight:document.documentElement.scrollHeight},"*")};` +
    `addEventListener("DOMContentLoaded",function(){new ResizeObserver(s).observe(document.body);s()});addEventListener("load",s)})()</script>` +
    `</head><body>${html}</body></html>`;

  return (
    <iframe
      ref={ref}
      title={label}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height }}
      className={className ?? "block w-full border-0 bg-transparent"}
    />
  );
}
