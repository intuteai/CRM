import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Search, Download, Loader2 } from 'lucide-react';
import axios from 'axios';
import { debounce } from 'lodash';
import { useNotify } from '../../hooks/useNotify';
import PeoplePage from '../shared/PeoplePage';

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

function AttendanceSummary({ socket }) {
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

  const subtitle = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>
        {search
          ? `Search: "${search}"${dateFilter && dateFilter !== currentToday ? ` • ${formatDisplayDate(dateFilter)}` : ''}`
          : isViewingToday
          ? 'Today'
          : `Attendance for ${formatDisplayDate(dateFilter)}`}
      </span>
      {isViewingToday && (
        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          Live
        </span>
      )}
      {total > 0 && (
        <span className="text-gray-400">
          {total} record{total > 1 ? 's' : ''}
          {lastUpdate && ` · Updated ${formatISTTime(lastUpdate)}`}
        </span>
      )}
    </div>
  );

  return (
    <PeoplePage title="Attendance Summary" subtitle={subtitle}>
      <div className="mb-5 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-[17px] h-[17px]" />
          <input
            type="text"
            placeholder="Search name, email, ID..."
            className="w-full pl-11 pr-4 py-3 rounded-lg border border-navy-100 bg-white shadow-sm focus:ring-2 focus:ring-gold-400 focus:outline-none transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          type="date"
          className="px-4 py-3 rounded-lg border border-navy-100 bg-white shadow-sm focus:ring-2 focus:ring-gold-400 focus:outline-none transition-colors"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value || todayIST())}
          max={todayIST()}
        />
        <button
          onClick={exportCSV}
          disabled={data.length === 0}
          className="px-5 py-3 bg-navy-800 text-white font-medium rounded-lg hover:bg-navy-700 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-navy-50">
              <tr>
                {['Date', 'Emp ID', 'Name', 'Status', 'Mode', 'In', 'Out'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-sm font-semibold text-navy-800 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {data.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-gray-400">
                    {search || (dateFilter && dateFilter !== currentToday)
                      ? 'No records match your filter'
                      : 'No attendance recorded yet today'}
                  </td>
                </tr>
              ) : (
                data.map((r) => (
                  <tr key={r.attendance_id} className="hover:bg-navy-50/60 transition-colors">
                    <td className="px-5 py-3.5 text-navy-800 whitespace-nowrap">{formatDisplayDate(r.date)}</td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{r.employee_id || '-'}</td>
                    <td className="px-5 py-3.5 font-medium text-navy-800">{r.name}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          r.status === 'present'
                            ? 'bg-emerald-100 text-emerald-700'
                            : r.status === 'absent'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 capitalize whitespace-nowrap">{r.mode || '-'}</td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">
                      {r.check_in ? formatTime(r.check_in) : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">
                      {r.check_out ? formatTime(r.check_out) : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Only show "Load More" when there's actually more data AND we have existing data */}
        {hasMore && data.length > 0 && (
          <div className="p-5 text-center border-t border-navy-100">
            <button
              onClick={debouncedLoadMore}
              disabled={loading}
              className="px-6 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 disabled:opacity-50 flex items-center gap-2 mx-auto transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading more...
                </>
              ) : (
                'Load More Records'
              )}
            </button>
          </div>
        )}
      </div>
    </PeoplePage>
  );
}

export default AttendanceSummary;