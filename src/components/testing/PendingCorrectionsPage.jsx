// Corrections waiting for a decision (testing_head / testing_admin).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { testingRequest } from './testingApi';
import { testingPaths } from './testingNav';
import { Loading, ErrorNote, EmptyState, CorrectionStatusBadge } from './TestingUi';
import { CorrectedFields, DecideButtons } from './CorrectionsPanel';
import { BTN_PRIMARY, CARD, formatDateTime, shortId } from './testingFormat';

export default function PendingCorrectionsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await testingRequest('/admin/corrections', { query: { status: 'PENDING' } });
      setItems(data?.items || []);
    } catch (err) {
      setError(err);
      setItems((p) => p || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A decided correction leaves this list.
  const onDecided = (updated) => {
    setItems((list) => (list || []).filter((c) => c.correction_id !== updated?.correction_id));
    if (!updated?.correction_id) load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-gray-500 flex-1">
          Corrections never change the original run. Approve only what the evidence supports; the person who added a correction cannot decide it.
        </p>
        <button type="button" className={BTN_PRIMARY} onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
      <ErrorNote error={error} onRetry={load} />
      <div className={`${CARD} overflow-hidden`}>
        {items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState>No corrections are waiting for a decision.</EmptyState>
        ) : (
          <ul className="divide-y divide-navy-100">
            {items.map((c) => (
              <li key={c.correction_id} className="p-4 flex flex-col md:flex-row md:items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CorrectionStatusBadge status={c.status} />
                    <Link to={testingPaths.run(c.test_id)} className="inline-flex items-center gap-1 text-xs font-mono text-navy-800 underline">
                      run {shortId(c.test_id)} <ExternalLink size={12} />
                    </Link>
                    <span className="text-xs text-gray-500">
                      by {c.added_operator_name || c.added_by_name || '—'} · {formatDateTime(c.added_at)}
                    </span>
                  </div>
                  <CorrectedFields fields={c.corrected_fields} />
                  <div className="text-sm text-gray-600"><span className="text-gray-500">Reason:</span> {c.reason}</div>
                </div>
                <div className="shrink-0"><DecideButtons correction={c} onDecided={onDecided} /></div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
