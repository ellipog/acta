"use client";

import { useEffect } from "react";

// Sends the browser on from inside the page. redirect() thrown in a streamed Suspense boundary reloads the page over
// and over instead, and an app's own scheme, like cursor://, only opens from the browser anyway
export function Go({ to, label }: { to: string; label: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <a href={to} className="text-sm text-lapis underline underline-offset-2">
      {label}
    </a>
  );
}
