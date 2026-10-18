/** Absolute URL for the bundled Jameel Noori Nastaleeq TTF. */
export function jameelNooriFontUrl(origin?: string): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).replace(
    /\/$/,
    "",
  );
  return `${base}/fonts/JameelNooriNastaleeq-Regular.ttf`;
}

export const JAMEEL_NOORI_FONT_FAMILY = "'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', serif";

/**
 * URL-based @font-face for print + preview.
 * Do NOT embed the TTF as base64 — ~10MB and print HTML can reject oversized docs.
 */
export function jameelNooriFontFaceCss(origin?: string): string {
  const url = jameelNooriFontUrl(origin);
  return `@font-face {
  font-family: 'Jameel Noori Nastaleeq';
  src: url('${url}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`;
}
