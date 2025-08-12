import React, { useState, useEffect } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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
        toast.info(`Attendance updated for ${newAttendance.date}`);
      });

      return () => {
        console.log('Stopped listening for attendanceMarked in AttendanceHistory');
        socket.off('attendanceMarked');
      };
    }
  }, [socket]);

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-amber-50 to-gray-100">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Attendance History</h1>
      {loading ? (
        <p className="text-center text-gray-600">Loading...</p>
      ) : error ? (
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              fetchAttendance();
            }}
            className="bg-amber-400 text-gray-900 font-medium px-6 py-3 rounded-xl hover:bg-amber-500"
          >
            Retry
          </button>
        </div>
      ) : attendance.length === 0 ? (
        <p className="text-center text-gray-600">No attendance records found.</p>
      ) : (
        <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-md">
          <table className="w-full table-auto">
            <thead>
              <tr className="bg-amber-100">
                <th className="px-4 py-2 text-left text-gray-700">Date</th>
                <th className="px-4 py-2 text-left text-gray-700">Check-In</th>
                <th className="px-4 py-2 text-left text-gray-700">Check-Out</th>
                <th className="px-4 py-2 text-left text-gray-700">Status</th>
                <th className="px-4 py-2 text-left text-gray-700">Location</th>
                <th className="px-4 py-2 text-left text-gray-700">WFH</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((record) => {
                console.log('Rendering record:', record);
                return (
                  <tr key={`${record.user_id}-${record.date}`} className="border-b">
                    <td className="px-4 py-2">{formatDate(record.date)}</td>
                    <td className="px-4 py-2">{formatTime(record.checkInTime || record.check_in_time)}</td>
                    <td className="px-4 py-2">{formatTime(record.checkOutTime || record.check_out_time)}</td>
                    <td className="px-4 py-2">{record.status || record.present_absent}</td>
                    <td className="px-4 py-2">{record.location || record.online_office}</td>
                    <td className="px-4 py-2">{(record.wfh !== undefined ? record.wfh : record.wfh) ? 'Yes' : 'No'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

export default AttendanceHistory;