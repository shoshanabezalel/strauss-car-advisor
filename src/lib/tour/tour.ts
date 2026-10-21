import type { TourStep } from "./steps";

/** Pure tour logic (docs/TOUR.md): which element a step points at, what it says, where the bubble goes, seen flag. */

export type TourScreen = "employee" | "rep";

/** Tailwind `lg`: the profile panel collapses below it (profile-panel.tsx `lg:hidden`). */
export const DESKTOP_QUERY = "(min-width: 1024px)";
/** Side gutter on every screen size, and the gap between a target and its bubble. */
export const GUTTER = 16;
export const BUBBLE_GAP = 12;

export function selectorFor(step: TourStep, isDesktop: boolean): string {
  if (typeof step.selector === "string") return step.selector;
  return isDesktop ? step.selector.desktop : step.selector.mobile;
}

/** A missing target never skips the step: the bubble is centered, with the fallback text if the step has one. */
export function stepContent(step: TourStep, found: boolean): { text: string; centered: boolean } {
  if (found) return { text: step.text, centered: false };
  return { text: step.fallback ?? step.text, centered: true };
}

export interface TourStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const TOUR_SCREENS: TourScreen[] = ["employee", "rep"];
export const TOUR_SEEN = "1";
export const seenKey = (screen: TourScreen) => `tour:${screen}:v1`;

/** Blocked or missing storage (private window, cleared site data) counts as a first visit and never throws. */
export function hasSeen(screen: TourScreen, storage: () => TourStorage | undefined): boolean {
  try {
    return storage()?.getItem(seenKey(screen)) === TOUR_SEEN;
  } catch {
    return false;
  }
}

export function markSeen(screen: TourScreen, storage: () => TourStorage | undefined): void {
  try {
    storage()?.setItem(seenKey(screen), TOUR_SEEN);
  } catch {
    // Storage blocked: the tour may show again next visit, which is harmless.
  }
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Bubble position in viewport coordinates: below the target if it fits, else above; right edges aligned (RTL);
 * clamped inside the gutter. The arrow points from the bubble to the target.
 */
export function placeBubble(
  target: Rect,
  viewport: { width: number; height: number },
  bubble: { width: number; height: number },
): { top: number; left: number; arrow: "up" | "down" } {
  const below = target.top + target.height + BUBBLE_GAP;
  const fitsBelow = below + bubble.height <= viewport.height - GUTTER;
  const above = target.top - BUBBLE_GAP - bubble.height;
  const fitsAbove = above >= GUTTER;
  const arrow = fitsBelow || !fitsAbove ? "up" : "down";
  const top = clamp(fitsBelow ? below : fitsAbove ? above : below, GUTTER, viewport.height - GUTTER - bubble.height);
  const left = clamp(target.left + target.width - bubble.width, GUTTER, viewport.width - GUTTER - bubble.width);
  return { top, left, arrow };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
