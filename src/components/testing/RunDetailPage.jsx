// One test run: facts, graphs, events, the exact criteria version used, CSV export and corrections.
// GET /api/testing/results/{test_id} pages its readings (samples_offset / samples_limit <= 5000);
// we keep fetching until samples_page.total readings are in.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { testingRequest, downloadTestingCsv, errorText } from './testingApi';
import { testingPaths } from './testingNav';
import { useNotify } from '../../hooks/useNotify';
import { OutcomeBadge, VersionStatusBadge, Loading, ErrorNote, SectionCard, Fact, Pill } from './TestingUi';
import { BTN_PRIMARY, CARD, TH, TD, formatDateTime, shortSha, display } from './testingFormat';
import { prepareSamples, gapStats } from './runData';
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

function DigestFact({ receipt }) {
  if (!receipt) return <span className="text-gray-400">No receipt</span>;
  return receipt.run_digest_match ? (
    <span className="inline-flex items-center gap-1 text-green-700 font-medium"><CheckCircle2 size={15} /> Digest matches</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-600 font-medium"><XCircle size={15} /> Digest mismatch</span>
  );
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
  const variantCode = location.state?.variant_code;

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
          <OutcomeBadge outcome={run.outcome} />
          <span className="text-sm text-gray-500">{run.final_state}</span>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          <Fact label="Variant">
            {variantCode ? <span className="font-mono text-xs">{variantCode}</span> : <span className="font-mono text-xs" title={run.variant_id}>{run.variant_id}</span>}
          </Fact>
          <Fact label="Operator">{run.operator_name}</Fact>
          <Fact label="Started">{formatDateTime(run.started_at)}</Fact>
          <Fact label="Ended">{formatDateTime(run.ended_at)}</Fact>
          <Fact label="Final state">{run.final_state}</Fact>
          <Fact label="Stop reason">{run.stop_reason}</Fact>
          <Fact label="Fault code">{run.fault_code || '—'}</Fact>
          <Fact label="Samples stored / expected">
            <span className={stored < run.sample_count ? 'text-amber-700 font-semibold' : undefined}>{stored} / {run.sample_count}</span>
          </Fact>
          <Fact label="VCU">{run.vcu ? `${run.vcu.vcu_id || '—'} · fw ${run.vcu.fw_version || '—'}` : '—'}</Fact>
          <Fact label="VCU boot id" mono>{run.vcu?.boot_id}</Fact>
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
          <Fact label="Receipt"><DigestFact receipt={run.receipt} /></Fact>
          <Fact label="Receipt id" mono>{run.receipt?.receipt_id}</Fact>
        </dl>
        <OutcomeReasons reasons={run.outcome_reasons} />
      </section>

      {(loading || gaps.gaps > 0 || error) && (
        <div className="space-y-2">
          {loading && <Loading label={`Loading readings… ${samples.length.toLocaleString()} / ${total.toLocaleString()}`} />}
          {error && <ErrorNote error={error} onRetry={reload} />}
          {gaps.gaps > 0 && (
            <div className="text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-2">
              {gaps.missing} sample{gaps.missing === 1 ? '' : 's'} missing in {gaps.gaps} gap{gaps.gaps === 1 ? '' : 's'}. Gaps are shown as breaks in the lines, not filled in.
            </div>
          )}
        </div>
      )}

      <RunCharts rows={rows} events={run.events} criteria={run.criteria} />

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
