"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { appearanceEvent, subscribeAppearance } from "@/lib/appearance";

// The panel's code loads the first time someone opens it
const Panel = dynamic(() => import("./appearance-panel").then((m) => m.AppearancePanel), { ssr: false });

/** Mounted once for the whole app. Opens the Appearance panel when asked, and keeps other tabs' changes in step */
export function AppearanceHost() {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    const show = () => {
      setWanted(true);
      setOpen(true);
    };
    window.addEventListener(appearanceEvent, show);
    const stop = subscribeAppearance(() => {});
    return () => {
      window.removeEventListener(appearanceEvent, show);
      stop();
    };
  }, []);

  return wanted ? <Panel open={open} onOpenChange={setOpen} /> : null;
}
