// Graphs of one test run (recharts 2.15, SVG). Rules:
//  - gaps stay gaps: a missing sample_seq or an invalid (null) value breaks the line, never interpolated;
//  - thresholds come only from the criteria version the run was judged by (criteria.definition.rules);
//    a rule whose numbers are null draws nothing;
//  - FAULT / STATE events are marked on the time chart (FAULT also on the RPM-axis charts).
import { memo, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ReferenceArea, ReferenceDot,
} from 'recharts';
import { toNum } from './testingFormat';

const C_ACTUAL = '#3b6fb6';
const C_CMD = '#c98a1a';
const C_LIMIT = '#dc2626';
const C_CHECK = '#7c3aed';
const C_STATE = '#94a3b8';
const C_GRID = '#e5e7eb';
const AXIS_TICK = { fontSize: 11, fill: '#6b7280' };

/** Threshold lines/markers for one signal from the criteria rules. Only numbers present in the rule are drawn. */
function thresholdsFor(rules, signal) {
  const lines = [];
  const checkpoints = [];
  for (const r of rules || []) {
    if (!r || r.signal !== signal) continue;
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

function ChartFrame({ title, subtitle, note, children }) {
  return (
    <figure className="bg-white rounded-xl border border-navy-100 p-3 sm:p-4 min-w-0">
      <figcaption className="mb-2">
        <div className="text-sm font-semibold text-navy-800">{title}</div>
        {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
      </figcaption>
      <div className="h-64 sm:h-72">{children}</div>
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

function RpmTimeChart({ rows, events, rules }) {
  const { lines } = useMemo(() => thresholdsFor(rules, 'rpm_actual'), [rules]);
  const marks = (events || []).filter((e) => e.type === 'FAULT' || e.type === 'STATE');
  return (
    <ChartFrame
      title="Commanded vs actual RPM"
      subtitle="Over time (ms). Dashed gold = commanded, blue = actual. Vertical lines: red FAULT, grey STATE."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={C_GRID} vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tick={AXIS_TICK} tickLine={false} stroke={C_GRID} unit=" ms" />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<TimeTooltip />} isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
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

function RunCharts({ rows, events, criteria, emptyText }) {
  const rules = criteria?.definition?.rules || [];
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
      <RpmTimeChart rows={rows} events={events} rules={rules} />
      <SignalVsRpmChart rows={rows} events={events} rules={rules} signalKey="current_a" field="current" title="Current" unit="A" />
      <SignalVsRpmChart rows={rows} events={events} rules={rules} signalKey="voltage_v" field="voltage" title="Voltage" unit="V" />
      {hasBemf && <SignalVsRpmChart rows={rows} events={events} rules={rules} signalKey="bemf_v" field="bemf" title="Back-EMF" unit="V" />}
    </div>
  );
}

export default memo(RunCharts);
