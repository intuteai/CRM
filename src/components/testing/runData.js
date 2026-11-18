import { toNum } from './testingFormat';

// status_flags bits: b0 rpm valid, b1 current, b2 voltage, b3 bemf.
const bit = (flags, n) => ((Number(flags) || 0) >> n) & 1;

/**
 * Normalises samples for plotting. Invalid values stay null (rpm_actual is treated as invalid when
 * status bit 0 is clear) and a break row is inserted wherever sample_seq jumps, so a chart line
 * stops at a gap instead of being drawn across it.
 */
export function prepareSamples(samples) {
  const out = [];
  let prev = null;
  for (const s of samples) {
    const seq = toNum(s.sample_seq);
    const flags = s.status_flags;
    const row = {
      seq,
      t: toNum(s.t_ms),
      cmd: toNum(s.rpm_cmd),
      rpm: bit(flags, 0) ? toNum(s.rpm_actual) : null,
      current: toNum(s.current_a),
      voltage: toNum(s.voltage_v),
      bemf: toNum(s.bemf_v),
    };
    if (prev && seq != null && prev.seq != null && seq > prev.seq + 1) {
      out.push({ gap: true, missing: seq - prev.seq - 1, seq: null, t: prev.t, cmd: null, rpm: null, current: null, voltage: null, bemf: null, gapAfter: prev.rpm });
    }
    out.push(row);
    prev = row;
  }
  return out;
}

/**
 * { gaps, missing, rpm, current, voltage } — number of sample_seq jumps, of samples missing inside the
 * stored range, and of stored readings whose rpm / current / voltage is invalid (left out of the graphs).
 */
export function gapStats(rows) {
  const acc = { gaps: 0, missing: 0, rpm: 0, current: 0, voltage: 0 };
  for (const r of rows) {
    if (r.gap) {
      acc.gaps += 1;
      acc.missing += r.missing;
      continue;
    }
    if (r.rpm == null) acc.rpm += 1;
    if (r.current == null) acc.current += 1;
    if (r.voltage == null) acc.voltage += 1;
  }
  return acc;
}
