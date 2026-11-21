// One test run: facts, graphs, events, the exact criteria version used, CSV export and corrections.
// GET /api/testing/results/{test_id} pages its readings (samples_offset / samples_limit <= 5000);
// we keep fetching until samples_page.total readings are in.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { testingRequest, downloadTestingCsv, errorText } from './testingApi';
import { testingPaths } from './testingNav';
import { useNotify } from '../../hooks/useNotify';
import { OutcomeBadge, VersionStatusBadge, Loading, ErrorNote, SectionCard, Fact, Pill, CancelledBadge, RunKindBadge, UnverifiedChip } from './TestingUi';
import {
  BTN_PRIMARY, CARD, TH, TD, formatDateTime, shortSha, display,
  isV04, isV05, isCancelled, timeQualifier, clockWarnings,
  WARNING_PHASE_TEXT, WARNING_KIND_STYLES, COMMAND_LINK_STYLES, isDetailKind, warningSourceText, commandLinkText, lostText,
} from './testingFormat';
import { prepareSamples, gapStats, flagStats, warningIntervals, withGaps } from './runData';
import { FLAG_BITS } from './criteriaRules';
import RunCharts from './RunCharts';
import CorrectionsPanel from './CorrectionsPanel';
import { CriteriaRulesView } from './CriteriaEditor';

const PAGE = 5000;

function useRun(testId) {
  const [state, setState] = useState({ loading: true, error: null, run: null, samples: [], total: 0 });

  const load = useCallback(async (signal) => {
    setState({ loading: true, error: null, run: null, samples: [], total: 0 });
    try {
      const first = await testingRequest(`/results/${testId}`, { query: { samples_offset: 0, samples_limit: PAGE }, signal });
      let samples = first.samples || [];
      const total = first.samples_page?.total ?? samples.length;
      setState({ loading: samples.length < total, error: null, run: first, samples, total });
      while (samples.length < total) {
        const page = await testingRequest(`/results/${testId}`, { query: { samples_offset: samples.length, samples_limit: PAGE }, signal });
        const more = page.samples || [];
        if (!more.length) break; // server returned fewer than it announced; show what we have
        samples = samples.concat(more);
        setState((s) => ({ ...s, samples, loading: samples.length < total }));
      }
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setState((s) => ({ ...s, loading: false, error: err }));
    }
  }, [testId]);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return { ...state, reload: () => load() };
}

function DigestFact({ receipt, incomplete }) {
  if (!receipt) return <span className="text-gray-400">No receipt</span>;
  if (receipt.run_digest_match) {
    return <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 size={15} /> Digest matches</span>;
  }
  // An INCOMPLETE run with readings missing is allowed to differ: the tablet's digest covers every reading it declared.
  return incomplete ? (
    <span className="inline-flex items-center gap-1 text-amber-700 font-medium"><AlertTriangle size={15} /> Digest differs (readings missing)</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-600 font-medium"><XCircle size={15} /> Digest mismatch</span>
  );
}

/** Start / end time. v0.4: tablet clock, so a small source qualifier and an "unverified" chip when it applies. */
function TimeValue({ run, which, unverified }) {
  const qualifier = timeQualifier(run, which);
  const value = run[`${which}_at`];
  if (!isV04(run)) return formatDateTime(value);
  return (
    <span>
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {formatDateTime(value)}
        {value && <UnverifiedChip reasons={unverified} />}
      </span>
      {qualifier && <span className="block text-xs text-gray-500">{qualifier}</span>}
    </span>
  );
}

function SignedReceiptFact({ receipt, version }) {
  const signed = receipt?.signed_receipt;
  if (!signed) return <span className="text-gray-500">Receipt not signed</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <ShieldCheck size={14} className="text-green-700 shrink-0" /> Signed receipt{version != null ? ` (MTRCPT${version})` : ''} · key <span className="font-mono">{signed.key_id || '—'}</span>
    </span>
  );
}

const NOTE_AMBER = 'text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-2';
const NOTE_NAVY = 'text-sm rounded-lg border border-navy-100 bg-navy-50 text-navy-800 px-4 py-2';
const NOTE_RED = 'text-sm rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2';

// ---- contract v0.5 warning events (CRM_BACKEND/docs/motor-test/contract/v05-warning-events.md) ----
// Everything below is shown as recorded evidence; the outcome stays the ERP's own result (nothing is judged here).

