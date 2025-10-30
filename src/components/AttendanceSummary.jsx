import React, { useEffect, useState, useCallback } from 'react';
import { Search, Download, Loader2, Sparkles } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import axios from 'axios';
import { format, parseISO } from 'date-fns';

const API_URL = import.meta.env.VITE_BACKEND_URL;

function AttendanceSummary({ socket }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(() => {
    return new Date().toISOString().split('T')[0]; // Today in YYYY-MM-DD
  });
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async (reset = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = {
        limit: 50,
        // Always send search if not empty
        ...(search && { search }),
        // Always send date if selected
        ...(dateFilter && { date: dateFilter }),
        cursor: reset ? undefined : cursor,
      };

      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Please log in again');
        setLoading(false);
        return;
      }

      const res = await axios.get(`${API_URL}/api/attendance/summary`, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const newData = res.data.attendance || [];
      setData(prev => reset ? newData : [...prev, ...newData]);
      setTotal(res.data.total);
      setCursor(res.data.nextCursor);
      setHasMore(!!res.data.nextCursor);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to load attendance';
      toast.error(msg);
      console.error('Attendance fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, cursor, loading]);

  // Fetch on mount + filter change
  useEffect(() => {
    setData([]);
    setCursor(null);
    fetchData(true);
  }, [search, dateFilter]);

  // Real-time updates
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      toast.info(`${payload.name || 'Employee'} marked attendance`, { autoClose: 3000 });
      fetchData(true);
    };

    socket.on('attendanceMarked', handler);
    return () => socket.off('attendanceMarked', handler);
  }, [socket, fetchData]);

  const exportCSV = () => {
    const headers = ['Date', 'Emp ID', 'Name', 'Email', 'Status', 'Mode', 'In', 'Out'];
    const rows = data.map(r => [
      format(parseISO(r.date), 'dd MMM yyyy'),
      r.employee_id || '-',
      r.name,
      r.email,
      r.status,
      r.mode,
      r.check_in ? format(parseISO(r.check_in), 'hh:mm a') : '-',
      r.check_out ? format(parseISO(r.check_out), 'hh:mm a') : '-',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${search || dateFilter || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
            Attendance Summary
          </h1>
          <p className="text-gray-600 text-lg font-light">
            {search 
              ? `Search: "${search}"${dateFilter ? ` • ${format(parseISO(dateFilter), 'dd MMM yyyy')}` : ''}`
              : dateFilter 
                ? `Attendance for ${format(parseISO(dateFilter), 'dd MMM yyyy')}`
                : 'All employees • Real-time'
            }
          </p>
          {total > 0 && <p className="text-sm text-gray-500 mt-2">{total} record{total > 1 ? 's' : ''}</p>}
        </div>

        {/* Filters */}
        <div className="max-w-6xl mx-auto mb-8 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search name, email, ID..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300 focus:outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <input
            type="date"
            className="px-4 py-3 rounded-xl border border-amber-200 focus:ring-4 focus:ring-amber-300"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
          />
          <button
            onClick={exportCSV}
            className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl flex items-center gap-2 transition-all"
          >
            <Download className="w-5 h-5" /> Export
          </button>
        </div>

        {/* Table */}
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
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      No attendance records found
                    </td>
                  </tr>
                ) : (
                  data.map(r => (
                    <tr key={r.attendance_id} className="hover:bg-amber-50 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-800">
                        {format(parseISO(r.date), 'dd MMM yyyy')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{r.employee_id || '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.name}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                          r.status === 'present' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{r.mode}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {r.check_in ? format(parseISO(r.check_in), 'hh:mm a') : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {r.check_out ? format(parseISO(r.check_out), 'hh:mm a') : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="p-4 text-center">
              <button
                onClick={() => fetchData()}
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

      <ToastContainer position="top-right" />
    </div>
  );
}

export default AttendanceSummary;