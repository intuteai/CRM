// Plain helpers and style tables for the Motor Testing screens (no components here, so
// fast-refresh stays happy in the .jsx files that import them).

export const FIELD = 'w-full px-3 py-2 border border-navy-100 rounded-lg bg-white text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-500';
export const LABEL = 'block text-xs font-semibold text-navy-800 mb-1';
export const BTN_CREATE = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gold-500 text-navy-900 rounded-lg text-sm font-semibold hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_SECONDARY = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_DANGER = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_SUCCESS = 'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const BTN_SMALL = 'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
export const CARD = 'bg-white rounded-xl shadow-sm border border-navy-100';
export const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-b border-navy-100';
export const TD = 'px-4 py-3 text-sm';

export const OUTCOME_STYLES = {
  PASS: 'bg-green-100 text-green-700',
  FAIL: 'bg-red-100 text-red-700',
  INCOMPLETE: 'bg-amber-100 text-amber-700',
  INVALID: 'bg-gray-200 text-gray-700',
};

export const VERSION_STATUS_STYLES = {
  DRAFT: 'bg-gray-100 text-gray-600',
  IN_REVIEW: 'bg-blue-100 text-blue-700',
  PUBLISHED: 'bg-green-100 text-green-700',
  SUPERSEDED: 'bg-slate-200 text-slate-600',
  WITHDRAWN: 'bg-red-100 text-red-700',
};

export const CORRECTION_STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

export const TESTING_ROLE_LABELS = {
  operator: 'Operator',
  viewer: 'Viewer',
  testing_head: 'Testing head',
  testing_admin: 'Testing admin',
};

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "sha256:abcdef…" -> "abcdef12…" (first 12 hex chars). */
export function shortSha(sha) {
  if (!sha) return '—';
  const hex = String(sha).replace(/^sha256:/, '');
  return `${hex.slice(0, 12)}…`;
}

export function shortId(id) {
  return id ? `${String(id).slice(0, 8)}…` : '—';
}

/** Number or null — Postgres numerics can arrive as strings; never turn null into 0. */
export function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function display(v, unit = '') {
  if (v === null || v === undefined || v === '') return '—';
  return unit ? `${v} ${unit}` : String(v);
}

// ---- contract v0.4 (CRM_BACKEND/docs/motor-test/contract/receipt-signing.md sections 2-3) ----
// v0.3 runs carry contract_version '0.3' and null for every v0.4 field; they keep the old display.
// v0.5 = the v0.4 body plus warning events (v05-warning-events.md), so every v0.4 display applies to it too.

export const isV04 = (run) => run?.contract_version === '0.4' || run?.contract_version === '0.5';
export const isV05 = (run) => run?.contract_version === '0.5';

/**
 * CANCEL before START: started === false. CONFIG_CANCELLED is allowed only with started = false
 * (rule CANCEL_SHAPE), so it identifies a cancel on the lookup rows, which do not carry `started`.
 */
export const isCancelled = (run) => run?.started === false || (isV04(run) && run?.stop_reason === 'CONFIG_CANCELLED');

/** Not a real bench run (staging only). v0.3 runs (run_kind null) and bench runs are not marked. */
export const RUN_KIND_LABELS = { host_simulation: 'Simulated', synthetic: 'Synthetic' };
export const isNotBench = (run) => !!run?.run_kind && run.run_kind !== 'bench';
export const runKindLabel = (kind) => RUN_KIND_LABELS[kind] || kind;

const SOURCE_TEXT = {
  HMI: 'approximate (tablet clock)',
  HMI_DERIVED: 'derived from VCU uptime (approximate)',
};

/** Small qualifier under a v0.4 start / end time, or null (v0.3 runs: none). which = 'started' | 'ended'. */
export function timeQualifier(run, which) {
  if (!isV04(run)) return null;
  const value = run[`${which}_at`];
  const source = run[`${which}_at_source`];
  if (value) return SOURCE_TEXT[source] || null;
  if (which === 'started' && run.started === false) return 'not started (cancelled)';
  if (run.started === true) return 'time unknown';
  return null;
}

const ms = (v) => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Why the tablet times of a v0.4 run should be treated as unverified ([] when none apply):
 * automatic time was off, the start is later than the ERP receive time, or the end is before the start.
 * Rows without hmi_auto_time (lookup list) are checked on the times alone.
 */
// ---- contract v0.5 warning events (v05-warning-events.md sections 3-5) ----

export const WARNING_PHASE_TEXT = { PRE_START: 'pre-start', CAPTURE: 'capture', POST_CAPTURE: 'post-capture' };
export const WARNING_KIND_STYLES = {
  ACTIVE_AT_START: 'bg-red-100 text-red-700',
  RAISED: 'bg-red-100 text-red-700',
  CLEARED: 'bg-green-100 text-green-700',
  STATUS_UNKNOWN: 'bg-slate-200 text-slate-700',
  STATUS_KNOWN: 'bg-navy-50 text-navy-800',
  DETAIL: 'bg-navy-50 text-navy-800',
  DETAIL_UNAVAILABLE: 'bg-amber-100 text-amber-700',
  DETAIL_AMBIGUOUS: 'bg-amber-100 text-amber-700',
};
export const isDetailKind = (kind) => kind === 'DETAIL' || kind === 'DETAIL_UNAVAILABLE' || kind === 'DETAIL_AMBIGUOUS';

/** "STATUS_BIT6", "VCU_LIMIT · RPM_DEVIATION", "SDO_2031_11". */
export const warningSourceText = (w) => (w.limit_id ? `${w.source} · ${w.limit_id}` : w.source || '—');

/** Plain words for a command change's link (section 4). */
export function commandLinkText(c) {
  switch (c.link) {
    case 'OWNS_READING': return `owns reading ${c.first_sample_seq ?? '—'}`;
    case 'SUPERSEDED': return 'superseded before a reading';
    case 'NO_READING': return 'no reading (capture ended)';
    case 'READING_NOT_RETAINED': return `reading ${c.first_sample_seq ?? '—'} acquired but not retained`;
    default: return c.link || '—';
  }
}
export const COMMAND_LINK_STYLES = {
  OWNS_READING: 'bg-green-100 text-green-700',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
  NO_READING: 'bg-amber-100 text-amber-700',
  READING_NOT_RETAINED: 'bg-amber-100 text-amber-700',
};

/** "2 events lost here" / "1 step lost here". */
export const lostText = (n, noun) => `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'} lost here`;

export function clockWarnings(run) {
  if (!isV04(run)) return [];
  const out = [];
  if (run.hmi_auto_time === false) out.push('the tablet had automatic time switched off');
  const start = ms(run.started_at);
  const end = ms(run.ended_at);
  const received = ms(run.received_at);
  if (start != null && received != null && start > received) out.push('the start is later than the time the ERP received the run');
  if (start != null && end != null && end < start) out.push('the end is earlier than the start');
  return out;
}
