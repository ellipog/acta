"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icons";
import { Surface } from "./overlays";

type Toast = {
  id: number;
  title: string;
  description?: string;
  icon?: IconName;
  action?: { label: string; onClick: () => void };
  duration?: number;
};

let toasts: Toast[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const none: Toast[] = [];

export function toast(t: Omit<Toast, "id">) {
  const id = ++nextId;
  toasts = [...toasts, { ...t, id }].slice(-3);
  emit();
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => none,
  );
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-80 flex-col gap-3">
      {list.map((t) => (
        <ToastCard key={t.id} {...t} />
      ))}
    </div>
  );
}

function ToastCard({ id, title, description, icon = "check", action, duration = 5000 }: Toast) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration]);

  return (
    <div role="status" className="toast-in pointer-events-auto">
      <Surface className="relative overflow-hidden">
        <div className="flex items-start gap-3 p-3 pr-2">
          <Icon name={icon} className="mt-px text-ink-2" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{title}</p>
            {description ? <p className="truncate text-xs text-ink-2">{description}</p> : null}
          </div>
          {action ? (
            <button
              onClick={() => {
                action.onClick();
                dismissToast(id);
              }}
              className="h-7 border border-line-strong px-2 text-xs hover:border-lapis hover:text-lapis"
            >
              {action.label}
            </button>
          ) : null}
          <button aria-label="Dismiss" onClick={() => dismissToast(id)} className="grid size-7 place-items-center text-ink-3 hover:text-ink">
            <Icon name="x" size="sm" />
          </button>
        </div>
        <span
          aria-hidden
          className={cn("toast-timer dither-75 absolute bottom-0 left-0 h-[3px] w-full [--dither:var(--lapis)]")}
          style={{ animationDuration: `${duration}ms` }}
        />
      </Surface>
    </div>
  );
}
