// ProformaForm.jsx
import React, { useState, useMemo, useRef } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { Plus, Download, Trash2, FileText } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
    
Modal.setAppElement('#root');

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

const formatINR = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Fixed RTGS values (display only)
const FIXED_RTGS = {
  account: '923020007963713',
  bank: 'AXIS BANK',
  branch: 'SLF MALL FARIDABAD',
  ifsc: 'UTIB0004676'
};

export default function ProformaForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  // Proforma no kept as previous default, but the main screen will NOT display it.
  const DEFAULT_PROFORMA = '086/25-26';
  // DEFAULT_DATE auto-picks today (YYYY-MM-DD)
  const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    // proforma_no and date prefilled inside the modal form
    proforma_no: DEFAULT_PROFORMA,
    date: DEFAULT_DATE,
    order_no: '',
    to_name: '',
    to_address: '',
    to_gst_number: '',
    // one blank item row (editable)
    items: [
      {
        description: '',
        qty: '',
        rate: '',
        total_price: ''
      }
    ],
    gst_percent: ''
  });

  const { subtotal, gstAmount, grandTotal } = useMemo(() => {
    const subtotal = (form.items || []).reduce((s, it) => {
      const qty = Number(it.qty || 0);
      const rate = Number(it.rate || 0);
      const total =
        it.total_price != null && String(it.total_price).trim() !== ''
          ? Number(it.total_price)
          : qty * rate;
      return s + (Number.isFinite(total) ? total : 0);
    }, 0);

    const gstAmount = +(subtotal * Number(form.gst_percent || 0) / 100);
    const grandTotal = subtotal + gstAmount;

    return { subtotal, gstAmount, grandTotal };
  }, [form.items, form.gst_percent]);

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { description: '', qty: '', rate: '', total_price: '' }]
    }));
  };

  const removeItem = (i) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== i)
    }));

  // updateItem handles numeric normalization; empty inputs are accepted visually
  const updateItem = (i, field, val) => {
    setForm((prev) => {
      const items = [...prev.items];
      const item = { ...items[i] };

      if (field === 'qty' || field === 'rate' || field === 'total_price') {
        if (val === '' || val === null) {
          item[field] = '';
        } else {
          item[field] = Number(val);
        }
        if (field !== 'total_price') {
          const q = Number(item.qty || 0);
          const r = Number(item.rate || 0);
          item.total_price = (String(item.qty) === '' && String(item.rate) === '') ? '' : +(q * r);
        }
      } else {
        item[field] = val;
      }

      items[i] = item;
      return { ...prev, items };
    });
  };

  const handleGenerate = async (ev) => {
    ev.preventDefault();
    const token = localStorage.getItem('token');

    if (!token) {
      toast.error('Please login first.');
      return;
    }

    if (!form.proforma_no) {
      toast.error('Proforma No is required.');
      return;
    }

    setLoading(true);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = {
        proforma_no: form.proforma_no,
        date: form.date || null,
        order_no: form.order_no,
        to_name: form.to_name,
        to_address: form.to_address,
        to_gst_number: form.to_gst_number,
        items: form.items.map((it, idx) => {
          const qty = Number(it.qty || 0);
          const rate = Number(it.rate || 0);
          const total = (it.total_price != null && String(it.total_price).trim() !== '')
            ? Number(it.total_price)
            : qty * rate;
          return {
            sno: idx + 1,
            description: (it.description && String(it.description).trim()) ? it.description : '—',
            qty: qty,
            rate: rate,
            total_price: Number.isFinite(total) ? total : 0
          };
        }),
        gst_percent: Number(form.gst_percent || 0)
      };

      const response = await axios.post(`${API_URL}/api/proforma/generate`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
        signal: controller.signal
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');

      const cd = response.headers['content-disposition'];
      let filename = `PROFORMA_${(form.proforma_no || 'proforma').replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;

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

      toast.success('Proforma PDF downloaded.');
      setIsOpen(false);
    } catch (err) {
      toast.error('Failed to generate PDF.');
      console.error(err);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  // helper to show friendly date (DD/MM/YYYY)
  const displayDate = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <ToastContainer position="top-right" />

      <div className="max-w-5xl mx-auto text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 tracking-tight">Proforma Generator</h1>

        {/* NOTE: removed the small "Proforma No / Date" text from the main screen as requested */}

        {/* --- CENTERED GREEN CREATE CARD --- */}
        <div className="flex justify-center mb-12">
          <button
            onClick={() => setIsOpen(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 rounded-xl shadow-md flex flex-col items-center gap-2 transition-all"
          >
            <FileText className="w-10 h-10" />
            <span className="text-lg font-semibold">Create New Proforma</span>
          </button>
        </div>
      </div>

      {/* =================== MODAL FORM =================== */}
      <Modal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        className="max-w-4xl mx-auto mt-8 bg-white rounded-xl p-6 outline-none shadow-xl"
        overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
      >
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Create Proforma Invoice</h3>

        {/* Display current Proforma meta (editable fields remain below) */}
        <div className="text-sm text-gray-600 mb-4">
          <span className="mr-6">Proforma Invoice No.: <strong>{form.proforma_no || DEFAULT_PROFORMA}</strong></span>
          <span>Date: <strong>{displayDate(form.date || DEFAULT_DATE)}</strong></span>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">

          {/* Top fields */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600">Proforma No *</label>
              <input
                value={form.proforma_no}
                onChange={(e) => setForm({ ...form, proforma_no: e.target.value })}
                required
                placeholder="e.g. 086/25-26"
                className="w-full border rounded px-2 py-1 mt-1"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border rounded px-2 py-1 mt-1"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600">Order No</label>
              <input
                value={form.order_no}
                onChange={(e) => setForm({ ...form, order_no: e.target.value })}
                placeholder="Customer PO / Order number"
                className="w-full border rounded px-2 py-1 mt-1"
              />
            </div>
          </div>

          {/* To Section */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600">To (Name)</label>
              <input
                value={form.to_name}
                onChange={(e) => setForm({ ...form, to_name: e.target.value })}
                placeholder="Customer / Company name"
                className="w-full border rounded px-2 py-1 mt-1"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600">GST No. (To)</label>
              <input
                value={form.to_gst_number}
                onChange={(e) => setForm({ ...form, to_gst_number: e.target.value })}
                placeholder="GSTIN (optional)"
                className="w-full border rounded px-2 py-1 mt-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600">To (Address)</label>
            <textarea
              rows={3}
              value={form.to_address}
              onChange={(e) => setForm({ ...form, to_address: e.target.value })}
              placeholder="Customer address, city, pincode"
              className="w-full border rounded px-2 py-1 mt-1"
            />
          </div>

          {/* Items */}
          <div className="bg-gray-50 p-3 rounded">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold">Items</div>
              <button
                type="button"
                onClick={addItem}
                className="text-green-600 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-start mb-2">
                <div className="col-span-1 text-center pt-2">{idx + 1}</div>

                <textarea
                  rows={2}
                  className="col-span-6 border rounded px-2 py-1"
                  value={it.description}
                  onChange={(e) => updateItem(idx, 'description', e.target.value)}
                  placeholder="Description — e.g. Servo Motor-125/5D SPM"
                />

                <input
                  type="number"
                  className="col-span-1 border rounded px-2 py-1"
                  value={it.qty}
                  onChange={(e) => updateItem(idx, 'qty', e.target.value)}
                  placeholder="Qty (e.g. 1)"
                />

                <input
                  type="number"
                  className="col-span-2 border rounded px-2 py-1"
                  value={it.rate}
                  onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                  placeholder="Rate (e.g. 75000)"
                />

                <input
                  type="number"
                  className="col-span-2 border rounded px-2 py-1"
                  value={it.total_price}
                  onChange={(e) => updateItem(idx, 'total_price', e.target.value)}
                  placeholder="Total (auto-calculated)"
                />

                <div className="col-span-1 text-right pt-2">
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="text-red-600">
                      <Trash2 />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="text-right mt-2 space-y-1">
            <div className="text-sm text-gray-700">Subtotal: ₹ {formatINR(subtotal)}</div>

            <div className="flex justify-end items-center gap-2">
              <div className="text-sm">GST @</div>
              <input
                type="number"
                className="w-20 border rounded px-2 py-1"
                value={form.gst_percent}
                onChange={(e) => setForm({ ...form, gst_percent: e.target.value })}
                placeholder="e.g. 18"
              />
              <div className="text-sm">%</div>
              <div className="text-sm font-medium">: ₹ {formatINR(gstAmount)}</div>
            </div>

            <div className="font-bold text-lg text-gray-800">Grand Total: ₹ {formatINR(grandTotal)}</div>
          </div>

          {/* RTGS Box */}
          <div className="bg-white border rounded p-3">
            <div className="font-semibold mb-2">RTGS Details (Fixed)</div>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <div className="text-xs text-gray-500">Account Number</div>
                <div className="font-medium">{FIXED_RTGS.account}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Bank</div>
                <div className="font-medium">{FIXED_RTGS.bank}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Branch</div>
                <div className="font-medium">{FIXED_RTGS.branch}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">IFSC</div>
                <div className="font-medium">{FIXED_RTGS.ifsc}</div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 border rounded">Cancel</button>

            <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded shadow flex items-center">
              <Download className="w-4 h-4 inline mr-2" />
              {loading ? 'Generating...' : 'Generate PDF'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
