/** Display-only rounding. The engine never rounds (CLAUDE.md rule 4). */

export function roundShekel(x: number): number {
  return Math.round(x) || 0; // avoid -0
}

/**
 * Shown diff = rounded alt − rounded today (difference of the rounded values), so the table is always
 * internally consistent and matches the "חישובים" sheet.
 */
export function displayDiff(alt: number, today: number): number {
  return roundShekel(alt) - roundShekel(today);
}

/**
 * Parts of a shown total (the net change per component): each rounded, and the rounding remainder put on the last
 * part, so the parts on screen add up exactly to the shown total.
 */
export function displayParts(parts: number[], shownTotal: number): number[] {
  if (!parts.length) return [];
  const rounded = parts.map(roundShekel);
  const rest = rounded.slice(0, -1).reduce((s, x) => s + x, 0);
  rounded[rounded.length - 1] = shownTotal - rest || 0;
  return rounded;
}
