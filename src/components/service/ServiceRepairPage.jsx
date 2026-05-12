import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, RefreshCw, Edit2, Trash2, Upload, X,
  ChevronLeft, ChevronRight, Eye, ZoomIn, Search,
  Wrench, ShoppingBag, Clock, CheckCircle2, Truck, AlertCircle,
} from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const STATUS_OPTIONS = ['pending', 'in_progress', 'repaired', 'dispatched'];
const STATUS_LABELS  = { pending: 'Pending', in_progress: 'In Progress', repaired: 'Repaired', dispatched: 'Dispatched' };
const STATUS_COLORS  = {
  pending:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
  repaired:    'bg-green-100 text-green-700 border-green-200',
  dispatched:  'bg-slate-100 text-slate-600 border-slate-200',
};
const STATUS_ICONS = {
  pending:     <Clock className="w-3 h-3" />,
  in_progress: <AlertCircle className="w-3 h-3" />,
  repaired:    <CheckCircle2 className="w-3 h-3" />,
  dispatched:  <Truck className="w-3 h-3" />,
};

const SERVICE_TYPE_LABELS = { repair: 'Repair', purchase_for_service: 'Purchase for Service' };
const SERVICE_TYPE_COLORS = {
  repair:               'bg-orange-100 text-orange-700 border-orange-200',
  purchase_for_service: 'bg-purple-100 text-purple-700 border-purple-200',
};

const EMPTY_FORM = {
  service_type: 'repair', customer_name: '', dispatch_material_no: '',
  part_details: '', receiving_quantity: '', dispatch_quantity: '',
  fault_query: '', actual_issue: '', repair_status: 'pending',
  responsibility_person: '', testing_responsibility: '', remarks: '', sent_date: '',
};

// ── Utils ─────────────────────────────────────────────────────────────────────
const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white placeholder:text-gray-400';
const formatDate = (d) => (!d ? '—' : new Date(d).toLocaleDateString('en-IN'));
const val = (v) => (v != null && v !== '') ? v : '—';

