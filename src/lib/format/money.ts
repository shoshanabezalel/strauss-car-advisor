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
