/** Seeded unit symbols → display names (matches backend seed_units). */
export const UNIT_LABELS: Record<string, string> = {
  pc: "Piece",
  m: "Meter",
  gaz: "Gaz",
  ft: "Foot",
  roll: "Roll",
  coil: "Coil",
  reel: "Reel",
  pk: "Pack",
  box: "Box",
  doz: "Dozen",
  pair: "Pair",
  set: "Set",
  bundle: "Bundle",
  kg: "Kilogram",
  g: "Gram",
  L: "Liter",
};

export function unitNameFromSymbol(symbol: string) {
  return UNIT_LABELS[symbol] ?? symbol;
}

export function symbolFromUnitName(name: string, fallback = "pc") {
  const needle = name.trim().toLowerCase();
  const exact = Object.entries(UNIT_LABELS).find(([, label]) => label.toLowerCase() === needle);
  if (exact) return exact[0];
  if (needle.includes("pack")) return "pk";
  if (needle.includes("box")) return "box";
  if (needle.includes("gaz")) return "gaz";
  if (needle.includes("meter")) return "m";
  if (needle.includes("piece")) return "pc";
  return fallback;
}

/** Builds a short, URL-safe symbol for units created from an inline selector. */
export function uniqueUnitSymbol(name: string, usedSymbols: string[]) {
  const known = symbolFromUnitName(name, "");
  const stem =
    known ||
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 12) ||
    "unit";
  const used = new Set(usedSymbols.map((symbol) => symbol.trim().toLowerCase()));
  if (!used.has(stem.toLowerCase())) return stem;
  let suffix = 2;
  while (used.has(`${stem}${suffix}`.toLowerCase())) suffix += 1;
  return `${stem}${suffix}`;
}
