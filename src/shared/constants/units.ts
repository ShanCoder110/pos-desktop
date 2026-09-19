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
