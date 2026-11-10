// Corrections of one run. The original run never changes; a correction is PENDING until a
// testing head / admin (a different person from who added it) approves or rejects it.
import { useCallback, useEffect, useState } from 'react';
import { Plus, Check, X as XIcon } from 'lucide-react';
import { testingRequest, errorText } from './testingApi';
import { useTestingAccess } from './useTestingAccess';
import { useNotify } from '../../hooks/useNotify';
import { SectionCard, CorrectionStatusBadge, Loading, ErrorNote, EmptyState, Modal } from './TestingUi';
import { FIELD, LABEL, BTN_CREATE, BTN_SECONDARY, BTN_SUCCESS, BTN_DANGER, BTN_SMALL, formatDateTime } from './testingFormat';

const FIELD_LABELS = { motor_serial: 'Motor serial', operator_ref: 'Operator', remark: 'Remark' };

export function CorrectedFields({ fields, operatorNames = {} }) {
  const entries = Object.entries(fields || {});
  if (!entries.length) return <span className="text-gray-400">—</span>;
  return (
    <ul className="space-y-0.5">
      {entries.map(([k, v]) => (
        <li key={k} className="text-sm">
          <span className="text-gray-500">{FIELD_LABELS[k] || k}:</span>{' '}
          <span className="font-medium text-navy-800 break-words">{k === 'operator_ref' ? operatorNames[v] || v : String(v)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Approve / reject buttons with an optional note. Calls onDecided(updatedCorrection). */
export function DecideButtons({ correction, onDecided }) {
  const { me } = useTestingAccess();
  const { notifySuccess, notifyError } = useNotify();
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ownCorrection = me?.user_id != null && Number(correction.added_by) === Number(me.user_id);

  if (correction.status !== 'PENDING') return null;

  const submit = async () => {
    setBusy(true);
    try {
      const updated = await testingRequest(`/corrections/${correction.correction_id}/decide`, {
        method: 'POST',
        body: { decision, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      notifySuccess(decision === 'APPROVED' ? 'Correction approved.' : 'Correction rejected.');
      setDecision(null);
      setNote('');
      onDecided(updated);
    } catch (err) {
      notifyError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ownCorrection}
          title={ownCorrection ? 'You added this correction; someone else must decide it.' : undefined}
          onClick={() => setDecision('APPROVED')}
          className={`${BTN_SMALL} border-green-200 text-green-700 hover:bg-green-50`}
        >
          <Check size={13} /> Approve
        </button>
        <button
          type="button"
          disabled={ownCorrection}
          title={ownCorrection ? 'You added this correction; someone else must decide it.' : undefined}
          onClick={() => setDecision('REJECTED')}
          className={`${BTN_SMALL} border-red-200 text-red-600 hover:bg-red-50`}
        >
          <XIcon size={13} /> Reject
        </button>
      </div>
      {ownCorrection && <div className="text-[11px] text-gray-400 mt-1">Added by you — another person decides.</div>}
      {decision && (
        <Modal
          title={decision === 'APPROVED' ? 'Approve correction' : 'Reject correction'}
          onClose={() => setDecision(null)}
          footer={
            <>
              <button type="button" className={BTN_SECONDARY} onClick={() => setDecision(null)}>Cancel</button>
              <button type="button" disabled={busy} className={decision === 'APPROVED' ? BTN_SUCCESS : BTN_DANGER} onClick={submit}>
                {decision === 'APPROVED' ? 'Approve' : 'Reject'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <CorrectedFields fields={correction.corrected_fields} />
            <div className="text-sm text-gray-600"><span className="text-gray-500">Reason:</span> {correction.reason}</div>
            {decision === 'APPROVED' && correction.corrected_fields?.motor_serial && (
              <p className="text-xs text-gray-500 bg-navy-50 rounded px-3 py-2">
                Once approved, this run will also be found under serial <b>{correction.corrected_fields.motor_serial}</b>. The original record is kept.
              </p>
            )}
            <div>
              <label className={LABEL} htmlFor="decide-note">Note (optional)</label>
              <textarea id="decide-note" rows={3} className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function AddCorrectionModal({ testId, run, onClose, onAdded }) {
  const { notifySuccess } = useNotify();
  const [operators, setOperators] = useState(null);
  const [opsError, setOpsError] = useState(null);
  const [form, setForm] = useState({ added_by_ref: '', motor_serial: '', operator_ref: '', remark: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    testingRequest('/operators')
      .then((d) => setOperators((d?.items || []).filter((o) => o.active !== false)))
      .catch((err) => setOpsError(err));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const corrected = {
    ...(form.motor_serial.trim() ? { motor_serial: form.motor_serial.trim() } : {}),
    ...(form.operator_ref ? { operator_ref: form.operator_ref } : {}),
    ...(form.remark.trim() ? { remark: form.remark.trim() } : {}),
  };
  const valid = form.added_by_ref && form.reason.trim() && Object.keys(corrected).length > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const created = await testingRequest(`/results/${testId}/corrections`, {
        method: 'POST',
        body: { corrected_fields: corrected, reason: form.reason.trim(), operator_ref: form.added_by_ref },
      });
      notifySuccess('Correction added. It waits for approval by the testing head.');
      onAdded(created);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add correction"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button type="submit" form="add-correction" disabled={!valid || busy} className={BTN_CREATE}>
            <Plus size={15} /> Add correction
          </button>
        </>
      }
    >
      <form id="add-correction" onSubmit={submit} className="space-y-3">
        <p className="text-xs text-gray-500 bg-navy-50 rounded px-3 py-2">
          The original run is never changed. Fill only what needs correcting; the testing head approves or rejects it.
        </p>
        <div>
          <label className={LABEL} htmlFor="c-by">Who is adding this? *</label>
          {opsError ? (
            <ErrorNote error={opsError} />
          ) : (
            <select id="c-by" className={FIELD} value={form.added_by_ref} onChange={set('added_by_ref')} required disabled={!operators}>
              <option value="">{operators ? 'Select your name' : 'Loading operators…'}</option>
              {(operators || []).map((o) => <option key={o.operator_ref} value={o.operator_ref}>{o.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <label className={LABEL} htmlFor="c-serial">Correct motor serial</label>
          <input id="c-serial" className={FIELD} value={form.motor_serial} onChange={set('motor_serial')} maxLength={64} placeholder={run?.motor_serial ? `Currently ${run.motor_serial}` : ''} />
        </div>
        <div>
          <label className={LABEL} htmlFor="c-op">Correct operator</label>
          <select id="c-op" className={FIELD} value={form.operator_ref} onChange={set('operator_ref')} disabled={!operators}>
            <option value="">{run?.operator_name ? `No change (${run.operator_name})` : 'No change'}</option>
            {(operators || []).map((o) => <option key={o.operator_ref} value={o.operator_ref}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="c-remark">Remark</label>
          <textarea id="c-remark" rows={2} className={FIELD} value={form.remark} onChange={set('remark')} maxLength={1000} />
        </div>
        <div>
          <label className={LABEL} htmlFor="c-reason">Reason for the correction *</label>
          <textarea id="c-reason" rows={3} className={FIELD} value={form.reason} onChange={set('reason')} maxLength={1000} required />
        </div>
        {error && <ErrorNote error={error} />}
      </form>
    </Modal>
  );
}

export default function CorrectionsPanel({ testId, run, can }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await testingRequest(`/results/${testId}/corrections`);
      setItems(data?.items || []);
    } catch (err) {
      setError(err);
      setItems([]);
    }
  }, [testId]);

  useEffect(() => { load(); }, [load]);

  const replace = (updated) => {
    if (!updated?.correction_id) return load();
    setItems((list) => (list || []).map((c) => (c.correction_id === updated.correction_id ? updated : c)));
    return undefined;
  };

  return (
    <SectionCard
      title="Corrections"
      actions={can.addCorrection && (
        <button type="button" className={BTN_CREATE} onClick={() => setAdding(true)}>
          <Plus size={15} /> Add correction
        </button>
      )}
    >
      <div className="p-4 space-y-3">
        <ErrorNote error={error} onRetry={load} />
        {items === null && <Loading />}
        {items && items.length === 0 && !error && <EmptyState>No corrections for this run.</EmptyState>}
        {items && items.length > 0 && (
          <ul className="divide-y divide-navy-100 border border-navy-100 rounded-lg">
            {items.map((c) => (
              <li key={c.correction_id} className="p-3 flex flex-col md:flex-row md:items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CorrectionStatusBadge status={c.status} />
                    <span className="text-xs text-gray-500">
                      by {c.added_operator_name || c.added_by_name || '—'} · {formatDateTime(c.added_at)}
                    </span>
                  </div>
                  <CorrectedFields fields={c.corrected_fields} />
                  <div className="text-sm text-gray-600"><span className="text-gray-500">Reason:</span> {c.reason}</div>
                  {c.status !== 'PENDING' && (
                    <div className="text-xs text-gray-500">
                      {c.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {c.decided_by_name || '—'} · {formatDateTime(c.decided_at)}
                      {c.decision_note ? ` — “${c.decision_note}”` : ''}
                    </div>
                  )}
                </div>
                {can.decideCorrection && <div className="shrink-0"><DecideButtons correction={c} onDecided={replace} /></div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {adding && (
        <AddCorrectionModal
          testId={testId}
          run={run}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
    </SectionCard>
  );
}
