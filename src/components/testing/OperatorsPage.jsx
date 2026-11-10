// Operator pick-list shown on the test bench HMI (testing_head / testing_admin).
// Operators are deactivated, never deleted: old runs keep the name they were recorded with.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { testingRequest, errorText } from './testingApi';
import { useNotify } from '../../hooks/useNotify';
import { Loading, ErrorNote, EmptyState, Modal, Pill } from './TestingUi';
import { FIELD, LABEL, BTN_CREATE, BTN_PRIMARY, BTN_SECONDARY, CARD, TH, TD, formatDate } from './testingFormat';

function OperatorForm({ operator, onClose, onSaved }) {
  const { notifySuccess } = useNotify();
  const [name, setName] = useState(operator?.name || '');
  const [userId, setUserId] = useState(operator?.user_id != null ? String(operator.user_id) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const badUser = userId.trim() !== '' && !/^\d+$/.test(userId.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || badUser) return;
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), user_id: userId.trim() ? Number(userId) : null };
    if (!operator && body.user_id === null) delete body.user_id;
    try {
      const saved = operator
        ? await testingRequest(`/admin/operators/${operator.operator_ref}`, { method: 'PATCH', body })
        : await testingRequest('/admin/operators', { method: 'POST', body });
      notifySuccess(operator ? 'Operator saved.' : 'Operator added.');
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={operator ? 'Edit operator' : 'Add operator'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button type="submit" form="operator-form" disabled={busy || !name.trim() || badUser} className={operator ? BTN_PRIMARY : BTN_CREATE}>
            {operator ? 'Save' : (<><Plus size={15} /> Add</>)}
          </button>
        </>
      }
    >
      <form id="operator-form" onSubmit={submit} className="space-y-3">
        <div>
          <label className={LABEL} htmlFor="op-name">Name *</label>
          <input id="op-name" className={FIELD} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required autoFocus />
          {operator && <p className="text-[11px] text-gray-400 mt-1">Runs already recorded keep the name they were stored with.</p>}
        </div>
        <div>
          <label className={LABEL} htmlFor="op-user">ERP user id (optional)</label>
          <input id="op-user" inputMode="numeric" className={FIELD} value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Link to an ERP login, if the person has one" />
          {badUser && <p className="text-xs text-red-600 mt-1">User id must be a whole number.</p>}
        </div>
        {error && <ErrorNote error={error} />}
      </form>
    </Modal>
  );
}

export default function OperatorsPage() {
  const { notifySuccess, notifyError } = useNotify();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [formFor, setFormFor] = useState(undefined);
  const [showInactive, setShowInactive] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await testingRequest('/admin/operators', { query: { include_inactive: 1 } });
      setItems(data?.items || []);
    } catch (err) {
      setError(err);
      setItems((p) => p || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (o) => {
    try {
      await testingRequest(`/admin/operators/${o.operator_ref}`, { method: 'PATCH', body: { active: !o.active } });
      notifySuccess(o.active ? `${o.name} deactivated.` : `${o.name} reactivated.`);
      load();
    } catch (err) {
      notifyError(errorText(err));
    }
  };

  const shown = (items || []).filter((o) => showInactive || o.active);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-gray-500 flex-1">Names the operator picks on the test bench before each run.</p>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        <button type="button" className={BTN_CREATE} onClick={() => setFormFor(null)}>
          <Plus size={15} /> Add operator
        </button>
      </div>
      <ErrorNote error={error} onRetry={load} />
      <div className={`${CARD} overflow-hidden`}>
        {items === null ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState>No operators yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[520px]">
              <thead>
                <tr className="bg-navy-50 text-navy-800">
                  <th className={TH}>Name</th>
                  <th className={TH}>ERP user</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Added</th>
                  <th className={TH} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {shown.map((o) => (
                  <tr key={o.operator_ref} className="hover:bg-navy-50/60 transition-colors">
                    <td className={`${TD} font-medium text-navy-800`}>{o.name}</td>
                    <td className={`${TD} text-gray-600`}>{o.user_id ?? '—'}</td>
                    <td className={TD}>
                      <Pill className={o.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>{o.active ? 'Active' : 'Inactive'}</Pill>
                      {!o.active && o.deactivated_at && <span className="block text-[11px] text-gray-400 mt-0.5">since {formatDate(o.deactivated_at)}</span>}
                    </td>
                    <td className={`${TD} text-gray-600 whitespace-nowrap`}>{formatDate(o.created_at)}</td>
                    <td className={TD}>
                      <div className="flex items-center gap-3 justify-end">
                        <button type="button" onClick={() => setFormFor(o)} className="flex items-center gap-1 text-sm text-navy-800 font-medium hover:text-navy-600">
                          <Pencil size={14} /> Edit
                        </button>
                        <button type="button" onClick={() => toggle(o)} className={`text-sm font-medium ${o.active ? 'text-red-600 hover:text-red-700' : 'text-green-700 hover:text-green-800'}`}>
                          {o.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {formFor !== undefined && (
        <OperatorForm operator={formFor} onClose={() => setFormFor(undefined)} onSaved={() => { setFormFor(undefined); load(); }} />
      )}
    </div>
  );
}
