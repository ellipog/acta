"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { rangeFor } from "./table-window";

// Long lists other than the table's draw only what's near the view too: the board's columns and the roadmap's rows.
// Like the table (see table-window.ts), each stands an empty block of the right height in for each stretch it skips

// Before a list's scroller is known, as on the server, a tall screenful is drawn
const FIRST_VIEW = 1200;

// first is how much of the list is drawn before its scroller is known
type Range = { offset?: number; margin?: number; step?: number; first?: number };

/**
 * The stretch of a list to draw, [start, end), following its scroller. tops are where each item starts, with where
 * the last one ends at the close (see placeItems), and offset is how far down the scroller's content the list starts.
 * The scroll position is noted as the scroller scrolls or resizes, and drawing reads only the note, so working out
 * the range never makes the browser lay out the page out of turn. The list draws again only when the range moves
 */
export function useScrollRange(
  scroller: HTMLElement | null,
  tops: readonly number[],
  { offset = 0, margin, step, first = FIRST_VIEW }: Range = {},
): [number, number] {
  const at = useRef({ top: 0, height: first });
  const subscribe = useCallback(
    (changed: () => void) => {
      if (!scroller) return () => {};
      const note = () => {
        at.current = { top: scroller.scrollTop, height: scroller.clientHeight };
        changed();
      };
      note();
      scroller.addEventListener("scroll", note, { passive: true });
      const ro = new ResizeObserver(note);
      ro.observe(scroller);
      return () => {
        scroller.removeEventListener("scroll", note);
        ro.disconnect();
      };
    },
    [scroller],
  );
  const key = (top: number, height: number) =>
    rangeFor(tops, top - offset, top - offset + height, { margin, step }).join(":");
  const range = useSyncExternalStore(
    subscribe,
    () => key(at.current.top, at.current.height),
    () => key(0, first),
  );
  const [start, end] = range.split(":").map(Number);
  return [start, end];
}

/**
 * How tall each kind of line in a list is, where every line of a kind is alike, measured from a drawn line of each kind
 * marked with data-line. The list changes size when lines come or go, or when the text size setting changes how tall
 * they are, and those are the times a measure could differ. A kind with none drawn grows or shrinks by as much as
 * the rows did, as a new text size changes every line alike
 */
export function useLineHeights<K extends string>(list: HTMLElement | null, guess: Record<K, number>, row: NoInfer<K>) {
  const [heights, setHeights] = useState<Record<K, number>>(guess);
  useEffect(() => {
    if (!list) return;
    const ro = new ResizeObserver(() => {
      const seen = new Map<K, number>();
      for (const k of Object.keys(guess) as K[]) {
        const h = list.querySelector(`[data-line="${k}"]`)?.getBoundingClientRect().height;
        if (h) seen.set(k, h);
      }
      setHeights((was) => {
        const scale = seen.has(row) && was[row] ? seen.get(row)! / was[row] : 1;
        let moved = 0;
        const next = { ...was };
        for (const k of Object.keys(was) as K[]) {
          next[k] = seen.get(k) ?? was[k] * scale;
          moved += Math.abs(next[k] - was[k]);
        }
        return moved < 0.01 ? was : next;
      });
    });
    ro.observe(list);
    return () => ro.disconnect();
    // The guess is only where the heights start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, row]);
  return heights;
}

// A card nobody has measured yet, before any card has been
const CARD = 112;

/**
 * Where each card starts in a list of cards of different heights, each followed by gap, with where the last one
 * ends at the close. A card not measured yet is taken to be as tall as the cards measured so far, on average
 */
export function placeCards(ids: readonly string[], sizes: ReadonlyMap<string, number>, gap: number) {
  let sum = 0;
  let known = 0;
  for (const id of ids) {
    const h = sizes.get(id);
    if (h !== undefined) {
      sum += h;
      known++;
    }
  }
  const guess = known ? sum / known : CARD;
  const tops = [0];
  for (const id of ids) tops.push(tops[tops.length - 1] + (sizes.get(id) ?? guess) + gap);
  return tops;
}

/**
 * The heights of cards as they're drawn, by the task each shows, and a watch for each card's element to report its
 * height as it's drawn and whenever it changes. Elements carry their task in data-task. Heights are read as the
 * browser lays the page out, so measuring never lays it out early, and every card measured in a frame lands at once
 */
export function useCardSizes() {
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [observer] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) =>
          setSizes((prev) => {
            let next: Map<string, number> | null = null;
            for (const e of entries) {
              const id = (e.target as HTMLElement).dataset.task;
              const h = e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight;
              // A card that isn't laid out, like one in a hidden column, has no height worth keeping
              if (!id || !h || prev.get(id) === h) continue;
              next ??= new Map(prev);
              next.set(id, h);
            }
            return next ?? prev;
          }),
        ),
  );
  const watch = useCallback(
    (el: HTMLElement) => {
      observer?.observe(el);
      return () => observer?.unobserve(el);
    },
    [observer],
  );
  return { sizes, watch };
}

export type CardSizes = ReturnType<typeof useCardSizes>;
