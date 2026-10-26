/**
 * CSS variables that size a pixel drawing in whole device pixels (see svg.pixel in globals.css). `w` and `h` are
 * its size in cells and `scale` the CSS pixels per cell it was drawn for. Ties round up below scale 2, so small
 * drawings stay legible, and down from 2, so larger ones stay inside their buttons
 */
export const pixelBox = (w: number, h: number, scale: number) =>
  ({ "--pw": w, "--ph": h, "--ps": scale, "--pb": scale < 2 ? 0.001 : -0.001 }) as React.CSSProperties;
