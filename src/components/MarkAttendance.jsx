import React, { useState, useEffect } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function MarkAttendance({ socket }) {
  const [formData, setFormData] = useState({
    present_absent: 'present',
    online_office: 'office',
    wfh: false,
    check_in_time: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 5),
    check_out_time: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 5),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isCheckOutMode, setIsCheckOutMode] = useState(false);
  const [existingRecord, setExistingRecord] = useState(null);
  const [isCheckInAllowed, setIsCheckInAllowed] = useState(true);

  const getCurrentDate = () => {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).split(',')[0];
  };

  const getCurrentISTTime = () => {
    return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 5);
  };

  const getCurrentDateISO = () => {
    return new Date().toISOString().split('T')[0];
  };

  const fetchTodayAttendance = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('No authentication token found');
        return;
      }
      const today = getCurrentDateISO();
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/attendance?date=${today}&force_refresh=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        console.error('Error fetching today’s attendance:', response.status, response.statusText);
        setError(`Failed to fetch attendance: ${response.statusText}`);
        return;
      }
      const { attendance } = await response.json();
      console.log('Today’s attendance:', attendance);
      if (attendance.length > 0 && attendance[0].date === today) {
        setExistingRecord(attendance[0]);
        setIsCheckInAllowed(false); // Disable check-in if any record exists for today
        setIsCheckOutMode(attendance[0].present_absent === 'present' && attendance[0].check_in_time && !attendance[0].check_out_time);
        setFormData({
          present_absent: attendance[0].present_absent,
          online_office: attendance[0].online_office || 'office',
          wfh: attendance[0].wfh || false,
          check_in_time: attendance[0].check_in_time
            ? new Date(attendance[0].check_in_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 5)
            : getCurrentISTTime(),
          check_out_time: getCurrentISTTime(),
        });
      } else {
        setIsCheckInAllowed(true);
        setIsCheckOutMode(false);
        setExistingRecord(null);
        setFormData({
          present_absent: 'present',
          online_office: 'office',
          wfh: false,
          check_in_time: getCurrentISTTime(),
          check_out_time: getCurrentISTTime(),
        });
      }
    } catch (err) {
      console.error('Error fetching today’s attendance:', err.message);
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchTodayAttendance();
    if (socket) {
      socket.on('attendanceMarked', () => fetchTodayAttendance());
      return () => socket.off('attendanceMarked');
    }
  }, [socket]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const today = getCurrentDateISO();
      let checkInTime, checkOutTime, onlineOffice, wfh;

      if (formData.present_absent === 'absent') {
        checkInTime = null;
        checkOutTime = null;
        onlineOffice = null;
        wfh = null;
      } else if (isCheckOutMode) {
        if (!existingRecord || !existingRecord.check_in_time) {
          throw new Error('No existing check-in record found');
        }
        checkInTime = existingRecord.check_in_time;
        checkOutTime = `${today}T${formData.check_out_time}:00Z`;
        onlineOffice = formData.wfh ? 'online' : 'office';
        wfh = formData.wfh;
        if (new Date(checkOutTime) <= new Date(checkInTime)) {
          throw new Error('Check-out time must be after check-in time');
        }
      } else {
        checkInTime = `${today}T${formData.check_in_time}:00Z`;
        checkOutTime = null;
        onlineOffice = formData.wfh ? 'online' : 'office';
        wfh = formData.wfh;
      }

      const payload = {
        date: today,
        present_absent: formData.present_absent,
        online_office: onlineOffice,
        wfh: wfh,
        check_in_time: isCheckOutMode ? undefined : checkInTime,
        check_out_time: checkOutTime,
      };
      console.log('Submitting attendance with token:', token.slice(0, 10) + '...', 'Payload:', payload);
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/attendance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      const data = await response.json();
      console.log('Attendance marked:', data);
      toast.success(isCheckOutMode ? 'Check-out marked successfully' : formData.present_absent === 'absent' ? 'Absent marked successfully' : 'Check-in marked successfully');
      setFormData({
        present_absent: 'present',
        online_office: 'office',
        wfh: false,
        check_in_time: getCurrentISTTime(),
        check_out_time: getCurrentISTTime(),
      });
      setExistingRecord(data);
      setIsCheckInAllowed(false);
      setIsCheckOutMode(false);
      fetchTodayAttendance();
    } catch (err) {
      console.error('Error marking attendance:', err.message);
      setError(err.message);
      if (err.message === 'Check-in already recorded for today') {
        toast.error('Check-in already recorded for today. Please proceed to check-out.');
      } else if (err.message === 'Cannot check out without a prior check-in') {
        toast.error('Please check-in first before marking check-out.');
      } else if (err.message === 'Check-out already recorded for today') {
        toast.error('Check-out already recorded for today.');
      } else if (err.message === 'Date must be today') {
        toast.error('Date must be today’s date.');
      } else if (err.message === 'Check-out time must be after check-in time') {
        toast.error('Check-out time must be after check-in time.');
      } else {
        toast.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-r from-gray-800 to-gray-900 flex items-center justify-center">
      <div className="max-w-lg w-full bg-gray-700 bg-opacity-50 p-8 rounded-xl shadow-lg">
        <h1 className="text-3xl font-bold text-amber-300 mb-6 text-center">
          {isCheckOutMode ? 'Mark Check-Out' : 'Mark Attendance'}
        </h1>
        <p className="text-gray-200 mb-6 text-center font-medium">
          Date: {getCurrentDate()}
        </p>
        {error && <p className="text-red-400 mb-4 text-center font-medium">{error}</p>}
        {existingRecord && existingRecord.present_absent === 'present' && existingRecord.check_in_time && (
          <p className="text-gray-200 mb-6 text-center font-medium">
            Check-in recorded at {new Date(existingRecord.check_in_time).toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })}
          </p>
        )}
        {isCheckInAllowed ? (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-gray-200 font-medium mb-2">Status</label>
              <select
                value={formData.present_absent}
                onChange={(e) => setFormData({ ...formData, present_absent: e.target.value })}
                className="w-full p-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-300 focus:border-amber-300 bg-gray-600 text-gray-200"
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
              </select>
            </div>
            {formData.present_absent === 'present' && (
              <>
                <div className="flex items-center">
                  <label className="text-gray-200 font-medium mr-4">Work From Home</label>
                  <input
                    type="checkbox"
                    checked={formData.wfh}
                    onChange={(e) => setFormData({ ...formData, wfh: e.target.checked })}
                    className="h-5 w-5 text-amber-400 border-amber-200 focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                {formData.wfh && (
                  <div>
                    <label className="block text-gray-200 font-medium mb-2">Location</label>
                    <select
                      value="online"
                      disabled
                      className="w-full p-3 border border-amber-200 rounded-lg bg-gray-500 text-gray-200 cursor-not-allowed"
                    >
                      <option value="online">Online</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-gray-200 font-medium mb-2">Check-In Time</label>
                  <input
                    type="time"
                    value={formData.check_in_time}
                    onChange={(e) => setFormData({ ...formData, check_in_time: e.target.value })}
                    className="w-full p-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-300 focus:border-amber-300 bg-gray-600 text-gray-200"
                  />
                </div>
              </>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-gray-900 font-medium transition-all ${
                loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-amber-400 hover:bg-amber-500'
              }`}
            >
              {loading ? 'Submitting...' : formData.present_absent === 'absent' ? 'Mark Absent' : 'Mark Check-In'}
            </button>
          </form>
        ) : isCheckOutMode ? (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-gray-200 font-medium mb-2">Check-In Time (Fixed)</label>
              <input
                type="time"
                value={new Date(existingRecord?.check_in_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 5)}
                readOnly
                className="w-full p-3 border border-amber-200 rounded-lg bg-gray-500 text-gray-200 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-gray-200 font-medium mb-2">Check-Out Time</label>
              <input
                type="time"
                value={formData.check_out_time}
                onChange={(e) => setFormData({ ...formData, check_out_time: e.target.value })}
                className="w-full p-3 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-300 focus:border-amber-300 bg-gray-600 text-gray-200"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg text-gray-900 font-medium transition-all ${
                loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-amber-400 hover:bg-amber-500'
              }`}
            >
              {loading ? 'Submitting...' : 'Mark Check-Out'}
            </button>
          </form>
        ) : (
          <p className="text-gray-200 mb-4 text-center font-medium">
            Check-in and check-out completed for today. You can check-in again tomorrow.
          </p>
        )}
      </div>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
        className="mt-16"
      />
    </div>
  );
}

export default MarkAttendance;