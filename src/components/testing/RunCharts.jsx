// Graphs of one test run (recharts 2.15, SVG). Rules:
//  - gaps stay gaps: a missing sample_seq or an invalid (null) value breaks the line, never interpolated;
//  - thresholds come only from the criteria version the run was judged by (criteria.definition.rules);
//    a rule whose numbers are null draws nothing;
//  - FAULT / STATE events are marked on the time chart (FAULT also on the RPM-axis charts);
//  - VCU status flags b4/b6/b7 are shaded on the time chart as one band per stretch of consecutive
//    readings (never one area per reading), b5 (setpoint changed) is a thin vertical marker per reading,
//    and a flag_exclusion rule on b5 shades its settle window. Runs without flags look exactly as before.
//  - contract v0.5 only: warning intervals from the VCU event log (warningIntervals() in runData.js) are drawn as
//    hatched, outlined bands (red = warning active, slate dashed = status unknown), distinct from the sampled b6 bands,
//    and detail records as small dots at their t_ms labelled with the raw code. v0.3 / v0.4 runs pass no warnings.
import { memo, useId, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ReferenceArea, ReferenceDot,
} from 'recharts';
import { toNum } from './testingFormat';
import { settleWindow } from './runData';
import { isFlagType, bitLabel } from './criteriaRules';

const C_ACTUAL = '#3b6fb6';
const C_CMD = '#c98a1a';
const C_LIMIT = '#dc2626';
const C_CHECK = '#7c3aed';
const C_STATE = '#94a3b8';
const C_GRID = '#e5e7eb';
const AXIS_TICK = { fontSize: 11, fill: '#6b7280' };
// Status-flag marks on the time chart (low opacity so the lines stay readable).
const FLAG_BANDS = [
  { bit: 4, color: '#f59e0b', opacity: 0.2, text: 'CAN stale' },
  { bit: 6, color: '#dc2626', opacity: 0.14, text: 'protective warning' },
  { bit: 7, color: '#6b7280', opacity: 0.2, text: 'storage lag' },
];
const C_STEP = '#0f766e';
const C_SETTLE = '#14b8a6';
// v0.5 warning-event marks.
const C_WARN = '#b91c1c';
const C_UNKNOWN = '#475569';
const DETAIL_MARKS = {
  DETAIL: { fill: '#7f1d1d', stroke: '#fff', label: (w) => String(w.code ?? '—') },
  DETAIL_AMBIGUOUS: { fill: '#d97706', stroke: '#fff', label: (w) => `${w.code ?? '—'}?` },
  DETAIL_UNAVAILABLE: { fill: '#fff', stroke: C_WARN, label: () => 'n/a' },
};

/** Threshold lines/markers for one signal from the criteria rules. Only numbers present in the rule are drawn. */
function thresholdsFor(rules, signal) {
  const lines = [];
  const checkpoints = [];
  for (const r of rules || []) {
    // Status-flag rules (flag_share, flag_any, flag_exclusion, step_coverage) have no signal and draw nothing.
    if (!r || typeof r !== 'object' || isFlagType(r.type) || r.signal !== signal) continue;
    const id = r.id || r.type;
    if (r.type === 'checkpoint') {
      const at = toNum(r.at_rpm);
      if (at == null) continue;
      checkpoints.push({ id, at, window: toNum(r.rpm_window), min: toNum(r.min), max: toNum(r.max) });
      continue;
    }
    const limit = toNum(r.limit);
    const min = toNum(r.min);
    const max = toNum(r.max);
    if (limit != null) lines.push({ key: `${id}-limit`, y: limit, label: `${id} ${r.type === 'min' ? 'min' : 'limit'} ${limit}` });
    if (min != null) lines.push({ key: `${id}-min`, y: min, label: `${id} min ${min}` });
    if (max != null) lines.push({ key: `${id}-max`, y: max, label: `${id} max ${max}` });
  }
  return { lines, checkpoints };
}

