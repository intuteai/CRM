import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, LogIn, LogOut, MapPin, RefreshCw, TrendingUp } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';
import PeoplePage from '../shared/PeoplePage';

// ──────────────────────────────────────────────────────────────
// TIMEZONE-SAFE FORMATTERS (no Date → UTC conversions)
// Backend sends local strings: 
//   date: 'YYYY-MM-DD'
//   times: 'YYYY-MM-DDTHH:mm:ss' (no Z)
// ──────────────────────────────────────────────────────────────
const formatDateLocal = (s) => {
  if (!s) return '-';
  // expect 'YYYY-MM-DD'
  const parts = s.split('T')[0].split('-');
  if (parts.length !== 3) return '-';
  const [y, m, d] = parts;
  // en-IN display (DD/MM/YYYY)
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
};

const formatTimeLocal = (s) => {
  if (!s || !s.includes('T')) return '-';
  // 'YYYY-MM-DDTHH:mm:ss'
  const time = s.split('T')[1];
  const [H, M] = time.split(':').map(Number);
  if (Number.isNaN(H) || Number.isNaN(M)) return '-';
  const period = H >= 12 ? 'PM' : 'AM';
  const hh = (H % 12) || 12;
  return `${String(hh).padStart(2, '0')}:${String(M).padStart(2, '0')} ${period}`;
};

const formatMode = (mode) => (mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : '-');

const getStatusColor = (status) =>
  !status
    ? 'bg-gray-100 text-gray-600 border-gray-200'
    : status.toLowerCase() === 'present'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-red-100 text-red-700 border-red-200';

const getModeIcon = (mode) =>
  !mode ? null : mode.toLowerCase() === 'office' ? <MapPin className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />;

function IAAttendanceHistory({ socket }) {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const { notifyError, notifyInfo } = useNotify();

  const fetchAttendance = async () => {
    try {
      // cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/attendance?force_refresh=true`,
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const { attendance: records } = await response.json();
      setAttendance(records || []);
      setLoading(false);
    } catch (err) {
      // ignore cancellations
      if (err?.name === 'AbortError') return;
      console.error('Error fetching attendance:', err?.message || err);
      setError(err?.message || 'Failed to fetch');
      notifyError(err?.message || 'Failed to fetch');
      setLoading(false);
    } finally {
      abortRef.current = null;
    }
  };

  useEffect(() => {
    fetchAttendance();

    if (!socket) return;

    const handler = (payload) => {
      // payload from model: { attendance_id, user_id, date, check_in_time, check_out_time, present_absent, mode, name, created_at }
      setAttendance((prev) => [
        // insert/replace by date (one row per day per user)
        payload,
        ...prev.filter((r) => !(r.user_id === payload.user_id && r.date === payload.date)),
      ]);
      notifyInfo(`Attendance updated for ${formatDateLocal(payload.date)}`);
    };

    socket.on('attendanceMarked', handler);
    return () => {
      socket.off('attendanceMarked', handler);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [socket]);

  const stats = {
    total: attendance.length,
    present: attendance.filter((r) => r.present_absent?.toLowerCase() === 'present').length,
    absent: attendance.filter((r) => r.present_absent?.toLowerCase() === 'absent').length,
  };

  if (error) return <ConnectionError onRetry={fetchAttendance} />;

  return (
    <PeoplePage title="Attendance History" subtitle="Track your daily attendance records">
      <div>
        {/* Stats Cards */}
        {!loading && !error && attendance.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-navy-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-1">Total Days</p>
                  <p className="text-2xl font-bold text-navy-800">{stats.total}</p>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded-xl hidden sm:flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-navy-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-1">Present</p>
                  <p className="text-2xl font-bold text-emerald-600">{stats.present}</p>
                </div>
                <div className="w-10 h-10 bg-emerald-100 rounded-xl hidden sm:flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-navy-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-1">Absent</p>
                  <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
                </div>
                <div className="w-10 h-10 bg-red-100 rounded-xl hidden sm:flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-red-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-gold-300/50 border-t-gold-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500">Loading your attendance records...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-12 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <RefreshCw className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-3">Oops! Something went wrong</h2>
            <p className="text-red-600 mb-6">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                setError(null);
                fetchAttendance();
              }}
              className="inline-flex items-center gap-2 bg-navy-800 text-white font-medium px-6 py-3 rounded-lg hover:bg-navy-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        ) : attendance.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-12 text-center">
            <div className="w-20 h-20 bg-gold-400/25 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-10 h-10 text-gold-600" />
            </div>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-3">No Records Yet</h2>
            <p className="text-gray-500">Start marking your attendance to see records here</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-navy-100">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-navy-50 border-b border-navy-100">
                    <th className="px-5 py-3 text-left">
                      <div className="flex items-center gap-2 text-navy-800 text-sm font-semibold">
                        <Calendar className="w-4 h-4" />
                        Date
                      </div>
                    </th>
                    <th className="px-5 py-3 text-left">
                      <div className="flex items-center gap-2 text-navy-800 text-sm font-semibold">
                        <LogIn className="w-4 h-4" />
                        Check-In
                      </div>
                    </th>
                    <th className="px-5 py-3 text-left">
                      <div className="flex items-center gap-2 text-navy-800 text-sm font-semibold">
                        <LogOut className="w-4 h-4" />
                        Check-Out
                      </div>
                    </th>
                    <th className="px-5 py-3 text-left">
                      <div className="flex items-center gap-2 text-navy-800 text-sm font-semibold">
                        <TrendingUp className="w-4 h-4" />
                        Status
                      </div>
                    </th>
                    <th className="px-5 py-3 text-left">
                      <div className="flex items-center gap-2 text-navy-800 text-sm font-semibold">
                        <MapPin className="w-4 h-4" />
                        Mode
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((record) => (
                    <tr
                      key={`${record.user_id}-${record.date}`}
                      className="border-b border-navy-100 last:border-b-0 hover:bg-navy-50/60 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-navy-800">{formatDateLocal(record.date)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">{formatTimeLocal(record.check_in_time)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">{formatTimeLocal(record.check_out_time)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(record.present_absent)}`}>
                          {record.present_absent}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {getModeIcon(record.mode)}
                          <span className="text-gray-700">{formatMode(record.mode)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-navy-100">
              {attendance.map((record) => (
                <div key={`${record.user_id}-${record.date}`} className="p-4 hover:bg-navy-50/60 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-gold-600" />
                      <span className="font-semibold text-navy-800">{formatDateLocal(record.date)}</span>
                    </div>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(record.present_absent)}`}>
                      {record.present_absent}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-600">
                        <LogIn className="w-4 h-4" />
                        <span>Check-In:</span>
                      </div>
                      <span className="font-medium text-gray-800">{formatTimeLocal(record.check_in_time)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-600">
                        <LogOut className="w-4 h-4" />
                        <span>Check-Out:</span>
                      </div>
                      <span className="font-medium text-gray-800">{formatTimeLocal(record.check_out_time)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-600">
                        {getModeIcon(record.mode)}
                        <span>Mode:</span>
                      </div>
                      <span className="font-medium text-gray-800">{formatMode(record.mode)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PeoplePage>
  );
}

export default IAAttendanceHistory;
