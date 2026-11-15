import type { MetadataRoute } from "next";

// Added to a phone's home screen, Acta opens as an app of its own, without the browser around it, at the last
// board (see /home)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Acta",
    short_name: "Acta",
    description: "A project manager for teams and their AI agents.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f3f0e8",
    theme_color: "#f3f0e8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