function nearestRow(rows, t) {
  let best = null;
  let bestD = Infinity;
  for (const r of rows) {
    if (r.gap || r.t == null) continue;
    const d = Math.abs(r.t - t);
    if (d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

function fmt(v, digits = 2) {
  if (v === null || v === undefined) return 'invalid';
  return Number.isInteger(v) ? String(v) : v.toFixed(digits);
}

function ChartFrame({ title, subtitle, note, legend, children }) {
  return (
    <figure className="bg-white rounded-xl border border-navy-100 p-3 sm:p-4 min-w-0">
      <figcaption className="mb-2">
        <div className="text-sm font-semibold text-navy-800">{title}</div>
        {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      </figcaption>
      <div className="h-64 sm:h-72">{children}</div>
      {legend}
      {note && <div className="mt-2 text-[11px] text-gray-400">{note}</div>}
    </figure>
  );
}

function TimeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.gap) return null;
  return (
    <div className="bg-white border border-navy-100 rounded-lg shadow-lg px-3 py-2 text-xs text-navy-800">
      <div className="font-semibold mb-0.5">t = {p.t} ms · #{p.seq}</div>
      <div>Commanded: {fmt(p.cmd)} rpm</div>
      <div>Actual: {fmt(p.rpm)} rpm</div>
      {(p.b4 || p.b5 || p.b6 || p.b7) && (
        <div className="text-gray-500">Flags: {[4, 5, 6, 7].filter((b) => p[`b${b}`]).map((b) => bitLabel(b)).join(', ')}</div>
      )}
    </div>
  );
}

function makeXYTooltip(yLabel, unit) {
  return function XYTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    if (p.gap) return null;
    return (
      <div className="bg-white border border-navy-100 rounded-lg shadow-lg px-3 py-2 text-xs text-navy-800">
        <div className="font-semibold mb-0.5">#{p.seq} · t = {p.t} ms</div>
        <div>RPM actual: {fmt(p.rpm)}</div>
        <div>{yLabel}: {fmt(p.y, 3)} {unit}</div>
      </div>
    );
  };
}

const limitLabel = (text) => ({ value: text, position: 'insideTopRight', fill: C_LIMIT, fontSize: 10 });

/** Merges [a, b] intervals that overlap or touch (input sorted by a). */
function mergeIntervals(list) {
  const out = [];
  for (const [a, b] of list) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Bands, step markers and settle windows for the time chart, from flagStats() (runData.js).
 * A stretch is drawn from half a period before its first reading to half a period after its last,
 * so the band width equals the stretch length (widened to a minimum visible width); clamped to the data range.
 */
function flagMarks(rows, flags, settle) {
  if (!flags?.any) return null;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const r of rows) {
    if (r.gap || r.t == null) continue;
    if (r.t < tMin) tMin = r.t;
    if (r.t > tMax) tMax = r.t;
  }
  if (!Number.isFinite(tMin)) return null;
  const half = flags.period != null ? flags.period / 2 : Math.max((tMax - tMin) / 2000, 0.5);
  const clamp = (v) => Math.min(tMax, Math.max(tMin, v));
  // A one-reading stretch in a long run would be under a pixel wide: keep every band at least 0.8 % of the time axis.
  const minHalf = (tMax - tMin) * 0.004;
  const bands = [];
  for (const def of FLAG_BANDS) {
    for (const s of flags.bits[def.bit].stretches) {
      if (s.t1 == null) continue;
      const mid = (s.t1 + s.t2) / 2;
      const w = Math.max((s.t2 - s.t1) / 2 + half, minHalf);
      const x1 = clamp(mid - w);
      const x2 = clamp(mid + w);
      if (x2 > x1) bands.push({ key: `b${def.bit}-${s.t1}`, x1, x2, def });
    }
  }
  const steps = [];
  for (const r of rows) if (!r.gap && r.b5 && r.t != null) steps.push(r.t);
  const settleAreas = settle && steps.length
    ? mergeIntervals(steps.map((t) => [t, t + settle.windowMs])).map(([a, b]) => [a, Math.min(b, tMax)]).filter(([a, b]) => b > a)
    : [];
  return { bands, steps, settleAreas };
}

function Swatch({ color, opacity, line = false }) {
  return line ? (
    <span className="inline-block w-0.5 h-3" style={{ background: color }} />
  ) : (
    <span className="inline-block w-3 h-3 rounded-sm border" style={{ background: color, opacity: Math.min(1, opacity * 2.5), borderColor: color }} />
  );
}

/** Compact legend: only the flags that occur in the run. */
function FlagLegend({ flags, settle }) {
  const items = [];
  for (const def of FLAG_BANDS) {
    if (flags.bits[def.bit].count) items.push({ key: def.bit, swatch: <Swatch color={def.color} opacity={def.opacity} />, text: `b${def.bit} ${def.text}` });
  }
  if (flags.bits[5].count) {
    items.push({ key: 5, swatch: <Swatch color={C_STEP} line />, text: 'b5 setpoint changed (step start)' });
    if (settle) {
      const who = settle.appliesTo ? `ignored by ${settle.appliesTo.join(', ')}` : 'ignored by value rules';
      const many = settle.count > 1 ? `; largest of ${settle.count} windows` : '';
      items.push({ key: 'settle', swatch: <Swatch color={C_SETTLE} opacity={0.08} />, text: `settle ${settle.windowMs} ms (${who}${many})` });
    }
  }
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">{i.swatch}{i.text}</span>
      ))}
    </div>
  );
}

