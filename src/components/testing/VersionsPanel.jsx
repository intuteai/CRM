// All versions of one variant's ramp profiles or acceptance criteria, with lifecycle actions:
// DRAFT edit / delete / submit · IN_REVIEW approve / return · PUBLISHED withdraw (reason required).
// Approve must be done by someone other than the author (server: 409 SECOND_PERSON_REQUIRED).
import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Send, Undo2, CheckCircle2, Ban, Eye } from 'lucide-react';
import { testingRequest, errorText } from './testingApi';
import { useTestingAccess } from './useTestingAccess';
import { useNotify } from '../../hooks/useNotify';
import { VersionStatusBadge, Loading, ErrorNote, EmptyState, Modal } from './TestingUi';
import { CriteriaEditor, CriteriaRulesView } from './CriteriaEditor';
import {
  FIELD, LABEL, BTN_CREATE, BTN_SECONDARY, BTN_DANGER, BTN_SUCCESS, BTN_PRIMARY, BTN_SMALL,
  formatDateTime, shortSha,
} from './testingFormat';

const PROFILE_FIELDS = [
  { key: 'max_rpm', label: 'Max RPM', unit: 'rpm' },
  { key: 'step_rpm', label: 'Step', unit: 'rpm' },
  { key: 'duration_s', label: 'Duration', unit: 's' },
  { key: 'sample_hz', label: 'Sample rate', unit: 'Hz' },
];

const idOf = (kind, v) => (kind === 'profiles' ? v.profile_id : v.criteria_version_id);

function ProfileForm({ initial, variant, saving, onSave, onCancel }) {
  const [form, setForm] = useState(() => Object.fromEntries(PROFILE_FIELDS.map(({ key }) => [key, initial?.[key] != null ? String(initial[key]) : ''])));
  const bad = PROFILE_FIELDS.filter(({ key }) => !/^\d+$/.test(form[key].trim()) || Number(form[key]) <= 0);
  const overLimit = variant?.max_rpm_limit != null && Number(form.max_rpm) > Number(variant.max_rpm_limit);

  const submit = (e) => {
    e.preventDefault();
    if (bad.length) return;
    onSave(Object.fromEntries(PROFILE_FIELDS.map(({ key }) => [key, Number(form[key])])));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-gray-500 bg-navy-50 rounded px-3 py-2">Enter the ramp exactly as approved on the signed sheet. Whole numbers only.</p>
      <div className="grid grid-cols-2 gap-3">
        {PROFILE_FIELDS.map(({ key, label, unit }) => (
          <div key={key}>
            <label className={LABEL} htmlFor={`pf-${key}`}>{label} ({unit}) *</label>
            <input
              id={`pf-${key}`}
              inputMode="numeric"
              className={FIELD}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              required
            />
          </div>
        ))}
      </div>
      {overLimit && <div className="text-xs text-amber-700">Max RPM is above this variant&apos;s max RPM limit ({variant.max_rpm_limit}). The server may refuse it.</div>}
      {bad.length > 0 && Object.values(form).some((v) => v.trim()) && (
        <div className="text-xs text-red-600">Positive whole numbers needed for: {bad.map((b) => b.label).join(', ')}.</div>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-navy-100">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        <button type="submit" className={BTN_CREATE} disabled={saving || bad.length > 0}>{saving ? 'Saving…' : 'Save draft'}</button>
      </div>
    </form>
  );
}

function versionSummary(kind, v) {
  if (kind === 'profiles') return PROFILE_FIELDS.map(({ key, unit }) => `${v[key] ?? '—'} ${unit}`).join(' · ');
  const n = v.definition?.rules?.length ?? 0;
  return `${n} rule${n === 1 ? '' : 's'}${v.source_document ? ` · ${v.source_document}` : ''}`;
}

/** Withdraw (reason required) or return-to-draft (optional note). */
function ReasonModal({ title, label, required, confirmLabel, danger, onConfirm, onClose, busy }) {
  const [text, setText] = useState('');
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button type="button" className={danger ? BTN_DANGER : BTN_PRIMARY} disabled={busy || (required && !text.trim())} onClick={() => onConfirm(text.trim())}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <label className={LABEL} htmlFor="reason-text">{label}{required ? ' *' : ''}</label>
      <textarea id="reason-text" rows={4} className={FIELD} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} autoFocus />
    </Modal>
  );
}

