import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Search, Download, Loader2, Sparkles } from 'lucide-react';
import axios from 'axios';
import { debounce } from 'lodash';
import { useNotify } from '../../hooks/useNotify';

const todayIST = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

const formatDisplayDate = (s) => {
  if (!s) return '-';
  const dateStr = s.split('T')[0];
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return '-';
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (s) => {
  if (!s || !s.includes('T')) return '-';
  const timePart = s.split('T')[1];
  const [hours, minutes] = timePart.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return '-';
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const formatISTTime = (date) => {
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).toLowerCase().replace(/:/g, ':');
};

const API_URL = import.meta.env.VITE_BACKEND_URL;

function IAAttendanceSummary({ socket }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(() => todayIST());
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);

  const abortRef = useRef(null);

  const fetchFirstPageQuietly = useCallback(async () => {
    if (loading) return;

    try {
      const params = {
        limit: 50,
        ...(search && { search }),
        ...(dateFilter && { date: dateFilter }),
      };

      const token = localStorage.getItem('token');
      if (!token) return;

      const controller = new AbortController();
      abortRef.current = controller;

      const res = await axios.get(`${API_URL}/api/attendance/summary`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      const firstPage = res.data.attendance || [];

      setData((prev) => {
        const existingIds = new Set(prev.map((r) => r.attendance_id));
        const newUnique = firstPage.filter((r) => !existingIds.has(r.attendance_id));
        return [...newUnique, ...prev];
      });

      setTotal(res.data.total || 0);
      setCursor(res.data.nextCursor || null);
      setHasMore(!!res.data.nextCursor);
      setLastUpdate(new Date());
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }, [search, dateFilter, loading]);

  const fetchData = useCallback(
    async (reset = false, currentCursor = null) => {
      if (loading) return;
      setLoading(true);

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = {
          limit: 50,
          ...(search && { search }),
          ...(dateFilter && { date: dateFilter }),
          ...(reset ? {} : currentCursor ? { cursor: currentCursor } : {}),
        };

        const token = localStorage.getItem('token');
        if (!token) {
          notifyError('Please log in again');
          return;
        }

        const res = await axios.get(`${API_URL}/api/attendance/summary`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        const newData = res.data.attendance || [];
        setData((prev) => (reset ? newData : [...prev, ...newData]));
        setTotal(res.data.total || 0);
        setCursor(res.data.nextCursor || null);
        setHasMore(!!res.data.nextCursor);
        setLastUpdate(new Date());
      } catch (err) {
        if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
        const msg = err.response?.data?.error || 'Failed to load attendance';
        notifyError(msg);
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [search, dateFilter, loading]
  );

  useEffect(() => {
    setData([]);
    setCursor(null);
    setHasMore(true);
    fetchData(true);
  }, [search, dateFilter]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Debounced version of fetchFirstPageQuietly for WebSocket updates
  const debouncedQuietRefresh = useMemo(
    () => debounce(fetchFirstPageQuietly, 1000),
    [fetchFirstPageQuietly]
  );

  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      const currentToday = todayIST();
      const isViewingToday = !dateFilter || dateFilter === currentToday;

      if (!isViewingToday) return;

      notifyInfo(`${payload.name || 'Employee'} marked attendance`, {
        autoClose: 2500,
      });

      if (cursor === null) {
        fetchData(true);
      } else {
        debouncedQuietRefresh();
      }
    };

    socket.on('attendanceMarked', handler);
    return () => {
      socket.off('attendanceMarked', handler);
      debouncedQuietRefresh.cancel();
    };
  }, [socket, dateFilter, cursor, fetchData, debouncedQuietRefresh]);

  // Handle socket reconnection
  useEffect(() => {
    if (!socket) return;

    const onReconnect = () => {
      const currentToday = todayIST();
      const isViewingToday = !dateFilter || dateFilter === currentToday;
      
      if (isViewingToday) {
        fetchData(true);
        notifySuccess('Reconnected - Data refreshed', { autoClose: 2000 });
      }
    };

    socket.on('connect', onReconnect);
    return () => socket.off('connect', onReconnect);
  }, [socket, dateFilter, fetchData]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore && cursor) {
      fetchData(false, cursor);
    }
  }, [loading, hasMore, cursor, fetchData]);

  const debouncedLoadMore = useMemo(() => debounce(loadMore, 300), [loadMore]);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  useEffect(() => {
    return () => debouncedLoadMore.cancel();
  }, [debouncedLoadMore]);

  const exportCSV = useCallback(() => {
    const headers = ['Date', 'Emp ID', 'Name', 'Email', 'Status', 'Mode', 'In', 'Out'];
    const rows = data.map((r) => [
      formatDisplayDate(r.date),
      r.employee_id || '-',
      r.name,
      r.email,
      r.status,
      r.mode,
      r.check_in ? formatTime(r.check_in) : '-',
      r.check_out ? formatTime(r.check_out) : '-',
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const today = todayIST();
    const datePart = dateFilter && dateFilter !== today ? dateFilter : 'today';
    const searchPart = search ? `_search_${search.replace(/[^a-z0-9]/gi, '_').toLowerCase()}` : '';
    a.download = `attendance_${datePart}${searchPart}.csv`;

    a.click();
    URL.revokeObjectURL(url);
  }, [data, search, dateFilter]);

  const currentToday = todayIST();
  const isViewingToday = !dateFilter || dateFilter === currentToday;

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
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            Attendance Summary
          </h1>
          <div className="flex items-center justify-center gap-3 mb-2">
            <p className="text-gray-600 text-lg font-light">
              {search
                ? `Search: "${search}"${dateFilter && dateFilter !== currentToday ? ` • ${formatDisplayDate(dateFilter)}` : ''}`
                : isViewingToday
                ? 'Today'
                : `Attendance for ${formatDisplayDate(dateFilter)}`}
            </p>
            {isViewingToday && (
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-sm text-green-600 font-medium">Live</span>
              </div>
            )}
          </div>
          {total > 0 && (
            <div className="flex items-center justify-center gap-4 mt-2">
              <p className="text-sm text-gray-500">
                {total} record{total > 1 ? 's' : ''}
              </p>
              {lastUpdate && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Updated: {formatISTTime(lastUpdate)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search name, email, ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <input
            type="date"
            className="px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 transition-all"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value || todayIST())}
            max={todayIST()}
          />
          <button
            onClick={exportCSV}
            disabled={data.length === 0}
            className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl flex items-center gap-2 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            <Download className="w-5 h-5" /> Export CSV
          </button>
        </div>

        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-amber-100 to-orange-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Emp ID</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Mode</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">In</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-gray-500 text-lg">
                      {search || (dateFilter && dateFilter !== currentToday)
                        ? 'No records match your filter'
                        : 'No attendance recorded yet today'}
                    </td>
                  </tr>
                ) : (
                  data.map((r) => (
                    <tr key={r.attendance_id} className="hover:bg-amber-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-800">{formatDisplayDate(r.date)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{r.employee_id || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.name}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                            r.status === 'present'
                              ? 'bg-green-100 text-green-800'
                              : r.status === 'absent'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 capitalize">{r.mode || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {r.check_in ? formatTime(r.check_in) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {r.check_out ? formatTime(r.check_out) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {hasMore && data.length > 0 && (
            <div className="p-6 text-center">
              <button
                onClick={debouncedLoadMore}
                disabled={loading}
                className="px-8 py-3 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2 mx-auto transition-all shadow-md"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading more...
                  </>
                ) : (
                  'Load More Records'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

</div>
  );
}

export default IAAttendanceSummary;