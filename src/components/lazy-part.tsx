"use client";

import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Module<P> = { default: ComponentType<P> };

/**
 * A component whose code downloads the first time it's drawn, or earlier with `preload()`.
 *
 * It waits behind its own fallback, so only its own spot shows anything while it loads. Without that, the wait
 * reaches the nearest boundary above, which on a board is the whole page's loading frame.
 *
 * Once its code is in, it draws at once. React's own lazy waits a turn even for code that's already here, and
 * React then keeps a fallback it has shown up for about 300ms, so a part preloaded in idle time still flashed
 */
export function lazyPart<P extends object>(load: () => Promise<ComponentType<P>>, fallback: ReactNode = null) {
  let loaded: ComponentType<P> | undefined;
  let loading: Promise<ComponentType<P>> | undefined;
  const preload = () =>
    (loading ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => {
        // Tried again next time, as when a deploy replaced the file or the connection dropped
        loading = undefined;
        throw error;
      },
    ));

  const Lazy = lazy<ComponentType<P>>(() => {
    const ready = loaded;
    // A thenable that answers straight away is read in the same render, so nothing waits
    if (ready)
      return { then: (done: (m: Module<P>) => void) => done({ default: ready }) } as unknown as Promise<Module<P>>;
    return preload().then((component) => ({ default: component }));
  });

  function Part(props: P) {
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return Object.assign(Part, { preload });
}
