// ──────────────────────────────────────────────────────────────
// IAInvoiceForm.jsx
// Invoice Generator + History — Intute AI (HR + Employee)
// ──────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Plus, Loader2, Download, Trash2, Building2, FileText, Package,
  Search, X, Hash, Calendar, User, RotateCcw, Eye, Upload, IndianRupee,
} from 'lucide-react';
import axios from 'axios';
import debounce from 'lodash.debounce';
import Modal from 'react-modal';
import { toWords } from 'number-to-words';
import { useNotify } from '../../hooks/useNotify';
import PeoplePage from '../shared/PeoplePage';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const MAX_CACHED = 200;

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

const formatDate = (v) => {
  if (!v) return '—';
  const ymd = toYMD(v);
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

const downloadBlob = (data, headers, fallbackName) => {
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  const filename = headers['content-disposition']?.match(/filename="?(.+)"?/)?.[1] || fallbackName;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Opens a PDF blob inline in a new tab instead of forcing a download. The
// object URL is deliberately NOT revoked immediately — the new tab needs it
// to still be valid while it loads/renders the PDF.
const viewBlob = (data) => {
  const url = window.URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener,noreferrer');
};

const emptyUploadForm = () => ({
  invoiceNumber: '', date: '', customerName: '', grandTotal: '', file: null,
});

// ────── MAIN COMPONENT ──────
function IAInvoiceForm({ socket }) {
  // Create modal state
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  // Upload-old-invoice modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(emptyUploadForm());
  const [uploadLoading, setUploadLoading] = useState(false);

  // History list state
  const [invoices, setInvoices] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [viewingId, setViewingId] = useState(null);

  const mountedRef = useRef(true);
  const abortRef = useRef(null);
  const listAbortRef = useRef(null);
  const loadingRef = useRef(false);
  const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotify();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
      if (listAbortRef.current) listAbortRef.current.abort();
    };
  }, []);

  // ────── FETCH HISTORY ──────
  const fetchInvoices = useCallback(async (reset = false, currentCursor = null, currentSearch = '') => {
    if (loadingRef.current) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    loadingRef.current = true;
    setListLoading(true);
    if (listAbortRef.current) listAbortRef.current.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    try {
      const params = { limit: 50, ...(currentSearch ? { search: currentSearch } : {}), ...(currentCursor && !reset ? { cursor: currentCursor } : {}) };
      const res = await axios.get(`${API_URL}/api/invoice-records`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const newData = res.data?.data || [];
      setInvoices((prev) => (reset ? newData : [...prev, ...newData]).slice(0, MAX_CACHED));
      setTotal(res.data?.total || 0);
      setCursor(res.data?.cursor || null);
      setHasMore(Boolean(res.data?.cursor));
    } catch (err) {
      if (err?.name === 'CanceledError') return;
      if (mountedRef.current) notifyError(err.response?.data?.error || 'Failed to load invoices');
    } finally {
      if (mountedRef.current) { setListLoading(false); loadingRef.current = false; listAbortRef.current = null; }
    }
  }, [notifyError]);

  useEffect(() => { fetchInvoices(true, null, search); }, [fetchInvoices, search]);

  // ────── SOCKET ──────
  useEffect(() => {
    if (!socket) return;
    const onCreate = (inv) => {
      setInvoices((prev) => [inv, ...prev.filter((x) => x.invoiceId !== inv.invoiceId)].slice(0, MAX_CACHED));
      setTotal((t) => t + 1);
      notifyInfo(`New invoice: ${inv?.invoiceNumber || ''}`, { autoClose: 3000 });
    };
    const onDelete = ({ invoiceId }) => {
      setInvoices((prev) => prev.filter((x) => x.invoiceId !== invoiceId));
      setTotal((t) => Math.max(0, t - 1));
      notifyWarning('Invoice deleted', { autoClose: 3000 });
    };
    socket.on('invoice_records:created', onCreate);
    socket.on('invoice_records:deleted', onDelete);
    return () => {
      socket.off('invoice_records:created', onCreate);
      socket.off('invoice_records:deleted', onDelete);
    };
  }, [socket, notifyInfo, notifyWarning]);

  // ────── DEBOUNCED SEARCH ──────
  const debouncedSearch = useMemo(() => debounce((v) => { if (mountedRef.current) setSearch(v); }, 300), []);
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  const debouncedLoadMore = useMemo(() => debounce(() => {
    if (cursor && !listLoading && !loadingRef.current) fetchInvoices(false, cursor, search);
  }, 300), [cursor, listLoading, fetchInvoices, search]);
  useEffect(() => () => debouncedLoadMore.cancel(), [debouncedLoadMore]);

  const resetSearch = () => { setSearchInput(''); setSearch(''); };

  // ────── LIVE TOTALS (create form) ──────
  // Mirrors the validItems filter in handleSubmit below, so the preview never
  // shows a total that includes a row (e.g. rate filled in before description)
  // that would actually get dropped from what's submitted.
  const { totalAmount, gstAmount, grandTotal, amountInWords } = useMemo(() => {
    const items = (form.items || []).filter((i) => i.description.trim() && Number(i.qty) > 0);
    const total_ = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
    const gstPct = Number(form.gstPercent) || 0;
    const gst = total_ * (gstPct / 100);
    const grand = Math.round((total_ + gst) * 100) / 100;
    const rounded = Math.round(grand);
    const words = rounded > 0 ? toWords(rounded) : 'zero';
    const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
    return { totalAmount: total_, gstAmount: gst, grandTotal: grand, amountInWords: `INR ${capitalized} Only` };
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

  // ────── SUBMIT → SAVE + DOWNLOAD PDF ──────
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

      // Save the record first, then re-download via its id so the PDF is
      // always generated from exactly what's stored (server-computed totals),
      // never from a second, possibly-drifted copy of the same form data.
      const createRes = await axios.post(
        `${API_URL}/api/invoice-records`,
        payload,
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );
      const invoiceId = createRes.data.invoiceId;

      const pdfRes = await axios.get(
        `${API_URL}/api/invoice-records/${invoiceId}/pdf`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob', signal: controller.signal }
      );
      downloadBlob(pdfRes.data, pdfRes.headers, `INVOICE_${form.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);

      notifySuccess('Invoice saved & downloaded!');
      setIsModalOpen(false);
      resetForm();
      fetchInvoices(true, null, search);
    } catch (err) {
      if (err.name === 'CanceledError') return;
      notifyError(err.response?.data?.error || 'Failed to save invoice');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  };

  // ────── RE-DOWNLOAD FROM HISTORY ──────
  const handleDownload = async (invoice) => {
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in again'); return; }
    setDownloadingId(invoice.invoiceId);
    try {
      const res = await axios.get(
        `${API_URL}/api/invoice-records/${invoice.invoiceId}/pdf`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }
      );
      downloadBlob(res.data, res.headers, `INVOICE_${invoice.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Download failed');
    } finally {
      if (mountedRef.current) setDownloadingId(null);
    }
  };

  // ────── VIEW (open inline in a new tab) ──────
  const handleView = async (invoice) => {
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in again'); return; }
    setViewingId(invoice.invoiceId);
    try {
      const res = await axios.get(
        `${API_URL}/api/invoice-records/${invoice.invoiceId}/pdf`,
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }
      );
      viewBlob(res.data);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Failed to open invoice');
    } finally {
      if (mountedRef.current) setViewingId(null);
    }
  };

  // ────── DELETE ──────
  const handleDelete = async (invoice) => {
    if (!window.confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in again'); return; }
    try {
      await axios.delete(`${API_URL}/api/invoice-records/${invoice.invoiceId}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      notifyError(err.response?.data?.error || 'Delete failed');
    }
  };

  const resetForm = () => setForm(emptyForm());
  const openModal = () => { resetForm(); setIsModalOpen(true); };
  const closeModal = () => setIsModalOpen(false);

  // ────── UPLOAD OLD INVOICE ──────
  const resetUploadForm = () => setUploadForm(emptyUploadForm());
  const openUploadModal = () => { resetUploadForm(); setIsUploadModalOpen(true); };
  const closeUploadModal = () => setIsUploadModalOpen(false);

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in again'); return; }
    if (!uploadForm.invoiceNumber.trim()) { notifyError('Invoice number is required'); return; }
    if (!uploadForm.date) { notifyError('Invoice date is required'); return; }
    if (!uploadForm.customerName.trim()) { notifyError('Customer name is required'); return; }
    if (!(Number(uploadForm.grandTotal) > 0)) { notifyError('Total amount must be greater than 0'); return; }
    if (!uploadForm.file) { notifyError('Select a PDF file to upload'); return; }
    if (uploadForm.file.type !== 'application/pdf') { notifyError('Only PDF files are accepted'); return; }

    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append('invoiceNumber', uploadForm.invoiceNumber.trim());
      fd.append('date', uploadForm.date);
      fd.append('customerName', uploadForm.customerName.trim());
      fd.append('grandTotal', uploadForm.grandTotal);
      fd.append('file', uploadForm.file);

      await axios.post(`${API_URL}/api/invoice-records/upload`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      });

      notifySuccess('Old invoice uploaded!');
      setIsUploadModalOpen(false);
      resetUploadForm();
      fetchInvoices(true, null, search);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Upload failed');
    } finally {
      if (mountedRef.current) setUploadLoading(false);
    }
  };

  // ────── RENDER ──────
  return (
    <PeoplePage
      title="Invoice Generator"
      subtitle="Manual Entry • Auto GST + Totals • Saved History • PDF Download"
    >
        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 px-5 py-4 flex items-center gap-4">
            <div className="p-2.5 rounded-xl text-gold-600 bg-gold-400/25"><FileText className="w-5 h-5" /></div>
            <div>
              <p className="text-2xl font-bold text-navy-800">{total}</p>
              <p className="text-xs text-gray-500 font-medium">Total Invoices</p>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 px-5 py-4 flex items-center gap-4">
            <div className="p-2.5 rounded-xl text-emerald-700 bg-emerald-100"><Package className="w-5 h-5" /></div>
            <div>
              <p className="text-2xl font-bold text-navy-800">{invoices.length}</p>
              <p className="text-xs text-gray-500 font-medium">Shown</p>
            </div>
          </div>
        </div>

        {/* Search + New Invoice */}
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-[17px] h-[17px]" />
            <input
              type="text"
              placeholder="Search by invoice number or customer name..."
              className="w-full pl-11 pr-10 py-3 rounded-lg border border-navy-100 bg-white shadow-sm focus:ring-2 focus:ring-gold-400 focus:outline-none text-sm"
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); debouncedSearch(e.target.value); }}
            />
            {searchInput && (
              <button onClick={resetSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={openUploadModal}
            className="px-5 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4" /> Upload Old Invoice
          </button>
          <button
            onClick={openModal}
            className="px-5 py-3 bg-gold-500 text-navy-900 font-semibold rounded-lg hover:bg-gold-400 flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>

        {/* History table */}
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-navy-50 border-b border-navy-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-gray-400" /> Invoice No.</div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-gray-400" /> Customer</div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">
                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" /> Date</div>
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-navy-800 whitespace-nowrap">Grand Total</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">Created By</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {invoices.length === 0 && !listLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-400 font-medium">No invoices found</p>
                      {search && (
                        <button onClick={resetSearch} className="mt-2 text-sm text-gold-600 hover:text-gold-600 underline flex items-center gap-1 mx-auto">
                          <RotateCcw className="w-3.5 h-3.5" /> Clear search
                        </button>
                      )}
                    </td>
                  </tr>
                ) : invoices.map((inv) => (
                  <tr key={inv.invoiceId} className="hover:bg-navy-50/50 transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-mono text-gold-600 font-semibold">{inv.invoiceNumber}</span>
                        {inv.source === 'uploaded' && (
                          <span className="inline-flex items-center bg-purple-100 text-purple-700 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full">
                            Uploaded
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-800">{inv.billing?.name}</td>
                    <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{formatDate(inv.date)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-gray-800 whitespace-nowrap">
                      ₹{Number(inv.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">{inv.createdByName || '—'}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleView(inv)}
                          disabled={viewingId === inv.invoiceId}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                          title="View PDF"
                        >
                          {viewingId === inv.invoiceId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDownload(inv)}
                          disabled={downloadingId === inv.invoiceId}
                          className="p-2 text-gold-600 hover:bg-navy-50 rounded-lg transition-all disabled:opacity-50"
                          title="Download PDF"
                        >
                          {downloadingId === inv.invoiceId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleDelete(inv)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {listLoading && invoices.length === 0 && (
            <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-gold-600 mx-auto" /></div>
          )}

          {hasMore && (
            <div className="p-4 text-center border-t border-navy-100">
              <button onClick={debouncedLoadMore} disabled={listLoading}
                className="px-6 py-2.5 bg-navy-50 hover:bg-gold-400/25 text-gold-600 font-medium rounded-xl border border-navy-100 disabled:opacity-50 flex items-center gap-2 mx-auto transition-all text-sm">
                {listLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</> : 'Load More Invoices'}
              </button>
            </div>
          )}
        </div>

      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        className="bg-white rounded-xl p-4 sm:p-6 max-w-5xl mx-auto mt-0 sm:mt-10 shadow-2xl outline-none overflow-y-auto max-h-[90vh] sm:max-h-screen w-[calc(100vw-2rem)] sm:w-auto"
        overlayClassName="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50"
      >
        <h2 className="font-display text-xl font-bold text-navy-800 mb-5">Generate Invoice</h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Invoice Meta */}
          <div className="bg-navy-50 rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold text-gold-600 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Invoice Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Invoice No. *</label>
                <input
                  type="text" required placeholder="e.g. 2026-27/Ak/009"
                  className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400 font-mono"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Date</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400"
                  value={toYMD(form.date)}
                  onChange={(e) => setForm({ ...form, date: toYMD(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Order No. <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400"
                  value={form.orderNo}
                  onChange={(e) => setForm({ ...form, orderNo: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Order Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="date"
                  className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400"
                  value={toYMD(form.orderDate)}
                  onChange={(e) => setForm({ ...form, orderDate: toYMD(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">HSN</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400 font-mono"
                  value={form.hsn}
                  onChange={(e) => setForm({ ...form, hsn: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Vendor Code <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400"
                  value={form.vendorCode}
                  onChange={(e) => setForm({ ...form, vendorCode: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Billing Details */}
          <div className="bg-blue-50 rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold text-blue-800 flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Billing / Customer Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-navy-800 mb-1">Company / Customer Name *</label>
                <input
                  type="text" required placeholder="e.g. Fluisys Technologies"
                  className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={form.billing.name}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, name: e.target.value } })}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-navy-800 mb-1">Billing Address</label>
                <textarea
                  rows={2}
                  className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none resize-none"
                  value={form.billing.address}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, address: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Phone</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={form.billing.phone}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, phone: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Email</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={form.billing.email}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, email: e.target.value } })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">GST Number</label>
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-lg border border-blue-200 bg-white focus:ring-2 focus:ring-gold-400 focus:outline-none font-mono"
                  value={form.billing.gst}
                  onChange={(e) => setForm({ ...form, billing: { ...form.billing, gst: e.target.value } })}
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-green-50 rounded-xl p-4 sm:p-6 space-y-4">
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
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text" placeholder="Description"
                    className="w-full sm:w-auto sm:flex-1 min-w-0 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                    value={item.description}
                    onChange={(e) => setItemField(i, 'description', e.target.value)}
                  />
                  <input
                    type="number" min="0" step="1" placeholder="Qty"
                    className="flex-1 min-w-[4rem] sm:flex-none sm:w-20 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                    value={item.qty}
                    onChange={(e) => setItemField(i, 'qty', Number(e.target.value) || 0)}
                  />
                  <input
                    type="number" min="0" step="0.01" placeholder="Rate"
                    className="flex-1 min-w-[5rem] sm:flex-none sm:w-28 px-4 py-2 rounded-lg border border-green-200 focus:ring-2 focus:ring-green-300"
                    value={item.rate}
                    onChange={(e) => setItemField(i, 'rate', Number(e.target.value) || 0)}
                  />
                  <div className="w-24 sm:w-28 px-3 py-2 text-right text-sm font-medium text-green-900">
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
          <div className="bg-gold-400/20 border border-gold-400/40 rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800">Totals</h3>
              <label className="flex items-center gap-2">
                <span className="text-sm text-gold-600">GST %</span>
                <input
                  type="number" min="0" max="100" step="0.01"
                  className="w-20 px-3 py-2 rounded-lg border border-gold-400/60 bg-white text-navy-800 focus:ring-2 focus:ring-gold-400 focus:outline-none"
                  value={form.gstPercent}
                  onChange={(e) => setForm({ ...form, gstPercent: Number(e.target.value) || 0 })}
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right">
              <div>
                <p className="text-xs text-gold-600 uppercase tracking-wide">Total Amount</p>
                <p className="text-lg font-bold text-navy-800">₹{totalAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gold-600 uppercase tracking-wide">GST ({form.gstPercent || 0}%)</p>
                <p className="text-lg font-bold text-navy-800">₹{gstAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gold-600 uppercase tracking-wide">Grand Total</p>
                <p className="text-lg font-bold text-navy-800">₹{grandTotal.toFixed(2)}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1">Amount in Words</label>
              <div className="px-4 py-3 rounded-xl bg-navy-50 border border-gold-400 text-gold-600 italic">
                {amountInWords}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sm:gap-4 pt-2">
            <button type="button" onClick={closeModal} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 flex items-center justify-center gap-2 transition-colors disabled:opacity-70"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
              ) : (
                <><Download className="w-5 h-5" /> Save & Download PDF</>
              )}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isUploadModalOpen}
        onRequestClose={closeUploadModal}
        className="bg-white rounded-xl p-6 max-w-lg mx-auto mt-0 sm:mt-24 shadow-2xl outline-none max-h-[90vh] overflow-y-auto"
        overlayClassName="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4"
      >
        <h2 className="font-display text-xl font-bold text-navy-800 mb-2">Upload Old Invoice</h2>
        <p className="text-sm text-gray-500 mb-6 text-center">
          For invoices generated before this system existed. No line-item breakdown needed — just the file and basic details.
        </p>

        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">Invoice No. *</label>
            <input
              type="text" required placeholder="e.g. 2023-24/Ak/042"
              className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400 font-mono"
              value={uploadForm.invoiceNumber}
              onChange={(e) => setUploadForm({ ...uploadForm, invoiceNumber: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1">Date *</label>
              <input
                type="date" required
                className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400"
                value={uploadForm.date}
                onChange={(e) => setUploadForm({ ...uploadForm, date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-navy-800 mb-1">Total Amount *</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number" required min="0.01" step="0.01" placeholder="0.00"
                  className="w-full pl-9 pr-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400"
                  value={uploadForm.grandTotal}
                  onChange={(e) => setUploadForm({ ...uploadForm, grandTotal: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">Customer Name *</label>
            <input
              type="text" required placeholder="e.g. Fluisys Technologies"
              className="w-full px-4 py-3 rounded-xl border border-navy-100 focus:ring-4 focus:ring-gold-400"
              value={uploadForm.customerName}
              onChange={(e) => setUploadForm({ ...uploadForm, customerName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-800 mb-1">PDF File *</label>
            <label className="flex items-center justify-center gap-2 w-full px-4 py-6 rounded-xl border-2 border-dashed border-gold-400 bg-navy-50/50 hover:bg-navy-50 cursor-pointer text-sm text-gold-600 transition-all">
              <Upload className="w-4 h-4" />
              {uploadForm.file ? uploadForm.file.name : 'Click to select a PDF file'}
              <input
                type="file" accept="application/pdf" className="hidden" required
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
              />
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeUploadModal} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all text-sm font-medium">
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadLoading}
              className="px-5 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 flex items-center gap-2 transition-colors text-sm disabled:opacity-70"
            >
              {uploadLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>) : (<><Upload className="w-4 h-4" /> Upload</>)}
            </button>
          </div>
        </form>
      </Modal>

    </PeoplePage>
  );
}

export default IAInvoiceForm;
