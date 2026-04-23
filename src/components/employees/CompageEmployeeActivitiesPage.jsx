// ──────────────────────────────────────────────────────────────
// CompageEmployeeActivitiesPage.jsx
// Compage Employee only — role: employee (role_id=9)
// Can only see their assigned tasks + update status
// ──────────────────────────────────────────────────────────────

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  Search,
  Loader2,
  Sparkles,
  Calendar,
  Flag,
  Users,
  MessageSquare,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import axios from "axios";
import debounce from "lodash.debounce";
import Modal from "react-modal";
import { useNotify } from '../../hooks/useNotify';

const API_URL = import.meta.env.VITE_BACKEND_URL;
const MAX_CACHED_ACTIVITIES = 200;

const STATUS_COLORS = {
  todo: "bg-gray-100 text-gray-800",
  in_progress: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
};

const PRIORITY_COLORS = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

const toYMD = (v) => {
  if (!v) return "";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes("T")) {
    const dt = new Date(s);
    if (!isNaN(dt)) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
};

const formatDisplayDate = (value) => {
  const ymd = toYMD(value);
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

function CompageEmployeeActivitiesPage({ socket }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  // Status update modal
  const [statusModal, setStatusModal] = useState(null); // { id, currentStatus }
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  const [commentModal, setCommentModal] = useState(null);
  const [summaryModal, setSummaryModal] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const requestSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getSortIcon = (column) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === "asc"
      ? <ChevronUp className="w-4 h-4 inline ml-1" />
      : <ChevronDown className="w-4 h-4 inline ml-1" />;
  };

  const abortRef = useRef(null);
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);

  const matchesFilters = useCallback(
    (a) => {
      if (!a) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (priorityFilter !== "all" && a.priority !== priorityFilter) return false;
      const searchLower = search.toLowerCase();
      if (searchLower && !a.summary?.toLowerCase().includes(searchLower) && !a.comments?.toLowerCase().includes(searchLower)) return false;
      return true;
    },
    [statusFilter, priorityFilter, search]
  );

  const matchesFiltersRef = useRef(matchesFilters);
  useEffect(() => { matchesFiltersRef.current = matchesFilters; }, [matchesFilters]);

  const fetchActivities = useCallback(async (reset = false, currentCursor = null) => {
    if (loadingRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) { notifyError("Please log in again"); return; }

    loadingRef.current = true;
    setLoading(true);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = {
        limit: 50,
        ...(reset ? {} : currentCursor ? { cursor: currentCursor } : {}),
      };
      const res = await axios.get(`${API_URL}/api/activities`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!mountedRef.current) return;

      const newData = res.data?.data || [];
      setActivities((prev) => {
        const updated = reset ? newData : [...prev, ...newData];
        return updated.slice(0, MAX_CACHED_ACTIVITIES);
      });
      setTotal(res.data?.total || 0);
      setCursor(res.data?.cursor || null);
      setHasMore(Boolean(res.data?.cursor));
    } catch (err) {
      if (err?.name === "CanceledError") return;
      if (mountedRef.current) notifyError(err.response?.data?.error || "Failed to load activities");
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        loadingRef.current = false;
        abortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    setCursor(null);
    setHasMore(true);
    setActivities([]);
    fetchActivities(true, null);
  }, [search, statusFilter, priorityFilter, fetchActivities]);

  useEffect(() => {
    if (!API_URL) { notifyError("Backend URL not configured"); return; }
    fetchActivities(true, null);
    return () => { mountedRef.current = false; };
  }, [fetchActivities]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (activity) => {
      setActivities((prev) => prev.map((a) => (a.id === activity.id ? activity : a)));
    };
    // Employee sees updates to their assigned tasks in real time
    socket.on("activities:updated", handleUpdate);
    return () => { socket.off("activities:updated", handleUpdate); };
  }, [socket]);

  const handleLoadMore = useCallback(() => {
    if (!cursor || loading || loadingRef.current) return;
    fetchActivities(false, cursor);
  }, [cursor, loading, fetchActivities]);

  const debouncedLoadMore = useMemo(() => debounce(handleLoadMore, 300), [handleLoadMore]);
  const debouncedSetSearch = useMemo(
    () => debounce((v) => { if (mountedRef.current) setSearch(v); }, 400),
    []
  );

  useEffect(() => {
    return () => { debouncedLoadMore.cancel(); debouncedSetSearch.cancel(); };
  }, [debouncedLoadMore, debouncedSetSearch]);

  const filteredActivities = useMemo(() => activities.filter(matchesFilters), [activities, matchesFilters]);
  const { notifySuccess, notifyError } = useNotify();

  const sortedActivities = useMemo(() => {
    if (!sortConfig.key) return filteredActivities;
    const items = [...filteredActivities];
    const { key, direction } = sortConfig;
    items.sort((a, b) => {
      let aVal, bVal;
      switch (key) {
        case "summary": aVal = a.summary?.toLowerCase() || ""; bVal = b.summary?.toLowerCase() || ""; break;
        case "status": aVal = a.status; bVal = b.status; break;
        case "due_date": aVal = toYMD(a.due_date) || ""; bVal = toYMD(b.due_date) || ""; break;
        case "priority": { const order = { low: 0, medium: 1, high: 2, urgent: 3 }; aVal = order[a.priority] ?? -1; bVal = order[b.priority] ?? -1; break; }
        default: return 0;
      }
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [filteredActivities, sortConfig]);

  // ── Status update ─────────────────────────────────────────
  const openStatusModal = (activity) => {
    setNewStatus(activity.status);
    setStatusModal({ id: activity.id, summary: activity.summary, currentStatus: activity.status });
  };

  const handleStatusUpdate = async () => {
    if (!statusModal || !newStatus) return;
    if (newStatus === statusModal.currentStatus) {
      setStatusModal(null);
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) { notifyError("Please log in again"); return; }

    setUpdatingStatus(true);
    try {
      const res = await axios.put(
        `${API_URL}/api/activities/${statusModal.id}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActivities((prev) => prev.map((a) => (a.id === statusModal.id ? res.data : a)));
      notifySuccess("Status updated!");
      setStatusModal(null);
    } catch (err) {
      notifyError(err.response?.data?.error || "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10 p-6">
        <div className="text-center mb-12 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <div className="flex justify-center mb-3">
            <span className="inline-flex items-center bg-white border border-amber-200 text-amber-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm">
              Compage
            </span>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            My Activities
          </h1>
          {total > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {total} activit{total > 1 ? "ies" : "y"} assigned to you
              {filteredActivities.length !== total && <> · {filteredActivities.length} shown</>}
            </p>
          )}
        </div>

        {/* Filters — no assignee filter (employee only sees their own) */}
        <div className="max-w-7xl mx-auto mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search activities..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none" value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); debouncedSetSearch(e.target.value); }} />
          </div>
          <select className="px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>
          <select className="px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="all">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-amber-100 to-orange-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">S.No</th>
                  {[["summary", "Summary"], ["status", "Status"], ["due_date", "Due", <Calendar className="w-4 h-4" />], ["priority", "Priority", <Flag className="w-4 h-4" />]].map(([key, label, icon]) => (
                    <th key={key} className="px-6 py-4 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-amber-200" onClick={() => requestSort(key)}>
                      <div className="flex items-center gap-1">{icon}{label}</div>{getSortIcon(key)}
                    </th>
                  ))}
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    <div className="flex items-center gap-1"><Users className="w-4 h-4" /> Assignees</div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                    <div className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> Comments</div>
                  </th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedActivities.length === 0 && !loading ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500">No activities assigned to you</td></tr>
                ) : (
                  sortedActivities.map((a, index) => (
                    <tr key={a.id} className="hover:bg-amber-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-gray-600">#{filteredActivities.length - index}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                        {a.summary ? (
                          <button onClick={() => setSummaryModal(a.summary)} className="text-left text-amber-700 hover:text-amber-900 underline truncate block w-full">
                            {a.summary.length > 60 ? `${a.summary.slice(0, 60)}…` : a.summary}
                          </button>
                        ) : <span className="text-gray-400 italic">—</span>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[a.status]}`}>
                          {a.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{a.due_date ? formatDisplayDate(a.due_date) : "-"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[a.priority]}`}>{a.priority}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {a.assignees?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {a.assignees.map((u) => <span key={u.user_id} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded">{u.name}</span>)}
                          </div>
                        ) : "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                        {a.comments ? (
                          <button onClick={() => setCommentModal(a.comments)} className="text-left text-gray-800 hover:text-gray-900 truncate block w-full">
                            {a.comments.length > 60 ? `${a.comments.slice(0, 60)}…` : a.comments}
                          </button>
                        ) : <span className="text-gray-400 italic">—</span>}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => openStatusModal(a)}
                          className="px-3 py-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-lg text-xs font-medium transition-all"
                        >
                          Update Status
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="p-4 text-center">
              <button onClick={debouncedLoadMore} disabled={loading} className="px-6 py-2 bg-amber-400 text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 flex items-center gap-2 mx-auto">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</> : "Load More"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Modal */}
      <Modal isOpen={!!summaryModal} onRequestClose={() => setSummaryModal(null)} className="bg-white rounded-2xl p-6 max-w-2xl mx-auto mt-20 shadow-2xl outline-none max-h-screen overflow-y-auto" overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Full Summary</h3>
          <button onClick={() => setSummaryModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-600" /></button>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans break-words">{summaryModal}</pre>
        </div>
      </Modal>

      {/* Comment Modal */}
      <Modal isOpen={!!commentModal} onRequestClose={() => setCommentModal(null)} className="bg-white rounded-2xl p-6 max-w-2xl mx-auto mt-20 shadow-2xl outline-none max-h-screen overflow-y-auto" overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Full Comment</h3>
          <button onClick={() => setCommentModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-600" /></button>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl">
          <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans break-words">{commentModal}</pre>
        </div>
      </Modal>

      {/* Status Update Modal */}
      <Modal isOpen={!!statusModal} onRequestClose={() => setStatusModal(null)} className="bg-white rounded-2xl p-8 max-w-md mx-auto mt-40 shadow-2xl outline-none" overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">Update Status</h2>
          <button onClick={() => setStatusModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-600" /></button>
        </div>
        {statusModal && (
          <div className="space-y-5">
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs text-amber-600 font-medium mb-1">Activity</p>
              <p className="text-sm text-gray-800 font-medium">{statusModal.summary}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">New Status</label>
              <div className="space-y-2">
                {[
                  { value: "todo", label: "To Do", color: "bg-gray-100 text-gray-800 border-gray-300" },
                  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-800 border-blue-300" },
                  { value: "done", label: "Done", color: "bg-green-100 text-green-800 border-green-300" },
                ].map((s) => (
                  <label key={s.value} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${newStatus === s.value ? `${s.color} border-current` : "border-gray-200 hover:border-amber-200"}`}>
                    <input type="radio" name="status" value={s.value} checked={newStatus === s.value} onChange={(e) => setNewStatus(e.target.value)} className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setStatusModal(null)} className="px-6 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all">Cancel</button>
              <button
                onClick={handleStatusUpdate}
                disabled={updatingStatus || newStatus === statusModal.currentStatus}
                className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {updatingStatus ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Status"}
              </button>
            </div>
          </div>
        )}
      </Modal>

</div>
  );
}

export default CompageEmployeeActivitiesPage;