/**
 * v0.5 warning-event marks for the time chart: interval segments (very short ones widened to a visible width) and
 * detail dots placed just above the highest plotted RPM. null when the run has no warning records to draw.
 */
function warningMarks(rows, warningEvents) {
  const intervals = warningEvents?.intervals || [];
  const details = (warningEvents?.warnings || []).filter((w) => DETAIL_MARKS[w.kind] && toNum(w.t_ms) != null);
  if (!intervals.length && !details.length) return null;
  let tMin = Infinity;
  let tMax = -Infinity;
  let yTop = 0;
  for (const r of rows) {
    if (r.gap || r.t == null) continue;
    if (r.t < tMin) tMin = r.t;
    if (r.t > tMax) tMax = r.t;
    for (const v of [r.rpm, r.cmd]) if (v != null && v > yTop) yTop = v;
  }
  if (!Number.isFinite(tMin)) return null;
  const minW = (tMax - tMin) * 0.004;
  const segments = [];
  for (const iv of intervals) {
    for (const s of iv.segments) {
      let { t1, t2 } = s;
      if (t2 - t1 < minW * 2) {
        const mid = (t1 + t2) / 2;
        t1 = mid - minW;
        t2 = mid + minW;
      }
      segments.push({ key: `${iv.key}-${s.state}-${s.t1}`, state: s.state, x1: t1, x2: t2 });
    }
  }
  // Labels of dots close together in time are stacked upwards (level) so their codes stay readable.
  const near = (tMax - tMin) * 0.03;
  const dots = [];
  for (const w of details.slice().sort((a, b) => toNum(a.t_ms) - toNum(b.t_ms))) {
    const x = toNum(w.t_ms);
    const prev = dots[dots.length - 1];
    const level = prev && x - prev.x < near ? Math.min(prev.level + 1, 3) : 0;
    dots.push({ key: `d-${w.seq}`, x, y: yTop, level, mark: DETAIL_MARKS[w.kind], w });
  }
  return {
    segments,
    dots,
    maxLevel: dots.reduce((m, d) => Math.max(m, d.level), 0),
    hasActive: segments.some((s) => s.state === 'active'),
    hasUnknown: segments.some((s) => s.state === 'unknown'),
  };
}

const hatch = (color) => `repeating-linear-gradient(135deg, ${color} 0 1.5px, transparent 1.5px 4px)`;

function WarningLegend({ wm }) {
  const items = [];
  if (wm.hasActive) {
    items.push({ key: 'active', swatch: <span className="inline-block w-3 h-3 rounded-sm border" style={{ background: hatch(C_WARN), borderColor: C_WARN }} />, text: 'warning interval (VCU event log)' });
  }
  if (wm.hasUnknown) {
    items.push({ key: 'unknown', swatch: <span className="inline-block w-3 h-3 rounded-sm border border-dashed" style={{ background: hatch(C_UNKNOWN), borderColor: C_UNKNOWN }} />, text: 'warning status unknown' });
  }
  if (wm.dots.length) {
    items.push({ key: 'detail', swatch: <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: DETAIL_MARKS.DETAIL.fill }} />, text: 'detail code (raw number; ? ambiguous, n/a unavailable)' });
  }
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">{i.swatch}{i.text}</span>
      ))}
    </div>
  );
}