export default function VersionsPanel({ kind, variant, can, onChanged }) {
  const { me } = useTestingAccess();
  const { notifySuccess, notifyError } = useNotify();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { version|null (new), seed? }
  const [viewing, setViewing] = useState(null);
  const [prompt, setPrompt] = useState(null); // { action: 'withdraw'|'return', version }
  const [confirming, setConfirming] = useState(null); // { action: 'approve'|'submit'|'delete', version }
  const [busy, setBusy] = useState(false);
  const label = kind === 'profiles' ? 'profile' : 'criteria';

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await testingRequest(`/admin/variants/${variant.variant_id}/${kind}`);
      setItems(data?.items || []);
    } catch (err) {
      setError(err);
      setItems([]);
    }
  }, [variant.variant_id, kind]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const run = async (fn, successMessage) => {
    setBusy(true);
    try {
      await fn();
      notifySuccess(successMessage);
      setPrompt(null);
      setConfirming(null);
      setEditing(null);
      await load();
      onChanged?.();
    } catch (err) {
      notifyError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const save = (body) => {
    const v = editing?.version;
    return run(
      () => (v
        ? testingRequest(`/admin/${kind}/${idOf(kind, v)}`, { method: 'PATCH', body })
        : testingRequest(`/admin/variants/${variant.variant_id}/${kind}`, { method: 'POST', body })),
      v ? `Draft v${v.version} saved.` : `New ${label} draft created.`,
    );
  };

  const doAction = (action, v, body) => {
    const id = idOf(kind, v);
    if (action === 'delete') return run(() => testingRequest(`/admin/${kind}/${id}`, { method: 'DELETE' }), `Draft v${v.version} deleted.`);
    const messages = {
      submit: `v${v.version} sent for review.`,
      approve: `v${v.version} approved and published.`,
      return: `v${v.version} returned to draft.`,
      withdraw: `v${v.version} withdrawn.`,
    };
    return run(() => testingRequest(`/admin/${kind}/${id}/${action}`, { method: 'POST', ...(body ? { body } : {}) }), messages[action]);
  };

  const latest = items?.[0];
  const isAuthor = (v) => me?.user_id != null && Number(v.created_by) === Number(me.user_id);

  return (
    <div className="space-y-3">
      {can.manageConfig && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BTN_CREATE} onClick={() => setEditing({ version: null, seed: null })}>
            <Plus size={15} /> New {label} draft
          </button>
          {latest && (
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditing({ version: null, seed: latest })}>
              Start from v{latest.version}
            </button>
          )}
        </div>
      )}

      <ErrorNote error={error} onRetry={load} />
      {items === null && <Loading />}
      {items && items.length === 0 && !error && <EmptyState>No {label} versions yet.</EmptyState>}

      {items && items.length > 0 && (
        <ul className="divide-y divide-navy-100 border border-navy-100 rounded-lg bg-white">
          {items.map((v) => (
            <li key={idOf(kind, v)} className="p-3 sm:p-4 flex flex-col lg:flex-row lg:items-start gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-navy-800">v{v.version}</span>
                  <VersionStatusBadge status={v.status} />
                  <span className="font-mono text-xs text-gray-400" title={v.sha256 || 'Not frozen until published'}>
                    {v.sha256 ? shortSha(v.sha256) : 'no sha yet'}
                  </span>
                </div>
                <div className="text-sm text-gray-700 break-words">{versionSummary(kind, v)}</div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div>Author {v.created_by_name || v.created_by || '—'} · {formatDateTime(v.created_at)}{v.submitted_at ? ` · submitted ${formatDateTime(v.submitted_at)}` : ''}</div>
                  {(v.approved_by || v.published_at) && (
                    <div>Approved by {v.approved_by_name || v.approved_by || '—'} · published {formatDateTime(v.published_at)}</div>
                  )}
                  {v.retired_at && <div>Retired {formatDateTime(v.retired_at)}{v.retired_reason ? ` — ${v.retired_reason}` : ''}</div>}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 shrink-0">
                {kind === 'criteria' && (
                  <button type="button" className={`${BTN_SMALL} border-navy-100 text-navy-800 hover:bg-navy-50`} onClick={() => setViewing(v)}>
                    <Eye size={13} /> Rules
                  </button>
                )}
                {can.manageConfig && v.status === 'DRAFT' && (
                  <>
                    <button type="button" className={`${BTN_SMALL} border-navy-100 text-navy-800 hover:bg-navy-50`} onClick={() => setEditing({ version: v })}>
                      <Pencil size={13} /> Edit
                    </button>
                    <button type="button" className={`${BTN_SMALL} border-blue-200 text-blue-700 hover:bg-blue-50`} onClick={() => setConfirming({ action: 'submit', version: v })}>
                      <Send size={13} /> Submit
                    </button>
                    <button type="button" className={`${BTN_SMALL} border-red-200 text-red-600 hover:bg-red-50`} onClick={() => setConfirming({ action: 'delete', version: v })}>
                      <Trash2 size={13} /> Delete
                    </button>
                  </>
                )}
                {can.manageConfig && v.status === 'IN_REVIEW' && (
                  <>
                    <button
                      type="button"
                      disabled={isAuthor(v)}
                      title={isAuthor(v) ? 'You wrote this version; a second person must approve it.' : undefined}
                      className={`${BTN_SMALL} border-green-200 text-green-700 hover:bg-green-50`}
                      onClick={() => setConfirming({ action: 'approve', version: v })}
                    >
                      <CheckCircle2 size={13} /> Approve
                    </button>
                    <button type="button" className={`${BTN_SMALL} border-navy-100 text-navy-800 hover:bg-navy-50`} onClick={() => setPrompt({ action: 'return', version: v })}>
                      <Undo2 size={13} /> Return
                    </button>
                  </>
                )}
                {can.manageConfig && v.status === 'PUBLISHED' && (
                  <button type="button" className={`${BTN_SMALL} border-red-200 text-red-600 hover:bg-red-50`} onClick={() => setPrompt({ action: 'withdraw', version: v })}>
                    <Ban size={13} /> Withdraw
                  </button>
                )}
              </div>
              {can.manageConfig && v.status === 'IN_REVIEW' && isAuthor(v) && (
                <div className="text-[11px] text-gray-400 lg:hidden">You wrote this version — another person approves it.</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal
          title={editing.version ? `Edit ${label} draft v${editing.version.version}` : `New ${label} draft`}
          onClose={() => setEditing(null)}
          wide={kind === 'criteria'}
        >
          {kind === 'profiles' ? (
            <ProfileForm initial={editing.version || editing.seed} variant={variant} saving={busy} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <CriteriaEditor initial={editing.version || editing.seed} saving={busy} onSave={save} onCancel={() => setEditing(null)} />
          )}
        </Modal>
      )}

      {viewing && (
        <Modal title={`Criteria v${viewing.version}`} onClose={() => setViewing(null)} wide>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <VersionStatusBadge status={viewing.status} />
              {viewing.sha256 && <span className="font-mono text-xs text-gray-500 break-all">{viewing.sha256}</span>}
            </div>
            <div className="text-sm text-gray-600">Source document: {viewing.source_document || '—'}</div>
            <CriteriaRulesView definition={viewing.definition} />
          </div>
        </Modal>
      )}

      {confirming && (
        <Modal
          title={{ submit: 'Send for review', approve: 'Approve and publish', delete: 'Delete draft' }[confirming.action]}
          onClose={() => setConfirming(null)}
          footer={
            <>
              <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(null)}>Cancel</button>
              <button
                type="button"
                disabled={busy}
                className={confirming.action === 'delete' ? BTN_DANGER : confirming.action === 'approve' ? BTN_SUCCESS : BTN_PRIMARY}
                onClick={() => doAction(confirming.action, confirming.version)}
              >
                {{ submit: 'Submit', approve: 'Approve', delete: 'Delete' }[confirming.action]}
              </button>
            </>
          }
        >
          <p className="text-sm text-gray-600">
            {confirming.action === 'submit' && `Send ${label} v${confirming.version.version} for review? It can't be edited while in review.`}
            {confirming.action === 'delete' && `Delete ${label} draft v${confirming.version.version}? This can't be undone.`}
            {confirming.action === 'approve' && (
              <>
                Publish {label} v{confirming.version.version}? It becomes the version the test bench uses and can never be changed;
                the currently published version (if any) becomes SUPERSEDED. Check every value against the signed sheet first.
              </>
            )}
          </p>
        </Modal>
      )}

      {prompt && (
        <ReasonModal
          title={prompt.action === 'withdraw' ? `Withdraw ${label} v${prompt.version.version}` : `Return ${label} v${prompt.version.version} to draft`}
          label={prompt.action === 'withdraw' ? 'Reason for withdrawing' : 'Note for the author'}
          required={prompt.action === 'withdraw'}
          confirmLabel={prompt.action === 'withdraw' ? 'Withdraw' : 'Return to draft'}
          danger={prompt.action === 'withdraw'}
          busy={busy}
          onClose={() => setPrompt(null)}
          onConfirm={(text) => doAction(prompt.action, prompt.version, prompt.action === 'withdraw' ? { reason: text } : text ? { note: text } : undefined)}
        />
      )}
    </div>
  );
}
