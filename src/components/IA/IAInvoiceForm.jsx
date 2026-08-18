// ──────────────────────────────────────────────────────────────
// IAInvoiceForm.jsx
// Manual Invoice Generator — Intute AI (HR + Employee)
// ──────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Loader2, Download, Trash2, Building2, FileText, Package } from 'lucide-react';
import axios from 'axios';
import Modal from 'react-modal';
import { toWords } from 'number-to-words';
import { useNotify } from '../../hooks/useNotify';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// ────── DATE HELPERS ──────
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
  if (s.includes('T')) {
    const dt = new Date(s);
    if (!isNaN(dt)) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

const emptyItem = () => ({ description: '', qty: 1, rate: 0 });

const emptyForm = () => ({
  invoiceNumber: '',
  date: todayIST(),
  orderNo: '',
  orderDate: '',
  billing: { name: '', address: '', phone: '', email: '', gst: '' },
  hsn: '85371000',
  vendorCode: '',
  gstPercent: 18,
  items: [emptyItem()],
});

// ────── MAIN COMPONENT ──────
function IAInvoiceForm({ socket }) {
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const mountedRef = useRef(true);
  const abortRef = useRef(null);
  const { notifySuccess, notifyError } = useNotify();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ────── LIVE TOTALS ──────
  // Mirrors the validItems filter in handleSubmit below, so the preview never
  // shows a total that includes a row (e.g. rate filled in before description)
  // that would actually get dropped from what's submitted to the PDF.
  const { totalAmount, gstAmount, grandTotal, amountInWords } = useMemo(() => {
    const items = (form.items || []).filter((i) => i.description.trim() && Number(i.qty) > 0);
    const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
    const gstPct = Number(form.gstPercent) || 0;
    const gst = total * (gstPct / 100);
    const grand = Math.round((total + gst) * 100) / 100;
    const rounded = Math.round(grand);
    const words = rounded > 0 ? toWords(rounded) : 'zero';
    const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
    return { totalAmount: total, gstAmount: gst, grandTotal: grand, amountInWords: `INR ${capitalized} Only` };
  }, [form.items, form.gstPercent]);

  // ────── ADD/REMOVE ROWS ──────
  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  const removeItem = (i) =>
    setForm((prev) => {
      if (prev.items.length === 1) return prev;
      return { ...prev, items: prev.items.filter((_, idx) => idx !== i) };
    });
  const setItemField = (i, field, value) =>
    setForm((prev) => {
      const items = [...prev.items];
      items[i] = { ...items[i], [field]: value };
      return { ...prev, items };
    });

  // ────── SUBMIT → GENERATE PDF ──────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in again'); return; }
    if (!form.invoiceNumber.trim()) { notifyError('Invoice number is required'); return; }
    if (!form.billing.name.trim()) { notifyError('Billing name is required'); return; }

    const validItems = form.items.filter((i) => i.description.trim() && Number(i.qty) > 0);
    if (validItems.length === 0) { notifyError('Add at least one item with a description and qty'); return; }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = { ...form, items: validItems };

      const response = await axios.post(
        `${API_URL}/api/invoice/generate`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
          signal: controller.signal,
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = response.headers['content-disposition']
        ?.match(/filename="?(.+)"?/)?.[1]
        || `INVOICE_${form.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      notifySuccess('Invoice generated & downloaded!');
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      if (err.name === 'CanceledError') return;
      notifyError(err.response?.data?.error || 'Failed to generate PDF');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  };

  const resetForm = () => setForm(emptyForm());
  const openModal = () => { resetForm(); setIsModalOpen(true); };
  const closeModal = () => setIsModalOpen(false);

  // ────── RENDER ──────
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden p-6">
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10">
        <div className="text-center mb-12 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <FileText className="w-8 h-8 text-white animate-bounce" />
            </div>
          </div>
          <div className="flex justify-center mb-3">
            <span className="inline-flex items-center bg-white border border-amber-200 text-amber-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm">
              INTUTE AI
            </span>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            Invoice Generator
          </h1>
          <p className="text-sm text-gray-500 mt-2">Manual Entry • Auto GST + Totals • Instant PDF Download</p>
        </div>

        <div className="max-w-7xl mx-auto mb-8 flex justify-center">
          <button
            onClick={openModal}
            className="px-8 py-4 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl flex items-center gap-3 transition-all text-lg"
          >
            <Plus className="w-6 h-6" /> Generate New Invoice
          </button>
        </div>

        <div className="max-w-4xl mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 text-center">
          <p className="text-gray-600">Click above to fill in invoice details. Company header, GST, and bank details are added automatically.</p>
          <p className="text-sm text-amber-600 mt-2">Auto-calculate GST & Total • Real-time Amount in Words • Instant PDF Download</p>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        className="bg-white rounded-2xl p-8 max-w-5xl mx-auto mt-10 shadow-2xl outline-none overflow-y-auto max-h-screen"
        overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      >
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Generate Invoice</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Invoice Meta */}
          <div className="bg-amber-50 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-amber-800 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Invoice Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice No. *</label>
                <input
                  type="text" required placeholder="e.g. 2026-27/Ak/009"
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 font-mono"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                  value={toYMD(form.date)}
                  onChange={(e) => setForm({ ...form, date: toYMD(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order No. <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                  value={form.orderNo}
                  onChange={(e) => setForm({ ...form, orderNo: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                  value={toYMD(form.orderDate)}
                  onChange={(e) => setForm({ ...form, orderDate: toYMD(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HSN</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 font-mono"
                  value={form.hsn}
                  onChange={(e) => setForm({ ...form, hsn: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Code <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                  value={form.vendorCode}
                  onChange={(e) => setForm({ ...form, vendorCode: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Billing Details */}
          <div className="bg-orange-50 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-orange-800 flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Billing / Customer Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Company / Customer Name *</label>
                <input
                  type="text" required placeholder="e.g. Fluisys Technologies"
                  className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300"
                  value={form.billing.name}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, name: e.target.value } })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
                <textarea
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300 resize-none"
                  value={form.billing.address}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, address: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300"
                  value={form.billing.phone}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, phone: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300"
                  value={form.billing.email}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, email: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300 font-mono"
                  value={form.billing.gst}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, gst: e.target.value } })}
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-green-50 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-green-800 flex items-center gap-2">
                <Package className="w-5 h-5" /> Items
              </h3>
              <button type="button" onClick={addItem} className="text-green-600 hover:bg-green-100 p-2 rounded-lg">
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {form.items.map((item, i) => {
              const lineTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0);
              return (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text" placeholder="Description"
                    className="flex-1 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                    value={item.description}
                    onChange={(e) => setItemField(i, 'description', e.target.value)}
                  />
                  <input
                    type="number" min="0" step="1" placeholder="Qty"
                    className="w-20 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                    value={item.qty}
                    onChange={(e) => setItemField(i, 'qty', Number(e.target.value) || 0)}
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Rate"
                    className="w-28 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                    value={item.rate}
                    onChange={(e) => setItemField(i, 'rate', Number(e.target.value) || 0)}
                  />
                  <div className="w-28 px-3 py-2 text-right text-sm font-medium text-green-900">
                    ₹{lineTotal.toFixed(2)}
                  </div>
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-red-600 hover:bg-red-100 p-2 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-amber-900">Totals</h3>
              <label className="flex items-center gap-2">
                <span className="text-sm text-amber-700">GST %</span>
                <input
                  type="number" min="0" max="100" step="0.01"
                  className="w-20 px-3 py-2 rounded-lg border border-amber-300 bg-white text-amber-900 focus:ring-4 focus:ring-amber-400"
                  value={form.gstPercent}
                  onChange={(e) => setForm({ ...form, gstPercent: Number(e.target.value) || 0 })}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
              <div>
                <p className="text-xs text-amber-700 uppercase tracking-wide">Total Amount</p>
                <p className="text-lg font-bold text-amber-900">₹{totalAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-amber-700 uppercase tracking-wide">GST ({form.gstPercent || 0}%)</p>
                <p className="text-lg font-bold text-amber-900">₹{gstAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-amber-700 uppercase tracking-wide">Grand Total</p>
                <p className="text-lg font-bold text-amber-900">₹{grandTotal.toFixed(2)}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount in Words</label>
              <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 italic">
                {amountInWords}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-2">
            <button type="button" onClick={closeModal} className="px-8 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-xl shadow-lg hover:shadow-xl flex items-center gap-3 transition-all disabled:opacity-70"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</>
              ) : (
                <><Download className="w-5 h-5" /> Generate PDF</>
              )}
            </button>
          </div>
        </form>
      </Modal>

</div>
  );
}

export default IAInvoiceForm;
