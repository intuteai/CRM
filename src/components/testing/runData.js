import { toNum } from './testingFormat';

// status_flags bits: b0 rpm valid, b1 current, b2 voltage, b3 bemf (validity);
// b4 CAN stale, b5 setpoint changed, b6 protective warning, b7 storage lag (VCU status flags,
// recorded per reading and never changed; the criteria decide what they mean).
const bit = (flags, n) => ((Number(flags) || 0) >> n) & 1;

/** The status-flag bits shown on the graphs, in display order. */
export const STATUS_BITS = [4, 5, 6, 7];

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
      b4: bit(flags, 4) === 1,
      b5: bit(flags, 5) === 1,
      b6: bit(flags, 6) === 1,
      b7: bit(flags, 7) === 1,
    };
    if (prev && seq != null && prev.seq != null && seq > prev.seq + 1) {
      out.push({
        gap: true, missing: seq - prev.seq - 1, seq: null, t: prev.t, cmd: null, rpm: null, current: null, voltage: null, bemf: null, gapAfter: prev.rpm,
        b4: false, b5: false, b6: false, b7: false,
      });
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

/** Median step of t_ms between consecutive readings (sample_seq +1), or null. Fallback when sample_hz is missing. */
function medianStep(rows) {
  const steps = [];
  let prev = null;
  for (const r of rows) {
    if (r.gap) {
      prev = null;
      continue;
    }
    if (prev && r.seq != null && prev.seq != null && r.seq === prev.seq + 1 && r.t != null && prev.t != null && r.t > prev.t) steps.push(r.t - prev.t);
    prev = r;
  }
  if (!steps.length) return null;
  steps.sort((a, b) => a - b);
  const mid = steps.length >> 1;
  return steps.length % 2 ? steps[mid] : (steps[mid - 1] + steps[mid]) / 2;
}

/**
 * Status flags b4–b7 of a run (criteria-flag-rules.md): per bit the readings with it set and its stretches.
 * A stretch = consecutive readings (sample_seq +1) that all have the bit; a missing sample_seq ends it.
 * Stretch length = readings in it × period, period = 1000 / sample_hz (median t_ms step when sample_hz is missing).
 * Returns { total, period, any, bits: { 4: { count, longest, longestMs, stretches: [{ t1, t2, n }] }, ... } }
 * where t1 / t2 are the t_ms of the first / last reading of the stretch.
 */
export function flagStats(rows, sampleHz) {
  const hz = toNum(sampleHz);
  const period = hz && hz > 0 ? 1000 / hz : medianStep(rows);
  const bits = {};
  for (const b of STATUS_BITS) bits[b] = { count: 0, longest: 0, longestMs: null, stretches: [] };
  let total = 0;
  let prev = null;
  for (const r of rows) {
    if (r.gap) {
      prev = null;
      continue;
    }
    total += 1;
    const follows = prev && r.seq != null && prev.seq != null && r.seq === prev.seq + 1;
    for (const b of STATUS_BITS) {
      if (!r[`b${b}`]) continue;
      const acc = bits[b];
      acc.count += 1;
      const last = acc.stretches[acc.stretches.length - 1];
      if (follows && prev[`b${b}`] && last) {
        last.n += 1;
        if (r.t != null) last.t2 = r.t;
      } else {
        acc.stretches.push({ t1: r.t, t2: r.t, n: 1 });
      }
    }
    prev = r;
  }
  for (const b of STATUS_BITS) {
    const acc = bits[b];
    acc.longest = acc.stretches.reduce((m, s) => Math.max(m, s.n), 0);
    acc.longestMs = period != null && acc.longest ? acc.longest * period : null;
  }
  return { total, period, any: STATUS_BITS.some((b) => bits[b].count > 0), bits };
}

/**
 * Warning intervals from a v0.5 warnings[] journal (v05-warning-events.md section 3), per source + limit_id, in seq order:
 * an interval opens at ACTIVE_AT_START / RAISED / STATUS_UNKNOWN and closes at CLEARED or at STATUS_KNOWN with
 * restored_state CLEAR; STATUS_KNOWN with restored_state ACTIVE keeps it open. One still open at the end runs to
 * capture_end_ms (toEnd = true). Records with no open interval to act on (e.g. an unproven CLEARED whose RAISED was lost)
 * open nothing: intervals are never invented.
 * Each interval has segments [{ state: 'active' | 'unknown', t1, t2 }] so the unknown-status stretches can be drawn
 * in their own tone. Returns [{ key, source, limitId, t1, t2, toEnd, segments }] sorted by t1.
 */
export function warningIntervals(warnings, captureEndMs) {
  const list = (Array.isArray(warnings) ? warnings : [])
    .filter((w) => w && (w.source === 'STATUS_BIT6' || w.source === 'VCU_LIMIT') && toNum(w.t_ms) != null)
    .slice()
    .sort((a, b) => toNum(a.seq) - toNum(b.seq));
  const end = toNum(captureEndMs);
  const open = new Map();
  const out = [];
  const closeSeg = (iv, t) => {
    const seg = iv.segments[iv.segments.length - 1];
    if (seg && seg.t2 == null) seg.t2 = t;
  };
  const finish = (k, iv, t) => {
    closeSeg(iv, t);
    iv.t2 = t;
    out.push(iv);
    open.delete(k);
  };
  for (const w of list) {
    const k = `${w.source}|${w.limit_id ?? ''}`;
    const t = toNum(w.t_ms);
    const iv = open.get(k);
    switch (w.kind) {
      case 'ACTIVE_AT_START':
      case 'RAISED':
        if (!iv) open.set(k, { key: k, source: w.source, limitId: w.limit_id ?? null, t1: t, t2: null, toEnd: false, segments: [{ state: 'active', t1: t, t2: null }] });
        break;
      case 'STATUS_UNKNOWN':
        if (!iv) open.set(k, { key: k, source: w.source, limitId: w.limit_id ?? null, t1: t, t2: null, toEnd: false, segments: [{ state: 'unknown', t1: t, t2: null }] });
        else if (iv.segments[iv.segments.length - 1].state !== 'unknown') {
          closeSeg(iv, t);
          iv.segments.push({ state: 'unknown', t1: t, t2: null });
        }
        break;
      case 'STATUS_KNOWN':
        if (!iv) break;
        if (w.restored_state === 'CLEAR') finish(k, iv, t);
        else if (w.restored_state === 'ACTIVE' && iv.segments[iv.segments.length - 1].state === 'unknown') {
          closeSeg(iv, t);
          iv.segments.push({ state: 'active', t1: t, t2: null });
        }
        break;
      case 'CLEARED':
        if (iv) finish(k, iv, t);
        break;
      default:
        break;
    }
  }
  for (const [k, iv] of [...open]) {
    // Still open when the journal ends: runs to capture_end_ms (or, if that is missing, to its own last time).
    const last = iv.segments[iv.segments.length - 1].t1;
    iv.toEnd = true;
    finish(k, iv, end != null ? Math.max(end, last) : last);
  }
  return out.sort((a, b) => a.t1 - b.t1);
}

/**
 * Explicit gaps in a strictly increasing id sequence (warnings[].seq, command_changes[].step): list items in order with
 * { lost: n } entries inserted where ids are missing (also before the first one when it is above 0).
 */
export function withGaps(items, idKey) {
  const sorted = (Array.isArray(items) ? items : []).slice().sort((a, b) => toNum(a[idKey]) - toNum(b[idKey]));
  const out = [];
  let expect = 0;
  for (const it of sorted) {
    const id = toNum(it[idKey]);
    if (id != null && id > expect) out.push({ lost: id - expect, from: expect });
    out.push({ item: it });
    if (id != null) expect = id + 1;
  }
  return out;
}

/**
 * The settle window to shade after each b5 reading: the largest window_ms of the flag_exclusion rules on bit 5
 * that exclude anything (applies_to null or non-empty). { windowMs, count, appliesTo } or null when there is none;
 * appliesTo = the applies_to of the rule with that window (null = all value rules).
 */
export function settleWindow(rules) {
  const list = (rules || []).filter((r) => r && r.type === 'flag_exclusion' && Number(r.bit) === 5
    && toNum(r.window_ms) != null && toNum(r.window_ms) > 0 && !(Array.isArray(r.applies_to) && r.applies_to.length === 0));
  if (!list.length) return null;
  const widest = list.reduce((a, r) => (toNum(r.window_ms) > toNum(a.window_ms) ? r : a));
  return { windowMs: toNum(widest.window_ms), count: list.length, appliesTo: Array.isArray(widest.applies_to) ? widest.applies_to : null };
}
