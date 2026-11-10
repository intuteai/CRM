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
