import type { Metadata } from "next";
import { Suspense } from "react";
import { EB_Garamond, Geist, Geist_Mono, Marcellus } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toast";
import { appearanceScript } from "@/lib/appearance";
import { siteUrl } from "@/lib/slugs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const garamond = EB_Garamond({
  variable: "--font-garamond",
  style: "italic",
  subsets: ["latin"],
  // Only small captions use it, so it shouldn't hold up the headings and body text
  preload: false,
});

const marcellus = Marcellus({
  variable: "--font-marcellus",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Acta", template: "%s · Acta" },
  description: "A project manager for teams and their AI agents: boards, tables, a timeline and public roadmaps.",
  applicationName: "Acta",
  openGraph: { siteName: "Acta", locale: "en_US", type: "website" },
  twitter: { card: "summary_large_image" },
  // Codes from Google Search Console and Bing Webmaster Tools, for when the domain can't be verified through DNS
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
};

// Pixel art snaps to whole device pixels (see globals.css), so the page needs the current device pixel ratio
// before it paints. It changes with browser zoom and when the window moves to another screen
const pixelRatio = `(function(){var r=document.documentElement;function s(){var d=window.devicePixelRatio||1;r.style.setProperty("--dpr",String(d));try{matchMedia("(resolution: "+d+"dppx)").addEventListener("change",s,{once:true})}catch(e){}}s()})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${marcellus.variable} ${garamond.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: pixelRatio }} />
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
          <Suspense fallback={null}>
            <Analytics />
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
