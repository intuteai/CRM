// Serial lookup: every stored test run of one exact motor serial (GET /api/testing/results?serial=).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Eye, ChevronRight } from 'lucide-react';
import { testingRequest } from './testingApi';
import { testingPaths } from './testingNav';
import { OutcomeBadge, Loading, ErrorNote, EmptyState } from './TestingUi';
import { BTN_PRIMARY, CARD, TH, TD, formatDateTime } from './testingFormat';

function samplesText(run) {
  const stored = run.stored_sample_count ?? '—';
  const expected = run.sample_count ?? '—';
  return `${stored} / ${expected}`;
}

function samplesShort(run) {
  return run.stored_sample_count != null && run.sample_count != null && run.stored_sample_count < run.sample_count;
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
                        <td className={`${TD} text-navy-800 font-medium whitespace-nowrap`}>{formatDateTime(run.started_at || run.received_at)}</td>
                        <td className={`${TD} text-gray-600`}>{run.operator_name || '—'}</td>
                        <td className={`${TD} text-gray-600 font-mono text-xs`}>{run.variant_code || '—'}</td>
                        <td className={`${TD} text-gray-600`}>{run.final_state || '—'}</td>
                        <td className={TD}><OutcomeBadge outcome={run.outcome} /></td>
                        <td className={`${TD} text-gray-600 whitespace-nowrap`}>
                          v{run.criteria_version ?? '—'}
                          <span className="text-gray-400 text-xs"> · profile v{run.profile_version ?? '—'}</span>
                        </td>
                        <td className={`${TD} whitespace-nowrap ${samplesShort(run) ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}>{samplesText(run)}</td>
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
                          <OutcomeBadge outcome={run.outcome} />
                          <span className="text-xs text-gray-500">{run.final_state}</span>
                        </div>
                        <div className="text-sm font-medium text-navy-800">{formatDateTime(run.started_at || run.received_at)}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {run.operator_name || '—'} · {run.variant_code || '—'} · criteria v{run.criteria_version ?? '—'}
                        </div>
                        <div className={`text-xs ${samplesShort(run) ? 'text-amber-700 font-semibold' : 'text-gray-500'}`}>Samples {samplesText(run)}</div>
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
