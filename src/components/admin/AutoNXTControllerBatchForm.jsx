import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Layers, Eye, Download, RefreshCw, Pencil, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { useNotify } from '../../hooks/useNotify';
import { logout, toggleLogin } from '../../features/auth/authSlice.js';
import { disconnectSocket } from '../../services/socket.js';
import { pdiBatchPath, pdiFormPath } from '../../utils/pdiRoutes';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

const TEMPLATE_ID = 'autonxt_controller';
const SERIAL_KEY = 'controller_sr_no';

const INPUT_CLS =
  'w-full border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const SELECT_CLS =
  'border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';

const SHARED_FIELDS = [
  { key: 'customer_name', label: 'Customer name', placeholder: 'e.g. Autonxt' },
  { key: 'product_id', label: 'Product ID', placeholder: 'e.g. CASHV-38140' },
  { key: 'product_specifications', label: 'Product specifications', placeholder: 'e.g. 384V 140A CONTROLLER' },
  { key: 'drawing_no', label: 'Drawing number', placeholder: 'e.g. CASPL-XXXX' },
];

// Keys MUST match CRM_BACKEND/models/operations/pdi/templates/autonxt_controller.js's
// CONTROLLER_TYPE_PRESETS keys (and AutoNXTControllerGeneratorForm.jsx's own copy) —
// same duplicated-not-shared convention as every other PDI template constant in this
// codebase. Only the key names are needed here (not the full 35-row preset data),
// since this form just offers the choice; the single-report form does the actual
// per-row seeding once a report is opened.
const CONTROLLER_TYPES = ['CASHV38140'];

const LOT_FIELDS = [
  { key: 'pdi_no', label: 'PDI No.', placeholder: '' },
  ...SHARED_FIELDS,
  { key: 'controller_type', label: 'Controller type', options: CONTROLLER_TYPES },
];

// Mirrors PdiReportsTable.jsx's STATUS_STYLES pill colors (copied, not imported),
// plus the lot-only Finalizing state.
const STATUS_STYLES = {
  Completed: 'bg-green-100 text-green-700',
  'In Progress': 'bg-yellow-100 text-yellow-700',
  Finalizing: 'bg-blue-100 text-blue-700',
  Failed: 'bg-red-100 text-red-700',
  Pending: 'bg-gray-100 text-gray-600',
};
const DEFAULT_STATUS_STYLE = 'bg-gray-100 text-gray-600';

// Mirrors services/apiStatus.js's SESSION_CODES.
const SESSION_CODES = new Set(['AUTH_INVALID_TOKEN', 'AUTH_INVALID_USER', 'AUTH_NO_TOKEN']);
const SESSION_MESSAGE = 'Your session has expired. Please sign in again.';

