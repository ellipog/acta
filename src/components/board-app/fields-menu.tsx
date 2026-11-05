"use client";

import { lazyPart } from "@/components/lazy-part";
import { Spinner } from "@/components/ui/display";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Prefs } from "./fields";

// The columns inside are dragged into order, and the drag and drop code arrives only once the menu is wanted. It
// starts on the way when the pointer reaches the button, so it's usually there by the click
const FieldList = lazyPart(
  () => import("./fields-list").then((m) => m.FieldList),
  <div className="late grid h-24 place-items-center">
    <Spinner />
  </div>,
);
const preload = () => void FieldList.preload().catch(() => {});

export function FieldsMenu({
  prefs,
  setPrefs,
  trigger,
  align = "end",
}: {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  trigger: React.ReactElement;
  align?: "start" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild onPointerEnter={preload} onFocus={preload}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64">
        <FieldList prefs={prefs} setPrefs={setPrefs} />
      </PopoverContent>
    </Popover>
  );
}