function getWeservUrl(url) {
  if (!url) return null;
  if (url.includes('images.weserv.nl')) return url;
  let directUrl = url;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) directUrl = `https://drive.google.com/uc?export=view&id=${m[1]}`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=800&h=600&fit=outside&output=webp&q=85`;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, type = 'status' }) {
  const colors = type === 'status' ? STATUS_COLORS : SERVICE_TYPE_COLORS;
  const label  = type === 'status' ? STATUS_LABELS[status] : SERVICE_TYPE_LABELS[status];
  const icon   = type === 'status' ? STATUS_ICONS[status] : (status === 'repair' ? <Wrench className="w-3 h-3" /> : <ShoppingBag className="w-3 h-3" />);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {icon}{label || status}
    </span>
  );
}

// ── Photo thumbnail + lightbox ────────────────────────────────────────────────
function PhotoThumb({ url, label, size = 'md' }) {
  const [lightbox, setLightbox] = useState(false);
  const [err,      setErr]      = useState(false);
  if (!url) return (
    <div className={`${size === 'lg' ? 'w-32 h-32' : 'w-24 h-24'} rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center`}>
      <span className="text-xs text-gray-400">No photo</span>
    </div>
  );
  const isPdf   = url.toLowerCase().includes('pdf');
  const thumbUrl = getWeservUrl(url);
  const sz = size === 'lg' ? 'w-32 h-32' : 'w-24 h-24';

  return (
    <>
      <div
        onClick={() => setLightbox(true)}
        className={`${sz} relative group cursor-pointer rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200`}
      >
        {isPdf ? (
          <div className="w-full h-full bg-red-50 flex flex-col items-center justify-center gap-1">
            <span className="text-2xl">📄</span>
            <span className="text-xs text-red-500 font-semibold">PDF</span>
          </div>
        ) : err ? (
          <div className="w-full h-full bg-gray-50 flex items-center justify-center">
            <span className="text-xs text-gray-400 text-center px-2">Preview unavailable</span>
          </div>
        ) : (
          <img src={thumbUrl} alt={label} className="w-full h-full object-cover" onError={() => setErr(true)} />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
          <ZoomIn className="w-6 h-6 text-white drop-shadow" />
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
          <button className="absolute top-5 right-5 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors" onClick={() => setLightbox(false)}>
            <X className="w-5 h-5" />
          </button>
          <p className="absolute top-5 left-5 text-white/60 text-sm">{label}</p>
          {isPdf
            ? <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                className="bg-white px-8 py-4 rounded-2xl text-blue-600 font-semibold shadow-xl">Open PDF ↗</a>
            : <img src={thumbUrl} alt={label} className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
          }
        </div>
      )}
    </>
  );
}

// ── View modal ────────────────────────────────────────────────────────────────
function ViewModal({ record, onClose, onEdit }) {
  if (!record) return null;
  const isRepair = record.service_type === 'repair';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white rounded-t-2xl">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Record</p>
              <h2 className="text-xl font-bold text-gray-900">#{record.record_id}</h2>
            </div>
            <StatusBadge status={record.service_type} type="service" />
            <StatusBadge status={record.repair_status} type="status" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-sm transition-colors">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Section 1 — Core info */}
          <Section title="Overview">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoField label={isRepair ? 'Customer' : 'Recipient'} value={val(record.customer_name)} highlight />
              <InfoField label="Material No." value={val(record.dispatch_material_no)} />
              <InfoField label="Part Details" value={val(record.part_details)} />
              <InfoField label={isRepair ? 'Receiving Qty' : 'Purchase Qty'} value={val(record.receiving_quantity)} />
              <InfoField label="Dispatch Qty" value={val(record.dispatch_quantity)} />
              <InfoField label={isRepair ? 'Sent to Customer' : 'Received from Supplier'} value={formatDate(record.sent_date)} />
              <InfoField label="Responsibility" value={val(record.responsibility_person)} />
              {isRepair && <InfoField label="Testing By" value={val(record.testing_responsibility)} />}
              <InfoField label="Logged By" value={val(record.created_by_name)} />
              <InfoField label="Created On" value={formatDate(record.created_at)} />
            </div>
          </Section>

          {/* Section 2 — Repair details (repair only) */}
          {isRepair && (record.fault_query || record.actual_issue || record.fault_photos_urls?.length > 0 || record.actual_issue_photos_urls?.length > 0) && (
            <Section title="Repair Details">
              <div className="space-y-4">
                {(record.fault_query || record.fault_photos_urls?.length > 0) && (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Fault / Query from Customer</p>
                    {record.fault_query && <p className="text-sm text-gray-800">{record.fault_query}</p>}
                    {record.fault_photos_urls?.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {record.fault_photos_urls.map((u, i) => (
                          <PhotoThumb key={i} url={u} label={`Fault Photo ${i + 1}`} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {(record.actual_issue || record.actual_issue_photos_urls?.length > 0) && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Actual Issue Found</p>
                    {record.actual_issue && <p className="text-sm text-gray-800">{record.actual_issue}</p>}
                    {record.actual_issue_photos_urls?.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {record.actual_issue_photos_urls.map((u, i) => (
                          <PhotoThumb key={i} url={u} label={`Issue Photo ${i + 1}`} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Section 3 — Remarks */}
          {record.remarks && (
            <Section title="Remarks">
              <p className="text-sm text-gray-700 bg-gray-50 rounded-xl px-4 py-3">{record.remarks}</p>
            </Section>
          )}

          {/* Section 4 — Photos */}
          <Section title="Photos">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PhotoGroup label={`${isRepair ? 'Chalan (Received)' : 'Purchase Challan'} (${(record.chalan_photos_urls || []).length})`}>
                  <div className="flex flex-wrap gap-2">
                    {!(record.chalan_photos_urls?.length)
                      ? <PhotoThumb url={null} label="" size="lg" />
                      : record.chalan_photos_urls.map((u, i) => <PhotoThumb key={i} url={u} label={`Chalan ${i + 1}`} />)
                    }
                  </div>
                </PhotoGroup>
                <PhotoGroup label={`Delivery Challan (${(record.delivery_challan_photos_urls || []).length})`}>
                  <div className="flex flex-wrap gap-2">
                    {!(record.delivery_challan_photos_urls?.length)
                      ? <PhotoThumb url={null} label="" size="lg" />
                      : record.delivery_challan_photos_urls.map((u, i) => <PhotoThumb key={i} url={u} label={`DC ${i + 1}`} />)
                    }
                  </div>
                </PhotoGroup>
              </div>
              {isRepair && (
                <PhotoGroup label={`Repaired Photos (${(record.repaired_photos_urls || []).length})`}>
                  <div className="flex flex-wrap gap-2">
                    {!(record.repaired_photos_urls?.length)
                      ? <PhotoThumb url={null} label="" size="lg" />
                      : record.repaired_photos_urls.map((u, i) => <PhotoThumb key={i} url={u} label={`Repaired ${i + 1}`} />)
                    }
                  </div>
                </PhotoGroup>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</p>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      {children}
    </div>
  );
}

function PhotoGroup({ label, children }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>
      {children}
    </div>
  );
}

function InfoField({ label, value, highlight }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm ${highlight ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{value}</p>
    </div>
  );
}

// ── Customer typeahead ────────────────────────────────────────────────────────
function CustomerTypeahead({ value, onChange }) {
  const [query, setQuery]     = useState(value || '');
  const [options, setOptions] = useState([]);
  const [open, setOpen]       = useState(false);
  const debounceRef           = useRef(null);
  const token = localStorage.getItem('token');

  useEffect(() => { setQuery(value || ''); }, [value]);

  const fetchOptions = (q) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) { setOptions([]); return; }
      try {
        const res = await fetch(`${BASE_URL}/api/customers/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setOptions(await res.json());
      } catch { /* silent */ }
    }, 250);
  };

  const handleInput = (e) => { const v = e.target.value; setQuery(v); onChange(v); setOpen(true); fetchOptions(v); };
  const handleSelect = (name) => { setQuery(name); onChange(name); setOptions([]); setOpen(false); };
  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && query === '') onChange('');
    if (e.key === 'Escape') { setOpen(false); setOptions([]); }
  };

  return (
    <div className="relative">
      <input type="text" value={query} onChange={handleInput} onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => { if (query) { setOpen(true); fetchOptions(query); } }}
        placeholder="Type to search customer..." className={inputCls} autoComplete="off" required />
      {open && options.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto text-sm">
          {options.map((c) => (
            <li key={c.customer_id} onMouseDown={() => handleSelect(c.name)}
              className="px-4 py-2.5 hover:bg-amber-50 cursor-pointer first:rounded-t-xl last:rounded-b-xl">
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ServiceRepairPage({ socket, userRole }) {
  const [records,        setRecords]        = useState([]);
  const [isLoading,      setIsLoading]      = useState(true);
  const [showModal,      setShowModal]      = useState(false);
  const [modalMode,      setModalMode]      = useState('create');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [viewRecord,     setViewRecord]     = useState(null);
  const [formData,       setFormData]       = useState(EMPTY_FORM);
  const [confirmDelete,  setConfirmDelete]  = useState(null);
  const [page,           setPage]           = useState(0);
  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [typeFilter,     setTypeFilter]     = useState('');
  const limit      = 10;
  const isFetching = useRef(false);
  const { notifySuccess, notifyError } = useNotify();

  const [chalanFiles, setChalanFiles]               = useState([]);
  const [dcFiles, setDcFiles]                       = useState([]);
  const [faultFiles, setFaultFiles]                 = useState([]);
  const [actualIssueFiles, setActualIssueFiles]     = useState([]);
  const [repairedFiles, setRepairedFiles]           = useState([]);
  const [uploading, setUploading]                   = useState(false);

  const token      = localStorage.getItem('token');
  const authHeader = { Authorization: `Bearer ${token}` };
  const isAdmin    = userRole === 'admin';

  const fetchRecords = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/service-repair?limit=${limit}&offset=${page * limit}`, { headers: authHeader });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setRecords(await res.json());
    } catch (err) {
      notifyError(err.message || 'Failed to fetch records');
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [page]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const openCreate = () => {
    setModalMode('create'); setSelectedRecord(null); setFormData(EMPTY_FORM);
    setChalanFiles([]); setDcFiles([]); setFaultFiles([]); setActualIssueFiles([]); setRepairedFiles([]);
    setShowModal(true);
  };

  const openEdit = (record) => {
    setViewRecord(null); setModalMode('edit'); setSelectedRecord(record);
    setFormData({
      service_type: record.service_type || 'repair',
      customer_name: record.customer_name || '',
      dispatch_material_no: record.dispatch_material_no || '',
      part_details: record.part_details || '',
      receiving_quantity: record.receiving_quantity ?? '',
      dispatch_quantity: record.dispatch_quantity ?? '',
      fault_query: record.fault_query || '',
      actual_issue: record.actual_issue || '',
      repair_status: record.repair_status || 'pending',
      responsibility_person: record.responsibility_person || '',
      testing_responsibility: record.testing_responsibility || '',
      remarks: record.remarks || '',
      sent_date: record.sent_date ? record.sent_date.substring(0, 10) : '',
    });
    setChalanFiles([]); setDcFiles([]); setFaultFiles([]); setActualIssueFiles([]); setRepairedFiles([]);
    setShowModal(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'service_type' && value === 'purchase_for_service') {
        next.fault_query = ''; next.actual_issue = ''; next.testing_responsibility = '';
      }
      return next;
    });
  };

  const makeUploader = (endpoint, errorMsg) => async (recordId, file) => {
    const fd = new FormData(); fd.append('photo', file);
    const res = await fetch(`${BASE_URL}/api/service-repair/${recordId}/${endpoint}`, { method: 'POST', headers: authHeader, body: fd });
    if (!res.ok) throw new Error(errorMsg);
  };

  const uploadChalanPhoto         = makeUploader('chalan-photo',           'Chalan photo upload failed');
  const uploadDeliveryChallanPhoto = makeUploader('delivery-challan-photo', 'Delivery challan photo upload failed');
  const uploadFaultPhoto           = makeUploader('fault-photo',            'Fault photo upload failed');
  const uploadActualIssuePhoto     = makeUploader('actual-issue-photo',     'Actual issue photo upload failed');
  const uploadRepairedPhoto        = makeUploader('repaired-photo',         'Repaired photo upload failed');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_name.trim()) { notifyError('Customer / Recipient name is required'); return; }
    try {
      setUploading(true);
      const body = {
        ...formData,
        receiving_quantity: formData.receiving_quantity !== '' ? Number(formData.receiving_quantity) : null,
        dispatch_quantity: formData.dispatch_quantity !== '' ? Number(formData.dispatch_quantity) : null,
        sent_date: formData.sent_date || null,
      };
      let record;
      if (modalMode === 'create') {
        const res = await fetch(`${BASE_URL}/api/service-repair`, { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Failed to create (${res.status})`);
        record = await res.json();
      } else {
        const res = await fetch(`${BASE_URL}/api/service-repair/${selectedRecord.record_id}`, { method: 'PUT', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Failed to update (${res.status})`);
        record = await res.json();
      }
      for (const f of chalanFiles) await uploadChalanPhoto(record.record_id, f);
      for (const f of dcFiles) await uploadDeliveryChallanPhoto(record.record_id, f);
      if (formData.service_type === 'repair') {
        for (const f of faultFiles) await uploadFaultPhoto(record.record_id, f);
        for (const f of actualIssueFiles) await uploadActualIssuePhoto(record.record_id, f);
        for (const f of repairedFiles) await uploadRepairedPhoto(record.record_id, f);
      }
      notifySuccess(modalMode === 'create' ? 'Record created' : 'Record updated');
      setShowModal(false); fetchRecords();
    } catch (err) {
      notifyError(err.message || 'Something went wrong');
    } finally { setUploading(false); }
  };

  const handleDelete = async (record_id) => {
    try {
      const res = await fetch(`${BASE_URL}/api/service-repair/${record_id}`, { method: 'DELETE', headers: authHeader });
      if (!res.ok) throw new Error(`Failed to delete (${res.status})`);
      notifySuccess('Record deleted'); setConfirmDelete(null); fetchRecords();
    } catch (err) { notifyError(err.message || 'Delete failed'); }
  };

  const isRepair = formData.service_type === 'repair';

  // Stats (based on all records, not filtered)
  const stats = {
    pending:     records.filter(r => r.repair_status === 'pending').length,
    in_progress: records.filter(r => r.repair_status === 'in_progress').length,
    repaired:    records.filter(r => r.repair_status === 'repaired').length,
    dispatched:  records.filter(r => r.repair_status === 'dispatched').length,
  };

  // Client-side filtering
  const filteredRecords = records.filter(r => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || r.customer_name?.toLowerCase().includes(q)
      || r.dispatch_material_no?.toLowerCase().includes(q)
      || r.responsibility_person?.toLowerCase().includes(q);
    const matchesStatus = !statusFilter || r.repair_status === statusFilter;
    const matchesType   = !typeFilter   || r.service_type  === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const activeFilters = (search ? 1 : 0) + (statusFilter ? 1 : 0) + (typeFilter ? 1 : 0);
  const clearFilters  = () => { setSearch(''); setStatusFilter(''); setTypeFilter(''); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-4xl font-bold text-gray-800 tracking-tight">Service &amp; Repair</h1>
          <div className="flex gap-2">
            <button onClick={fetchRecords}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm text-gray-600 shadow-sm transition-colors">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-sm transition-colors">
              <Plus className="w-4 h-4" /> New Record
            </button>
          </div>
        </div>

        {/* ── Stats bar (click to filter by status) ── */}
        {!isLoading && records.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'pending',     label: 'Pending',     value: stats.pending,     border: 'border-l-yellow-400', bg: 'bg-yellow-50',  ring: 'ring-yellow-300' },
              { key: 'in_progress', label: 'In Progress', value: stats.in_progress, border: 'border-l-blue-400',   bg: 'bg-blue-50',    ring: 'ring-blue-300' },
              { key: 'repaired',    label: 'Repaired',    value: stats.repaired,    border: 'border-l-green-400',  bg: 'bg-green-50',   ring: 'ring-green-300' },
              { key: 'dispatched',  label: 'Dispatched',  value: stats.dispatched,  border: 'border-l-slate-400',  bg: 'bg-slate-50',   ring: 'ring-slate-300' },
            ].map(s => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(prev => prev === s.key ? '' : s.key)}
                className={`${s.bg} ${s.border} border-l-4 rounded-xl px-4 py-3 bg-white shadow-sm text-left transition-all
                  ${statusFilter === s.key ? `ring-2 ${s.ring} scale-[1.02]` : 'hover:scale-[1.01] hover:shadow-md'}`}
              >
                <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                <p className="text-xs text-gray-500 font-medium mt-0.5">{s.label}</p>
              </button>
            ))}
          </div>
        )}

        {/* ── Filter bar ── */}
        {!isLoading && records.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search customer, material no., person…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm text-gray-600"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>

            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm text-gray-600"
            >
              <option value="">All Types</option>
              <option value="repair">Repair</option>
              <option value="purchase_for_service">Purchase for Service</option>
            </select>

            {/* Clear */}
            {activeFilters > 0 && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm hover:bg-red-100 transition-colors">
                <X className="w-3.5 h-3.5" /> Clear ({activeFilters})
              </button>
            )}

            {/* Result count */}
            <p className="text-xs text-gray-400 ml-auto">
              {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}

        {/* ── Table ── */}
        {isLoading ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading records…</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-8 h-8 text-amber-500" />
            </div>
            {activeFilters > 0 ? (
              <>
                <h3 className="text-base font-semibold text-gray-700 mb-1">No matching records</h3>
                <p className="text-sm text-gray-400 mb-4">Try adjusting your search or filters</p>
                <button onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold">
                  <X className="w-4 h-4" /> Clear filters
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-700 mb-1">No records yet</h3>
                <p className="text-sm text-gray-400 mb-4">Create your first service or repair record</p>
                <button onClick={openCreate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold">
                  <Plus className="w-4 h-4" /> New Record
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {['#', 'Type', 'Customer / Recipient', 'Material No.', 'Status', 'Responsibility', 'Date', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRecords.map((r) => (
                    <tr key={r.record_id} onClick={() => setViewRecord(r)}
                      className="hover:bg-amber-50/40 cursor-pointer transition-colors group">
                      <td className="px-4 py-3.5 text-gray-400 text-xs font-mono">#{r.record_id}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={r.service_type} type="service" /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {r.chalan_photos_urls?.[0] && (
                            <img
                              src={getWeservUrl(r.chalan_photos_urls[0])}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover border border-gray-200 shrink-0"
                              onError={e => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <span className="font-semibold text-gray-800">{r.customer_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500">{r.dispatch_material_no || '—'}</td>
                      <td className="px-4 py-3.5"><StatusBadge status={r.repair_status} type="status" /></td>
                      <td className="px-4 py-3.5 text-gray-600">{r.responsibility_person || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(r.sent_date)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setViewRecord(r)}
                            className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500 transition-colors" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => openEdit(r)}
                            className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors" title="Edit">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button onClick={() => setConfirmDelete(r.record_id)}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/40">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <span className="text-xs text-gray-400">Page {page + 1}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={records.length < limit}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── View modal ── */}
      {viewRecord && <ViewModal record={viewRecord} onClose={() => setViewRecord(null)} onEdit={() => openEdit(viewRecord)} />}

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">Delete this record?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="flex-1 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">

            {/* Form header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white rounded-t-2xl">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">
                  {modalMode === 'create' ? 'New' : 'Edit'} Record
                </p>
                <h2 className="text-lg font-bold text-gray-900">
                  {modalMode === 'create' ? 'Log a Service Job' : `Editing Record #${selectedRecord?.record_id}`}
                </h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-6">

              {/* Service Type */}
              <FormSection title="Service Type">
                <div className="grid grid-cols-2 gap-3">
                  <RadioOption name="service_type" value="repair" checked={formData.service_type === 'repair'} onChange={handleChange}
                    icon={<Wrench className="w-5 h-5" />} label="Repair" sub="Fix a returned product" />
                  <RadioOption name="service_type" value="purchase_for_service" checked={formData.service_type === 'purchase_for_service'} onChange={handleChange}
                    icon={<ShoppingBag className="w-5 h-5" />} label="Purchase for Service" sub="Buy & send on behalf of recipient" />
                </div>
              </FormSection>

              {/* Basic Info */}
              <FormSection title="Basic Information">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label={isRepair ? 'Customer Name *' : 'Recipient Name *'}>
                      {isRepair
                        ? <CustomerTypeahead value={formData.customer_name} onChange={v => setFormData(p => ({ ...p, customer_name: v }))} />
                        : <input name="customer_name" value={formData.customer_name} onChange={handleChange} required className={inputCls} placeholder="Name of person / company" />
                      }
                    </Field>
                  </div>
                  <Field label="Dispatch Material Number">
                    <input name="dispatch_material_no" value={formData.dispatch_material_no} onChange={handleChange} className={inputCls} placeholder="Material / challan no." />
                  </Field>
                  <Field label="Part Details / Product Specs">
                    <textarea name="part_details" value={formData.part_details} onChange={handleChange} rows={2} className={inputCls} placeholder="Model, serial no., specs" />
                  </Field>
                </div>
              </FormSection>

              {/* Quantities */}
              <FormSection title="Quantities">
                <div className="grid grid-cols-2 gap-4">
                  <Field label={isRepair ? 'Receiving Quantity' : 'Purchase Quantity'}>
                    <input name="receiving_quantity" type="number" min="0" value={formData.receiving_quantity} onChange={handleChange} className={inputCls} placeholder="0" />
                  </Field>
                  <Field label="Dispatch Quantity">
                    <input name="dispatch_quantity" type="number" min="0" value={formData.dispatch_quantity} onChange={handleChange} className={inputCls} placeholder="0" />
                  </Field>
                </div>
              </FormSection>

              {/* Repair-specific */}
              {isRepair && (
                <FormSection title="Repair Details">
                  <div className="space-y-4">
                    <Field label="Fault / Query from Customer">
                      <textarea name="fault_query" value={formData.fault_query} onChange={handleChange} rows={2} className={inputCls} placeholder="What the customer reported" />
                    </Field>
                    <Field label="Fault Photos">
                      <MultiFileInput onChange={setFaultFiles} existing={selectedRecord?.fault_photos_urls} label="Upload fault photos" />
                    </Field>
                    <Field label="Actual Issue Found">
                      <textarea name="actual_issue" value={formData.actual_issue} onChange={handleChange} rows={2} className={inputCls} placeholder="Root cause identified" />
                    </Field>
                    <Field label="Actual Issue Photos">
                      <MultiFileInput onChange={setActualIssueFiles} existing={selectedRecord?.actual_issue_photos_urls} label="Upload actual issue photos" />
                    </Field>
                  </div>
                </FormSection>
              )}

              {/* Photos */}
              <FormSection title="Photos">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={isRepair ? 'Chalan Photos (Received)' : 'Purchase Challan Photos'}>
                    <MultiFileInput onChange={setChalanFiles} existing={selectedRecord?.chalan_photos_urls} label="Upload chalan photos or PDFs" accept="image/*,application/pdf" />
                  </Field>
                  <Field label="Delivery Challan Photos">
                    <MultiFileInput onChange={setDcFiles} existing={selectedRecord?.delivery_challan_photos_urls} label="Upload delivery challan photos or PDFs" accept="image/*,application/pdf" />
                  </Field>
                  {isRepair && (
                    <div className="sm:col-span-2">
                      <Field label="Repaired Photos">
                        <MultiFileInput onChange={setRepairedFiles} existing={selectedRecord?.repaired_photos_urls} label="Upload repaired photos" />
                      </Field>
                    </div>
                  )}
                </div>
              </FormSection>

              {/* Status & Assignment */}
              <FormSection title="Status &amp; Assignment">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={isRepair ? 'Repair Status' : 'Dispatch Status'}>
                    <select name="repair_status" value={formData.repair_status} onChange={handleChange} className={inputCls}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </Field>
                  <Field label="Responsibility Person">
                    <input name="responsibility_person" value={formData.responsibility_person} onChange={handleChange} className={inputCls} placeholder="Person handling this job" />
                  </Field>
                  {isRepair && (
                    <Field label="Testing Responsibility">
                      <input name="testing_responsibility" value={formData.testing_responsibility} onChange={handleChange} className={inputCls} placeholder="Person responsible for testing" />
                    </Field>
                  )}
                  <Field label={isRepair ? 'Sent to Customer Date' : 'Date Received from Supplier'}>
                    <input name="sent_date" type="date" value={formData.sent_date} onChange={handleChange} className={inputCls} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Remarks">
                      <textarea name="remarks" value={formData.remarks} onChange={handleChange} rows={2} className={inputCls} placeholder="Any additional notes" />
                    </Field>
                  </div>
                </div>
              </FormSection>

              <div className="flex justify-end gap-3 pt-1 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={uploading}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-60 shadow-sm transition-colors">
                  {uploading ? 'Saving…' : modalMode === 'create' ? 'Create Record' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function FormSection({ title, children }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function RadioOption({ name, value, checked, onChange, icon, label, sub }) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border-2 transition-all ${
      checked ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
    }`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="hidden" />
      <div className={`p-1.5 rounded-lg shrink-0 ${checked ? 'bg-amber-400 text-white' : 'bg-gray-100 text-gray-500'}`}>{icon}</div>
      <div>
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
      </div>
    </label>
  );
}

function FileInput({ onChange, current, label }) {
  const [fileName, setFileName] = useState('');
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-amber-300 cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 text-sm text-amber-600 transition-all">
        <Upload className="w-4 h-4 shrink-0" />
        <span className="truncate">{fileName || label}</span>
        <input type="file" accept="image/*,application/pdf" onChange={e => { const f = e.target.files[0]; if (f) { setFileName(f.name); onChange(f); } }} className="hidden" />
      </label>
      {current && !fileName && (
        <a href={current} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline block truncate">
          ↗ View existing file
        </a>
      )}
    </div>
  );
}

function MultiFileInput({ onChange, existing = [], label = 'Upload photos (multiple)', accept = 'image/*' }) {
  const [count, setCount] = useState(0);
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed border-amber-300 cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 text-sm text-amber-600 transition-all">
        <Upload className="w-4 h-4 shrink-0" />
        {count > 0 ? `${count} file(s) selected` : label}
        <input type="file" accept={accept} multiple onChange={e => { const f = Array.from(e.target.files); setCount(f.length); onChange(f); }} className="hidden" />
      </label>
      {existing?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {existing.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">Photo {i + 1}</a>
          ))}
        </div>
      )}
    </div>
  );
}

export default ServiceRepairPage;
