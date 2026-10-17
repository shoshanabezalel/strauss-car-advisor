"use client";

import { Direction } from "radix-ui";

/** RTL context for Radix-based shadcn components (dropdowns, popovers, etc.). */
export function DirectionProvider({ children }: { children: React.ReactNode }) {
  return <Direction.Provider dir="rtl">{children}</Direction.Provider>;
}