const emptyForm = () => ({
  pdi_no: '', quantity: '',
  customer_name: '', product_id: '', product_specifications: '', drawing_no: '',
  controller_type: CONTROLLER_TYPES[0],
});

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const pdfFileName = (batch) =>
  `PDI_BATCH_${String(batch.pdi_no || batch.batch_id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

// Blob requests (finalize/download) get their error body back as a Blob, and a
// proxy timeout can answer with HTML, so never assume the body is JSON.
async function readErrorBody(err) {
  const data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return data && typeof data === 'object' ? data : {};
}

const errorText = (body, fallback) => (typeof body?.error === 'string' && body.error ? body.error : fallback);

function isSessionError(status, code) {
  return status === 401 || SESSION_CODES.has(code);
}

function describeLoadError(err, body) {
  const status = err?.response?.status;
  if (isSessionError(status, body.code)) return { kind: 'session', message: SESSION_MESSAGE };
  if (status === 404) return { kind: 'notfound', message: 'Lot not found. It may have been deleted, or the link is wrong.' };
  if (status === 403) return { kind: 'forbidden', message: errorText(body, "You don't have access to PDI reports.") };
  if (!err?.response) return { kind: 'other', message: 'Could not reach the server. Check your connection and try again.' };
  return { kind: 'other', message: errorText(body, 'Could not load this lot.') };
}

function saveBlob(data, filename) {
  const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight after click() cancels the download in some browsers.
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

function StatusBadge({ status }) {
  if (status === 'Finalizing') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_STYLES.Finalizing}`}>
        <Loader2 size={12} className="animate-spin" /> Finalizing
      </span>
    );
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_STYLES[status] || DEFAULT_STATUS_STYLE}`}>
      {status || 'Unknown'}
    </span>
  );
}

function RecentLots() {
  const [lots, setLots] = useState(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('token');
    if (!token) { setHidden(true); return undefined; }
    axios.get(`${API_URL}/api/pdi/report-batches`, {
      headers: authHeaders(token),
      params: { template_id: TEMPLATE_ID, limit: 20 },
    }).then((response) => {
      if (!cancelled) setLots(Array.isArray(response.data) ? response.data : []);
    }).catch((err) => {
      if (cancelled) return;
      if (err?.response?.status === 404) { setHidden(true); return; }
      setError(errorText(err?.response?.data, 'Could not load recent lots.'));
    });
    return () => { cancelled = true; };
  }, []);

  if (hidden) return null;
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 sm:p-6">
      <h3 className="text-base font-bold text-navy-800 mb-3">Recent lots</h3>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : lots === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : lots.length === 0 ? (
        <p className="text-sm text-gray-400">No lots yet</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {lots.map((lot) => (
            <li key={lot.batch_id}>
              <Link
                to={pdiBatchPath(lot.template_id || TEMPLATE_ID, lot.batch_id) || pdiBatchPath(TEMPLATE_ID, lot.batch_id)}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-navy-50 rounded-lg px-2 -mx-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-navy-800 break-all">{lot.pdi_no || `Lot #${lot.batch_id}`}</div>
                  <div className="text-xs text-gray-500">
                    {lot.lot_quantity} controller(s) · {Number(lot.completed_count) || 0}/{lot.lot_quantity} completed
                    {lot.created_at ? ` · ${new Date(lot.created_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <StatusBadge status={lot.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AutoNXTControllerBatchForm() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const { notifySuccess, notifyError, notifyWarning, notifyInfo } = useNotify();
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [batch, setBatch] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [missingLots, setMissingLots] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const busyRef = useRef(false);
  const loadSeqRef = useRef(0);
  const batchIdRef = useRef(null);

  const batchId = searchParams.get('batch');
  batchIdRef.current = batchId;

  const loadBatch = useCallback(async (id, { background = false } = {}) => {
    if (String(id) !== String(batchIdRef.current)) return;
    const seq = ++loadSeqRef.current;
    const token = localStorage.getItem('token');
    if (!token) { setLoadError({ kind: 'session', message: SESSION_MESSAGE }); return; }
    setLoadError(null);
    if (background) setRefreshing(true);
    try {
      const response = await axios.get(`${API_URL}/api/pdi/report-batches/${encodeURIComponent(id)}`, {
        headers: authHeaders(token),
      });
      if (seq !== loadSeqRef.current) return;
      const loaded = response.data;
      if (loaded?.template_id && loaded.template_id !== TEMPLATE_ID) {
        const target = pdiBatchPath(loaded.template_id, loaded.batch_id);
        if (target) { navigate(target, { replace: true }); return; }
        setLoadError({ kind: 'notfound', message: 'This lot uses a template that has no lot page.' });
        return;
      }
      setBatch(loaded);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setLoadError(describeLoadError(err, await readErrorBody(err)));
    } finally {
      if (seq === loadSeqRef.current) setRefreshing(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadSeqRef.current += 1;
    setBatch(null);
    setLoadError(null);
    setRefreshing(false);
    setMissingLots([]);
    setEditing(false);
    if (batchId) loadBatch(batchId);
  }, [batchId, loadBatch]);

  const batchStatus = batch?.status;
  useEffect(() => {
    if (!batchId || batchStatus !== 'Finalizing') return undefined;
    const timer = setInterval(() => loadBatch(batchId, { background: true }), 5000);
    return () => clearInterval(timer);
  }, [batchId, batchStatus, loadBatch]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    const pdiNo = form.pdi_no.trim();
    if (!pdiNo) { notifyError('PDI No. is required.'); return; }
    const quantityText = String(form.quantity).trim();
    const quantity = Number(quantityText);
    if (!/^\d+$/.test(quantityText) || quantity < 1 || quantity > 50) {
      notifyError('Quantity must be a whole number between 1 and 50.');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) { notifyError(SESSION_MESSAGE); return; }
    busyRef.current = true;
    setCreating(true);
    try {
      const optional = Object.fromEntries(
        SHARED_FIELDS.map(({ key }) => [key, form[key].trim()]).filter(([, v]) => Boolean(v))
      );
      const response = await axios.post(`${API_URL}/api/pdi/report-batches`, {
        template_id: TEMPLATE_ID, pdi_no: pdiNo, quantity,
        controller_type: form.controller_type, ...optional,
      }, {
        headers: authHeaders(token),
      });
      notifySuccess(`Lot created with ${quantity} linked report(s).`);
      setForm(emptyForm());
      navigate(pdiBatchPath(TEMPLATE_ID, response.data.batch_id), { replace: true });
    } catch (err) {
      notifyError(errorText(err?.response?.data, 'Could not create this lot.'));
    } finally {
      busyRef.current = false;
      setCreating(false);
    }
  };

  const handleFinalizeBatch = async () => {
    if (!batch || busyRef.current || batch.status !== 'In Progress') return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError(SESSION_MESSAGE); return; }
    const id = batch.batch_id;
    const filename = pdfFileName(batch);
    busyRef.current = true;
    setFinalizing(true);
    setMissingLots([]);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/report-batches/${id}/finalize`, {}, {
        headers: authHeaders(token),
        responseType: 'blob',
      });
      saveBlob(response.data, filename);
      notifySuccess('Lot finalized and combined PDF downloaded.');
    } catch (err) {
      const body = await readErrorBody(err);
      const status = err?.response?.status;
      if (isSessionError(status, body.code)) {
        notifyError(SESSION_MESSAGE);
      } else if (body.code === 'BATCH_FINALIZING') {
        notifyWarning(`${errorText(body, 'This lot is already being finalized.')} Showing its latest status.`);
      } else {
        if (Array.isArray(body.lots)) setMissingLots(body.lots.map(Number));
        notifyError(errorText(body, 'Failed to finalize this lot.'));
      }
    } finally {
      busyRef.current = false;
      setFinalizing(false);
      // Always reload: after a gateway timeout the server may still have committed.
      await loadBatch(id, { background: true });
    }
  };

  const handleDownloadBatchPdf = async () => {
    if (!batch || downloading) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError(SESSION_MESSAGE); return; }
    setDownloading(true);
    try {
      const response = await axios.get(`${API_URL}/api/pdi/report-batches/${batch.batch_id}/pdf`, {
        headers: authHeaders(token),
        responseType: 'blob',
      });
      saveBlob(response.data, pdfFileName(batch));
    } catch (err) {
      const body = await readErrorBody(err);
      notifyError(isSessionError(err?.response?.status, body.code)
        ? SESSION_MESSAGE
        : errorText(body, 'Could not download the combined PDF.'));
    } finally {
      setDownloading(false);
    }
  };

  const startEdit = () => {
    if (!batch) return;
    setEditForm(Object.fromEntries(LOT_FIELDS.map(({ key }) => [key, batch[key] ?? ''])));
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!batch || busyRef.current) return;
    const trimmed = Object.fromEntries(LOT_FIELDS.map(({ key }) => [key, String(editForm[key] ?? '').trim()]));
    if (!trimmed.pdi_no) { notifyError('PDI No. is required.'); return; }
    const changes = Object.fromEntries(
      Object.entries(trimmed).filter(([key, value]) => value !== String(batch[key] ?? '').trim())
    );
    if (Object.keys(changes).length === 0) { setEditing(false); notifyInfo('No changes to save.'); return; }
    const token = localStorage.getItem('token');
    if (!token) { notifyError(SESSION_MESSAGE); return; }
    busyRef.current = true;
    setSavingEdit(true);
    try {
      const response = await axios.patch(`${API_URL}/api/pdi/report-batches/${batch.batch_id}`, changes, {
        headers: authHeaders(token),
      });
      setBatch((prev) => ({ ...prev, ...response.data }));
      setEditing(false);
      notifySuccess('Lot details saved to every report in this lot.');
    } catch (err) {
      const body = err?.response?.data || {};
      notifyError(errorText(body, 'Could not save the lot details.'));
      if (body.code === 'BATCH_ALREADY_FINALIZED') {
        setEditing(false);
        loadBatch(batch.batch_id, { background: true });
      }
    } finally {
      busyRef.current = false;
      setSavingEdit(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!batch || busyRef.current || batch.status !== 'In Progress') return;
    const count = batch.reports?.length ?? batch.lot_quantity;
    if (!window.confirm(
      `Delete lot ${batch.pdi_no}? This permanently deletes all ${count} report(s) in it. This cannot be undone.`
    )) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError(SESSION_MESSAGE); return; }
    const id = batch.batch_id;
    busyRef.current = true;
    setDeleting(true);
    try {
      await axios.delete(`${API_URL}/api/pdi/report-batches/${id}`, { headers: authHeaders(token) });
      notifySuccess(`Lot ${batch.pdi_no} and its ${count} report(s) were deleted.`);
      navigate(pdiBatchPath(TEMPLATE_ID), { replace: true });
    } catch (err) {
      notifyError(errorText(err?.response?.data, 'Could not delete this lot.'));
      loadBatch(id, { background: true });
    } finally {
      busyRef.current = false;
      setDeleting(false);
    }
  };

  // Same sign-out + login prompt as pages/ConnectionError.jsx.
  const handleSignInAgain = () => {
    localStorage.clear();
    disconnectSocket();
    dispatch(logout());
    dispatch(toggleLogin(true));
  };

  if (batchId) {
    const backLink = (
      <Link to={pdiBatchPath(TEMPLATE_ID)} className="inline-flex items-center gap-1 text-sm text-navy-700 hover:underline">
        <ArrowLeft size={14} /> Back to Create Lot
      </Link>
    );

    if (loadError && (loadError.kind !== 'other' || !batch)) {
      return (
        <div className="max-w-xl mx-auto p-4">
          <div className="bg-white rounded-xl shadow-sm p-6 text-center space-y-3">
            <h2 className="text-lg font-bold text-navy-800">
              {loadError.kind === 'notfound' ? 'Lot not found'
                : loadError.kind === 'forbidden' ? 'Access denied'
                  : loadError.kind === 'session' ? 'Session expired'
                    : 'Could not load this lot'}
            </h2>
            <p className="text-sm text-gray-600">{loadError.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {loadError.kind === 'session' && (
                <button
                  type="button"
                  onClick={handleSignInAgain}
                  className="px-4 py-2 bg-gold-500 text-navy-900 rounded-lg text-sm font-semibold hover:bg-gold-400"
                >
                  Sign in again
                </button>
              )}
              {loadError.kind === 'other' && (
                <button
                  type="button"
                  onClick={() => loadBatch(batchId)}
                  className="flex items-center gap-2 px-4 py-2 bg-navy-800 text-white rounded-lg text-sm font-semibold hover:bg-navy-900"
                >
                  <RefreshCw size={14} /> Retry
                </button>
              )}
              {backLink}
            </div>
          </div>
        </div>
      );
    }

    if (!batch) {
      return <div className="max-w-5xl mx-auto p-8 text-center text-gray-400">Loading lot…</div>;
    }

    const isInProgress = batch.status === 'In Progress';
    const isCompleted = batch.status === 'Completed';
    const isFinalizing = batch.status === 'Finalizing' || finalizing;
    const busy = finalizing || deleting || savingEdit;
    const reports = Array.isArray(batch.reports) ? batch.reports : [];
    const completedCount = reports.filter((r) => r.status === 'Completed').length;

    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        {backLink}
        <div className="bg-white rounded-xl shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-navy-800 break-all">Lot {batch.pdi_no}</h2>
                <StatusBadge status={finalizing ? 'Finalizing' : batch.status} />
              </div>
              <p className="text-gray-500 text-sm mt-1">
                {batch.lot_quantity} controller(s) · {completedCount}/{reports.length} completed
                {batch.customer_name ? ` · ${batch.customer_name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => loadBatch(batch.batch_id, { background: true })}
                disabled={refreshing}
                className="flex items-center gap-2 px-3 py-2 border border-navy-100 text-navy-800 rounded-lg text-sm font-semibold hover:bg-navy-50 disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </button>
              {isCompleted ? (
                <button
                  type="button"
                  onClick={handleDownloadBatchPdf}
                  disabled={downloading}
                  className="flex items-center gap-2 px-4 py-2 bg-navy-800 text-white rounded-lg text-sm font-semibold hover:bg-navy-900 disabled:opacity-50"
                >
                  <Download size={16} /> {downloading ? 'Downloading…' : 'Download Combined PDF'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleFinalizeBatch}
                    disabled={busy || isFinalizing || !isInProgress}
                    className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-navy-900 rounded-lg text-sm font-semibold hover:bg-gold-400 disabled:opacity-50"
                  >
                    {isFinalizing ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                    {isFinalizing ? 'Finalizing…' : 'Finalize Lot'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteBatch}
                    disabled={busy || isFinalizing || !isInProgress}
                    className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete Lot'}
                  </button>
                </>
              )}
            </div>
          </div>

          {loadError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <span>{loadError.message}</span>
              <button type="button" onClick={() => loadBatch(batch.batch_id, { background: true })} className="font-semibold underline">
                Retry
              </button>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-bold text-navy-800">Lot details</h3>
              {isInProgress && !isFinalizing && !editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={busy}
                  className="flex items-center gap-1 px-3 py-1.5 border border-navy-100 text-navy-800 rounded-lg text-xs font-semibold hover:bg-navy-50 disabled:opacity-50"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-3">
              These values apply to every report in this lot.
              {isInProgress ? '' : ' They can no longer be changed once the lot is finalized.'}
            </p>
            {editing && isInProgress && !isFinalizing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {LOT_FIELDS.map(({ key, label, placeholder, options }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-navy-800 mb-1">
                        {label}{key === 'pdi_no' ? ' *' : ''}
                      </label>
                      {options ? (
                        <select
                          className={`${SELECT_CLS} w-full`}
                          value={editForm[key] ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }))}
                        >
                          <option value="">Not set</option>
                          {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input
                          className={INPUT_CLS}
                          placeholder={placeholder}
                          value={editForm[key] ?? ''}
                          onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="px-4 py-2 bg-gold-500 text-navy-900 rounded-lg text-sm font-semibold hover:bg-gold-400 disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={savingEdit}
                    className="px-4 py-2 border border-navy-100 text-navy-800 rounded-lg text-sm font-semibold hover:bg-navy-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {LOT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="text-navy-800 break-words">{batch[key] || <span className="text-gray-400">Not set</span>}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {reports.map((r) => {
            const serial = String(r[SERIAL_KEY] ?? '').trim();
            const flagged = !serial && missingLots.includes(Number(r.lot_index));
            return (
              <div
                key={r.report_id}
                className={`flex items-center justify-between gap-3 px-4 sm:px-5 py-3 ${flagged ? 'bg-red-50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-navy-800 whitespace-nowrap">Lot {r.lot_index}/{batch.lot_quantity}</span>
                  <span className="block sm:inline text-gray-400 text-sm sm:ml-2 break-all">
                    {serial ? `Sr. No. ${serial}` : 'No serial number yet'}
                  </span>
                  {flagged && (
                    <span className="inline-block mt-1 sm:mt-0 sm:ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                      Serial number missing
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={r.status} />
                  <Link
                    to={pdiFormPath(batch.template_id || TEMPLATE_ID, r.report_id)}
                    className="p-2 hover:bg-navy-50 rounded-full text-navy-800"
                    title="Open this report"
                    aria-label={`Open report for lot ${r.lot_index}`}
                  >
                    <Eye size={18} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-sm p-5 sm:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="text-gold-600" size={28} />
          <h2 className="text-xl font-bold text-navy-800">Create AutoNXT Controller Batch Lot</h2>
        </div>
        <p className="text-gray-500 text-sm">
          Creates several linked PDI reports sharing the same PDI No. and lot-wide fields. Fill in each controller&rsquo;s checklist afterward.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">PDI No. *</label>
            <input className={INPUT_CLS} value={form.pdi_no} onChange={(e) => setField('pdi_no', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">Quantity (1-50) *</label>
            <input type="number" min="1" max="50" step="1" inputMode="numeric" className={INPUT_CLS} value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} />
          </div>
          {SHARED_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-navy-800 mb-1">{label}</label>
              <input className={INPUT_CLS} placeholder={placeholder} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">Controller type</label>
            <select className={`${SELECT_CLS} w-full`} value={form.controller_type} onChange={(e) => setField('controller_type', e.target.value)}>
              {CONTROLLER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create Batch'}
        </button>
      </form>
      <RecentLots />
    </div>
  );
}
