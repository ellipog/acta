"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { AppearanceHost } from "@/components/appearance";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <AppearanceHost />
    </NextThemesProvider>
  );
}
