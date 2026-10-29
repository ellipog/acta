import { previewSize, siteImage } from "@/lib/og";

export const alt = "Acta: project management for teams and their AI agents";
export const size = previewSize;
export const contentType = "image/png";

export default function Image() {
  return siteImage();
}