/** "No · 3 lost" / "No · lost count unknown" / "Yes". */
function EventLogFact({ log }) {
  if (!log || log.complete == null) return '—';
  if (log.complete) return 'Yes';
  return (
    <span className="text-amber-700 font-semibold">
      No · {log.lost_count != null ? `${Number(log.lost_count).toLocaleString()} lost` : 'lost count unknown'}
    </span>
  );
}

function EventDigestFact({ run }) {
  const title = `VCU: ${run.event_digest || '—'}\nERP: ${run.events_stored_digest || '—'}`;
  if (run.event_digest_match === true) {
    return <span className="inline-flex items-center gap-1 text-green-700 font-medium" title={title}><CheckCircle2 size={15} /> Matches VCU</span>;
  }
  if (run.event_digest_match === false) {
    return <span className="inline-flex items-center gap-1 text-red-600 font-medium" title={title}><XCircle size={15} /> Differs</span>;
  }
  return '—';
}

function B6CoverageFact({ ok }) {
  if (ok === true) return 'Covered';
  if (ok === false) return <span className="text-amber-700 font-semibold">Not covered</span>;
  return '—';
}

const unprovenKey = (u) => (u.seq != null ? `w${u.seq}` : u.step != null ? `c${u.step}` : null);
const unprovenWhere = (u) => (u.seq != null ? `warning seq ${u.seq}` : u.step != null ? `command step ${u.step}` : 'record');

function UnprovenPill() {
  return <Pill className="bg-amber-100 text-amber-700" title="Kept as recorded; its partner may have been lost (incomplete event log).">unproven</Pill>;
}

/**
 * The v0.5 evidence notes, factual only: event digest, incomplete log, b6 coverage, unproven records, and the items the
 * testing head's decisions S1-S3 name (unknown status during capture, steps without their own reading, missing or
 * ambiguous detail codes). Returns null when there is nothing to say.
 */
function eventEvidence(run, intervals) {
  const log = run.event_log || {};
  const end = run.capture_end_ms;
  const unknown = [];
  for (const iv of intervals) {
    for (const s of iv.segments) {
      if (s.state !== 'unknown') continue;
      if (end != null && (s.t2 < 0 || s.t1 > end)) continue; // only spans that touch the capture window
      unknown.push(`${iv.limitId ? `${iv.source} · ${iv.limitId}` : iv.source} ${s.t1}–${s.t2} ms${iv.toEnd && s === iv.segments[iv.segments.length - 1] ? ' (to capture end)' : ''}`);
    }
  }
  const noReading = (run.command_changes || [])
    .filter((c) => c.link === 'SUPERSEDED' || c.link === 'NO_READING' || c.link === 'READING_NOT_RETAINED')
    .map((c) => `step ${c.step} (${commandLinkText(c)})`);
  const badDetail = (run.warnings || [])
    .filter((w) => w.kind === 'DETAIL_UNAVAILABLE' || w.kind === 'DETAIL_AMBIGUOUS')
    .map((w) => (w.kind === 'DETAIL_UNAVAILABLE'
      ? `seq ${w.seq} unavailable${w.reason ? ` (${w.reason})` : ''}`
      : `seq ${w.seq} ambiguous code ${w.code ?? '—'}${w.reason ? ` (${w.reason})` : ''}`));
  const unproven = Array.isArray(run.unproven) ? run.unproven : [];
  return {
    digestDiffers: run.event_digest_match === false,
    incomplete: log.complete === false,
    lost: log.lost_count,
    b6Uncovered: run.b6_coverage_ok === false,
    unproven,
    unknown,
    noReading,
    badDetail,
  };
}

