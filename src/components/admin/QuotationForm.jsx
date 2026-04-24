import React, { useState, useMemo, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { Plus, Download, Trash2, Eye } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// Theme colors (single source of truth)
const THEME = {
  primary: '#0b6b24',   // company green
  muted: '#6b7280',     // muted text
  surface: '#ffffff',
  accent: '#0b6b24',
  border: '#e6f4ea',    // light green border for subtle cards
};

const DEFAULT_TERMS_KEY = 'quotation_default_terms_v1';

const DEFAULT_TERMS_FALLBACK = [
  "Validity – 10 days from the date of offer",
  "Price Basis – Ex-Works Faridabad. Packing and forwarding extra.",
  "Payment Terms – 100% advance with P.O. for initial orders; for regular orders, the payment terms will be as settled at the time of finalization.",
  "Delivery – 4–6 weeks from the date of receipt of PO along with advance."
];

const todayIST = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};
const toYMD = (v) => {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3 && parts[0].length === 4) return s;
    return todayIST();
  }
  return todayIST();
};

const formatINR = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function QuotationForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const socketStatus = useSelector(state => state.auth.socketStatus);
  const abortRef = useRef(null);

  // Load default terms from localStorage (if present) or fallback
  const loadDefaultTerms = () => {
    try {
      const raw = localStorage.getItem(DEFAULT_TERMS_KEY);
      if (!raw) return DEFAULT_TERMS_FALLBACK.slice();
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
      return DEFAULT_TERMS_FALLBACK.slice();
    } catch (e) {
      return DEFAULT_TERMS_FALLBACK.slice();
    }
  };

  const [defaultTerms, setDefaultTerms] = useState(() => loadDefaultTerms());
  const [manageTermsOpen, setManageTermsOpen] = useState(false);

  const [form, setForm] = useState({
    quotation_no: '2024-25/sales/AA/0001',
    date: todayIST(),
    to_address: '',
    to_gst_number: '',
    kind_attn: '',
    subject_item: '',
    intro: 'We are pleased to quote you our best prices for the following items:',
    items: [{ sno: 1, description: '', hsn_code: '', qty: 1, unit_price: 0, total_price: 0 }],
    gst_percent: 18,
  });

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Save default terms to localStorage
  const saveDefaultTerms = (terms) => {
    try {
      localStorage.setItem(DEFAULT_TERMS_KEY, JSON.stringify(terms));
      setDefaultTerms(terms);
      notifySuccess('Default Terms saved');
    } catch (e) {
      notifyError('Failed to save default terms');
    }
  };

  // subtotal now uses total_price if provided, otherwise qty * unit_price
  const { subtotal, gstAmount, grandTotal } = useMemo(() => {
    const subtotal = (form.items || []).reduce((s, it) => {
      const qty = Number(it.qty || 0);
      const unit = Number(it.unit_price || 0);
      const total = (it.total_price != null && Number(it.total_price) !== 0) ? Number(it.total_price) : qty * unit;
      return s + total;
    }, 0);
    const gstPercent = Number(form.gst_percent || 0);
    const gstAmount = +(subtotal * gstPercent / 100);
    const grandTotal = subtotal + gstAmount;
    return { subtotal, gstAmount, grandTotal };
  }, [form.items, form.gst_percent]);

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { sno: prev.items.length + 1, description: '', hsn_code: '', qty: 1, unit_price: 0, total_price: 0 }
      ]
    }));
  };
  const removeItem = (i) => {
    setForm(prev => {
      const items = prev.items.filter((_, idx) => idx !== i).map((it, idx) => ({ ...it, sno: idx + 1 }));
      return { ...prev, items };
    });
  };

  // updateItem: when qty or unit_price change, recalc total_price = qty * unit_price
  const updateItem = (i, field, val) => {
    setForm(prev => {
      const items = prev.items.slice();
      const item = { ...items[i] };

      if (field === 'description' || field === 'hsn_code') {
        item[field] = String(val);
      } else if (field === 'qty') {
        const qty = Number(val || 0);
        item.qty = qty;
        const unit = Number(item.unit_price || 0);
        item.total_price = +(qty * unit);
      } else if (field === 'unit_price') {
        const unit = Number(val || 0);
        item.unit_price = unit;
        const qty = Number(item.qty || 0);
        item.total_price = +(qty * unit);
      } else if (field === 'total_price') {
        item.total_price = Number(val || 0);
      } else {
        item[field] = val;
      }

      items[i] = item;
      return { ...prev, items };
    });
  };

  const [previewOpen, setPreviewOpen] = useState(false);

  const handleGenerate = async (ev) => {
    ev.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please login to generate quotation (token missing).'); return; }
    if (!form.quotation_no) { notifyError('Quotation No is required'); return; }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Always send the defaultTerms as the Terms & Conditions (single source)
      const termsToSend = defaultTerms;

      const payload = {
        quotation_no: form.quotation_no,
        date: form.date,
        to_address: form.to_address,
        to_gst_number: form.to_gst_number?.trim() || '',
        kind_attn: form.kind_attn,
        subject_item: form.subject_item,
        intro: form.intro,
        items: form.items.map((it, idx) => ({
          sno: it.sno ?? (idx + 1),
          description: it.description || '—',
          hsn_code: it.hsn_code || '',
          qty: Number(it.qty || 0),
          unit_price: Number(it.unit_price || 0),
          total_price: Number(it.total_price != null && Number(it.total_price) !== 0 ? it.total_price : (Number(it.qty || 0) * Number(it.unit_price || 0))),
        })),
        gst_percent: Number(form.gst_percent || 18),
        // no per-quotation override: we always send termsToSend
        terms: termsToSend,
      };

      const response = await axios.post(`${API_URL}/api/quotation/generate`, payload, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        responseType: 'blob',
        signal: controller.signal
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');

      const cd = response.headers['content-disposition'];
      let filename = `QUOTATION_${form.quotation_no.replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;
      if (cd) {
        const m = cd.match(/filename="?(.+)"?/);
        if (m && m[1]) filename = m[1];
      }

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      notifySuccess('Quotation PDF downloaded');
      setIsOpen(false);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') notifyInfo('Request cancelled');
      else { console.error(err); setFetchError(err.response?.data?.error || 'Failed to generate quotation'); }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  // styles that use THEME to avoid repeating inline hex codes
  const primaryStyle = { color: THEME.primary };
  const primaryBg = { backgroundColor: THEME.primary };
  const cardBorder = { borderColor: THEME.border };

  /* ---------- Terms Manager helpers ---------- */
  const openManageTerms = () => setManageTermsOpen(true);
  const closeManageTerms = () => setManageTermsOpen(false);

  // local state used inside Manage Terms modal so edits aren't auto-saved until "Save" clicked
  const [manageTermsDraft, setManageTermsDraft] = useState(() => defaultTerms.slice());
  const { notifySuccess, notifyError, notifyInfo } = useNotify();
  useEffect(() => { setManageTermsDraft(defaultTerms.slice()); }, [manageTermsOpen]); // refresh when modal opens

  const addDefaultTerm = () => setManageTermsDraft(prev => ([...prev, '']));
  const updateDefaultTermAt = (idx, text) => setManageTermsDraft(prev => prev.map((t, i) => i === idx ? text : t));
  const removeDefaultTermAt = (idx) => setManageTermsDraft(prev => prev.filter((_, i) => i !== idx));
  const saveManagedTerms = () => {
    const clean = manageTermsDraft.map(t => String(t || '').trim()).filter(Boolean);
    if (clean.length === 0) { notifyError('Please keep at least one term.'); return; }
    saveDefaultTerms(clean);
    closeManageTerms();
  };

  /* ---------- Render ---------- */
  if (socketStatus === 'error' || fetchError) return <ConnectionError onRetry={() => setFetchError(null)} />;

  return (
    <div className="p-6">
<div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold" style={primaryStyle}>Create Quotation</h2>
          <div className="flex gap-2">
            <button onClick={() => setPreviewOpen(true)} className="px-3 py-2 border rounded flex items-center gap-2 hover:shadow-sm">
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button onClick={openModal} className="px-4 py-2 rounded flex items-center gap-2 text-white" style={primaryBg}>
              <Plus className="w-4 h-4" /> New / Edit
            </button>
          </div>
        </div>

        {/* Inline quick summary */}
        <div className="bg-white p-4 rounded shadow mb-6" style={cardBorder}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs" style={{ color: THEME.muted }}>Quotation No</div>
              <div className="font-medium">{form.quotation_no}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: THEME.muted }}>Date</div>
              <div className="font-medium">{form.date}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: THEME.muted }}>To</div>
              <div className="font-medium">{form.to_address || '—'}</div>
            </div>
            <div>
              <div className="text-xs" style={{ color: THEME.muted }}>Grand Total</div>
              <div className="font-medium" style={primaryStyle}>₹ {formatINR(grandTotal)}</div>
            </div>

            {/* show GST under summary if present */}
            <div>
              <div className="text-xs" style={{ color: THEME.muted }}>To - GST No</div>
              <div className="font-medium">{form.to_gst_number || '—'}</div>
            </div>
          </div>
        </div>

        {/* Modal for the form */}
        <Modal
          isOpen={isOpen}
          onRequestClose={closeModal}
          className="max-w-4xl mx-auto mt-8 bg-white rounded-xl p-6 outline-none shadow-xl"
          overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold" style={primaryStyle}>Quotation Details</h3>
            <div className="flex gap-2">
              <button onClick={closeModal} className="px-3 py-2 border rounded">Close</button>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm" style={{ color: THEME.muted }}>Quotation No *</label>
                <input className="w-full border rounded px-3 py-2" value={form.quotation_no}
                  onChange={(e) => setForm(prev => ({ ...prev, quotation_no: e.target.value }))} required />
              </div>
              <div>
                <label className="text-sm" style={{ color: THEME.muted }}>Date</label>
                <input type="date" className="w-full border rounded px-3 py-2"
                  value={toYMD(form.date)} onChange={e => setForm(prev => ({ ...prev, date: toYMD(e.target.value) }))} />
              </div>
              <div>
                <label className="text-sm" style={{ color: THEME.muted }}>GST %</label>
                <input type="number" min="0" className="w-full border rounded px-3 py-2"
                  value={form.gst_percent} onChange={e => setForm(prev => ({ ...prev, gst_percent: Number(e.target.value || 0) }))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-sm" style={{ color: THEME.muted }}>To</label>
                <textarea className="w-full border rounded px-3 py-2" rows={3}
                  placeholder="M/s. ABC Industries, Plot 12, ..."
                  value={form.to_address} onChange={e => setForm(prev => ({ ...prev, to_address: e.target.value }))} />

                {/* GST number input for recipient */}
                <div className="mt-2">
                  <label className="text-sm" style={{ color: THEME.muted }}>GST No (Recipient)</label>
                  <input
                    className="w-64 border rounded px-3 py-2"
                    placeholder="12ABCDE3456F7Z8"
                    value={form.to_gst_number}
                    onChange={e => setForm(prev => ({ ...prev, to_gst_number: String(e.target.value).trim() }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm" style={{ color: THEME.muted }}>Kind Attn</label>
                <input className="w-full border rounded px-3 py-2" value={form.kind_attn}
                  onChange={e => setForm(prev => ({ ...prev, kind_attn: e.target.value }))} />
                <label className="text-sm mt-2 block" style={{ color: THEME.muted }}>Sub: Quotation for</label>
                <input className="w-full border rounded px-3 py-2" value={form.subject_item}
                  onChange={e => setForm(prev => ({ ...prev, subject_item: e.target.value }))} />
              </div>
            </div>

            {/* items */}
            <div className="bg-gray-50 rounded p-4" style={cardBorder}>
              <div className="flex justify-between items-center mb-3">
                <div className="font-semibold">Items</div>
                <button type="button" onClick={addItem} className="text-green-600 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ color: THEME.muted }}>
                      <th className="pr-4 pb-2">S. No.</th>
                      <th className="pr-4 pb-2">Description</th>
                      <th className="pr-4 pb-2">HSN Code</th>
                      <th className="pr-4 pb-2">Qty</th>
                      <th className="pr-4 pb-2">Unit Price (INR)</th>
                      <th className="pr-4 pb-2">Total Price (INR)</th>
                      <th className="pr-4 pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="py-2">{idx + 1}</td>
                        <td className="py-2">
                          <textarea rows={2} className="w-full border rounded px-2 py-1"
                            value={it.description}
                            onChange={e => updateItem(idx, 'description', e.target.value)} />
                        </td>
                        <td className="py-2">
                          <input className="w-28 border rounded px-2 py-1" value={it.hsn_code}
                            onChange={e => updateItem(idx, 'hsn_code', e.target.value)} />
                        </td>
                        <td className="py-2">
                          <input type="number" min="0" step="1" className="w-20 border rounded px-2 py-1"
                            value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} />
                        </td>
                        <td className="py-2">
                          <input type="number" step="0.01" className="w-36 border rounded px-2 py-1"
                            value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                        </td>
                        <td className="py-2">
                          <input type="number" step="0.01" className="w-36 border rounded px-2 py-1"
                            value={it.total_price} onChange={e => updateItem(idx, 'total_price', e.target.value)} />
                        </td>
                        <td className="py-2">
                          {form.items.length > 1 && (
                            <button type="button" onClick={() => removeItem(idx)} className="text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* totals */}
              <div className="flex justify-end gap-6 mt-4 items-end">
                <div className="text-right">
                  <div className="text-sm" style={{ color: THEME.muted }}>Subtotal</div>
                  <div className="font-medium">₹ {formatINR(subtotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm" style={{ color: THEME.muted }}>GST @ {form.gst_percent}%</div>
                  <div className="font-medium">₹ {formatINR(gstAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm" style={{ color: THEME.muted }}>Grand Total</div>
                  <div className="font-bold text-lg" style={primaryStyle}>₹ {formatINR(grandTotal)}</div>
                </div>
              </div>
            </div>

            {/* Manage Default Terms button */}
            <div className="flex items-center gap-4">
              <div>
                <div className="text-sm" style={{ color: THEME.muted }}>Terms & Conditions</div>
                <div className="text-xs text-gray-500">Using default terms from Manage Default Terms (editable in settings)</div>
              </div>
              <button type="button" onClick={openManageTerms} className="px-3 py-1 border rounded text-sm ml-2">
                Manage Default Terms
              </button>
            </div>

            {/* actions */}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeModal} className="px-4 py-2 border rounded">Cancel</button>
              <button type="button" onClick={() => setPreviewOpen(true)} className="px-4 py-2 border rounded flex items-center gap-2">
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button type="submit" disabled={loading} className="px-6 py-2 rounded flex items-center gap-2 text-white" style={primaryBg}>
                <Download className="w-4 h-4" /> {loading ? 'Generating...' : 'Generate PDF'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Manage Default Terms Modal */}
        <Modal
          isOpen={manageTermsOpen}
          onRequestClose={closeManageTerms}
          className="max-w-3xl mx-auto mt-10 bg-white rounded-xl p-6 outline-none shadow-xl"
          overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold" style={primaryStyle}>Manage Default Terms & Conditions</h4>
            <div className="flex gap-2">
              <button onClick={closeManageTerms} className="px-3 py-1 border rounded">Close</button>
              <button onClick={saveManagedTerms} className="px-3 py-1 bg-green-600 text-white rounded">Save</button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm text-gray-600">Edit the default terms that will be used for all quotations. Changes are saved to your browser (localStorage).</div>

            {manageTermsDraft.map((t, i) => (
              <div key={i} className="flex gap-2 items-start">
                <textarea
                  rows={2}
                  className="flex-1 border rounded px-2 py-1"
                  value={t}
                  onChange={(e) => updateDefaultTermAt(i, e.target.value)}
                />
                <button onClick={() => removeDefaultTermAt(i)} className="px-2 py-1 text-red-600 border rounded h-10">Remove</button>
              </div>
            ))}

            <div className="flex gap-2">
              <button onClick={addDefaultTerm} className="px-3 py-1 border rounded flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Term
              </button>
              <button onClick={() => { setManageTermsDraft(DEFAULT_TERMS_FALLBACK.slice()); notifyInfo('Reset to original default terms'); }} className="px-3 py-1 border rounded">
                Reset to original
              </button>
            </div>
          </div>
        </Modal>

        {/* Preview Modal - simple HTML view */}
        <Modal
          isOpen={previewOpen}
          onRequestClose={() => setPreviewOpen(false)}
          className="max-w-3xl mx-auto mt-10 bg-white rounded-xl p-6 outline-none shadow-xl"
          overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
        >
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold" style={primaryStyle}>Quotation Preview</h4>
            <button onClick={() => setPreviewOpen(false)} className="text-sm" style={{ color: THEME.muted }}>Close</button>
          </div>

          <div className="border p-4 rounded" style={cardBorder}>
            <div className="text-center font-bold text-lg mb-2" style={primaryStyle}>COMPAGE AUTOMATION SYSTEMS PVT.LTD.</div>

            <div className="flex justify-between text-sm mb-4">
              <div>Quotation No. <span className="font-medium">{form.quotation_no}</span></div>
              <div>Date: <span className="font-medium">{form.date}</span></div>
            </div>

            <div className="mb-4">
              <div><strong>To,</strong></div>
              <div className="whitespace-pre-line">{form.to_address || '……………………………'}</div>
              <div className="mt-2 text-sm">
                <strong>GST No:</strong> {form.to_gst_number || '—'}
              </div>
            </div>

            <div className="text-center mb-4">
              <div><strong>Kind Attn:</strong> {form.kind_attn || '……………'}</div>
              <div><strong>Sub:</strong> Quotation for {form.subject_item || '______________'}</div>
            </div>

            <div className="mb-4">{form.intro}</div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead className="text-left" style={{ color: THEME.muted }}>
                  <tr>
                    <th className="pb-2">S. No.</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">HSN</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Unit Price (INR)</th>
                    <th className="pb-2 text-right">Total Price (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2 align-top">{i + 1}</td>
                      <td className="py-2 align-top">{it.description || '………………'}</td>
                      <td className="py-2 align-top">{it.hsn_code || '—'}</td>
                      <td className="py-2 text-right align-top">{Number(it.qty || 0)}</td>
                      <td className="py-2 text-right align-top">₹ {formatINR(it.unit_price)}</td>
                      <td className="py-2 text-right align-top">₹ {formatINR((it.total_price != null && Number(it.total_price) !== 0) ? it.total_price : (Number(it.qty || 0) * Number(it.unit_price || 0)))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-right space-y-1">
              <div className="flex justify-end gap-6">
                <div className="text-right">
                  <div className="text-sm" style={{ color: THEME.muted }}>Subtotal</div>
                  <div className="font-medium">₹ {formatINR(subtotal)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm" style={{ color: THEME.muted }}>GST @ {form.gst_percent}%</div>
                  <div className="font-medium">₹ {formatINR(gstAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm" style={{ color: THEME.muted }}>Grand Total</div>
                  <div className="font-bold text-lg" style={primaryStyle}>₹ {formatINR(grandTotal)}</div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <strong>Terms & Conditions:</strong>
              <ol className="ml-4 list-decimal mt-2 space-y-1 text-sm" style={{ color: THEME.muted }}>
                {defaultTerms.map((t, i) => <li key={i}>{t}</li>)}
              </ol>
            </div>

            <div className="mt-6">
              <div>Thanking you.</div>
              <div>For Compage Automation Systems Pvt. Ltd.</div>
              <div className="mt-4 font-semibold">Anil Aggarwal (M:9999982595)</div>
            </div>

            <div className="mt-6 text-center text-sm" style={{ color: THEME.muted }}>
              Factory:20-21,NewDLFIndustrialArea,Faridabad-121003,Phone: 9311856598 E-mail : sales@compageauto@gmail.com,Website: www.compageauto.com
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
