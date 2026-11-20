/* =====================================================================
   Raw-material PRODUCT CODE helpers (pure — no React, no import.meta, so
   they run under `node --test`).

   Code structure (11 characters):
     NNNN   4-digit part number (0001–9999), unique per raw material
     CC     2-char chart pair (e.g. L5, R1, CO, GN, MO)
     SS     2-char sub code (e.g. BR, SH, FF, RF, AU or any custom pair)
     T C R  store, column, row — 1 digit each

   Source: ERP_PART_CODE_LIST.pdf
     Chart     Pair  Default sub
     IPT       L5    BR (Bearing BR)
     Rikshaw   R1    SH (Shaft)
     2Wheeler  W2    FF (Front Flange)
     Autonxt   A0    RF (Rear Flange)
     Special   S3    —
     CO        CO    —
     General   GN    —
     Motor     MO    —
   ===================================================================== */

export const PRODUCT_CHARTS = [
  { label: "IPT", symbol: "L", digit: "5", defaultSub: "BR", color: "purple" },
  { label: "Rikshaw", symbol: "R", digit: "1", defaultSub: "SH", color: "blue" },
  { label: "2Wheeler", symbol: "W", digit: "2", defaultSub: "FF", color: "indigo" },
  { label: "Autonxt", symbol: "A", digit: "0", defaultSub: "RF", color: "violet" },
  { label: "Special", symbol: "S", digit: "3", defaultSub: "", color: "fuchsia" },
  { label: "CO", symbol: "C", digit: "", pair: "CO", defaultSub: "", color: "gray" },
  { label: "General", symbol: "G", digit: "N", pair: "GN", defaultSub: "", color: "green" },
  { label: "Motor", symbol: "M", digit: "O", pair: "MO", defaultSub: "", color: "rose" },
];

export const SUB_CODES = [
  { abbr: "BR", label: "Bearing BR" },
  { abbr: "SH", label: "Shaft" },
  { abbr: "FF", label: "Front Flange" },
  { abbr: "RF", label: "Rear Flange" },
  { abbr: "AU", label: "Auxiliary" },
];

// Tailwind colour per code segment (used by the builder preview).
export const SEG = {
  part: "text-blue-700",
  chart: "text-purple-600",
  sub: "text-green-700",
  store: "text-red-600",
  col: "text-orange-500",
  row: "text-teal-600",
};

// Same rule the backend enforces (and every stored code matches).
export const PRODUCT_CODE_RE = /^\d{4}[A-Z0-9]{4}\d{3}$/;

/** "42" → "0042"; anything below 1 or unparsable → "0001"; capped at "9999". */
export function pad4(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return "0001";
  return String(Math.min(n, 9999)).padStart(4, "0");
}

/** The 2-char chart pair for a chart entry ("L5", "CO", "GN", ...). */
export function chartPair(chart) {
  if (!chart) return "";
  return chart.pair || (chart.symbol || "") + (chart.digit || "");
}

/**
 * Build the 11-char code from builder segments. A missing sub code is padded
 * with "_" so callers can tell the code is incomplete; missing store/col/row
 * simply make the result shorter than 11.
 */
export function buildCode({ partNum, chartSymbol, chartDigit, subAbbr, storeNum, colNum, rowNum }) {
  const p = String(partNum || "0001").padStart(4, "0").slice(0, 4);
  const cp = chartSymbol === "C" && !chartDigit ? "CO" : (chartSymbol || "") + (chartDigit || "");
  const s = (subAbbr || "").slice(0, 2).padEnd(2, "_");
  const st = (storeNum || "").slice(0, 1);
  const co = (colNum || "").slice(0, 1);
  const ro = (rowNum || "").slice(0, 1);
  return p + cp + s + st + co + ro;
}

/**
 * Split an 11-char code back into builder segments. Returns null when the
 * code is not 11 characters. `chart` is null when the pair is not a known chart.
 */
export function parseCode(code) {
  if (typeof code !== "string" || code.length !== 11) return null;
  const partNum = code.slice(0, 4);
  let chartSymbol = code.slice(4, 5);
  let chartDigit = code.slice(5, 6);
  if (code.slice(4, 6) === "CO") {
    chartSymbol = "C";
    chartDigit = "";
  }
  const chart =
    PRODUCT_CHARTS.find((c) => c.symbol === chartSymbol && c.digit === chartDigit) || null;
  return {
    partNum,
    chartSymbol,
    chartDigit,
    subAbbr: code.slice(6, 8),
    storeNum: code.slice(8, 9),
    colNum: code.slice(9, 10),
    rowNum: code.slice(10, 11),
    chart,
  };
}

export function isValidProductCode(code) {
  return typeof code === "string" && PRODUCT_CODE_RE.test(code);
}

/**
 * Suggested part number for a new item: highest productId + 1, as 4 digits.
 * (With auto part-numbering the server assigns the real number on save.)
 */
export function suggestPartNumber(items) {
  let max = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const id = Number(it?.productId ?? it?.product_id);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return pad4(max + 1);
}
