import React, { useState, useEffect } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Calendar, Clock, LogIn, LogOut, MapPin, RefreshCw, TrendingUp } from 'lucide-react';

function AttendanceHistory({ socket }) {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatTime = (dateTime) => {
    if (!dateTime) return '-';
    const date = new Date(dateTime);
    return date.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatMode = (mode) => {
    if (!mode) return '-';
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  };

  const getStatusColor = (status) => {
    if (!status) return 'bg-gray-100 text-gray-800 border-gray-200';
    return status.toLowerCase() === 'present' 
      ? 'bg-green-100 text-green-800 border-green-200' 
      : 'bg-red-100 text-red-800 border-red-200';
  };

  const getModeIcon = (mode) => {
    if (!mode) return null;
    return mode.toLowerCase() === 'office' 
      ? <MapPin className="w-4 h-4" />
      : <TrendingUp className="w-4 h-4" />;
  };

  const fetchAttendance = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      console.log('Fetching attendance with token:', token.slice(0, 10) + '...');
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/attendance?force_refresh=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Response status:', response.status, response.statusText);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      const { attendance: records } = await response.json();
      console.log('Raw attendance records:', records);
      setAttendance(records);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching attendance:', err.message);
      setError(err.message);
      toast.error(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();

    if (socket) {
      console.log('Listening for attendanceMarked in AttendanceHistory');
      socket.on('attendanceMarked', (newAttendance) => {
        console.log('Received attendanceMarked:', newAttendance);
        setAttendance((prev) => [
          newAttendance,
          ...prev.filter((record) => record.date !== newAttendance.date),
        ]);
        toast.info(`Attendance updated for ${formatDate(newAttendance.date)}`);
      });

      return () => {
        console.log('Stopped listening for attendanceMarked in AttendanceHistory');
        socket.off('attendanceMarked');
      };
    }
  }, [socket]);

  const stats = {
    total: attendance.length,
    present: attendance.filter(r => r.present_absent?.toLowerCase() === 'present').length,
    absent: attendance.filter(r => r.present_absent?.toLowerCase() === 'absent').length,
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-amber-50 via-orange-50 to-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl mb-4 shadow-lg">
            <Calendar className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent mb-2">
            Attendance History
          </h1>
          <p className="text-gray-600 text-lg">Track your daily attendance records</p>
        </div>

        {/* Stats Cards */}
        {!loading && !error && attendance.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-1">Total Days</p>
                  <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-1">Present</p>
                  <p className="text-3xl font-bold text-green-600">{stats.present}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-1">Absent</p>
                  <p className="text-3xl font-bold text-red-600">{stats.absent}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-600 text-lg">Loading your attendance records...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <RefreshCw className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">Oops! Something went wrong</h2>
            <p className="text-red-600 mb-6 text-lg">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                setError(null);
                fetchAttendance();
              }}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold px-8 py-4 rounded-xl hover:from-amber-500 hover:to-orange-600 shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              <RefreshCw className="w-5 h-5" />
              Try Again
            </button>
          </div>
        ) : attendance.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-12 h-12 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">No Records Yet</h2>
            <p className="text-gray-600 text-lg">Start marking your attendance to see records here</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-amber-50 to-orange-50 border-b-2 border-amber-200">
                    <th className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        <Calendar className="w-4 h-4" />
                        Date
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        <LogIn className="w-4 h-4" />
                        Check-In
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        <LogOut className="w-4 h-4" />
                        Check-Out
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        <TrendingUp className="w-4 h-4" />
                        Status
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2 text-gray-700 font-semibold">
                        <MapPin className="w-4 h-4" />
                        Mode
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((record, index) => {
                    console.log('Rendering record:', record);
                    return (
                      <tr 
                        key={`${record.user_id}-${record.date}`} 
                        className={`border-b border-gray-100 hover:bg-amber-50 transition-colors ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-800">{formatDate(record.date)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700">{formatTime(record.check_in_time)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700">{formatTime(record.check_out_time)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(record.present_absent)}`}>
                            {record.present_absent}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {getModeIcon(record.mode)}
                            <span className="text-gray-700">{formatMode(record.mode)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden divide-y divide-gray-100">
              {attendance.map((record) => (
                <div key={`${record.user_id}-${record.date}`} className="p-4 hover:bg-amber-50 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-amber-500" />
                      <span className="font-semibold text-gray-800">{formatDate(record.date)}</span>
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
                      <span className="font-medium text-gray-800">{formatTime(record.check_in_time)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-600">
                        <LogOut className="w-4 h-4" />
                        <span>Check-Out:</span>
                      </div>
                      <span className="font-medium text-gray-800">{formatTime(record.check_out_time)}</span>
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
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

export default AttendanceHistory;