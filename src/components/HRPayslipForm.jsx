// ──────────────────────────────────────────────────────────────
// HRPayslipForm.jsx
// Manual Payslip Generator — HR Only
// 100% matches your ActivitiesPage style & UX
// No DB, No Auto-Calc (optional toggle), Full Control
// ──────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Loader2, Download, Trash2, Edit2, Users, Calendar } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import axios from 'axios';
import Modal from 'react-modal';
import { toWords } from 'number-to-words';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// ────── DATE HELPERS (Same as ActivitiesPage) ──────
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

const formatDisplayDate = (value) => {
  const ymd = toYMD(value);
  if (!ymd) return '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ────── MAIN COMPONENT ──────
function HRPayslipForm({ socket }) {
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [autoCalc, setAutoCalc] = useState(true); // Optional: auto net pay

  const [form, setForm] = useState({
    employee: { name: '', id: '' },
    period: '',
    payDate: todayIST(),
    paidDays: 31,
    lopDays: 0,
    netPay: 0,
    earnings: [{ label: 'Basic', amount: 0 }],
    deductions: [{ label: 'Income Tax', amount: 0 }],
  });

  const mountedRef = useRef(true);
  const abortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ────── AUTO NET PAY & WORDS ──────
  const { gross, totalDed, netPay, amountInWords } = useMemo(() => {
    const earnings = form.earnings || [];
    const deductions = form.deductions || [];
    const gross = earnings.reduce((s, e) => s + Number(e.amount || 0), 0);
    const totalDed = deductions.reduce((s, d) => s + Number(d.amount || 0), 0);
    const net = autoCalc ? gross - totalDed : Number(form.netPay || 0);
    const words = net > 0 ? toWords(Math.round(net)) : 'zero';
    const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
    return {
      gross,
      totalDed,
      netPay: net,
      amountInWords: `Indian Rupee ${capitalized} Only`,
    };
  }, [form.earnings, form.deductions, form.netPay, autoCalc]);

  useEffect(() => {
    if (autoCalc) {
      setForm((prev) => ({ ...prev, netPay }));
    }
  }, [netPay, autoCalc]);

  // ────── ADD/REMOVE ROWS ──────
  const addEarning = () => {
    setForm((prev) => ({
      ...prev,
      earnings: [...prev.earnings, { label: '', amount: 0 }],
    }));
  };

  const addDeduction = () => {
    setForm((prev) => ({
      ...prev,
      deductions: [...prev.deductions, { label: '', amount: 0 }],
    }));
  };

  const removeEarning = (i) => {
    setForm((prev) => ({
      ...prev,
      earnings: prev.earnings.filter((_, idx) => idx !== i),
    }));
  };

  const removeDeduction = (i) => {
    setForm((prev) => ({
      ...prev,
      deductions: prev.deductions.filter((_, idx) => idx !== i),
    }));
  };

  // ────── SUBMIT → GENERATE PDF ──────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in again');
      return;
    }

    if (!form.employee.name || !form.period) {
      toast.error('Employee name and period are required');
      return;
    }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = {
        ...form,
        netPay: netPay,
        earnings: form.earnings.filter((e) => e.label && e.amount > 0),
        deductions: form.deductions.filter((d) => d.label && d.amount >= 0),
      };

      const response = await axios.post(
        `${API_URL}/api/payslip/generate`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
          signal: controller.signal,
        }
      );

      // Trigger download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = response.headers['content-disposition']
        ?.match(/filename="?(.+)"?/)?.[1]
        || `PAYSLIP_${form.employee.name.replace(/\s+/g, '_')}_${form.period.replace(/\s+/g, '_')}.pdf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Payslip generated & downloaded!');
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      if (err.name === 'CanceledError') return;
      toast.error(err.response?.data?.error || 'Failed to generate PDF');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  };

  const resetForm = () => {
    setForm({
      employee: { name: '', id: '' },
      period: '',
      payDate: todayIST(),
      paidDays: 31,
      lopDays: 0,
      netPay: 0,
      earnings: [{ label: 'Basic', amount: 0 }],
      deductions: [{ label: 'Income Tax', amount: 0 }],
    });
  };

  const openModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // ────── RENDER ──────
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden p-6">
      {/* Background Blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10">
        {/* Header */}
        <div className="text-center mb-12 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <Download className="w-8 h-8 text-white animate-bounce" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            Payslip Generator
          </h1>
          <p className="text-sm text-gray-500 mt-2">HR-Only • Manual Entry • Pixel-Perfect PDF</p>
        </div>

        {/* Action */}
        <div className="max-w-7xl mx-auto mb-8 flex justify-center">
          <button
            onClick={openModal}
            className="px-8 py-4 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl flex items-center gap-3 transition-all text-lg"
          >
            <Plus className="w-6 h-6" /> Generate New Payslip
          </button>
        </div>

        {/* Info Card */}
        <div className="max-w-4xl mx-auto bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 text-center">
          <p className="text-gray-600">
            Click above to manually fill payslip details. Every field is under your control.
          </p>
          <p className="text-sm text-amber-600 mt-2">
            Auto-calculate Net Pay • Real-time Amount in Words • Instant PDF Download
          </p>
        </div>
      </div>

      {/* ────── MODAL FORM ────── */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        className="bg-white rounded-2xl p-8 max-w-5xl mx-auto mt-10 shadow-2xl outline-none overflow-y-auto max-h-screen"
        overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      >
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Generate Payslip</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Employee Info */}
          <div className="bg-amber-50 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-amber-800 flex items-center gap-2">
              <Users className="w-5 h-5" /> Employee Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee Name *</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                  value={form.employee.name}
                  onChange={(e) => setForm({ ...form, employee: { ...form.employee, name: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                  value={form.employee.id}
                  onChange={(e) => setForm({ ...form, employee: { ...form.employee, id: e.target.value } })}
                />
              </div>
            </div>
          </div>

          {/* Pay Period */}
          <div className="bg-orange-50 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-orange-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Pay Period
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period *</label>
                <input
                  type="text"
                  required
                  placeholder="SEPTEMBER 2025"
                  className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pay Date</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300"
                  value={toYMD(form.payDate)}
                  onChange={(e) => setForm({ ...form, payDate: toYMD(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Days</label>
                  <input
                    type="number"
                    min="0"
                    max="31"
                    className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300"
                    value={form.paidDays}
                    onChange={(e) => setForm({ ...form, paidDays: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">LOP Days</label>
                  <input
                    type="number"
                    min="0"
                    max="31"
                    className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-4 focus:ring-orange-300"
                    value={form.lopDays}
                    onChange={(e) => setForm({ ...form, lopDays: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Earnings */}
          <div className="bg-green-50 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-green-800">Earnings</h3>
              <button
                type="button"
                onClick={addEarning}
                className="text-green-600 hover:bg-green-100 p-2 rounded-lg"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {form.earnings.map((e, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Label"
                  className="flex-1 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                  value={e.label}
                  onChange={(ev) => {
                    const newEarnings = [...form.earnings];
                    newEarnings[i].label = ev.target.value;
                    setForm({ ...form, earnings: newEarnings });
                  }}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-32 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                  value={e.amount}
                  onChange={(ev) => {
                    const newEarnings = [...form.earnings];
                    newEarnings[i].amount = Number(ev.target.value) || 0;
                    setForm({ ...form, earnings: newEarnings });
                  }}
                />
                {form.earnings.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEarning(i)}
                    className="text-red-600 hover:bg-red-100 p-2 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="text-right font-medium text-green-800">
              Gross: ₹{gross.toFixed(2)}
            </div>
          </div>

          {/* Deductions */}
          <div className="bg-red-50 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-red-800">Deductions</h3>
              <button
                type="button"
                onClick={addDeduction}
                className="text-red-600 hover:bg-red-100 p-2 rounded-lg"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {form.deductions.map((d, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Label"
                  className="flex-1 px-4 py-2 rounded-lg border border-red-200 focus:ring-2 focus:ring-red-300"
                  value={d.label}
                  onChange={(ev) => {
                    const newDeductions = [...form.deductions];
                    newDeductions[i].label = ev.target.value;
                    setForm({ ...form, deductions: newDeductions });
                  }}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-32 px-4 py-2 rounded-lg border border-red-200 focus:ring-2 focus:ring-red-300"
                  value={d.amount}
                  onChange={(ev) => {
                    const newDeductions = [...form.deductions];
                    newDeductions[i].amount = Number(ev.target.value) || 0;
                    setForm({ ...form, deductions: newDeductions });
                  }}
                />
                {form.deductions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeDeduction(i)}
                    className="text-red-600 hover:bg-red-100 p-2 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="text-right font-medium text-red-800">
              Total Deductions: ₹{totalDed.toFixed(2)}
            </div>
          </div>

          {/* Net Pay & Words */}
          <div className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-amber-900">Net Pay</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalc}
                  onChange={(e) => setAutoCalc(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                />
                <span className="text-sm text-amber-700">Auto-calculate</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Net Pay (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-3 rounded-xl border border-amber-300 bg-white font-bold text-amber-900 focus:ring-4 focus:ring-amber-400"
                  value={netPay.toFixed(2)}
                  readOnly={autoCalc}
                  onChange={(e) => !autoCalc && setForm({ ...form, netPay: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount in Words</label>
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 italic">
                  {amountInWords}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-6">
            <button
              type="button"
              onClick={closeModal}
              className="px-8 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-xl shadow-lg hover:shadow-xl flex items-center gap-3 transition-all disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" /> Generating...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" /> Generate PDF
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      <ToastContainer position="top-right" />
    </div>
  );
}

export default HRPayslipForm;