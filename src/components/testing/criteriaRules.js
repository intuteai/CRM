// Shared knowledge about criteria rule types (CRM_BACKEND/docs/motor-test/criteria-flag-rules.md).
// Value rules judge one signal; status-flag rules judge the VCU status_flags bits b4–b7 and never have a signal.

export const VALUE_TYPES = ['max', 'min', 'range', 'checkpoint', 'tracking', 'reach', 'bemf_constant'];
export const FLAG_TYPES = ['flag_share', 'flag_any', 'flag_exclusion', 'step_coverage'];
export const SIGNALS = ['current_a', 'voltage_v', 'rpm_actual', 'bemf_v'];
export const isFlagType = (type) => FLAG_TYPES.includes(type);
/** flag_exclusion only hides readings from value rules: it has no on_violation and never gives a verdict. */
export const hasVerdict = (type) => type !== 'flag_exclusion';

export const FLAG_BITS = { 4: 'CAN stale', 5: 'setpoint changed', 6: 'protective warning', 7: 'storage lag' };
export const bitLabel = (bit) => (FLAG_BITS[bit] ? `b${bit} ${FLAG_BITS[bit]}` : `b${bit ?? '—'}`);

/**
 * Moves the decimal point of a decimal text by `places`, on the digits only (no float arithmetic), so it is exact:
 * ("2", -2) -> "0.02"; ("0.07", 2) -> "7" (0.07 * 100 in floats would be 7.000000000000001). null if not a number.
 */
function shiftDecimalText(text, places) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(text).trim());
  if (!m || (m[2] === '' && (m[3] || '') === '')) return null;
  const [, sign, int, frac = '', exp = '0'] = m;
  const digits = int + frac;
  const point = int.length + Number(exp) + places;
  let out;
  if (point <= 0) out = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + '0'.repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  out = out.replace(/^0+(?=\d)/, '');
  if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return `${sign === '-' && /[1-9]/.test(out) ? '-' : ''}${out}`;
}
/** Percent typed in the UI ("2") -> stored 0–1 fraction (0.02). NaN when not a number. */
export const pctToFraction = (pct) => {
  const t = shiftDecimalText(pct, -2);
  return t === null ? NaN : Number(t);
};
/** Stored fraction (0.02) -> percent text for the UI ("2"). Round-trips exactly through pctToFraction. */
export const fractionToPct = (fraction) => shiftDecimalText(String(fraction), 2) ?? String(fraction);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numText = (v, unit = '') => (isNum(v) ? `${v}${unit}` : '—');

/**
 * Readable one-line text of a status-flag rule, e.g.
 *   "b4 CAN stale · share ≤ 2 % · longest ≤ 1000 ms → INVALID"
 *   "b5 setpoint changed · ignore 1500 ms after · all value rules"
 */
export function describeFlagRule(rule) {
  const parts = [bitLabel(rule.bit)];
  if (rule.type === 'flag_share') {
    if (isNum(rule.max_fraction)) parts.push(`share ≤ ${fractionToPct(rule.max_fraction)} %`);
    if (isNum(rule.max_continuous_ms)) parts.push(`longest ≤ ${rule.max_continuous_ms} ms`);
    if (!isNum(rule.max_fraction) && !isNum(rule.max_continuous_ms)) parts.push('no limit set');
  } else if (rule.type === 'flag_any') {
    parts.push('any');
  } else if (rule.type === 'flag_exclusion') {
    parts.push(`ignore ${numText(rule.window_ms, ' ms')} after`);
    if (!Array.isArray(rule.applies_to)) parts.push('all value rules');
    else parts.push(rule.applies_to.length ? `only ${rule.applies_to.join(', ')}` : 'no value rules');
  } else if (rule.type === 'step_coverage') {
    const signals = Array.isArray(rule.signals) && rule.signals.length ? ` (${rule.signals.join(', ')})` : '';
    parts.push(`per step ≥ ${numText(rule.min_readings)} fresh valid readings${signals} after ${numText(rule.settle_ms, ' ms')}`);
  }
  const text = parts.join(' · ');
  return hasVerdict(rule.type) ? `${text} → ${rule.on_violation || '—'}` : text;
}
