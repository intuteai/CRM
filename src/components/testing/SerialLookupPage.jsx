// Serial lookup: every stored test run of one exact motor serial (GET /api/testing/results?serial=).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Eye, ChevronRight } from 'lucide-react';
import { testingRequest } from './testingApi';
import { testingPaths } from './testingNav';
import { OutcomeBadge, Loading, ErrorNote, EmptyState, CancelledBadge, RunKindBadge, UnverifiedChip, Pill } from './TestingUi';
import { BTN_PRIMARY, CARD, TH, TD, formatDateTime, isV04, isV05, isCancelled, clockWarnings } from './testingFormat';

const dash = (v) => v ?? '—';

// v0.3: "stored / expected" as before. v0.4: "held / declared held · stored stored", where held_count = readings
// the VCU kept and sample_count = readings the run declared; a cancel has no readings at all.
function samplesParts(run) {
  if (!isV04(run)) return [`${dash(run.stored_sample_count)} / ${dash(run.sample_count)}`];
  if (isCancelled(run)) return ['No readings', '(cancelled)'];
  return [`${dash(run.held_count)} / ${dash(run.sample_count)} held`, `${dash(run.stored_sample_count)} stored`];
}

const samplesText = (run) => samplesParts(run).join(isCancelled(run) ? ' ' : ' · ');

/** v0.4 only: the VCU's own recording_complete = false, shown on its own line under the counts. */
function VcuIncomplete({ run }) {
  if (!isV04(run) || run.recording_complete !== false) return null;
  return <span className="block text-[11px] font-semibold">VCU: recording incomplete</span>;
}

const SAMPLES_TITLE_V04 = 'held = readings the VCU kept · declared = readings the run declared · stored = readings in the ERP';

function samplesShort(run) {
  if (isV04(run)) {
    if (run.recording_complete === false) return true;
    return run.stored_sample_count != null && run.held_count != null && run.stored_sample_count < run.held_count;
  }
  return run.stored_sample_count != null && run.sample_count != null && run.stored_sample_count < run.sample_count;
}

/** Date of a run. v0.4 start times come from the tablet clock: marked approximate, or "received" when unknown. */
function RunDate({ run }) {
  const text = formatDateTime(run.started_at || run.received_at);
  if (!isV04(run)) return text;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {text}
      <span className="text-[11px] font-normal text-gray-400" title={run.started_at ? 'Start time from the tablet clock (approximate)' : 'No start time; this is when the ERP received the run'}>
        {run.started_at ? 'approx.' : 'received'}
      </span>
      {run.started_at && <UnverifiedChip reasons={clockWarnings(run)} />}
    </span>
  );
}

/** v0.5 only: the VCU's event log was not complete (lost warning / command records). */
function EventsIncompleteBadge({ run }) {
  if (!isV05(run) || run.event_log_complete !== false) return null;
  const unproven = run.unproven_count ? ` · ${run.unproven_count} unproven record${run.unproven_count === 1 ? '' : 's'}` : '';
  return (
    <Pill className="bg-amber-100 text-amber-700" title={`The VCU's warning / command event log is incomplete${unproven}.`}>
      events incomplete
    </Pill>
  );
}

function RunBadges({ run, full = false }) {
  return (
    <>
      {isCancelled(run) ? <CancelledBadge compact={!full} /> : <OutcomeBadge outcome={run.outcome} />}
      <RunKindBadge run={run} />
      <EventsIncompleteBadge run={run} />
    </>
  );
}

