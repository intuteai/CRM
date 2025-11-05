// ──────────────────────────────────────────────────────────────
// KEY DATE FIX:
// - toYMD(): if value contains 'T' (ISO), parse to Date and use LOCAL parts
//   so '2025-11-05T18:30:00.000Z' → 2025-11-06 in IST.
// - formatDisplayDate() stays date-only & local-safe.
// - openEdit() & <input type="date" /> use toYMD().
// ──────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Search, Plus, Loader2, Sparkles, Edit2, Trash2, Calendar, Flag, Users } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import axios from 'axios';
import debounce from 'lodash.debounce';
import Modal from 'react-modal';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const MAX_CACHED_ACTIVITIES = 200;

const STATUS_COLORS = {
  todo: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
};

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

// Date helpers
const todayIST = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

// Accepts: 'YYYY-MM-DD', ISO with/without Z, Date, or null/undefined.
// IMPORTANT: If it contains 'T', we parse to Date and use *LOCAL* Y/M/D.
const toYMD = (v) => {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();

  // exact YYYY-MM-DD → return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO or anything with 'T' → parse, then use LOCAL parts (IST on your machine)
  if (s.includes('T')) {
    const dt = new Date(s);
    if (!isNaN(dt)) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // fallback: best-effort leading date capture
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

const formatDisplayDate = (value) => {
  const ymd = toYMD(value);
  if (!ymd) return '-';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d); // local date, no UTC shift
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

function ActivitiesPage({ socket }) {
  const [activities, setActivities] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [statusFilter, setStatusFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [form, setForm] = useState({
    summary: '',
    status: 'todo',
    assignee_ids: [], // ARRAY
    due_date: '',
    priority: 'medium',
  });

  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const fetchIdRef = useRef(0);
  const loadMoreRef = useRef();

  useEffect(() => {
    const setModalRoot = () => {
      const root = document.getElementById('root');
      if (root) Modal.setAppElement(root);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setModalRoot);
      return () => document.removeEventListener('DOMContentLoaded', setModalRoot);
    }
    setModalRoot();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ────── FETCH ASSIGNEES ──────
  const fetchAssignees = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await axios.get(`${API_URL}/api/users/employees-hr`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mountedRef.current) {
        setAssignees(res.data || []);
      }
    } catch (err) {
      if (mountedRef.current) {
        console.error('Failed to load assignees:', err);
        toast.error('Could not load team members');
      }
    }
  }, []);

  // ────── FILTER: Check assignees array ──────
  const matchesFilters = useCallback(
    (a) => {
      if (!a) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && a.priority !== priorityFilter) return false;
      if (assigneeFilter !== 'all') {
        const hasAssignee = a.assignees?.some((u) => String(u.user_id) === String(assigneeFilter));
        if (!hasAssignee) return false;
      }
      if (search && !a.summary?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    },
    [statusFilter, priorityFilter, assigneeFilter, search]
  );

  const matchesFiltersRef = useRef(matchesFilters);
  useEffect(() => {
    matchesFiltersRef.current = matchesFilters;
  }, [matchesFilters]);

  // ────── FETCH ACTIVITIES ──────
  const fetchActivities = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please log in again');
        return;
      }

      loadingRef.current = true;
      setLoading(true);

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const currentFetchId = ++fetchIdRef.current;

      try {
        const params = { limit: 50, ...(reset ? {} : cursor ? { cursor } : {}) };
        const res = await axios.get(`${API_URL}/api/activities`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (currentFetchId !== fetchIdRef.current || !mountedRef.current) return;

        const newData = res.data?.data || [];
        setActivities((prev) => {
          const updated = reset ? newData : [...prev, ...newData];
          return updated.slice(0, MAX_CACHED_ACTIVITIES);
        });
        setTotal(res.data?.total || 0);
        setCursor(res.data?.cursor || null);
        setHasMore(Boolean(res.data?.cursor));
      } catch (err) {
        if (err?.name === 'CanceledError') return;
        if (mountedRef.current) {
          toast.error(err.response?.data?.error || 'Failed to load activities');
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          loadingRef.current = false;
          abortRef.current = null;
        }
      }
    },
    [cursor]
  );

  const fetchActivitiesRef = useRef(null);
  useEffect(() => {
    fetchActivitiesRef.current = fetchActivities;
  }, [fetchActivities]);

  useEffect(() => {
    if (!API_URL) {
      toast.error('Backend URL not configured');
      return;
    }
    fetchAssignees();
    fetchActivities(true);
  }, []);

  useEffect(() => {
    if (activities.length === 0 && !loading) fetchActivities(true);
  }, [search, statusFilter, assigneeFilter, priorityFilter]);

  // ────── REAL-TIME UPDATES ──────
  useEffect(() => {
    if (!socket) return;

    const handleCreate = (activity) => {
      toast.success(`New: ${activity.summary}`);
      setActivities((prev) => [activity, ...prev].slice(0, MAX_CACHED_ACTIVITIES));
      setTotal((t) => t + 1);
    };

    const handleUpdate = (activity) => {
      toast.info(`Updated: ${activity.summary}`);
      setActivities((prev) => prev.map((a) => (a.id === activity.id ? activity : a)));
    };

    const handleDelete = ({ id }) => {
      toast.warn('Activity deleted');
      setActivities((prev) => prev.filter((a) => a.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    };

    socket.on('activities:created', handleCreate);
    socket.on('activities:updated', handleUpdate);
    socket.on('activities:deleted', handleDelete);

    return () => {
      socket.off('activities:created', handleCreate);
      socket.off('activities:updated', handleUpdate);
      socket.off('activities:deleted', handleDelete);
    };
  }, [socket]);

  // ────── LOAD MORE ──────
  loadMoreRef.current = () => fetchActivities(false);
  const debouncedLoadMore = useMemo(() => debounce(() => loadMoreRef.current?.(), 300), []);

  const debouncedSetSearch = useMemo(
    () =>
      debounce((v) => {
        if (mountedRef.current) setSearch(v);
      }, 400),
    []
  );

  useEffect(() => {
    return () => {
      debouncedLoadMore.cancel();
      debouncedSetSearch.cancel();
    };
  }, [debouncedLoadMore, debouncedSetSearch]);

  const filteredActivities = useMemo(() => activities.filter(matchesFilters), [activities, matchesFilters]);

  // ────── FORM HANDLERS ──────
  const openCreate = () => {
    setEditingActivity(null);
    setForm({ summary: '', status: 'todo', assignee_ids: [], due_date: '', priority: 'medium' });
    setIsCreateOpen(true);
  };

  const openEdit = (activity) => {
    setEditingActivity(activity);
    setForm({
      summary: activity.summary,
      status: activity.status,
      assignee_ids: activity.assignees?.map((u) => String(u.user_id)) || [],
      due_date: toYMD(activity.due_date), // DATE-SAFE
      priority: activity.priority,
    });
    setIsEditOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in again');
      return;
    }

    const payload = {
      ...form,
      assignee_ids: form.assignee_ids.filter((id) => id), // remove empty
      due_date: toYMD(form.due_date), // ensure YYYY-MM-DD
    };

    if (payload.assignee_ids.length === 0) {
      toast.error('Select at least one assignee');
      return;
    }

    const url = editingActivity
      ? `${API_URL}/api/activities/${editingActivity.id}`
      : `${API_URL}/api/activities`;

    try {
      if (editingActivity) {
        await axios.put(url, payload, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post(url, payload, { headers: { Authorization: `Bearer ${token}` } });
      }
      toast.success(editingActivity ? 'Updated!' : 'Created!');
      setIsCreateOpen(false);
      setIsEditOpen(false);
      setEditingActivity(null);
      fetchActivities(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this activity?')) return;
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Please log in again');
      return;
    }
    try {
      await axios.delete(`${API_URL}/api/activities/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.warn('Deleted');
      setActivities((prev) => prev.filter((a) => a.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const closeModal = () => {
    setIsCreateOpen(false);
    setIsEditOpen(false);
    setEditingActivity(null);
  };

  // ────── RENDER ──────
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden">
      {/* Background Blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="text-center mb-12 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            Activities
          </h1>
          {total > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {total} activit{total > 1 ? 'ies' : 'y'}
            </p>
          )}
        </div>

        {/* Filters */}
        <div className="max-w-7xl mx-auto mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search summary..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                debouncedSetSearch(e.target.value);
              }}
            />
          </div>

          <select
            className="px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>

          <select
            className="px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All Assignees</option>
            {assignees.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name}
              </option>
            ))}
          </select>

          <select
            className="px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Actions */}
        <div className="max-w-7xl mx-auto mb-6 flex justify-between">
          <button
            onClick={openCreate}
            className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl flex items-center gap-2 transition-all"
          >
            <Plus className="w-5 h-5" /> New Activity
          </button>
          <div />
        </div>

        {/* Table */}
        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-amber-100 to-orange-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Summary</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" /> Assignees
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> Due
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    <div className="flex items-center gap-1">
                      <Flag className="w-4 h-4" /> Priority
                    </div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredActivities.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No activities found
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((a) => (
                    <tr key={a.id} className="hover:bg-amber-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-gray-600">#{a.id}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={a.summary}>
                        {a.summary}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[a.status]}`}
                        >
                          {a.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {a.assignees?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {a.assignees.map((u) => (
                              <span key={u.user_id} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">
                                {u.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {a.due_date ? formatDisplayDate(a.due_date) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[a.priority]}`}
                        >
                          {a.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(a)}
                            className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition-all"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(a.id)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="p-4 text-center">
              <button
                onClick={debouncedLoadMore}
                disabled={loading}
                className="px-6 py-2 bg-amber-400 text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 flex items-center gap-2 mx-auto transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Modal
        isOpen={isCreateOpen || isEditOpen}
        onRequestClose={closeModal}
        className="bg-white rounded-2xl p-8 max-w-2xl mx-auto mt-20 shadow-2xl outline-none"
        overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      >
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          {editingActivity ? 'Edit Activity' : 'New Activity'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Assignees</label>
            <div className="border border-amber-200 rounded-xl p-4 max-h-48 overflow-y-auto space-y-2">
              {assignees.length === 0 ? (
                <p className="text-sm text-gray-500">No team members available</p>
              ) : (
                assignees.map((u) => (
                  <label
                    key={u.user_id}
                    className="flex items-center gap-3 p-2 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-amber-500 border-amber-300 rounded focus:ring-amber-300 focus:ring-2 cursor-pointer"
                      checked={form.assignee_ids.includes(String(u.user_id))}
                      onChange={(e) => {
                        const id = String(u.user_id);
                        if (e.target.checked) {
                          setForm({ ...form, assignee_ids: [...form.assignee_ids, id] });
                        } else {
                          setForm({ ...form, assignee_ids: form.assignee_ids.filter((aid) => aid !== id) });
                        }
                      }}
                    />
                    <span className="text-sm text-gray-700">{u.name}</span>
                  </label>
                ))
              )}
            </div>
            {form.assignee_ids.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                {form.assignee_ids.length} assignee{form.assignee_ids.length > 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              className="w-full px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
              value={toYMD(form.due_date)} // DATE-SAFE
              onChange={(e) => setForm({ ...form, due_date: toYMD(e.target.value) })}
              min={todayIST()}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="px-6 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              {editingActivity ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      <ToastContainer position="top-right" />
    </div>
  );
}

export default ActivitiesPage;