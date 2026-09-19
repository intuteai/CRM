// ──────────────────────────────────────────────────────────────
// IAHRPayslipForm.jsx
// Manual Payslip Generator — IA HR Only
// Moved from src/components/hr/HRPayslipForm.jsx
// ──────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Loader2, Download, Trash2, Users, Calendar } from 'lucide-react';
import axios from 'axios';
import Modal from 'react-modal';
import { toWords } from 'number-to-words';
import { useNotify } from '../../hooks/useNotify';
import PeoplePage from '../shared/PeoplePage';

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

const formatDisplayDate = (value) => {
  const ymd = toYMD(value);
  if (!ymd) return '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ────── MAIN COMPONENT ──────
function IAHRPayslipForm({ socket }) {
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [autoCalc, setAutoCalc] = useState(true);

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
  const { notifySuccess, notifyError } = useNotify();

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
  const addEarning = () =>
    setForm((prev) => ({ ...prev, earnings: [...prev.earnings, { label: '', amount: 0 }] }));

  const addDeduction = () =>
    setForm((prev) => ({ ...prev, deductions: [...prev.deductions, { label: '', amount: 0 }] }));

  const removeEarning = (i) =>
    setForm((prev) => ({ ...prev, earnings: prev.earnings.filter((_, idx) => idx !== i) }));

  const removeDeduction = (i) =>
    setForm((prev) => ({ ...prev, deductions: prev.deductions.filter((_, idx) => idx !== i) }));

  // ────── SUBMIT → GENERATE PDF ──────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in again'); return; }
    if (!form.employee.name || !form.period) { notifyError('Employee name and period are required'); return; }

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

      notifySuccess('Payslip generated & downloaded!');
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

  const openModal = () => { resetForm(); setIsModalOpen(true); };
  const closeModal = () => setIsModalOpen(false);

  // ────── RENDER ──────
  return (
    <PeoplePage
      title="Payslip Generator"
      subtitle="HR-Only • Manual Entry • Pixel-Perfect PDF"
      actions={
        <button
          onClick={openModal}
          className="px-5 py-3 bg-gold-500 text-navy-900 font-semibold rounded-lg hover:bg-gold-400 flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" /> Generate New Payslip
        </button>
      }
    >
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-6 text-center">
          <p className="text-gray-600">Click above to manually fill payslip details. Every field is under your control.</p>
          <p className="text-sm text-gold-600 mt-2">Auto-calculate Net Pay • Real-time Amount in Words • Instant PDF Download</p>
        </div>

      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        className="bg-white rounded-xl p-4 sm:p-6 max-w-5xl mx-auto mt-0 sm:mt-10 shadow-2xl outline-none overflow-y-auto max-h-[90vh] sm:max-h-screen w-[calc(100vw-2rem)] sm:w-auto"
        overlayClassName="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50"
      >
        <h2 className="font-display text-xl font-bold text-navy-800 mb-5">Generate Payslip</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Employee Info */}
          <div className="bg-navy-50 rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold text-navy-800 flex items-center gap-2">
              <Users className="w-5 h-5" /> Employee Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Employee Name *</label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-3 rounded-lg border border-navy-100 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={form.employee.name}
                  onChange={(e) => setForm({ ...form, employee: { ...form.employee, name: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Employee ID</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg border border-navy-100 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={form.employee.id}
                  onChange={(e) => setForm({ ...form, employee: { ...form.employee, id: e.target.value } })}
                />
              </div>
            </div>
          </div>

          {/* Pay Period */}
          <div className="bg-blue-50 rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold text-blue-800 flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Pay Period
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Period *</label>
                <input
                  type="text"
                  required
                  placeholder="SEPTEMBER 2025"
                  className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Pay Date</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={toYMD(form.payDate)}
                  onChange={(e) => setForm({ ...form, payDate: toYMD(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-navy-800 mb-1">Paid Days</label>
                  <input
                    type="number" min="0" max="31"
                    className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                    value={form.paidDays}
                    onChange={(e) => setForm({ ...form, paidDays: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-navy-800 mb-1">LOP Days</label>
                  <input
                    type="number" min="0" max="31"
                    className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                    value={form.lopDays}
                    onChange={(e) => setForm({ ...form, lopDays: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Earnings */}
          <div className="bg-green-50 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-green-800">Earnings</h3>
              <button type="button" onClick={addEarning} className="text-green-600 hover:bg-green-100 p-2 rounded-lg">
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {form.earnings.map((e, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text" placeholder="Label"
                  className="flex-1 min-w-0 px-4 py-2 rounded-lg border border-green-200 bg-white focus:ring-2 focus:ring-green-300 focus:outline-none"
                  value={e.label}
                  onChange={(ev) => {
                    const newEarnings = [...form.earnings];
                    newEarnings[i].label = ev.target.value;
                    setForm({ ...form, earnings: newEarnings });
                  }}
                />
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  className="w-28 sm:w-32 shrink-0 px-4 py-2 rounded-lg border border-green-200 bg-white focus:ring-2 focus:ring-green-300 focus:outline-none"
                  value={e.amount}
                  onChange={(ev) => {
                    const newEarnings = [...form.earnings];
                    newEarnings[i].amount = Number(ev.target.value) || 0;
                    setForm({ ...form, earnings: newEarnings });
                  }}
                />
                {form.earnings.length > 1 && (
                  <button type="button" onClick={() => removeEarning(i)} className="text-red-600 hover:bg-red-100 p-2 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="text-right font-medium text-green-800">Gross: ₹{gross.toFixed(2)}</div>
          </div>

          {/* Deductions */}
          <div className="bg-red-50 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-red-800">Deductions</h3>
              <button type="button" onClick={addDeduction} className="text-red-600 hover:bg-red-100 p-2 rounded-lg">
                <Plus className="w-5 h-5" />
              </button>
            </div>
            {form.deductions.map((d, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text" placeholder="Label"
                  className="flex-1 min-w-0 px-4 py-2 rounded-lg border border-red-200 bg-white focus:ring-2 focus:ring-red-300 focus:outline-none"
                  value={d.label}
                  onChange={(ev) => {
                    const newDeductions = [...form.deductions];
                    newDeductions[i].label = ev.target.value;
                    setForm({ ...form, deductions: newDeductions });
                  }}
                />
                <input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  className="w-28 sm:w-32 shrink-0 px-4 py-2 rounded-lg border border-red-200 bg-white focus:ring-2 focus:ring-red-300 focus:outline-none"
                  value={d.amount}
                  onChange={(ev) => {
                    const newDeductions = [...form.deductions];
                    newDeductions[i].amount = Number(ev.target.value) || 0;
                    setForm({ ...form, deductions: newDeductions });
                  }}
                />
                {form.deductions.length > 1 && (
                  <button type="button" onClick={() => removeDeduction(i)} className="text-red-600 hover:bg-red-100 p-2 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="text-right font-medium text-red-800">Total Deductions: ₹{totalDed.toFixed(2)}</div>
          </div>

          {/* Net Pay & Words */}
          <div className="bg-gold-400/20 border border-gold-400/40 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800">Net Pay</h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalc}
                  onChange={(e) => setAutoCalc(e.target.checked)}
                  className="w-4 h-4 text-gold-500 rounded focus:ring-gold-400"
                />
                <span className="text-sm text-navy-800">Auto-calculate</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Net Pay (₹)</label>
                <input
                  type="number" min="0" step="0.01"
                  className="w-full px-4 py-3 rounded-lg border border-gold-400/60 bg-white font-bold text-navy-800 focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={netPay.toFixed(2)}
                  readOnly={autoCalc}
                  onChange={(e) => !autoCalc && setForm({ ...form, netPay: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Amount in Words</label>
                <div className="px-4 py-3 rounded-lg bg-white border border-gold-400/60 text-navy-800 italic">
                  {amountInWords}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-6">
            <button type="button" onClick={closeModal} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
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

    </PeoplePage>
  );
}

export default IAHRPayslipForm;