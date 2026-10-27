"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { CustomColor, Swatch } from "@/components/ui/color-picker";
import { Segmented, Switch } from "@/components/ui/controls";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getAppearance,
  isDefaultAppearance,
  resetAppearance,
  serverAppearance,
  setAppearance,
  subscribeAppearance,
  type Accent,
  type Appearance,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark";

// The colours here only draw the choices. The look itself comes from globals.css
const accents: { id: Exclude<Accent, "custom">; name: string; light: string; dark: string }[] = [
  { id: "lapis", name: "Lapis", light: "#2c4a8c", dark: "#7f9be0" },
  { id: "amethyst", name: "Amethyst", light: "#6a4a9c", dark: "#b39be6" },
  { id: "rhodonite", name: "Rhodonite", light: "#a8436e", dark: "#e58fb3" },
  { id: "fluorite", name: "Fluorite", light: "#1f7586", dark: "#6cc0cf" },
  { id: "obsidian", name: "Obsidian", light: "#2b2f3a", dark: "#d6d2c8" },
];

const surfaces: { id: Appearance["surface"]; light: [string, string, string]; dark: [string, string, string] }[] = [
  { id: "warm", light: ["Stone", "#f3f0e8", "#fdfcf8"], dark: ["Basalt", "#15171c", "#23272e"] },
  { id: "neutral", light: ["Paper", "#f2f2f0", "#ffffff"], dark: ["Graphite", "#161616", "#252525"] },
  { id: "cool", light: ["Slate", "#eef1f5", "#fcfdfe"], dark: ["Midnight", "#11161f", "#1e2531"] },
];

const ink = { light: "#1d2230", dark: "#e9e5db" };

const fonts: Record<Appearance["font"], string> = {
  geist: "var(--font-geist-sans)",
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: "var(--font-geist-mono)",
};

function useAppearance() {
  return useSyncExternalStore(subscribeAppearance, getAppearance, serverAppearance);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] tracking-[0.1em] text-ink-3 uppercase">{title}</h3>
      {children}
    </section>
  );
}

// A small window in a mode's colours, with the chosen surface and accent
function Window({ mode, look, className }: { mode: Mode; look: Appearance; className?: string }) {
  const surface = surfaces.find((s) => s.id === look.surface)![mode];
  const accent =
    look.accent === "custom" && look.color ? look.color : accents.find((a) => a.id === look.accent)![mode];
  return (
    <span className={cn("flex flex-col gap-1 p-1.5", className)} style={{ background: surface[1] }}>
      <span className="flex gap-1">
        <span className="h-1.5 w-1/3" style={{ background: ink[mode], opacity: 0.7 }} />
        <span className="ml-auto h-1.5 w-1/5" style={{ background: accent }} />
      </span>
      <span className="flex flex-1 gap-1">
        {[0, 1].map((i) => (
          <span key={i} className="flex flex-1 flex-col gap-0.5 p-0.5" style={{ background: surface[2] }}>
            <span className="h-1 w-4/5" style={{ background: ink[mode], opacity: 0.35 }} />
            <span className="h-1 w-3/5" style={{ background: ink[mode], opacity: 0.35 }} />
          </span>
        ))}
      </span>
    </span>
  );
}

function Row({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-[11px] text-ink-3">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5" />
    </label>
  );
}

