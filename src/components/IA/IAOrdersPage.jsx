// components/ia/IAOrdersPage.jsx
import React, {
  useEffect, useState, useCallback, useRef, useMemo,
} from 'react';
import {
  Search, Plus, Loader2, Sparkles, Edit2, Trash2,
  Calendar, Package, User, FileText, X, ChevronUp,
  ChevronDown, ChevronRight, StickyNote, Filter,
  ArrowUpDown, Hash, Cpu, Monitor, RotateCcw,
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import axios from 'axios';
import debounce from 'lodash.debounce';
import Modal from 'react-modal';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const MAX_CACHED = 200;

// ── Helpers ───────────────────────────────────────────────────
const formatDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toYMD = (v) => {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (!isNaN(dt)) return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  return '';
};

// Highlight matching text
const Highlight = ({ text, query }) => {
  if (!query || !text) return <span>{text || '—'}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 text-amber-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
};

const emptyItem = () => ({ vcu_serial: '', vcu_make: '', vcu_model: '', hmi_imei: '', hmi_make: '', hmi_model: '' });
const emptyForm = () => ({ customer_name: '', invoice_number: '', dispatch_date: '', notes: '', items: [emptyItem()] });

// ── Sort indicator ────────────────────────────────────────────
const SortIcon = ({ col, sortConfig }) => {
  if (sortConfig.key !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 inline ml-1 opacity-50" />;
  return sortConfig.direction === 'asc'
    ? <ChevronUp className="w-3.5 h-3.5 text-amber-600 inline ml-1" />
    : <ChevronDown className="w-3.5 h-3.5 text-amber-600 inline ml-1" />;
};

// ── Sortable TH ───────────────────────────────────────────────
const SortTh = ({ col, label, icon, sortConfig, onSort, className = '' }) => (
  <th
    onClick={() => onSort(col)}
    className={`px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none transition-colors
      ${sortConfig.key === col ? 'bg-amber-100 text-amber-800' : 'hover:bg-amber-50'}
      ${className}`}
  >
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-gray-400">{icon}</span>}
      {label}
      <SortIcon col={col} sortConfig={sortConfig} />
    </div>
  </th>
);


function IAOrdersPage({ socket }) {
  const [orders, setOrders]             = useState([]);
  const [loading, setLoading]           = useState(false);
  const [cursor, setCursor]             = useState(null);
  const [hasMore, setHasMore]           = useState(true);
  const [total, setTotal]               = useState(0);

  // Search
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [searchField, setSearchField]   = useState('all');

  // Date range filter
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [showFilters, setShowFilters]   = useState(false);

  // UI state
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [form, setForm]                 = useState(emptyForm());
  const [notesModal, setNotesModal]     = useState(null);

  // Sort
  const [sortConfig, setSortConfig]     = useState({ key: null, direction: 'asc' });

  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const abortRef   = useRef(null);
  const searchRef  = useRef(null);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // ── Sort ─────────────────────────────────────────────────────
  const handleSort = (key) => setSortConfig(prev => ({
    key,
    direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
  }));

  // ── Fetch ─────────────────────────────────────────────────────
  const fetchOrders = useCallback(async (reset = false, currentCursor = null) => {
    if (loadingRef.current) return;
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Please log in again'); return; }

    loadingRef.current = true;
    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = { limit: 50, ...(currentCursor && !reset ? { cursor: currentCursor } : {}) };
      const res = await axios.get(`${API_URL}/api/ia-orders`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      const newData = res.data?.data || [];
      setOrders(prev => (reset ? newData : [...prev, ...newData]).slice(0, MAX_CACHED));
      setTotal(res.data?.total || 0);
      setCursor(res.data?.cursor || null);
      setHasMore(Boolean(res.data?.cursor));
    } catch (err) {
      if (err?.name === 'CanceledError') return;
      if (mountedRef.current) toast.error(err.response?.data?.error || 'Failed to load orders');
    } finally {
      if (mountedRef.current) { setLoading(false); loadingRef.current = false; abortRef.current = null; }
    }
  }, []);

  useEffect(() => { fetchOrders(true, null); }, [fetchOrders]);

  // ── Socket ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onCreate = (o) => { setOrders(prev => [o, ...prev.filter(x => x.order_id !== o.order_id)].slice(0, MAX_CACHED)); setTotal(t => t + 1); toast.success(`New order: ${o.invoice_number}`); };
    const onUpdate = (o) => { setOrders(prev => prev.map(x => x.order_id === o.order_id ? o : x)); toast.info(`Order updated: ${o.invoice_number}`); };
    const onDelete = ({ order_id }) => { setOrders(prev => prev.filter(x => x.order_id !== order_id)); setTotal(t => Math.max(0, t - 1)); toast.warn('Order deleted'); };
    socket.on('ia_orders:created', onCreate);
    socket.on('ia_orders:updated', onUpdate);
    socket.on('ia_orders:deleted', onDelete);
    return () => {
      socket.off('ia_orders:created', onCreate);
      socket.off('ia_orders:updated', onUpdate);
      socket.off('ia_orders:deleted', onDelete);
    };
  }, [socket]);

  // ── Debounced search ──────────────────────────────────────────
  const debouncedSearch = useMemo(() => debounce(v => { if (mountedRef.current) setSearch(v); }, 300), []);
  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  // ── Filter + sort ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = orders;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(o => {
        if (searchField === 'customer')   return o.customer_name?.toLowerCase().includes(q);
        if (searchField === 'invoice')    return o.invoice_number?.toLowerCase().includes(q);
        if (searchField === 'vcu_serial') return o.items?.some(i => i.vcu_serial?.toLowerCase().includes(q));
        if (searchField === 'hmi_imei')   return o.items?.some(i => i.hmi_imei?.toLowerCase().includes(q));
        if (searchField === 'vcu_make')   return o.items?.some(i => i.vcu_make?.toLowerCase().includes(q));
        if (searchField === 'vcu_model')  return o.items?.some(i => i.vcu_model?.toLowerCase().includes(q));
        if (searchField === 'hmi_make')   return o.items?.some(i => i.hmi_make?.toLowerCase().includes(q));
        if (searchField === 'hmi_model')  return o.items?.some(i => i.hmi_model?.toLowerCase().includes(q));
        return (
          o.customer_name?.toLowerCase().includes(q) ||
          o.invoice_number?.toLowerCase().includes(q) ||
          o.items?.some(i =>
            i.vcu_serial?.toLowerCase().includes(q) ||
            i.vcu_make?.toLowerCase().includes(q) ||
            i.vcu_model?.toLowerCase().includes(q) ||
            i.hmi_imei?.toLowerCase().includes(q) ||
            i.hmi_make?.toLowerCase().includes(q) ||
            i.hmi_model?.toLowerCase().includes(q)
          )
        );
      });
    }

    if (dateFrom) result = result.filter(o => toYMD(o.dispatch_date) >= dateFrom);
    if (dateTo)   result = result.filter(o => toYMD(o.dispatch_date) <= dateTo);

    return result;
  }, [orders, search, searchField, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    if (!sortConfig.key) return filtered;
    const { key, direction } = sortConfig;
    return [...filtered].sort((a, b) => {
      let av, bv;
      if (key === 'dispatch_date') { av = toYMD(a.dispatch_date); bv = toYMD(b.dispatch_date); }
      else if (key === 'units')    { av = a.items?.length ?? 0; bv = b.items?.length ?? 0; }
      else                         { av = (a[key] || '').toLowerCase(); bv = (b[key] || '').toLowerCase(); }
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ?  1 : -1;
      return 0;
    });
  }, [filtered, sortConfig]);

  // ── Stats ─────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    totalOrders: total,
    shownOrders: filtered.length,
    totalUnits:  filtered.reduce((sum, o) => sum + (o.items?.length || 0), 0),
  }), [filtered, total]);

  // ── Active filter count ───────────────────────────────────────
  const activeFilterCount = [search, dateFrom, dateTo].filter(Boolean).length;

  const resetFilters = () => {
    setSearchInput(''); setSearch('');
    setDateFrom(''); setDateTo('');
    setSearchField('all');
  };

  // ── Row expand ────────────────────────────────────────────────
  const toggleRow = (id) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // ── Form ──────────────────────────────────────────────────────
  const openCreate = () => { setEditingOrder(null); setForm(emptyForm()); setIsModalOpen(true); };
  const openEdit   = (order) => {
    setEditingOrder(order);
    setForm({
      customer_name:  order.customer_name,
      invoice_number: order.invoice_number,
      dispatch_date:  toYMD(order.dispatch_date),
      notes:          order.notes || '',
      items: order.items?.length > 0
        ? order.items.map(i => ({ vcu_serial: i.vcu_serial, vcu_make: i.vcu_make, vcu_model: i.vcu_model, hmi_imei: i.hmi_imei, hmi_make: i.hmi_make, hmi_model: i.hmi_model }))
        : [emptyItem()],
    });
    setIsModalOpen(true);
  };
  const closeModal    = () => { setIsModalOpen(false); setEditingOrder(null); };
  const setItemField  = (i, f, v) => setForm(prev => { const items = [...prev.items]; items[i] = { ...items[i], [f]: v }; return { ...prev, items }; });
  const addItem       = () => setForm(prev => ({ ...prev, items: [...prev.items, emptyItem()] }));
  const removeItem    = (i) => setForm(prev => { if (prev.items.length === 1) return prev; return { ...prev, items: prev.items.filter((_, idx) => idx !== i) }; });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Please log in again'); return; }

    const validItems = form.items.filter(i => i.vcu_serial.trim() && i.vcu_make.trim() && i.vcu_model.trim() && i.hmi_imei.trim() && i.hmi_make.trim() && i.hmi_model.trim());
    if (validItems.length === 0) { toast.error('Add at least one complete VCU + HMI unit'); return; }

    const payload = { ...form, dispatch_date: toYMD(form.dispatch_date), items: validItems };
    const isEdit  = !!editingOrder;
    const url     = isEdit ? `${API_URL}/api/ia-orders/${editingOrder.order_id}` : `${API_URL}/api/ia-orders`;

    try {
      isEdit
        ? await axios.put(url, payload,  { headers: { Authorization: `Bearer ${token}` } })
        : await axios.post(url, payload, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(isEdit ? 'Order updated!' : 'Order created!');
      closeModal();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (order) => {
    if (!window.confirm(`Delete order ${order.invoice_number}? This cannot be undone.`)) return;
    const token = localStorage.getItem('token');
    if (!token) { toast.error('Please log in again'); return; }
    try {
      await axios.delete(`${API_URL}/api/ia-orders/${order.order_id}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const debouncedLoadMore = useMemo(() => debounce(() => {
    if (cursor && !loading && !loadingRef.current) fetchOrders(false, cursor);
  }, 300), [cursor, loading, fetchOrders]);
  useEffect(() => () => debouncedLoadMore.cancel(), [debouncedLoadMore]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000" />

      <div className="relative z-10 p-6">

        {/* ── Header ── */}
        <div className="text-center mb-10 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            Dispatch Orders
          </h1>
        </div>

        {/* ── Stats bar ── */}
        <div className="max-w-7xl mx-auto mb-6 grid grid-cols-3 gap-4">
          {[
            { label: 'Total Orders', value: stats.totalOrders, icon: <FileText className="w-5 h-5" />, color: 'text-amber-700 bg-amber-100' },
            { label: 'Shown',        value: stats.shownOrders, icon: <Filter className="w-5 h-5" />,   color: 'text-orange-700 bg-orange-100' },
            { label: 'Total Units',  value: stats.totalUnits,  icon: <Package className="w-5 h-5" />,  color: 'text-green-700 bg-green-100' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl shadow-sm border border-amber-100 px-5 py-4 flex items-center gap-4">
              <div className={`p-2.5 rounded-xl ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                <p className="text-xs text-gray-500 font-medium">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Search + Filter bar ── */}
        <div className="max-w-7xl mx-auto mb-4 space-y-3">

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search field selector */}
            <select
              className="px-4 py-3 rounded-xl border border-amber-200 bg-white text-sm text-gray-700 focus:ring-4 focus:ring-amber-300 focus:outline-none shrink-0"
              value={searchField}
              onChange={e => setSearchField(e.target.value)}
            >
              <option value="all">All Fields</option>
              <optgroup label="Order">
                <option value="customer">Customer</option>
                <option value="invoice">Invoice No.</option>
              </optgroup>
              <optgroup label="VCU">
                <option value="vcu_serial">VCU Serial</option>
                <option value="vcu_make">VCU Make</option>
                <option value="vcu_model">VCU Model</option>
              </optgroup>
              <optgroup label="HMI">
                <option value="hmi_imei">HMI IMEI</option>
                <option value="hmi_make">HMI Make</option>
                <option value="hmi_model">HMI Model</option>
              </optgroup>
            </select>

            {/* Search input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                ref={searchRef}
                type="text"
                placeholder={
                  searchField === 'all'        ? 'Search across all fields...' :
                  searchField === 'customer'   ? 'Search by customer name...' :
                  searchField === 'invoice'    ? 'Search by invoice number...' :
                  searchField === 'vcu_serial' ? 'Search by VCU serial...' :
                  searchField === 'hmi_imei'   ? 'Search by HMI IMEI...' :
                  `Search by ${searchField.replace('_', ' ')}...`
                }
                className="w-full pl-10 pr-10 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none text-sm"
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); debouncedSearch(e.target.value); }}
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`px-4 py-3 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all shrink-0
                ${showFilters || dateFrom || dateTo
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'border-amber-200 bg-white text-gray-600 hover:border-amber-300'}`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {(dateFrom || dateTo) && (
                <span className="bg-amber-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {[dateFrom, dateTo].filter(Boolean).length}
                </span>
              )}
            </button>

            {/* New order */}
            <button
              onClick={openCreate}
              className="px-5 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl flex items-center gap-2 transition-all whitespace-nowrap shrink-0"
            >
              <Plus className="w-5 h-5" /> New Order
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="bg-white border border-amber-200 rounded-xl p-4 flex flex-wrap gap-4 items-end shadow-sm">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Dispatch Date From</label>
                <input type="date" className="px-3 py-2 rounded-lg border border-amber-200 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                  value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Dispatch Date To</label>
                <input type="date" className="px-3 py-2 rounded-lg border border-amber-200 text-sm focus:ring-2 focus:ring-amber-300 focus:outline-none"
                  value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              {(search || dateFrom || dateTo) && (
                <button onClick={resetFilters} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                  <RotateCcw className="w-3.5 h-3.5" /> Reset all
                </button>
              )}
            </div>
          )}

          {/* Active filter pills */}
          {(search || dateFrom || dateTo) && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500">Active filters:</span>
              {search && (
                <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs px-3 py-1 rounded-full">
                  {searchField === 'all' ? 'All fields' : searchField.replace('_', ' ')}: "{search}"
                  <button onClick={() => { setSearchInput(''); setSearch(''); }}><X className="w-3 h-3" /></button>
                </span>
              )}
              {dateFrom && (
                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 text-xs px-3 py-1 rounded-full">
                  From: {formatDate(dateFrom)}
                  <button onClick={() => setDateFrom('')}><X className="w-3 h-3" /></button>
                </span>
              )}
              {dateTo && (
                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 text-xs px-3 py-1 rounded-full">
                  To: {formatDate(dateTo)}
                  <button onClick={() => setDateTo('')}><X className="w-3 h-3" /></button>
                </span>
              )}
              <span className="text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-amber-100 to-orange-50 border-b border-amber-200">
                <tr>
                  <th className="px-4 py-4 w-10" />
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-gray-400" /> S.No</div>
                  </th>
                  <SortTh col="customer_name"  label="Customer"      icon={<User className="w-3.5 h-3.5" />}     sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh col="invoice_number" label="Invoice"       icon={<FileText className="w-3.5 h-3.5" />} sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh col="dispatch_date"  label="Dispatch Date" icon={<Calendar className="w-3.5 h-3.5" />} sortConfig={sortConfig} onSort={handleSort} />
                  <SortTh col="units"          label="Units"         icon={<Package className="w-3.5 h-3.5" />}  sortConfig={sortConfig} onSort={handleSort} />
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5 text-gray-400" /> Notes</div>
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <Package className="w-12 h-12 text-amber-200 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">No orders found</p>
                      {activeFilterCount > 0 && (
                        <button onClick={resetFilters} className="mt-2 text-sm text-amber-600 hover:text-amber-800 underline">Clear filters</button>
                      )}
                    </td>
                  </tr>
                ) : sorted.map((order, index) => (
                  <React.Fragment key={order.order_id}>
                    <tr className={`transition-colors group ${expandedRows.has(order.order_id) ? 'bg-amber-50/80' : 'hover:bg-amber-50/50'}`}>
                      {/* Expand */}
                      <td className="px-4 py-4">
                        <button onClick={() => toggleRow(order.order_id)} className="p-1.5 hover:bg-amber-200 rounded-lg transition-all">
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expandedRows.has(order.order_id) ? 'rotate-90 text-amber-600' : ''}`} />
                        </button>
                      </td>
                      <td className="px-4 py-4 text-sm font-mono text-gray-400">#{sorted.length - index}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-gray-900">
                        <Highlight text={order.customer_name} query={searchField === 'all' || searchField === 'customer' ? search : ''} />
                      </td>
                      <td className="px-4 py-4 text-sm font-mono text-amber-700">
                        <Highlight text={order.invoice_number} query={searchField === 'all' || searchField === 'invoice' ? search : ''} />
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{formatDate(order.dispatch_date)}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-1.5 rounded-full">
                          <Package className="w-3 h-3" /> {order.items?.length || 0}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600 max-w-xs">
                        {order.notes ? (
                          <button onClick={() => setNotesModal(order.notes)} className="text-left truncate block max-w-[150px] hover:text-amber-700 transition-colors" title="Click to view">
                            {order.notes.length > 35 ? `${order.notes.slice(0, 35)}…` : order.notes}
                          </button>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(order)} className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition-all" title="Edit"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(order)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Delete"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded items ── */}
                    {expandedRows.has(order.order_id) && (
                      <tr className="bg-amber-50/40">
                        <td colSpan={8} className="px-6 pb-5 pt-2">
                          {order.items?.length > 0 ? (
                            <div className="space-y-2">
                              {order.items.map((item, i) => (
                                <div key={item.item_id} className="bg-white rounded-xl border border-amber-100 shadow-sm overflow-hidden">
                                  <div className="grid grid-cols-2 divide-x divide-amber-100">
                                    {/* VCU */}
                                    <div className="p-3">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-md">
                                          <Cpu className="w-3 h-3" /> VCU
                                        </div>
                                        <span className="text-xs text-gray-400">Unit {i + 1}</span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                                        <div>
                                          <span className="text-gray-400 block">Serial</span>
                                          <span className="font-mono font-semibold text-gray-800">
                                            <Highlight text={item.vcu_serial} query={searchField === 'all' || searchField === 'vcu_serial' ? search : ''} />
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400 block">Make</span>
                                          <span className="font-medium text-gray-700">
                                            <Highlight text={item.vcu_make} query={searchField === 'all' || searchField === 'vcu_make' ? search : ''} />
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400 block">Model</span>
                                          <span className="font-medium text-gray-700">
                                            <Highlight text={item.vcu_model} query={searchField === 'all' || searchField === 'vcu_model' ? search : ''} />
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                    {/* HMI */}
                                    <div className="p-3">
                                      <div className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-bold px-2 py-0.5 rounded-md mb-2 w-fit">
                                        <Monitor className="w-3 h-3" /> HMI
                                      </div>
                                      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                                        <div>
                                          <span className="text-gray-400 block">IMEI</span>
                                          <span className="font-mono font-semibold text-gray-800">
                                            <Highlight text={item.hmi_imei} query={searchField === 'all' || searchField === 'hmi_imei' ? search : ''} />
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400 block">Make</span>
                                          <span className="font-medium text-gray-700">
                                            <Highlight text={item.hmi_make} query={searchField === 'all' || searchField === 'hmi_make' ? search : ''} />
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-gray-400 block">Model</span>
                                          <span className="font-medium text-gray-700">
                                            <Highlight text={item.hmi_model} query={searchField === 'all' || searchField === 'hmi_model' ? search : ''} />
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-sm text-gray-400 italic py-2">No items</p>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {loading && orders.length === 0 && (
            <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" /></div>
          )}

          {hasMore && (
            <div className="p-4 text-center border-t border-amber-100">
              <button onClick={debouncedLoadMore} disabled={loading}
                className="px-6 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium rounded-xl border border-amber-200 disabled:opacity-50 flex items-center gap-2 mx-auto transition-all text-sm">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</> : 'Load More Orders'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Notes modal ── */}
      <Modal isOpen={!!notesModal} onRequestClose={() => setNotesModal(null)}
        className="bg-white rounded-2xl p-6 max-w-lg mx-auto mt-24 shadow-2xl outline-none"
        overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2"><StickyNote className="w-5 h-5 text-amber-500" /> Notes</h3>
          <button onClick={() => setNotesModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans break-words">{notesModal}</pre>
        </div>
      </Modal>

      {/* ── Create / Edit modal ── */}
      <Modal isOpen={isModalOpen} onRequestClose={closeModal}
        className="bg-white rounded-2xl p-8 max-w-3xl mx-auto mt-8 shadow-2xl outline-none overflow-y-auto max-h-[92vh]"
        overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">{editingOrder ? 'Edit Order' : 'New Dispatch Order'}</h2>
          <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer Name</label>
              <input type="text" required placeholder="e.g. ABC Industries"
                className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none text-sm"
                value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Invoice Number</label>
              <input type="text" required placeholder="e.g. INV-2024-001"
                className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none text-sm font-mono"
                value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} />
            </div>
          </div>

          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Dispatch Date</label>
            <input type="date" required
              className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none text-sm"
              value={toYMD(form.dispatch_date)} onChange={e => setForm({ ...form, dispatch_date: toYMD(e.target.value) })} />
          </div>

          {/* Units */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">VCU + HMI Units</label>
              <button type="button" onClick={addItem}
                className="text-xs text-amber-600 hover:text-amber-800 font-semibold flex items-center gap-1 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-all">
                <Plus className="w-3.5 h-3.5" /> Add unit
              </button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, index) => (
                <div key={index} className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 flex items-center justify-between border-b border-amber-100">
                    <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Unit {index + 1}</span>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(index)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-lg transition-all">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    {/* VCU row */}
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-2 rounded-lg shrink-0 mt-5 border border-blue-100">
                        <Cpu className="w-3.5 h-3.5" /> VCU
                      </div>
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        {[['vcu_serial', 'Serial No.', 'SN-001', true], ['vcu_make', 'Make', 'e.g. Siemens', false], ['vcu_model', 'Model', 'e.g. S7-1200', false]].map(([field, label, placeholder, mono]) => (
                          <div key={field}>
                            <label className="block text-xs text-gray-500 mb-1">{label}</label>
                            <input type="text" required placeholder={placeholder}
                              className={`w-full px-3 py-2 rounded-lg border border-amber-200 focus:ring-2 focus:ring-amber-300 focus:outline-none text-sm ${mono ? 'font-mono' : ''}`}
                              value={item[field]} onChange={e => setItemField(index, field, e.target.value)} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-dashed border-amber-100" />
                    {/* HMI row */}
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-bold px-2.5 py-2 rounded-lg shrink-0 mt-5 border border-green-100">
                        <Monitor className="w-3.5 h-3.5" /> HMI
                      </div>
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        {[['hmi_imei', 'IMEI', '358XXXXXXXXXXX', true], ['hmi_make', 'Make', 'e.g. Weintek', false], ['hmi_model', 'Model', 'e.g. MT8071iP', false]].map(([field, label, placeholder, mono]) => (
                          <div key={field}>
                            <label className="block text-xs text-gray-500 mb-1">{label}</label>
                            <input type="text" required placeholder={placeholder}
                              className={`w-full px-3 py-2 rounded-lg border border-amber-200 focus:ring-2 focus:ring-amber-300 focus:outline-none text-sm ${mono ? 'font-mono' : ''}`}
                              value={item[field]} onChange={e => setItemField(index, field, e.target.value)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea rows={3} placeholder="Any additional notes..."
              className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none resize-none text-sm"
              value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all text-sm font-medium">Cancel</button>
            <button type="submit" className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-xl shadow-lg hover:shadow-xl transition-all text-sm font-medium">
              {editingOrder ? 'Update Order' : 'Create Order'}
            </button>
          </div>
        </form>
      </Modal>

      <ToastContainer position="top-right" />
    </div>
  );
}

export default IAOrdersPage;