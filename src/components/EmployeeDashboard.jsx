import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Sparkles } from 'lucide-react'; // removed CheckCircle
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function EmployeeDashboard({ socket }) {
  useEffect(() => {
    if (!socket) {
      console.warn('Socket.IO not initialized in EmployeeDashboard');
      return;
    }

    socket.on('attendanceMarked', (attendance) => {
      console.log('Received attendanceMarked:', attendance);
      toast.success(`Attendance marked for ${attendance.date}`, { autoClose: 3000 });
    });

    return () => {
      socket.off('attendanceMarked');
    };
  }, [socket]);

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
            Employee Dashboard
          </h1>
          <div className="w-24 h-1 bg-gradient-to-r from-amber-400 to-orange-400 mx-auto rounded-full"></div>
          <p className="text-gray-600 mt-4 text-lg font-light">Manage your attendance with ease</p>
        </div>

        <div className="max-w-6xl mx-auto">
          <Section title="Attendance Management">
            {/* Only Attendance History card remains */}
            <DashboardCard
              to="/attendance-history"
              icon={<Clock />}
              title="Attendance History"
              desc="View your past attendance records"
              gradient="from-amber-100 to-yellow-50"
              hoverGradient="hover:from-amber-200 hover:to-yellow-100"
              iconBg="bg-amber-500"
            />
          </Section>
        </div>
      </div>

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
      onClick={() => console.log(`Navigate to ${to}`)}
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

function Section({ title, children }) {
  return (
    <div className="mb-16">
      <div className="text-center mb-10">
        <h3 className="text-3xl font-bold text-gray-700 mb-2 tracking-wide">{title}</h3>
        <div className="w-16 h-0.5 bg-gradient-to-r from-amber-400 to-orange-400 mx-auto rounded-full"></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {children}
      </div>
    </div>
  );
}

export default EmployeeDashboard;