export function AppearancePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const look = useAppearance();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mode: Mode = resolvedTheme === "dark" ? "dark" : "light";
  const chosen = theme === "system" ? "system" : mode;
  const plain = isDefaultAppearance(look);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Appearance"
        description="How Acta looks on this device. Changes show straight away."
        className="max-w-md"
      >
        <div className="-mx-5 -my-4 max-h-[min(70dvh,40rem)] overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-6">
            <Section title="Mode">
              <div role="radiogroup" aria-label="Mode" className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["light", "Stone", "Light"],
                    ["dark", "Basalt", "Dark"],
                    ["system", "System", "Follows your device"],
                  ] as const
                ).map(([id, name, hint]) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={chosen === id}
                    onClick={() => setTheme(id)}
                    className={cn(
                      "flex flex-col gap-1.5 border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                      chosen === id ? "border-lapis bg-lapis-soft" : "border-line bg-raised hover:border-line-strong",
                    )}
                  >
                    <span className="flex h-12 overflow-hidden border border-line">
                      {id === "system" ? (
                        <>
                          <Window mode="light" look={look} className="w-1/2" />
                          <Window mode="dark" look={look} className="w-1/2" />
                        </>
                      ) : (
                        <Window mode={id} look={look} className="w-full" />
                      )}
                    </span>
                    <span>
                      <span className="block text-xs font-medium">{name}</span>
                      <span className="block truncate text-[10px] text-ink-3">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Accent">
              <div role="radiogroup" aria-label="Accent" className="flex flex-wrap gap-2">
                {accents.map((a) => (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={look.accent === a.id}
                    aria-label={a.name}
                    title={a.name}
                    onClick={() => setAppearance({ accent: a.id })}
                    className={cn(
                      "grid size-9 place-items-center border outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                      look.accent === a.id ? "border-ink" : "border-line hover:border-line-strong",
                    )}
                  >
                    <Swatch value={a[mode]} className="size-6" />
                  </button>
                ))}
                <Popover>
                  <PopoverTrigger
                    role="radio"
                    aria-checked={look.accent === "custom"}
                    aria-label="Your own colour"
                    title="Your own colour"
                    className={cn(
                      "grid size-9 place-items-center border outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                      look.accent === "custom"
                        ? "border-ink"
                        : "border-dashed border-line-strong text-ink-3 hover:text-ink",
                    )}
                  >
                    {look.color ? <Swatch value={look.color} className="size-6" /> : <Icon name="plus" size="sm" />}
                  </PopoverTrigger>
                  <PopoverContent className="w-60">
                    <p className="px-3 pt-3 text-xs font-medium text-ink-2">Your own colour</p>
                    <CustomColor
                      value={look.color || "#2c4a8c"}
                      onChange={(color) => setAppearance({ accent: "custom", color })}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <p className="text-[11px] text-ink-3">
                {look.accent === "custom"
                  ? "Lighter in basalt, so it stays easy to read."
                  : `${accents.find((a) => a.id === look.accent)!.name}. Buttons, links, focus and selection.`}
              </p>
            </Section>

            <Section title="Surfaces">
              <div role="radiogroup" aria-label="Surfaces" className="grid grid-cols-3 gap-2">
                {surfaces.map((s) => {
                  const [name, page, raised] = s[mode];
                  return (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={look.surface === s.id}
                      onClick={() => setAppearance({ surface: s.id })}
                      className={cn(
                        "flex items-center gap-2 border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-lapis",
                        look.surface === s.id
                          ? "border-lapis bg-lapis-soft"
                          : "border-line bg-raised hover:border-line-strong",
                      )}
                    >
                      <span className="flex size-7 shrink-0 border border-ink/15" style={{ background: page }}>
                        <span className="m-auto size-3.5 border border-ink/10" style={{ background: raised }} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">{name}</span>
                        <span className="block text-[10px] text-ink-3 capitalize">{s.id}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="Text">
              <Segmented
                aria-label="Text size"
                value={look.size}
                onValueChange={(size) => setAppearance({ size })}
                options={[
                  { value: "sm", label: "Small" },
                  { value: "md", label: "Default" },
                  { value: "lg", label: "Large" },
                  { value: "xl", label: "Larger" },
                ]}
              />
              <Segmented
                aria-label="Interface font"
                value={look.font}
                onValueChange={(font) => setAppearance({ font })}
                options={(
                  [
                    ["geist", "Geist"],
                    ["system", "System"],
                    ["mono", "Mono"],
                  ] as const
                ).map(([value, label]) => ({
                  value,
                  label: <span style={{ fontFamily: fonts[value] }}>{label}</span>,
                }))}
              />
            </Section>

            <Section title="Comfort">
              <Row
                label="More contrast"
                hint="Darker secondary text and stronger lines."
                checked={look.contrast === "more"}
                onChange={(on) => setAppearance({ contrast: on ? "more" : "normal" })}
              />
              <Row
                label="Reduce motion"
                hint="Turns off animations and transitions."
                checked={look.motion === "reduced"}
                onChange={(on) => setAppearance({ motion: on ? "reduced" : "full" })}
              />
            </Section>
          </div>
        </div>
        <div className="-mx-5 -mb-4 mt-4 flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-[11px] text-ink-3">Saved on this device</span>
          <Button variant="ghost" disabled={plain} onClick={resetAppearance}>
            <Icon name="reset" size="sm" /> Reset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
