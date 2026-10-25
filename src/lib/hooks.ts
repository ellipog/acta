"use client";

import { useSyncExternalStore } from "react";

const minute = () => Math.floor(Date.now() / 60_000) * 60_000;
const everyMinute = (tick: () => void) => {
  const id = setInterval(tick, 60_000);
  return () => clearInterval(id);
};

export function useNow() {
  return useSyncExternalStore(everyMinute, minute, () => null);
}
