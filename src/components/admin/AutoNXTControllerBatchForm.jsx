import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Layers, Eye, Download } from 'lucide-react';
import axios from 'axios';
import { useNotify } from '../../hooks/useNotify';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

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

const emptyForm = () => ({
  pdi_no: '', quantity: '',
  customer_name: '', product_id: '', product_specifications: '', drawing_no: '',
  controller_type: CONTROLLER_TYPES[0],
});

export default function AutoNXTControllerBatchForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { notifySuccess, notifyError } = useNotify();
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [batch, setBatch] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);

  const batchId = searchParams.get('batch');

  const loadBatch = useCallback(async (id) => {
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setLoadingBatch(true);
    try {
      const response = await axios.get(`${API_URL}/api/pdi/report-batches/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBatch(response.data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not load that batch.');
    } finally {
      setLoadingBatch(false);
    }
  }, [notifyError]);

  useEffect(() => {
    if (batchId) loadBatch(batchId);
  }, [batchId, loadBatch]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.pdi_no.trim()) { notifyError('PDI No. is required.'); return; }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      notifyError('Quantity must be a whole number between 1 and 50.');
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setCreating(true);
    try {
      const optional = Object.fromEntries(
        SHARED_FIELDS.map(({ key }) => [key, form[key].trim()]).filter(([, v]) => Boolean(v))
      );
      const response = await axios.post(`${API_URL}/api/pdi/report-batches`, {
        template_id: 'autonxt_controller', pdi_no: form.pdi_no.trim(), quantity,
        controller_type: form.controller_type, ...optional,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      notifySuccess(`Batch created with ${quantity} linked report(s).`);
      navigate(`/pdi-generator/autonxt-controller-batch?batch=${response.data.batch_id}`, { replace: true });
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not create this batch.');
    } finally {
      setCreating(false);
    }
  };

  const handleFinalizeBatch = async () => {
    if (!batch) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setFinalizing(true);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/report-batches/${batch.batch_id}/finalize`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PDI_BATCH_${String(batch.pdi_no || batch.batch_id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notifySuccess('Batch finalized and combined PDF downloaded.');
      await loadBatch(batch.batch_id);
    } catch (err) {
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          notifyError(parsed.error || text || 'Failed to finalize batch.');
        } catch {
          notifyError('Failed to finalize batch.');
        }
      } else {
        notifyError(err.response?.data?.error || 'Failed to finalize batch.');
      }
    } finally {
      setFinalizing(false);
    }
  };

  const handleDownloadBatchPdf = async () => {
    if (!batch) return;
    const token = localStorage.getItem('token');
    try {
      const response = await axios.get(`${API_URL}/api/pdi/report-batches/${batch.batch_id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PDI_BATCH_${String(batch.pdi_no || batch.batch_id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not download the batch PDF.');
    }
  };

  if (batchId) {
    if (loadingBatch || !batch) {
      return <div className="max-w-5xl mx-auto p-8 text-center text-gray-400">Loading batch…</div>;
    }
    const allFinalized = batch.status === 'Completed';
    return (
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <div className="bg-white rounded-xl shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold text-navy-800">Batch {batch.pdi_no}</h2>
              <p className="text-gray-500 text-sm mt-1">
                {batch.lot_quantity} controller(s) · {batch.status}
                {batch.customer_name ? ` · ${batch.customer_name}` : ''}
              </p>
            </div>
            {allFinalized ? (
              <button
                type="button"
                onClick={handleDownloadBatchPdf}
                className="flex items-center gap-2 px-4 py-2 bg-navy-800 text-white rounded-lg text-sm font-semibold hover:bg-navy-900"
              >
                <Download size={16} /> Download Combined PDF
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalizeBatch}
                disabled={finalizing}
                className="flex items-center gap-2 px-4 py-2 bg-gold-500 text-navy-900 rounded-lg text-sm font-semibold hover:bg-gold-400 disabled:opacity-50"
              >
                <ClipboardCheck size={16} /> {finalizing ? 'Finalizing…' : 'Finalize Batch'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          {batch.reports.map((r) => (
            <div key={r.report_id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <span className="font-semibold text-navy-800">Lot {r.lot_index}/{batch.lot_quantity}</span>
                <span className="text-gray-400 text-sm ml-2">
                  {r.controller_sr_no ? `Sr. No. ${r.controller_sr_no}` : 'No serial number yet'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full ${r.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {r.status}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/pdi-generator/autonxt-controller?report=${r.report_id}`)}
                  className="p-2 hover:bg-navy-50 rounded-full text-navy-800"
                  title="Open this report"
                  aria-label={`Open report for lot ${r.lot_index}`}
                >
                  <Eye size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
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
            <input type="number" min="1" max="50" className={INPUT_CLS} value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} />
          </div>
          {SHARED_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-navy-800 mb-1">{label}</label>
              <input className={INPUT_CLS} placeholder={placeholder} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">Controller type</label>
            <select className={SELECT_CLS + ' w-full'} value={form.controller_type} onChange={(e) => setField('controller_type', e.target.value)}>
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
    </div>
  );
}
