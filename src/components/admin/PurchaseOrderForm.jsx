import React, { useState, useMemo, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { Plus, Download, Trash2, FileText, Settings } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const DEFAULT_TERMS_KEY = 'po_default_terms_v1';
const DEFAULT_TERMS_FALLBACK = [
  'The rates prevailing at the time',
  'a) Price Basis : Ex-Faridabad',
  'b) Taxes : GST Extra',
  'c) Payment Terms : After Delivery',
  'd) Delivery : Immediate',
];
const DEFAULT_NOTES_FALLBACK = [
  '1. To ensure prompt action, please quote our order number & date on all future correspondence, challan, bills etc.',
  '2. Please send acceptance of this order immediately if nothing to the contrary is heard within 10 days from date of order, the order shall be deemed to have been accepted by you.',
];

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

const formatINR = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function loadTerms() {
  try {
    const raw = localStorage.getItem(DEFAULT_TERMS_KEY);
    if (!raw) return DEFAULT_TERMS_FALLBACK.slice();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_TERMS_FALLBACK.slice();
  } catch { return DEFAULT_TERMS_FALLBACK.slice(); }
}

function makeItem() {
  return { description: '', qty: '', unit_price: '', total_price: '', discount: 0, net_price: '' };
}

export default function PurchaseOrderForm() {
  const [isOpen,         setIsOpen]         = useState(false);
  const [termsOpen,      setTermsOpen]       = useState(false);
  const [loading,        setLoading]         = useState(false);
  const [fetchError,     setFetchError]      = useState(null);
  const [defaultTerms,   setDefaultTerms]    = useState(() => loadTerms());
  const [termsDraft,     setTermsDraft]      = useState([]);

  const socketStatus = useSelector(s => s.auth.socketStatus);
  const abortRef = useRef(null);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  const [form, setForm] = useState({
    po_no:      'CAS/2025-26/001',
    ref_no:     '',
    date:       todayIST(),
    ref_date:   '',
    to_name:    '',
    to_address: '',
    items:      [makeItem()],
  });

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);
  useEffect(() => { if (termsOpen) setTermsDraft(defaultTerms.slice()); }, [termsOpen]);

  /* ── Computed totals ─────────────────────────────────── */
  const grandNet = useMemo(() =>
    (form.items || []).reduce((sum, it) => {
      const qty   = Number(it.qty        || 0);
      const unit  = Number(it.unit_price || 0);
      const total = it.total_price !== '' && it.total_price != null
        ? Number(it.total_price) : qty * unit;
      const disc  = Number(it.discount || 0);
      const net   = it.net_price !== '' && it.net_price != null
        ? Number(it.net_price) : total * (1 - disc / 100);
      return sum + (Number.isFinite(net) ? net : 0);
    }, 0),
  [form.items]);

  /* ── Item helpers ─────────────────────────────────────── */
  const updateItem = (idx, field, val) => {
    setForm(prev => {
      const items = prev.items.slice();
      const item  = { ...items[idx], [field]: val };
      if (field === 'qty' || field === 'unit_price') {
        const qty  = Number(field === 'qty'        ? val : item.qty        || 0);
        const unit = Number(field === 'unit_price' ? val : item.unit_price || 0);
        item.total_price = +(qty * unit);
        const disc = Number(item.discount || 0);
        item.net_price   = +(item.total_price * (1 - disc / 100));
      }
      if (field === 'total_price') {
        const disc = Number(item.discount || 0);
        item.net_price = +(Number(val || 0) * (1 - disc / 100));
      }
      if (field === 'discount') {
        const total = Number(item.total_price || 0);
        item.net_price = +(total * (1 - Number(val || 0) / 100));
      }
      items[idx] = item;
      return { ...prev, items };
    });
  };
  const addItem    = () => setForm(p => ({ ...p, items: [...p.items, makeItem()] }));
  const removeItem = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  /* ── Terms helpers ────────────────────────────────────── */
  const saveTerms = (terms) => {
    const clean = terms.map(t => String(t || '').trim()).filter(Boolean);
    if (!clean.length) { notifyError('Keep at least one term.'); return; }
    localStorage.setItem(DEFAULT_TERMS_KEY, JSON.stringify(clean));
    setDefaultTerms(clean);
    setTermsOpen(false);
    notifySuccess('Default terms saved');
  };

  /* ── Generate PDF ─────────────────────────────────────── */
  const handleGenerate = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token)        { notifyError('Please login first.'); return; }
    if (!form.po_no)   { notifyError('PO No. is required.'); return; }
    if (!form.items.length) { notifyError('Add at least one item.'); return; }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = {
        po_no:      form.po_no,
        ref_no:     form.ref_no,
        date:       form.date,
        ref_date:   form.ref_date,
        to_name:    form.to_name,
        to_address: form.to_address,
        items: form.items.map((it, idx) => {
          const qty        = Number(it.qty        || 0);
          const unit_price = Number(it.unit_price || 0);
          const total_price = (it.total_price !== '' && it.total_price != null)
            ? Number(it.total_price) : qty * unit_price;
          const discount   = Number(it.discount || 0);
          const net_price  = (it.net_price !== '' && it.net_price != null)
            ? Number(it.net_price) : total_price * (1 - discount / 100);
          return {
            sno: idx + 1,
            description: it.description || '—',
            qty,
            unit_price,
            total_price,
            discount,
            net_price,
          };
        }),
        terms: defaultTerms,
        notes: DEFAULT_NOTES_FALLBACK,
      };

      const response = await axios.post(`${API_URL}/api/purchase-order/generate`, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        responseType: 'blob',
        signal: controller.signal,
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = response.headers['content-disposition'];
      let filename = `PO_${form.po_no.replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;
      if (cd) { const m = cd.match(/filename="?(.+)"?/); if (m?.[1]) filename = m[1]; }
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      notifySuccess('Purchase Order PDF downloaded');
      setIsOpen(false);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') notifyInfo('Request cancelled');
      else { console.error(err); setFetchError(err.response?.data?.error || 'Failed to generate PO'); }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  if (socketStatus === 'error' || fetchError)
    return <ConnectionError onRetry={() => setFetchError(null)} />;

  /* ── Landing page ─────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 bg-amber-100 border border-amber-200 rounded-full px-3 py-1 mb-3">
              <FileText size={12} className="text-amber-700" />
              <span className="text-amber-700 text-xs font-semibold tracking-wide">FY 2025-26</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Purchase Orders</h1>
            <p className="text-gray-600 text-sm mt-1.5">Create purchase orders for suppliers with instant PDF export</p>
          </div>
          <button
            onClick={() => setIsOpen(true)}
            className="px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-xl flex items-center gap-2 font-semibold transition-all shadow-md hover:shadow-lg text-sm shrink-0"
          >
            <Plus size={15} /> New Purchase Order
          </button>
        </div>

        {/* Summary card */}
        <div
          className="bg-gradient-to-br from-amber-100 to-amber-50 rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer border border-amber-200"
          onClick={() => setIsOpen(true)}
        >
          <div className="h-1.5 bg-gradient-to-r from-orange-500 to-amber-600" />
          <div className="p-7">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.15em] mb-1">Current Draft</p>
                <h2 className="text-xl font-bold text-gray-800">{form.po_no}</h2>
              </div>
              <span className="bg-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full border border-amber-300">
                Draft
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {[
                { label: 'PO Number',  value: form.po_no               },
                { label: 'Date',       value: form.date                 },
                { label: 'Supplier',   value: form.to_name || '—'       },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-xl p-4 border border-amber-100">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="font-semibold text-gray-800 text-sm truncate">{value}</p>
                </div>
              ))}
              <div className="bg-white rounded-xl p-4 border border-amber-100">
                <p className="text-xs text-gray-500 mb-1">Grand Net Total</p>
                <p className="font-bold text-lg text-orange-700">₹ {formatINR(grandNet)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-amber-200">
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span>{form.items.length} item{form.items.length !== 1 ? 's' : ''}</span>
                {form.ref_no && <><span>·</span><span>Ref: {form.ref_no}</span></>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setTermsOpen(true); }}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
              >
                <Settings size={11} /> Manage Terms
              </button>
            </div>
          </div>
        </div>

        <p className="text-gray-500 text-xs text-center mt-6">
          Click the card or "New Purchase Order" to fill in details and generate a PDF
        </p>

        {/* ── Main Form Modal ─────────────────────────────── */}
        <Modal
          isOpen={isOpen}
          onRequestClose={() => setIsOpen(false)}
          className="max-w-5xl mx-auto mt-6 bg-white rounded-xl p-6 outline-none shadow-xl"
          overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-semibold text-gray-800">Purchase Order Details</h3>
            <button onClick={() => setIsOpen(false)} className="px-3 py-1.5 border rounded text-sm text-gray-600">Close</button>
          </div>

          <form onSubmit={handleGenerate} className="space-y-5">

            {/* Top row: PO No, Ref No, Date, Ref Date */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">ORDER No. *</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.po_no}
                  onChange={e => setForm(p => ({ ...p, po_no: e.target.value }))}
                  required
                  placeholder="CAS/2025-26/001"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ref No.</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.ref_no}
                  onChange={e => setForm(p => ({ ...p, ref_no: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Ref Date</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.ref_date}
                  onChange={e => setForm(p => ({ ...p, ref_date: e.target.value }))}
                />
              </div>
            </div>

            {/* To section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1">To (Supplier Name)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.to_name}
                  onChange={e => setForm(p => ({ ...p, to_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Supplier Address / City</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.to_address}
                  onChange={e => setForm(p => ({ ...p, to_address: e.target.value }))}
                />
              </div>
            </div>

            {/* Items table */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="font-semibold text-gray-800 text-sm">Items</span>
                <button type="button" onClick={addItem} className="text-green-700 text-sm flex items-center gap-1.5">
                  <Plus size={14} /> Add Item
                </button>
              </div>

              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 mb-2 px-1">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-4">Description</div>
                <div className="col-span-1 text-center">Qty (KG)</div>
                <div className="col-span-2 text-center">Unit Price</div>
                <div className="col-span-1 text-center">Total</div>
                <div className="col-span-1 text-center">Disc%</div>
                <div className="col-span-1 text-center">Net Price</div>
                <div className="col-span-1" />
              </div>

              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start mb-2">
                  <div className="col-span-1 text-center pt-2.5 text-sm text-gray-500">{idx + 1}</div>
                  <textarea
                    rows={2}
                    className="col-span-4 border rounded-lg px-2 py-1.5 text-sm resize-none"
                    value={it.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="Description"
                  />
                  <input
                    type="number" min="0" step="any"
                    className="col-span-1 border rounded-lg px-2 py-1.5 text-sm text-center"
                    value={it.qty}
                    onChange={e => updateItem(idx, 'qty', e.target.value)}
                    placeholder="0"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="col-span-2 border rounded-lg px-2 py-1.5 text-sm"
                    value={it.unit_price}
                    onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                    placeholder="0.00"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="col-span-1 border rounded-lg px-2 py-1.5 text-sm"
                    value={it.total_price}
                    onChange={e => updateItem(idx, 'total_price', e.target.value)}
                    placeholder="auto"
                  />
                  <input
                    type="number" min="0" max="100" step="0.01"
                    className="col-span-1 border rounded-lg px-2 py-1.5 text-sm text-center"
                    value={it.discount}
                    onChange={e => updateItem(idx, 'discount', e.target.value)}
                    placeholder="0"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    className="col-span-1 border rounded-lg px-2 py-1.5 text-sm"
                    value={it.net_price}
                    onChange={e => updateItem(idx, 'net_price', e.target.value)}
                    placeholder="auto"
                  />
                  <div className="col-span-1 flex justify-center pt-1.5">
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(idx)} className="text-red-500 hover:text-red-700">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Grand net total */}
              <div className="flex justify-end mt-3 pt-3 border-t border-gray-200">
                <div className="text-right">
                  <div className="text-xs text-gray-500">Grand Net Total</div>
                  <div className="font-bold text-lg text-orange-700">₹ {formatINR(grandNet)}</div>
                </div>
              </div>
            </div>

            {/* Terms & Conditions preview */}
            <div className="flex items-center gap-4">
              <div>
                <div className="text-sm text-gray-700 font-medium">Terms &amp; Conditions</div>
                <div className="text-xs text-gray-500 mt-0.5">Using {defaultTerms.length} default terms</div>
              </div>
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1.5"
              >
                <Settings size={13} /> Manage Terms
              </button>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg flex items-center gap-2 text-sm font-semibold shadow-sm"
              >
                <Download size={15} />
                {loading ? 'Generating…' : 'Generate PDF'}
              </button>
            </div>
          </form>
        </Modal>

        {/* ── Manage Terms Modal ─────────────────────────── */}
        <Modal
          isOpen={termsOpen}
          onRequestClose={() => setTermsOpen(false)}
          className="max-w-2xl mx-auto mt-12 bg-white rounded-xl p-6 outline-none shadow-xl"
          overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-800">Manage Default Terms &amp; Conditions</h4>
            <div className="flex gap-2">
              <button onClick={() => setTermsOpen(false)} className="px-3 py-1 border rounded text-sm">Close</button>
              <button onClick={() => saveTerms(termsDraft)} className="px-3 py-1 bg-green-700 text-white rounded text-sm">Save</button>
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-4">
            These terms will be printed on all Purchase Orders. Changes are saved to your browser.
          </p>

          <div className="space-y-3">
            {termsDraft.map((t, i) => (
              <div key={i} className="flex gap-2 items-start">
                <textarea
                  rows={2}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                  value={t}
                  onChange={e => setTermsDraft(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                />
                <button
                  onClick={() => setTermsDraft(prev => prev.filter((_, j) => j !== i))}
                  className="px-2 py-1.5 text-red-500 border rounded-lg text-sm h-10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setTermsDraft(prev => [...prev, ''])}
              className="px-3 py-1.5 border rounded-lg text-sm flex items-center gap-1.5"
            >
              <Plus size={13} /> Add Term
            </button>
            <button
              onClick={() => { setTermsDraft(DEFAULT_TERMS_FALLBACK.slice()); notifyInfo('Reset to defaults'); }}
              className="px-3 py-1.5 border rounded-lg text-sm text-gray-600"
            >
              Reset to Default
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
}