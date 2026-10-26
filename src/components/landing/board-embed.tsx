"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

const BoardApp = lazy(() => import("@/components/board-app/board-app").then((m) => ({ default: m.BoardApp })));

// The board is the heaviest thing on the landing page, so it loads as it scrolls near rather than with the page
export function BoardEmbed({ fallback }: { fallback: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        seen.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {near ? (
        <Suspense fallback={fallback}>
          <BoardApp variant="embed" />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}
