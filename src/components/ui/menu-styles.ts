// Shared by the dropdown and right-click menus. Items are taller on a touch screen, a finger being wider than a pointer
export const menuItem =
  "relative flex h-8 cursor-default items-center gap-2 px-2 text-sm pointer-coarse:h-10 text-ink outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-sunken data-[state=open]:bg-sunken [&>svg]:text-ink-3";
export const menuContent = "z-50 min-w-44 max-w-[calc(100vw-1.5rem)] outline-none";
