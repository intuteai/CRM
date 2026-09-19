import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Search, Plus, Pencil, Trash2, Loader2, Settings2, Eye, X } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const COMPONENT_FIELDS = [
  { key: 'motor_serial', label: 'Motor' },
  { key: 'controller_serial', label: 'Controller' },
  { key: 'gearbox_serial', label: 'Gearbox' },
  { key: 'harness_serial', label: 'Harness' },
  { key: 'cluster_serial', label: 'Cluster' },
  { key: 'vcu_serial', label: 'VCU' },
  { key: 'dcdc_serial', label: 'DC/DC' },
];

// Table stays lean (scan-essential columns only) -- the remaining component
// serials move into the "View" details modal, matching the trim pattern
// established in CustomerList.jsx.
const VISIBLE_COMPONENT_FIELDS = COMPONENT_FIELDS.slice(0, 3);

const emptyForm = () => {
  const f = {};
  COMPONENT_FIELDS.forEach((c) => { f[c.key] = ''; });
  return f;
};

function IPTKitAssembly({ socket }) {
  const { notifySuccess, notifyError } = useNotify();
  const [kits, setKits] = useState([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingKit, setViewingKit] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [previewSerial, setPreviewSerial] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [fieldError, setFieldError] = useState({ field: null, message: '' });
  const [saving, setSaving] = useState(false);
  const [editingSerial, setEditingSerial] = useState(false);
  const [nextSerialInput, setNextSerialInput] = useState('');
  const [serialSetError, setSerialSetError] = useState('');
  const [settingSerial, setSettingSerial] = useState(false);
  const mountedRef = useRef(true);

  const token = localStorage.getItem('token');
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const fetchKits = useCallback(async (reset = true) => {
    setLoading(true);
    try {
      const params = { limit: 20 };
      if (search.trim()) params.search = search.trim();
      if (!reset && cursor) params.cursor = cursor;
      const res = await axios.get(`${API_URL}/api/ipt-kits`, { ...authHeaders, params });
      setKits((prev) => (reset ? res.data.data : [...prev, ...res.data.data]));
      setTotal(res.data.total);
      setCursor(res.data.cursor);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Failed to load IPT kits');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    mountedRef.current = true;
    fetchKits(true);
    return () => { mountedRef.current = false; };
  }, [fetchKits]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchKits(true);
    socket.on('ipt_kits:created', refresh);
    socket.on('ipt_kits:updated', refresh);
    socket.on('ipt_kits:deleted', refresh);
    return () => {
      socket.off('ipt_kits:created', refresh);
      socket.off('ipt_kits:updated', refresh);
      socket.off('ipt_kits:deleted', refresh);
    };
  }, [socket, fetchKits]);

  const openCreateModal = async () => {
    setEditingId(null);
    setForm(emptyForm());
    setFieldError({ field: null, message: '' });
    setPreviewSerial('');
    setEditingSerial(false);
    setNextSerialInput('');
    setSerialSetError('');
    setIsModalOpen(true);
    try {
      const res = await axios.get(`${API_URL}/api/ipt-kits/next-serial`, authHeaders);
      setPreviewSerial(res.data.kit_serial);
    } catch {
      setPreviewSerial('');
    }
  };

  const handleSetNextSerial = async (e) => {
    e.preventDefault();
    setSettingSerial(true);
    setSerialSetError('');
    try {
      const res = await axios.put(`${API_URL}/api/ipt-kits/next-serial`, { next: nextSerialInput }, authHeaders);
      setPreviewSerial(res.data.kit_serial);
      setEditingSerial(false);
      notifySuccess(`Next kit will be ${res.data.kit_serial}`);
    } catch (err) {
      setSerialSetError(err.response?.data?.error || 'Could not set next serial number');
    } finally {
      setSettingSerial(false);
    }
  };

  const openEditModal = (kit) => {
    setEditingId(kit.kit_id);
    const f = emptyForm();
    COMPONENT_FIELDS.forEach((c) => { f[c.key] = kit[c.key]; });
    setForm(f);
    setPreviewSerial(kit.kit_serial);
    setFieldError({ field: null, message: '' });
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFieldError({ field: null, message: '' });
    try {
      if (editingId) {
        await axios.put(`${API_URL}/api/ipt-kits/${editingId}`, form, authHeaders);
        notifySuccess('Kit updated');
      } else {
        await axios.post(`${API_URL}/api/ipt-kits`, form, authHeaders);
        notifySuccess('Kit created');
      }
      setIsModalOpen(false);
      fetchKits(true);
    } catch (err) {
      const data = err.response?.data;
      if (data?.field) {
        setFieldError({ field: data.field, message: data.error });
      } else {
        notifyError(data?.error || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kit) => {
    if (!window.confirm(`Delete kit ${kit.kit_serial}? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_URL}/api/ipt-kits/${kit.kit_id}`, authHeaders);
      notifySuccess('Kit deleted');
      fetchKits(true);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-4 flex items-center gap-3">
          <div className="text-sm text-gray-600"><strong>{total}</strong> total kits</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-4 flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by kit serial or any component serial..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-navy-100 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors flex items-center gap-2 font-semibold whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Kit
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-navy-50 text-navy-800 font-semibold">
                <th className="px-4 py-3 text-left border-b border-navy-100">Kit Serial</th>
                {VISIBLE_COMPONENT_FIELDS.map((c) => (
                  <th key={c.key} className="px-4 py-3 text-left border-b border-navy-100">{c.label}</th>
                ))}
                <th className="px-4 py-3 text-left border-b border-navy-100">Created By</th>
                <th className="px-4 py-3 text-left border-b border-navy-100">Date</th>
                <th className="px-4 py-3 text-left border-b border-navy-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {kits.map((kit) => (
                <tr key={kit.kit_id} className="hover:bg-navy-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-navy-800">{kit.kit_serial}</td>
                  {VISIBLE_COMPONENT_FIELDS.map((c) => (
                    <td key={c.key} className="px-4 py-3 font-mono text-gray-600">{kit[c.key]}</td>
                  ))}
                  <td className="px-4 py-3 text-gray-600">{kit.created_by_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{String(kit.created_at).slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewingKit(kit)} title="View" className="p-2 text-navy-600 hover:bg-navy-50 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditModal(kit)} title="Edit" className="p-2 text-navy-600 hover:bg-navy-50 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(kit)} title="Delete" className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && kits.length === 0 && (
                <tr><td colSpan={VISIBLE_COMPONENT_FIELDS.length + 4} className="px-4 py-12 text-center text-gray-400">No kits found</td></tr>
              )}
            </tbody>
          </table>
          {cursor && (
            <div className="p-4 text-center">
              <button onClick={() => fetchKits(false)} disabled={loading} className="px-4 py-2 text-navy-700 hover:bg-navy-50 rounded-lg text-sm font-medium transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Load more'}
              </button>
            </div>
          )}
        </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-xl font-bold text-navy-800 text-center mb-1">
              {editingId ? 'Edit Kit' : 'New Kit'}
            </h2>
            <div className="text-center text-sm text-gray-500 mb-2 font-mono flex items-center justify-center gap-2">
              {previewSerial ? `Kit Serial: ${previewSerial}` : ''}
              {!editingId && !editingSerial && (
                <button
                  type="button"
                  onClick={() => { setEditingSerial(true); setNextSerialInput(''); setSerialSetError(''); }}
                  title="Set starting number"
                  className="text-navy-600 hover:text-navy-800 transition-colors"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {!editingId && editingSerial && (
              <div className="mb-6 bg-navy-50 border border-navy-100 rounded-lg p-4">
                <form onSubmit={handleSetNextSerial} className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 font-mono">IPT</span>
                  <input
                    type="number"
                    min="1"
                    autoFocus
                    placeholder="e.g. 1"
                    className={`w-24 px-3 py-1.5 rounded-lg border font-mono text-sm focus:outline-none focus:ring-2 ${
                      serialSetError ? 'border-red-400 focus:ring-red-200' : 'border-navy-100 focus:ring-gold-400'
                    }`}
                    value={nextSerialInput}
                    onChange={(e) => { setNextSerialInput(e.target.value); setSerialSetError(''); }}
                  />
                  <button
                    type="submit"
                    disabled={settingSerial || !nextSerialInput}
                    className="px-3 py-1.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
                  >
                    {settingSerial ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingSerial(false); setSerialSetError(''); }}
                    className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </form>
                {serialSetError && (
                  <p className="text-xs text-red-500 mt-2">⚠ {serialSetError}</p>
                )}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              {COMPONENT_FIELDS.map((c) => (
                <div key={c.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{c.label} Serial *</label>
                  <input
                    type="text"
                    required
                    className={`w-full px-4 py-2 rounded-lg border font-mono focus:outline-none focus:ring-2 ${
                      fieldError.field === c.key ? 'border-red-400 focus:ring-red-200' : 'border-navy-100 focus:ring-gold-400'
                    }`}
                    value={form[c.key]}
                    onChange={(e) => {
                      setForm({ ...form, [c.key]: e.target.value });
                      if (fieldError.field === c.key) setFieldError({ field: null, message: '' });
                    }}
                  />
                  {fieldError.field === c.key && (
                    <p className="text-xs text-red-500 mt-1">{fieldError.message}</p>
                  )}
                </div>
              ))}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm font-semibold transition-colors disabled:opacity-70 ${
                    editingId
                      ? 'bg-navy-800 text-white hover:bg-navy-700'
                      : 'bg-gold-500 text-navy-900 hover:bg-gold-400'
                  }`}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Save Changes' : 'Create Kit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingKit && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setViewingKit(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
              {viewingKit.kit_serial || 'Kit Details'}
            </h2>
            <dl className="space-y-4">
              {[
                ...COMPONENT_FIELDS.map((c) => ({ label: `${c.label} Serial`, value: viewingKit[c.key] })),
                { label: 'Created By', value: viewingKit.created_by_name },
                { label: 'Date', value: viewingKit.created_at ? String(viewingKit.created_at).slice(0, 10) : null },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="text-navy-800 mt-0.5 font-mono">{value || 'N/A'}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setViewingKit(null)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default IPTKitAssembly;
