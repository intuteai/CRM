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
  isV04, isCancelled, timeQualifier, clockWarnings,
} from './testingFormat';
import { prepareSamples, gapStats, flagStats } from './runData';
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

function SignedReceiptFact({ receipt }) {
  const signed = receipt?.signed_receipt;
  if (!signed) return <span className="text-gray-500">Receipt not signed</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <ShieldCheck size={14} className="text-green-700 shrink-0" /> Signed receipt · key <span className="font-mono">{signed.key_id || '—'}</span>
    </span>
  );
}

const NOTE_AMBER = 'text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-2';
const NOTE_NAVY = 'text-sm rounded-lg border border-navy-100 bg-navy-50 text-navy-800 px-4 py-2';

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
          {v04 && <Fact label="Signed receipt"><SignedReceiptFact receipt={run.receipt} /></Fact>}
        </dl>
        <OutcomeReasons reasons={run.outcome_reasons} />
      </section>

      {(loading || gaps.gaps > 0 || invalidText || flagText || error || cancelled || recordingIncomplete || storedShort || unverified.length > 0) && (
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
        </div>
      )}

      <RunCharts
        rows={rows}
        events={run.events}
        criteria={run.criteria}
        flags={flags}
        emptyText={cancelled ? 'Cancelled before start — no readings were taken, so there is nothing to plot.' : undefined}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <CriteriaTable criteria={run.criteria} />
        <EventsTable events={run.events} />
      </div>

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