export default function SerialLookupPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const serialParam = searchParams.get('serial') || '';
  const [input, setInput] = useState(serialParam);
  const [state, setState] = useState({ loading: false, error: null, data: null });
  const navigate = useNavigate();

  const lookup = useCallback(async (serial, signal) => {
    setState({ loading: true, error: null, data: null });
    try {
      const data = await testingRequest('/results', { query: { serial }, signal });
      setState({ loading: false, error: null, data });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setState({ loading: false, error: err, data: null });
    }
  }, []);

  useEffect(() => {
    setInput(serialParam);
    if (!serialParam) {
      setState({ loading: false, error: null, data: null });
      return undefined;
    }
    const ctrl = new AbortController();
    lookup(serialParam, ctrl.signal);
    return () => ctrl.abort();
  }, [serialParam, lookup]);

  const submit = (e) => {
    e.preventDefault();
    const serial = input.trim();
    if (!serial) return;
    if (serial === serialParam) lookup(serial);
    else setSearchParams({ serial });
  };

  const runs = state.data?.runs || [];
  const openRun = (run) => navigate(testingPaths.run(run.test_id), { state: { variant_code: run.variant_code } });

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={64}
            placeholder="Exact motor serial, e.g. CA-2026-000123"
            className="w-full p-3 pl-10 border border-navy-100 rounded-lg bg-white shadow-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
            aria-label="Motor serial"
            autoFocus
          />
        </div>
        <button type="submit" className={`${BTN_PRIMARY} py-3`} disabled={!input.trim() || state.loading}>
          <Search size={15} /> Look up
        </button>
      </form>

      <ErrorNote error={state.error} onRetry={serialParam ? () => lookup(serialParam) : undefined} />
      {state.loading && <Loading label="Looking up runs…" />}

      {!state.loading && !state.error && !state.data && (
        <div className={CARD}>
          <EmptyState>Enter the exact serial printed on the motor to see every test run, newest first.</EmptyState>
        </div>
      )}

      {state.data && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-navy-100 text-sm text-gray-500">
            <span className="font-semibold text-navy-800">{runs.length}</span> run{runs.length === 1 ? '' : 's'} for serial{' '}
            <span className="font-mono font-semibold text-navy-800">{state.data.motor_serial}</span>
          </div>

          {runs.length === 0 ? (
            <EmptyState>No test runs stored for this serial. Check the serial — the match is exact.</EmptyState>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-navy-50 text-navy-800">
                      <th className={TH}>Date</th>
                      <th className={TH}>Operator</th>
                      <th className={TH}>Variant</th>
                      <th className={TH}>Final state</th>
                      <th className={TH}>Outcome</th>
                      <th className={TH}>Criteria</th>
                      <th className={TH}>Samples</th>
                      <th className={TH} aria-label="Open" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {runs.map((run) => (
                      <tr key={run.test_id} onClick={() => openRun(run)} className="hover:bg-navy-50/60 transition-colors cursor-pointer">
                        <td className={`${TD} text-navy-800 font-medium whitespace-nowrap`}><RunDate run={run} /></td>
                        <td className={`${TD} text-gray-600`}>{run.operator_name || '—'}</td>
                        <td className={`${TD} text-gray-600 font-mono text-xs`}>{run.variant_code || '—'}</td>
                        <td className={`${TD} text-gray-600`}>{run.final_state || '—'}</td>
                        <td className={TD}>
                          <div className="flex flex-wrap items-center gap-1.5"><RunBadges run={run} /></div>
                          {isCancelled(run) && <div className="text-[11px] font-medium text-navy-800 mt-0.5">Before start — not an executed test</div>}
                        </td>
                        <td className={`${TD} text-gray-600 whitespace-nowrap`}>
                          v{run.criteria_version ?? '—'}
                          <span className="text-gray-400 text-xs"> · profile v{run.profile_version ?? '—'}</span>
                        </td>
                        <td
                          className={`${TD} whitespace-nowrap ${samplesShort(run) ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}
                          title={isV04(run) ? SAMPLES_TITLE_V04 : undefined}
                        >
                          {isV04(run) ? samplesParts(run).map((part) => <span key={part} className="block">{part}</span>) : samplesText(run)}
                          <VcuIncomplete run={run} />
                        </td>
                        <td className={TD}>
                          <Link
                            to={testingPaths.run(run.test_id)}
                            state={{ variant_code: run.variant_code }}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-navy-800 hover:text-navy-600 font-medium text-sm"
                          >
                            <Eye size={15} /> View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="md:hidden divide-y divide-navy-100">
                {runs.map((run) => (
                  <li key={run.test_id}>
                    <button type="button" onClick={() => openRun(run)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-navy-50/60">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <RunBadges run={run} full />
                          <span className="text-xs text-gray-500">{run.final_state}</span>
                        </div>
                        <div className="text-sm font-medium text-navy-800"><RunDate run={run} /></div>
                        <div className="text-xs text-gray-500 truncate">
                          {run.operator_name || '—'} · {run.variant_code || '—'} · criteria v{run.criteria_version ?? '—'}
                        </div>
                        <div className={`text-xs ${samplesShort(run) ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>
                          {isCancelled(run) ? '' : isV04(run) ? 'Readings ' : 'Samples '}{samplesText(run)}
                          <VcuIncomplete run={run} />
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
