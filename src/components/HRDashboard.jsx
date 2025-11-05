import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Sparkles, Lock } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function HRDashboard({ socket, userRole }) {
  const [activitiesUnlocked, setActivitiesUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!socket) {
      console.warn('Socket.IO not initialized in HRDashboard');
      return;
    }

    socket.on('leaveRequestCreated', (data) => {
      toast.info(`New leave request from ${data?.name || 'employee'}`, { autoClose: 4000 });
    });

    socket.on('payrollProcessed', (data) => {
      toast.success(`Payroll for ${data?.month || 'month'} processed`, { autoClose: 4000 });
    });

    return () => {
      socket.off('leaveRequestCreated');
      socket.off('payrollProcessed');
    };
  }, [socket]);

  // Show Activities for HR and employees
  const showActivities = userRole === "hr" || userRole === "employee";

  const handleUnlockActivities = (e) => {
    e.preventDefault();
    if (password === 'INTUTE') {
      setActivitiesUnlocked(true);
      setError('');
      setPassword('');
      setShowPasswordModal(false);
      setShowPassword(false);
      toast.success('Activities unlocked successfully!', { autoClose: 2000 });
    } else {
      setError('Incorrect password');
      setPassword('');
    }
  };

  const handleCloseModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setError('');
    setShowPassword(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10 p-6">
        {/* Header with enhanced styling */}
        <div className="text-center mb-16 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            HR Dashboard
          </h1>
          <div className="w-24 h-1 bg-gradient-to-r from-amber-400 to-orange-400 mx-auto rounded-full"></div>
        </div>

        {/* Cards Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <DashboardCard
              to="/attendance-summary"
              icon={<CalendarCheck />}
              title="Attendance Summary"
              desc="Daily / monthly attendance reports for all employees"
              gradient="from-teal-100 to-cyan-50"
              hoverGradient="hover:from-teal-200 hover:to-cyan-100"
              iconBg="bg-teal-500"
            />
            {showActivities && !activitiesUnlocked ? (
              <button
                onClick={() => setShowPasswordModal(true)}
                className="group relative w-full bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 bg-gradient-to-br from-orange-100 to-red-50 hover:from-orange-200 hover:to-red-100 border border-amber-200 focus:outline-none focus:ring-4 focus:ring-amber-300 focus:ring-opacity-50 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></div>
                <div className="flex items-center justify-center mb-6">
                  <div className="p-4 bg-orange-500 rounded-2xl shadow-lg transform group-hover:scale-110 transition-transform duration-300 group-hover:rotate-3">
                    <CalendarDays className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-800 text-center mb-3 group-hover:text-gray-900 transition-colors duration-300">
                  Activities
                </h2>
                <p className="text-gray-600 text-center text-base leading-relaxed group-hover:text-gray-700 transition-colors duration-300">
                  Manage team tasks and assignments
                </p>
                <div className="flex items-center justify-center mt-4 gap-2">
                  <Lock className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-orange-600 font-medium">Protected</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
              </button>
            ) : showActivities && activitiesUnlocked ? (
              <DashboardCard
                to="/activities"
                icon={<CalendarDays />}
                title="Activities"
                desc="Manage team tasks and assignments"
                gradient="from-orange-100 to-red-50"
                hoverGradient="hover:from-orange-200 hover:to-red-100"
                iconBg="bg-orange-500"
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 transform animate-slideUp">
            <div className="flex flex-col items-center mb-6">
              <div className="p-4 bg-orange-100 rounded-full mb-4">
                <Lock className="w-10 h-10 text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Activities Locked</h2>
              <p className="text-sm text-orange-600 font-medium text-center bg-orange-50 px-4 py-2 rounded-lg">
                Currently only for Intute users
              </p>
            </div>
            
            <form onSubmit={handleUnlockActivities} className="space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  className="w-full px-4 py-3 pr-12 rounded-xl border-2 border-amber-200 focus:ring-4 focus:ring-amber-300 focus:border-amber-400 focus:outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              
              {error && (
                <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white font-medium rounded-xl shadow-lg hover:shadow-xl hover:from-amber-500 hover:to-orange-500 transition-all"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

function DashboardCard({ to, icon, title, desc, gradient, hoverGradient, iconBg }) {
  return (
    <Link
      to={to}
      className={`group relative w-full bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 bg-gradient-to-br ${gradient} ${hoverGradient} border border-amber-200 focus:outline-none focus:ring-4 focus:ring-amber-300 focus:ring-opacity-50 overflow-hidden`}
      aria-label={`Navigate to ${title}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 transform -translate-x-full group-hover:translate-x-full transition-all duration-1000"></div>
      <div className="flex items-center justify-center mb-6">
        <div className={`p-4 ${iconBg} rounded-2xl shadow-lg transform group-hover:scale-110 transition-transform duration-300 group-hover:rotate-3`}>
          {React.cloneElement(icon, { className: 'w-8 h-8 text-white' })}
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 text-center mb-3 group-hover:text-gray-900 transition-colors duration-300">
        {title}
      </h2>
      <p className="text-gray-600 text-center text-base leading-relaxed group-hover:text-gray-700 transition-colors duration-300">
        {desc}
      </p>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
    </Link>
  );
}

export default HRDashboard;