function EventEvidenceNotes({ ev }) {
  const s = [
    ev.unknown.length > 0 && ['Warning status unknown during capture', ev.unknown],
    ev.noReading.length > 0 && ['Steps without their own reading', ev.noReading],
    ev.badDetail.length > 0 && ['Detail codes missing or ambiguous', ev.badDetail],
  ].filter(Boolean);
  return (
    <>
      {ev.digestDiffers && (
        <div className={NOTE_RED}>
          <span className="font-semibold">Event digest mismatch:</span> the ERP&apos;s stored events differ from the VCU&apos;s digest — not releasable.
        </div>
      )}
      {ev.incomplete && (
        <div className={NOTE_AMBER}>
          <span className="font-semibold">Event log incomplete:</span>{' '}
          {ev.lost != null ? `${Number(ev.lost).toLocaleString()} event${Number(ev.lost) === 1 ? '' : 's'} lost` : 'an unknown number of events lost'} on the VCU.
          Missing seq / step numbers are shown as gaps, never filled in; the records kept prove nothing about what was lost.
        </div>
      )}
      {ev.b6Uncovered && (
        <div className={NOTE_AMBER}>
          <span className="font-semibold">b6 coverage failed:</span> readings with b6 outside any warning interval.
        </div>
      )}
      {ev.unproven.length > 0 && (
        <div className={NOTE_AMBER}>
          <span className="font-semibold">Unproven records</span> (kept as recorded in an incomplete log; their partner may have been lost):
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {ev.unproven.map((u, i) => (
              <li key={i} className="break-words">
                {unprovenWhere(u)} — <span className="font-mono text-xs">{u.rule}</span>{u.note ? `: ${u.note}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {s.length > 0 && (
        <div className={NOTE_AMBER}>
          {s.map(([label, items]) => (
            <div key={label} className="break-words"><span className="font-semibold">{label}:</span> {items.join('; ')}.</div>
          ))}
        </div>
      )}
      {(ev.incomplete || ev.b6Uncovered || ev.unproven.length > 0 || s.length > 0) && (
        <div className="text-xs text-gray-500 px-1">
          Event-log evidence (contract v0.5). The testing head decided (S1–S5) that unknown warning status, a step without its own
          reading, missing / ambiguous / unknown detail codes, an incomplete event log and failed b6 coverage each make a run INVALID.
          The outcome shown above is the ERP&apos;s own result. Detail codes are raw numbers; their names come from the testing
          head&apos;s versioned code table, which is not in the ERP yet.
        </div>
      )}
    </>
  );
}

function CollapseButton({ open, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-sm text-navy-800 font-medium">
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {open ? 'Hide' : 'Show'}
    </button>
  );
}

function GapRow({ colSpan, text }) {
  return (
    <tr className="bg-amber-50">
      <td colSpan={colSpan} className="px-4 py-1.5 text-xs font-semibold text-amber-800">{text}</td>
    </tr>
  );
}

/** warnings[] in seq order; seq gaps are shown as rows when the log is incomplete. */
function WarningEventsTable({ warnings, complete, unprovenKeys }) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const entries = withGaps(warnings, 'seq');
    return complete === false ? entries : entries.filter((e) => !e.lost);
  }, [warnings, complete]);
  const n = (warnings || []).length;
  return (
    <SectionCard title={`Warning events (${n})`} actions={list.length > 0 && <CollapseButton open={open} onClick={() => setOpen((o) => !o)} />}>
      {list.length === 0 && (
        <div className="p-4 text-sm text-gray-400">{complete === false ? 'No warning records kept (the event log is incomplete, so this proves nothing).' : 'No warning events recorded.'}</div>
      )}
      {open && list.length > 0 && (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-navy-50 text-navy-800">
                <th className={TH}>Seq</th>
                <th className={TH}>Time (ms)</th>
                <th className={TH}>Kind</th>
                <th className={TH}>Source / limit</th>
                <th className={TH}>Code</th>
                <th className={TH} title="Detail records: time of the status observation that triggered the read">Status t (ms)</th>
                <th className={TH}>Reason</th>
                <th className={TH}>Restored</th>
                <th className={TH}>Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {list.map((e) => {
                if (e.lost) return <GapRow key={`gap-${e.from}`} colSpan={9} text={lostText(e.lost, 'event')} />;
                const w = e.item;
                return (
                  <tr key={`w-${w.seq}`}>
                    <td className={`${TD} font-mono text-xs text-gray-600`}>
                      <span className="inline-flex items-center gap-1.5">{w.seq}{unprovenKeys.has(`w${w.seq}`) && <UnprovenPill />}</span>
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span className="font-mono text-xs text-navy-800">{w.t_ms}</span>
                      <span className="block text-[11px] text-gray-500">{WARNING_PHASE_TEXT[w.phase] || w.phase || '—'}</span>
                    </td>
                    <td className={TD}><Pill className={WARNING_KIND_STYLES[w.kind] || 'bg-gray-100 text-gray-600'}>{w.kind}</Pill></td>
                    <td className={`${TD} font-mono text-xs text-navy-800 whitespace-nowrap`}>{warningSourceText(w)}</td>
                    <td className={`${TD} font-mono text-xs text-navy-800`}>{w.code ?? (isDetailKind(w.kind) ? '—' : '')}</td>
                    <td className={`${TD} font-mono text-xs text-gray-600`}>{w.status_t_ms ?? ''}</td>
                    <td className={`${TD} text-xs text-gray-600`}>{w.reason || ''}</td>
                    <td className={`${TD} text-xs text-gray-600`}>{w.restored_state || ''}</td>
                    <td className={`${TD} text-gray-600 break-words min-w-[8rem]`}>{w.detail || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/** command_changes[] in step order; step gaps are always shown as rows. */
function CommandChangesTable({ changes, unprovenKeys }) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => withGaps(changes, 'step'), [changes]);
  const n = (changes || []).length;
  return (
    <SectionCard title={`Command changes (${n})`} actions={list.length > 0 && <CollapseButton open={open} onClick={() => setOpen((o) => !o)} />}>
      {list.length === 0 && <div className="p-4 text-sm text-gray-400">No command changes recorded.</div>}
      {open && list.length > 0 && (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-navy-50 text-navy-800">
                <th className={TH}>Step</th>
                <th className={TH}>t (ms)</th>
                <th className={TH}>RPM cmd</th>
                <th className={TH}>Reading</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {list.map((e) => {
                if (e.lost) return <GapRow key={`gap-${e.from}`} colSpan={4} text={lostText(e.lost, 'step')} />;
                const c = e.item;
                return (
                  <tr key={`c-${c.step}`}>
                    <td className={`${TD} font-mono text-xs text-gray-600`}>
                      <span className="inline-flex items-center gap-1.5">{c.step}{unprovenKeys.has(`c${c.step}`) && <UnprovenPill />}</span>
                    </td>
                    <td className={`${TD} font-mono text-xs text-navy-800`}>{c.t_ms}</td>
                    <td className={`${TD} font-mono text-xs text-navy-800`}>{c.rpm_cmd}</td>
                    <td className={TD}>
                      <Pill className={COMMAND_LINK_STYLES[c.link] || 'bg-gray-100 text-gray-600'} title={c.link}>{commandLinkText(c)}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

const msText = (v) => `${Number.isInteger(v) ? v : Math.round(v * 10) / 10} ms`;

/**
 * "b4 CAN stale 12 readings (1.0 %, longest 300 ms) · b6 protective warning 3 readings (…) · b5 command changes 6"
 * from flagStats() (runData.js); only flags that occur.
 */
function flagSummaryText(flags) {
  const parts = [];
  for (const b of [4, 6, 7]) {
    const f = flags.bits[b];
    if (!f.count) continue;
    const pct = flags.total ? ((f.count / flags.total) * 100).toFixed(1) : '0.0';
    const longest = f.longestMs != null ? `, longest ${msText(f.longestMs)}` : '';
    parts.push(`b${b} ${FLAG_BITS[b]} ${f.count.toLocaleString()} reading${f.count === 1 ? '' : 's'} (${pct} %${longest})`);
  }
  if (flags.bits[5].count) parts.push(`b5 command changes ${flags.bits[5].count.toLocaleString()}`);
  return parts.join(' · ');
}

function OutcomeReasons({ reasons }) {
  if (!reasons?.length) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="text-sm bg-navy-50 rounded-lg px-3 py-2">
          <span className="font-semibold text-navy-800">{r.criterion || r.reason}</span>
          {r.criterion && <span className="text-gray-600"> — {r.reason}</span>}
          {(r.measured != null || r.limit != null) && (
            <span className="text-gray-600"> · measured {display(r.measured, r.unit)} / limit {display(r.limit, r.unit)}</span>
          )}
          {Array.isArray(r.rpm_window) && r.rpm_window.length > 0 && <span className="text-gray-500"> · rpm {r.rpm_window.join('–')}</span>}
          {r.detail && <div className="text-xs text-gray-500">{r.detail}</div>}
        </li>
      ))}
    </ul>
  );
}

function CriteriaTable({ criteria }) {
  return (
    <SectionCard
      title={criteria ? `Criteria v${criteria.version}` : 'Criteria'}
      actions={criteria && (
        <>
          <VersionStatusBadge status={criteria.status} />
          <span className="font-mono text-xs text-gray-500" title={criteria.sha256}>{shortSha(criteria.sha256)}</span>
        </>
      )}
    >
      {!criteria ? (
        <div className="p-4 text-sm text-gray-400">Criteria snapshot not available.</div>
      ) : (
        <div className="p-4"><CriteriaRulesView definition={criteria.definition} /></div>
      )}
    </SectionCard>
  );
}

function EventsTable({ events }) {
  const [open, setOpen] = useState(false);
  const list = events || [];
  return (
    <SectionCard
      title={`Events (${list.length})`}
      actions={list.length > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-sm text-navy-800 font-medium">
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />} {open ? 'Hide' : 'Show'}
        </button>
      )}
    >
      {list.length === 0 && <div className="p-4 text-sm text-gray-400">No events recorded.</div>}
      {open && list.length > 0 && (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-navy-50 text-navy-800">
                <th className={TH}>t (ms)</th>
                <th className={TH}>Type</th>
                <th className={TH}>Code</th>
                <th className={TH}>Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {list.map((e, i) => (
                <tr key={i}>
                  <td className={`${TD} text-gray-600 font-mono text-xs`}>{e.t_ms}</td>
                  <td className={TD}>
                    <Pill className={e.type === 'FAULT' ? 'bg-red-100 text-red-700' : e.type === 'STATE' ? 'bg-navy-50 text-navy-800' : 'bg-gray-100 text-gray-600'}>{e.type}</Pill>
                  </td>
                  <td className={`${TD} font-mono text-xs text-navy-800`}>{e.code}</td>
                  <td className={`${TD} text-gray-600 break-words`}>{e.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export default function RunDetailPage({ can }) {
  const { testId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notifyError } = useNotify();
  const { loading, error, run, samples, total, reload } = useRun(testId);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(() => prepareSamples(samples), [samples]);
  const gaps = useMemo(() => gapStats(rows), [rows]);
  const sampleHz = run?.profile?.sample_hz;
  const flags = useMemo(() => flagStats(rows, sampleHz), [rows, sampleHz]);
  // contract v0.5 only; v0.3 / v0.4 runs get none of this, so they look exactly as before.
  const v05Events = useMemo(() => {
    if (!isV05(run)) return null;
    const intervals = warningIntervals(run.warnings, run.capture_end_ms);
    const unproven = Array.isArray(run.unproven) ? run.unproven : [];
    return {
      chart: { warnings: run.warnings || [], intervals },
      evidence: eventEvidence(run, intervals),
      unprovenKeys: new Set(unproven.map(unprovenKey).filter(Boolean)),
    };
  }, [run]);
  const variantCode = location.state?.variant_code || run?.variant_code;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadTestingCsv(`/results/${testId}/export.csv`, `motor-test-${run?.motor_serial || 'run'}-${testId.slice(0, 8)}.csv`);
    } catch (err) {
      notifyError(errorText(err, 'CSV export failed.'));
    } finally {
      setExporting(false);
    }
  };

  const back = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(run?.motor_serial ? `${testingPaths.lookup}?serial=${encodeURIComponent(run.motor_serial)}` : testingPaths.lookup);
  };

  if (!run) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm text-navy-800 font-medium hover:text-navy-600">
          <ArrowLeft size={15} /> Back
        </button>
        {error ? <ErrorNote error={error} onRetry={reload} /> : <Loading label="Loading test run…" />}
      </div>
    );
  }

  const p = run.profile;
  const stored = run.receipt?.stored_sample_count ?? total;
  const flagText = flags.any ? flagSummaryText(flags) : '';
  const invalidText = [['rpm', gaps.rpm], ['current', gaps.current], ['voltage', gaps.voltage]]
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n.toLocaleString()}`)
    .join(' · ');

  // contract v0.4: held_count = readings the VCU kept (covered by run_digest); sample_count = readings the run declared.
  const v04 = isV04(run);
  const cancelled = isCancelled(run);
  const held = run.held_count;
  const storedShort = v04 && held != null && stored < held;
  const recordingIncomplete = v04 && run.recording_complete === false;
  const unverified = clockWarnings(run);
  const digestExpected = v04 ? held : run.sample_count;
  const v05 = !!v05Events;
  const ev = v05Events?.evidence;
  const evNotes = !!ev && (ev.digestDiffers || ev.incomplete || ev.b6Uncovered || ev.unproven.length > 0
    || ev.unknown.length > 0 || ev.noReading.length > 0 || ev.badDetail.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm text-navy-800 font-medium hover:text-navy-600">
          <ArrowLeft size={15} /> Back
        </button>
        {can.exportCsv && (
          <button type="button" onClick={exportCsv} disabled={exporting} className={BTN_PRIMARY}>
            <Download size={15} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      <section className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h1 className="font-display text-xl font-bold text-navy-800 font-mono break-all">{run.motor_serial}</h1>
          {cancelled ? <CancelledBadge /> : <OutcomeBadge outcome={run.outcome} />}
          <RunKindBadge run={run} />
          <span className="text-sm text-gray-500">{run.final_state}</span>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          <Fact label="Variant">
            {variantCode ? <span className="font-mono text-xs">{variantCode}</span> : <span className="font-mono text-xs" title={run.variant_id}>{run.variant_id}</span>}
          </Fact>
          <Fact label="Operator">{run.operator_name}</Fact>
          <Fact label="Started"><TimeValue run={run} which="started" unverified={unverified} /></Fact>
          <Fact label="Ended"><TimeValue run={run} which="ended" unverified={unverified} /></Fact>
          <Fact label="Final state">{run.final_state}</Fact>
          <Fact label="Stop reason">{run.stop_reason}</Fact>
          <Fact label="Fault code">{run.fault_code || '—'}</Fact>
          {v04 ? (
            <>
              <Fact label="Readings held / declared">
                <span title="held = readings the VCU kept · declared = readings the run declared">{display(held)} / {display(run.sample_count)}</span>
              </Fact>
              <Fact label="Readings stored">
                <span className={storedShort ? 'text-amber-700 font-semibold' : undefined} title="Readings stored in the ERP">{stored}</span>
              </Fact>
              <Fact label="Recording complete (VCU)">
                {run.recording_complete === true && 'Yes'}
                {run.recording_complete === false && <span className="text-amber-700 font-semibold">No</span>}
                {run.recording_complete == null && '—'}
              </Fact>
            </>
          ) : (
            <Fact label="Samples stored / expected">
              <span className={stored < run.sample_count ? 'text-amber-700 font-semibold' : undefined}>{stored} / {run.sample_count}</span>
            </Fact>
          )}
          <Fact label="VCU">{run.vcu ? `${run.vcu.vcu_id || '—'} · fw ${run.vcu.fw_version || '—'}` : '—'}</Fact>
          {v04 ? (
            <>
              <Fact label="VCU origin boot id" mono>{run.origin_boot_id ?? run.vcu?.origin_boot_id}</Fact>
              <Fact label="Contract">v{run.contract_version}</Fact>
              <Fact label="Run kind" mono>{run.run_kind}</Fact>
              <Fact label="Config hash" mono>
                {run.config_hash ? <span title={run.config_hash}>{run.config_hash.length > 16 ? `${run.config_hash.slice(0, 16)}…` : run.config_hash}</span> : '—'}
              </Fact>
            </>
          ) : (
            <Fact label="VCU boot id" mono>{run.vcu?.boot_id}</Fact>
          )}
          <Fact label="HMI version">{run.hmi_version}</Fact>
          <Fact label="Received">{formatDateTime(run.received_at)}</Fact>
          <Fact label="Profile">
            {p ? (
              <span>
                v{p.version} · {p.max_rpm} rpm max, {p.step_rpm} rpm step, {p.duration_s} s, {p.sample_hz} Hz{' '}
                <span className="font-mono text-xs text-gray-400" title={p.sha256}>{shortSha(p.sha256)}</span>
              </span>
            ) : '—'}
          </Fact>
          <Fact label="Criteria">
            {run.criteria ? (
              <span>
                v{run.criteria.version}{' '}
                <span className="font-mono text-xs text-gray-400" title={run.criteria.sha256}>{shortSha(run.criteria.sha256)}</span>
              </span>
            ) : '—'}
          </Fact>
          <Fact label="Receipt"><DigestFact receipt={run.receipt} incomplete={run.outcome === 'INCOMPLETE' && digestExpected != null && stored < digestExpected} /></Fact>
          <Fact label="Receipt id" mono>{run.receipt?.receipt_id}</Fact>
          {v04 && <Fact label="Signed receipt"><SignedReceiptFact receipt={run.receipt} version={v05 ? run.receipt_version : null} /></Fact>}
          {v05 && (
            <>
              <Fact label="Event log complete"><EventLogFact log={run.event_log} /></Fact>
              <Fact label="Warnings / command changes">
                {display(run.event_log?.warnings_count ?? run.warnings?.length)} / {display(run.event_log?.command_changes_count ?? run.command_changes?.length)}
              </Fact>
              <Fact label="Event digest"><EventDigestFact run={run} /></Fact>
              <Fact label="b6 coverage"><B6CoverageFact ok={run.b6_coverage_ok} /></Fact>
              <Fact label="Unproven records">
                <span className={ev.unproven.length ? 'text-amber-700 font-semibold' : undefined}>{ev.unproven.length}</span>
              </Fact>
              <Fact label="Capture end">{run.capture_end_ms != null ? `${run.capture_end_ms} ms` : '—'}</Fact>
            </>
          )}
        </dl>
        <OutcomeReasons reasons={run.outcome_reasons} />
      </section>

      {(loading || gaps.gaps > 0 || invalidText || flagText || error || cancelled || recordingIncomplete || storedShort || unverified.length > 0 || evNotes) && (
        <div className="space-y-2">
          {loading && <Loading label={`Loading readings… ${samples.length.toLocaleString()} / ${total.toLocaleString()}`} />}
          {error && <ErrorNote error={error} onRetry={reload} />}
          {cancelled && (
            <div className={NOTE_NAVY}>
              <span className="font-semibold">Cancelled before start — not an executed test.</span> The run was cancelled before START
              (stop reason CONFIG_CANCELLED), so no readings were taken. Its INCOMPLETE outcome is not a pass/fail result.
            </div>
          )}
          {recordingIncomplete && <div className={NOTE_AMBER}>The VCU reports this recording as incomplete.</div>}
          {storedShort && (
            <div className={NOTE_AMBER}>
              {(held - stored).toLocaleString()} of the {held.toLocaleString()} reading{held === 1 ? '' : 's'} held by the VCU {held - stored === 1 ? 'has' : 'have'} not reached the ERP yet.
            </div>
          )}
          {unverified.length > 0 && (
            <div className={NOTE_AMBER}>Start / end times are unverified: {unverified.join('; ')}.</div>
          )}
          {gaps.gaps > 0 && (
            <div className={NOTE_AMBER}>
              {gaps.missing} sample{gaps.missing === 1 ? '' : 's'} missing in {gaps.gaps} gap{gaps.gaps === 1 ? '' : 's'}. Gaps are shown as breaks in the lines, not filled in.
            </div>
          )}
          {invalidText && (
            <div className={NOTE_NAVY}>
              Readings marked invalid by the VCU: {invalidText}. They are left out of the graphs (shown as breaks); the raw values stay in the CSV export.
            </div>
          )}
          {flagText && (
            <div className={NOTE_NAVY}>
              <span className="font-semibold">Flags in this run:</span> {flagText}.{' '}
              <span className="text-gray-500">Recorded by the VCU per reading; the criteria version decides what they mean.</span>
            </div>
          )}
          {evNotes && <EventEvidenceNotes ev={ev} />}
        </div>
      )}

      <RunCharts
        rows={rows}
        events={run.events}
        criteria={run.criteria}
        flags={flags}
        warningEvents={v05Events?.chart}
        emptyText={cancelled ? 'Cancelled before start — no readings were taken, so there is nothing to plot.' : undefined}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <CriteriaTable criteria={run.criteria} />
        {v05 ? (
          <div className="space-y-4 min-w-0">
            <EventsTable events={run.events} />
            <CommandChangesTable changes={run.command_changes} unprovenKeys={v05Events.unprovenKeys} />
          </div>
        ) : (
          <EventsTable events={run.events} />
        )}
      </div>

      {v05 && <WarningEventsTable warnings={run.warnings} complete={run.event_log?.complete} unprovenKeys={v05Events.unprovenKeys} />}

      <CorrectionsPanel testId={testId} run={run} can={can} />

      <p className="text-xs text-gray-400">
        Test id <span className="font-mono">{run.test_id}</span>
        {run.motor_serial && (
          <>
            {' · '}
            <Link className="underline" to={`${testingPaths.lookup}?serial=${encodeURIComponent(run.motor_serial)}`}>All runs of this serial</Link>
          </>
        )}
      </p>
    </div>
  );
}
