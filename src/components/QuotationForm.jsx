import React, { useState, useMemo, useRef, useEffect } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { Plus, Download, Trash2, Eye } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// Theme colors (single source of truth)
const THEME = {
  primary: '#0b6b24',   // company green
  muted: '#6b7280',     // muted text
  surface: '#ffffff',
  accent: '#0b6b24',
  border: '#e6f4ea',    // light green border for subtle cards
};

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
  const abortRef = useRef(null);

  const [form, setForm] = useState({
    quotation_no: '2024-25/sales/AA/0001',
    date: todayIST(),
    to_address: '',
    kind_attn: '',
    subject_item: '',
    intro: 'We are pleased to quote you our best prices for the following items:',
    items: [{ sno: 1, description: '', unit_price: 0, total_price: 0 }],
    gst_percent: 18,
    allowOverrideTerms: false,
    terms: [],
  });

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const { subtotal, gstAmount, grandTotal } = useMemo(() => {
    const subtotal = (form.items || []).reduce((s, it) => s + (Number(it.total_price || it.unit_price || 0)), 0);
    const gstPercent = Number(form.gst_percent || 0);
    const gstAmount = +(subtotal * gstPercent / 100);
    const grandTotal = subtotal + gstAmount;
    return { subtotal, gstAmount, grandTotal };
  }, [form.items, form.gst_percent]);

  const addItem = () => {
    setForm(prev => ({ ...prev, items: [...prev.items, { sno: prev.items.length + 1, description: '', unit_price: 0, total_price: 0 }] }));
  };
  const removeItem = (i) => {
    setForm(prev => {
      const items = prev.items.filter((_, idx) => idx !== i).map((it, idx) => ({ ...it, sno: idx + 1 }));
      return { ...prev, items };
    });
  };
  const updateItem = (i, field, val) => {
    setForm(prev => {
      const items = prev.items.slice();
      items[i] = { ...items[i], [field]: field === 'description' ? val : Number(val || 0) };
      if (field === 'unit_price') {
        items[i].total_price = Number(items[i].total_price) === 0 ? Number(val || 0) : items[i].total_price;
      }
      return { ...prev, items };
    });
  };

  const [previewOpen, setPreviewOpen] = useState(false);

  const handleGenerate = async (ev) => {
    ev.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Please login to generate quotation (token missing).'); return; }
    if (!form.quotation_no) { toast.error('Quotation No is required'); return; }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = {
        quotation_no: form.quotation_no,
        date: form.date,
        to_address: form.to_address,
        kind_attn: form.kind_attn,
        subject_item: form.subject_item,
        intro: form.intro,
        items: form.items.map((it, idx) => ({
          sno: it.sno ?? (idx + 1),
          description: it.description || '—',
          unit_price: Number(it.unit_price || 0),
          total_price: Number(it.total_price || it.unit_price || 0),
        })),
        gst_percent: Number(form.gst_percent || 18),
        allowOverrideTerms: !!form.allowOverrideTerms,
        terms: form.allowOverrideTerms ? form.terms : undefined,
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

      toast.success('Quotation PDF downloaded');
      setIsOpen(false);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') toast.info('Request cancelled');
      else { console.error(err); toast.error(err.response?.data?.error || 'Failed to generate quotation'); }
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

  return (
    <div className="p-6">
      <ToastContainer position="top-right" />
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

            {/* Terms toggle */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.allowOverrideTerms}
                  onChange={e => setForm(prev => ({ ...prev, allowOverrideTerms: e.target.checked }))} />
                <span className="text-sm">Allow editing Terms & Conditions</span>
              </label>
            </div>
            {form.allowOverrideTerms && (
              <div>
                <label className="text-sm" style={{ color: THEME.muted }}>Terms (one per line)</label>
                <textarea rows={4} className="w-full border rounded px-3 py-2"
                  value={form.terms.join('\n')}
                  onChange={e => setForm(prev => ({ ...prev, terms: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }))} />
              </div>
            )}

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
                    <th className="pb-2 text-right">Unit Price (INR)</th>
                    <th className="pb-2 text-right">Total Price (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-2 align-top">{i + 1}</td>
                      <td className="py-2 align-top">{it.description || '………………'}</td>
                      <td className="py-2 text-right align-top">₹ {formatINR(it.unit_price)}</td>
                      <td className="py-2 text-right align-top">₹ {formatINR(it.total_price || it.unit_price)}</td>
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
                {!form.allowOverrideTerms ? (
                  <>
                    <li>Validity – 10 days from the date of offer</li>
                    <li>Price Basis – Ex-Works Faridabad. Packing and forwarding extra.</li>
                    <li>Payment Terms – 100% advance with P.O. for initial orders; for regular orders, the payment terms will be as settled at the time of finalization.</li>
                    <li>Delivery – 4–6 weeks from the date of receipt of PO along with advance.</li>
                  </>
                ) : form.terms.length ? form.terms.map((t, i) => <li key={i}>{t}</li>) : <li>—</li>}
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
