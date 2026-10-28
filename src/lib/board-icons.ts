import type { IconName } from "@/components/ui/icons";

// The icons a board can show in the sidebar. Kept in step with the check on boards.icon in the database
export const boardIcons = [
  "board",
  "folder",
  "layers",
  "star",
  "flag",
  "bulb",
  "sparkle",
  "globe",
  "chart",
  "users",
  "shield",
  "calendar",
] as const satisfies readonly IconName[];

export type BoardIcon = (typeof boardIcons)[number];

/** A board's icon, or the usual one when it has none or one this version doesn't know */
export const boardIcon = (icon: string | null | undefined): BoardIcon =>
  boardIcons.includes(icon as BoardIcon) ? (icon as BoardIcon) : "board";