function RpmTimeChart({ rows, events, rules, flags, settle, warningEvents }) {
  const { lines } = useMemo(() => thresholdsFor(rules, 'rpm_actual'), [rules]);
  const fm = useMemo(() => flagMarks(rows, flags, settle), [rows, flags, settle]);
  const wm = useMemo(() => warningMarks(rows, warningEvents), [rows, warningEvents]);
  const uid = useId().replace(/:/g, '');
  const marks = (events || []).filter((e) => e.type === 'FAULT' || e.type === 'STATE');
  const extra = [fm && 'shading and teal lines: VCU status flags', wm && 'hatched outlined bands and dots: VCU warning event log'].filter(Boolean).join('; ');
  return (
    <ChartFrame
      title="Commanded vs actual RPM"
      subtitle={`Over time (ms). Dashed gold = commanded, blue = actual. Vertical lines: red FAULT, grey STATE${extra ? `; ${extra}` : ''}.`}
      legend={fm || wm ? (
        <>
          {fm && <FlagLegend flags={flags} settle={settle} />}
          {wm && <WarningLegend wm={wm} />}
        </>
      ) : null}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: wm?.dots.length ? 18 + wm.maxLevel * 10 : 8, right: 12, bottom: 4, left: 0 }}>
          {wm && (
            <defs>
              <pattern id={`warn-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke={C_WARN} strokeWidth="1.5" strokeOpacity="0.45" />
              </pattern>
              <pattern id={`unk-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke={C_UNKNOWN} strokeWidth="1.5" strokeOpacity="0.4" />
              </pattern>
            </defs>
          )}
          <CartesianGrid stroke={C_GRID} vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tick={AXIS_TICK} tickLine={false} stroke={C_GRID} unit=" ms" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<TimeTooltip />} isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          {fm?.settleAreas.map(([a, b]) => (
            <ReferenceArea key={`settle-${a}`} x1={a} x2={b} fill={C_SETTLE} fillOpacity={0.08} strokeOpacity={0} ifOverflow="hidden" />
          ))}
          {fm?.bands.map((band) => (
            <ReferenceArea key={band.key} x1={band.x1} x2={band.x2} fill={band.def.color} fillOpacity={band.def.opacity} strokeOpacity={0} ifOverflow="hidden" />
          ))}
          {wm?.segments.map((s) => (
            <ReferenceArea
              key={s.key}
              x1={s.x1}
              x2={s.x2}
              fill={`url(#${s.state === 'unknown' ? 'unk' : 'warn'}-${uid})`}
              fillOpacity={1}
              stroke={s.state === 'unknown' ? C_UNKNOWN : C_WARN}
              strokeOpacity={0.8}
              strokeDasharray={s.state === 'unknown' ? '4 3' : undefined}
              ifOverflow="hidden"
            />
          ))}
          {fm?.steps.map((t) => (
            <ReferenceLine key={`step-${t}`} x={t} stroke={C_STEP} strokeWidth={1} strokeOpacity={0.7} ifOverflow="hidden" />
          ))}
          {wm?.dots.map((d) => (
            <ReferenceDot
              key={d.key}
              x={d.x}
              y={d.y}
              r={4}
              fill={d.mark.fill}
              stroke={d.mark.stroke}
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{ value: d.mark.label(d.w), position: 'top', offset: 5 + d.level * 10, fill: C_WARN, fontSize: 9 }}
            />
          ))}
          {marks.map((e, i) => (
            <ReferenceLine
              key={`ev-${i}`}
              x={toNum(e.t_ms)}
              stroke={e.type === 'FAULT' ? C_LIMIT : C_STATE}
              strokeDasharray={e.type === 'FAULT' ? undefined : '2 3'}
              ifOverflow="extendDomain"
              label={e.type === 'FAULT' ? { value: e.code, position: 'insideTopLeft', fill: C_LIMIT, fontSize: 10 } : undefined}
            />
          ))}
          {lines.map((l) => (
            <ReferenceLine key={l.key} y={l.y} stroke={C_LIMIT} strokeDasharray="6 4" ifOverflow="extendDomain" label={limitLabel(l.label)} />
          ))}
          <Line name="Commanded" dataKey="cmd" stroke={C_CMD} strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} connectNulls={false} />
          <Line name="Actual" dataKey="rpm" stroke={C_ACTUAL} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function SignalVsRpmChart({ rows, events, rules, signalKey, field, title, unit }) {
  const data = useMemo(
    () => rows.map((r) => (r.gap ? { gap: true, rpm: r.gapAfter, y: null } : { ...r, y: r[field] })),
    [rows, field],
  );
  const { lines, checkpoints } = useMemo(() => thresholdsFor(rules, signalKey), [rules, signalKey]);
  const faults = useMemo(
    () => (events || [])
      .filter((e) => e.type === 'FAULT')
      .map((e) => ({ e, row: nearestRow(rows, toNum(e.t_ms)) }))
      .filter(({ row }) => row && row.rpm != null && row[field] != null),
    [events, rows, field],
  );
  const Tip = useMemo(() => makeXYTooltip(title, unit), [title, unit]);
  const nothingDrawn = lines.length === 0 && checkpoints.length === 0;

  return (
    <ChartFrame
      title={`${title} vs RPM`}
      subtitle={`${title} (${unit}) against actual RPM, in sample order.`}
      note={nothingDrawn ? 'No numeric limit for this signal in the criteria version used.' : 'Red dashed = limits, purple = checkpoint window, from the criteria version used.'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={C_GRID} vertical={false} />
          <XAxis dataKey="rpm" type="number" domain={['dataMin', 'dataMax']} tick={AXIS_TICK} tickLine={false} stroke={C_GRID} unit=" rpm" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} domain={['auto', 'auto']} />
          <Tooltip content={<Tip />} isAnimationActive={false} />
          {checkpoints.map((c) => {
            const half = c.window ?? 0;
            return [
              half > 0 && c.min != null && c.max != null ? (
                <ReferenceArea
                  key={`${c.id}-area`}
                  x1={c.at - half}
                  x2={c.at + half}
                  y1={c.min}
                  y2={c.max}
                  fill={C_CHECK}
                  fillOpacity={0.12}
                  stroke={C_CHECK}
                  strokeOpacity={0.6}
                  ifOverflow="extendDomain"
                />
              ) : null,
              <ReferenceLine
                key={`${c.id}-at`}
                x={c.at}
                stroke={C_CHECK}
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
                label={{ value: `${c.id} @ ${c.at} rpm`, position: 'insideTopLeft', fill: C_CHECK, fontSize: 10 }}
              />,
            ];
          })}
          {lines.map((l) => (
            <ReferenceLine key={l.key} y={l.y} stroke={C_LIMIT} strokeDasharray="6 4" ifOverflow="extendDomain" label={limitLabel(l.label)} />
          ))}
          {faults.map(({ e, row }, i) => (
            <ReferenceDot key={`f-${i}`} x={row.rpm} y={row[field]} r={5} fill={C_LIMIT} stroke="#fff" strokeWidth={2} label={{ value: e.code, position: 'top', fill: C_LIMIT, fontSize: 10 }} />
          ))}
          <Line name={title} dataKey="y" stroke={C_ACTUAL} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** warningEvents (contract v0.5 only): { warnings, intervals } from RunDetailPage; omitted for v0.3 / v0.4 runs. */
function RunCharts({ rows, events, criteria, flags, emptyText, warningEvents }) {
  const rules = criteria?.definition?.rules || [];
  const settle = useMemo(() => settleWindow(criteria?.definition?.rules), [criteria]);
  const hasBemf = useMemo(() => rows.some((r) => r.bemf != null), [rows]);
  if (!rows.length) {
    return (
      <div className="text-sm text-gray-400 p-6 text-center bg-white rounded-xl border border-navy-100">
        {emptyText || 'No readings were stored for this run, so there is nothing to plot.'}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <RpmTimeChart rows={rows} events={events} rules={rules} flags={flags} settle={settle} warningEvents={warningEvents} />
      <SignalVsRpmChart rows={rows} events={events} rules={rules} signalKey="current_a" field="current" title="Current" unit="A" />
      <SignalVsRpmChart rows={rows} events={events} rules={rules} signalKey="voltage_v" field="voltage" title="Voltage" unit="V" />
      {hasBemf && <SignalVsRpmChart rows={rows} events={events} rules={rules} signalKey="bemf_v" field="bemf" title="Back-EMF" unit="V" />}
    </div>
  );
}

export default memo(RunCharts);
