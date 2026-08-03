/** Muted palette for deterministic TeamMonogram hues — not scraped brand kits. */
const MONOGRAM_HUES = [
  { bg: "#3d3420", fg: "#f5e6a8" }, // amber muted
  { bg: "#1e3a2f", fg: "#b8e0c8" }, // forest
  { bg: "#1e2a3a", fg: "#b8cce0" }, // steel
  { bg: "#3a1e28", fg: "#e0b8c4" }, // wine
  { bg: "#2a2438", fg: "#c8b8e0" }, // slate violet
  { bg: "#1e3338", fg: "#b8dce0" }, // teal
  { bg: "#38301e", fg: "#e0d4b8" }, // sand
  { bg: "#2e2e32", fg: "#d4d4d8" }, // zinc
] as const

function hashAbbrev(abbrev: string): number {
  const key = abbrev.trim().toUpperCase()
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return hash
}

export function monogramColors(abbreviation: string): { bg: string; fg: string } {
  const idx = hashAbbrev(abbreviation) % MONOGRAM_HUES.length
  return MONOGRAM_HUES[idx]
}
