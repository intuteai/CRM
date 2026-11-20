/* =====================================================================
   Lead date logic (pure — runs under `node --test`).
   Internally a date is always an ISO calendar string 'YYYY-MM-DD'; the UI
   shows and accepts 'DD-MM-YYYY'. Arithmetic uses Date.UTC only, so local
   timezones and DST changes can never shift a day. Never use toISOString()
   on a local Date here.
   ===================================================================== */

export const LEAD_YEAR_MIN = 2000;
export const LEAD_YEAR_MAX = 2100;
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
export const WEEKDAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]; // Monday first

const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, "0");

export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month 1..12
export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** 'YYYY-MM-DD' from parts, or null when not a real date inside 2000..2100. */
export function isoFromParts(year, month, day) {
  if (![year, month, day].every(Number.isInteger)) return null;
  if (year < LEAD_YEAR_MIN || year > LEAD_YEAR_MAX || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** { year, month, day } from a valid ISO date, else null. */
export function partsFromIso(iso) {
  if (typeof iso !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  return isoFromParts(year, month, day) === iso ? { year, month, day } : null;
}

export const isValidIsoDate = (iso) => partsFromIso(iso) !== null;

/** ISO → 'DD-MM-YYYY'; '' for anything invalid. */
export function formatDisplay(iso) {
  const p = partsFromIso(iso);
  return p ? `${pad2(p.day)}-${pad2(p.month)}-${p.year}` : "";
}

/**
 * Typed or pasted text → ISO, or null when it isn't a real date.
 * Accepts DD-MM-YYYY with '-', '/', '.' or space separators (1–2 digit day
 * and month), YYYY-MM-DD / YYYY/MM/DD, and 8 bare digits DDMMYYYY.
 */
export function parseDisplay(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  let m;
  if ((m = /^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{4})$/.exec(s)))
    return isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)))
    return isoFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  if ((m = /^(\d{2})(\d{2})(\d{4})$/.exec(s)))
    return isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/**
 * Typing mask: keeps up to 8 digits and inserts the dashes → 'DD-MM-YYYY'.
 * A dash is only added once the next digit exists, so backspace over a dash
 * works naturally ('25-1' ← backspace → '25-' is shown as '25').
 */
export function maskDisplay(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

/**
 * What the input should show after a change event. A paste of a full date in
 * any accepted form is normalised to DD-MM-YYYY; anything else is masked.
 */
export function normaliseTyped(raw) {
  const iso = parseDisplay(raw);
  if (iso && /[/.\s]|^\d{4}-/.test(String(raw).trim())) return formatDisplay(iso);
  return maskDisplay(raw);
}

/** Local "today" as ISO (uses local calendar fields, not toISOString). */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

const toUtc = ({ year, month, day }) => Date.UTC(year, month - 1, day);
const fromUtc = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

/** Clamp an ISO date into 2000-01-01..2100-12-31. */
export function clampIso(iso) {
  if (iso < `${LEAD_YEAR_MIN}-01-01`) return `${LEAD_YEAR_MIN}-01-01`;
  if (iso > `${LEAD_YEAR_MAX}-12-31`) return `${LEAD_YEAR_MAX}-12-31`;
  return iso;
}

/** ISO ± n days (clamped to the allowed range). */
export function addDays(iso, n) {
  const p = partsFromIso(iso);
  if (!p) return iso;
  return clampIso(fromUtc(toUtc(p) + n * DAY_MS));
}

/** ISO ± n months; the day is clamped (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(iso, n) {
  const p = partsFromIso(iso);
  if (!p) return iso;
  const total = p.year * 12 + (p.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  if (year < LEAD_YEAR_MIN) return `${LEAD_YEAR_MIN}-01-01`;
  if (year > LEAD_YEAR_MAX) return `${LEAD_YEAR_MAX}-12-31`;
  return isoFromParts(year, month, Math.min(p.day, daysInMonth(year, month)));
}

export const addYears = (iso, n) => addMonths(iso, n * 12);

/** 0 = Monday … 6 = Sunday. */
export function weekdayMon(iso) {
  const p = partsFromIso(iso);
  if (!p) return 0;
  return (new Date(toUtc(p)).getUTCDay() + 6) % 7;
}

export const startOfWeek = (iso) => addDays(iso, -weekdayMon(iso));
export const endOfWeek = (iso) => addDays(iso, 6 - weekdayMon(iso));

/**
 * 6×7 calendar matrix for a month, Monday first:
 * [[{ iso, day, inMonth }, …7], …6]. Days outside 2000..2100 have iso null.
 */
export function monthMatrix(year, month) {
  const first = { year, month, day: 1 };
  const lead = (new Date(toUtc(first)).getUTCDay() + 6) % 7;
  const start = toUtc(first) - lead * DAY_MS;
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start + (w * 7 + d) * DAY_MS);
      const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, day = dt.getUTCDate();
      row.push({ iso: isoFromParts(y, m, day), day, inMonth: m === month && y === year });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Long label for screen readers: 'Wednesday, 25 November 2026'. */
export function ariaLabel(iso) {
  const p = partsFromIso(iso);
  if (!p) return "";
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return `${names[weekdayMon(iso)]}, ${p.day} ${MONTH_NAMES[p.month - 1]} ${p.year}`;
}
