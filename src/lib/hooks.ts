"use client";

import { useSyncExternalStore } from "react";
import { localToday } from "./dates";

const still = () => () => {};

// Null while prerendering
export function useToday() {
  return useSyncExternalStore(still, localToday, () => null);
}

const minute = () => Math.floor(Date.now() / 60_000) * 60_000;
const everyMinute = (tick: () => void) => {
  const id = setInterval(tick, 60_000);
  return () => clearInterval(id);
};

export function useNow() {
  return useSyncExternalStore(everyMinute, minute, () => null);
}

// Below Tailwind's sm, 640px: a phone held upright, or one sideways that's still too short for the desktop views
const phoneQuery = "(max-width: 639.98px)";
const onPhoneChange = (tick: () => void) => {
  const m = matchMedia(phoneQuery);
  m.addEventListener("change", tick);
  return () => m.removeEventListener("change", tick);
};
const isPhone = () => matchMedia(phoneQuery).matches;

/** Whether the window is phone-sized. False while prerendering, so the server draws the wider layout */
export function usePhone() {
  return useSyncExternalStore(onPhoneChange, isPhone, () => false);
}
