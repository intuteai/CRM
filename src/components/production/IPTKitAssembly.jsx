import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Boxes, Search, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
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
  const [editingId, setEditingId] = useState(null);
  const [previewSerial, setPreviewSerial] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [fieldError, setFieldError] = useState({ field: null, message: '' });
  const [saving, setSaving] = useState(false);
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
    setIsModalOpen(true);
    try {
      const res = await axios.get(`${API_URL}/api/ipt-kits/next-serial`, authHeaders);
      setPreviewSerial(res.data.kit_serial);
    } catch {
      setPreviewSerial('');
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white mb-3">
            <Boxes className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">IPT Kit Assembly</h1>
          <p className="text-sm text-gray-500 mt-2">Record which component serials went into each IPT Kit</p>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 mb-4 flex items-center gap-3">
          <div className="text-sm text-gray-600"><strong>{total}</strong> total kits</div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 mb-4 flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by kit serial or any component serial..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-amber-300"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl shadow flex items-center gap-2 font-medium whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Kit
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-amber-50 text-amber-900">
              <tr>
                <th className="px-4 py-3 text-left">Kit Serial</th>
                {COMPONENT_FIELDS.map((c) => (
                  <th key={c.key} className="px-4 py-3 text-left">{c.label}</th>
                ))}
                <th className="px-4 py-3 text-left">Created By</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {kits.map((kit) => (
                <tr key={kit.kit_id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-mono font-semibold">{kit.kit_serial}</td>
                  {COMPONENT_FIELDS.map((c) => (
                    <td key={c.key} className="px-4 py-3 font-mono">{kit[c.key]}</td>
                  ))}
                  <td className="px-4 py-3">{kit.created_by_name || '—'}</td>
                  <td className="px-4 py-3">{String(kit.created_at).slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEditModal(kit)} title="Edit" className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(kit)} title="Delete" className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && kits.length === 0 && (
                <tr><td colSpan={COMPONENT_FIELDS.length + 4} className="px-4 py-12 text-center text-gray-400">No kits found</td></tr>
              )}
            </tbody>
          </table>
          {cursor && (
            <div className="p-4 text-center">
              <button onClick={() => fetchKits(false)} disabled={loading} className="px-4 py-2 text-amber-700 hover:bg-amber-50 rounded-lg text-sm font-medium">
                {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-1 text-center">
              {editingId ? 'Edit Kit' : 'New Kit'}
            </h2>
            <p className="text-center text-sm text-gray-500 mb-6 font-mono">
              {previewSerial ? `Kit Serial: ${previewSerial}` : ''}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {COMPONENT_FIELDS.map((c) => (
                <div key={c.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{c.label} Serial *</label>
                  <input
                    type="text"
                    required
                    className={`w-full px-4 py-2 rounded-xl border font-mono focus:ring-2 ${
                      fieldError.field === c.key ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-amber-300'
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
                <button type="button" onClick={closeModal} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm font-medium">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl shadow flex items-center gap-2 text-sm font-medium disabled:opacity-70"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? 'Save Changes' : 'Create Kit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default IPTKitAssembly;
