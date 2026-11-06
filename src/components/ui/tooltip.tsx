"use client";

import { cloneElement, createContext, isValidElement, useContext, useState } from "react";
import { Tooltip as T } from "radix-ui";
import { pixelBox } from "@/lib/pixel";

const Shared = createContext(false);

// Tooltips under one provider open instantly when you move between them. A tooltip without one brings its own,
// so pages that never show a tooltip don't download them
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={300}>
      <Shared.Provider value>{children}</Shared.Provider>
    </T.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "top",
  hover,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /**
   * For a tip on something only the pointer reaches, in a list drawn many times over like the table's rows. The tip
   * is set up the first time the pointer comes over it, rather than with every row drawn
   */
  hover?: boolean;
}) {
  const shared = useContext(Shared);
  const [awake, setAwake] = useState(!hover);
  if (!awake && isValidElement<{ onPointerEnter?: (e: React.PointerEvent) => void }>(children)) {
    const enter = children.props.onPointerEnter;
    return cloneElement(children, {
      onPointerEnter: (e: React.PointerEvent) => {
        enter?.(e);
        setAwake(true);
      },
    });
  }
  const tip = (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={5} className="z-50 bg-ink px-2 py-1 text-xs text-page">
          {content}
          <T.Arrow asChild width={7} height={4}>
            <svg viewBox="0 0 7 4" shapeRendering="crispEdges" style={pixelBox(7, 4, 1)} className="pixel fill-ink">
              <path d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z" />
            </svg>
          </T.Arrow>
        </T.Content>
      </T.Portal>
    </T.Root>
  );
  return shared ? tip : <TooltipProvider>{tip}</TooltipProvider>;
}
