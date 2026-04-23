import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Sparkles, ClipboardList } from "lucide-react";
import { useNotify } from '../../hooks/useNotify';

function EmployeeDashboard({ socket, userRole }) {
  const [isLoading, setIsLoading] = useState(true);
  const { notifySuccess } = useNotify();

  useEffect(() => {
    if (!socket) return;
    socket.on("attendanceMarked", (attendance) => {
      notifySuccess(`Attendance marked for ${attendance.date}`, { autoClose: 3000 });
    });
    return () => socket.off("attendanceMarked");
  }, [socket]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10 p-6">
        {isLoading ? (
          <div className="text-center mb-16 mt-8 animate-pulse">
            <div className="inline-flex items-center justify-center mb-4">
              <div className="p-3 bg-gray-200 rounded-2xl w-14 h-14"></div>
            </div>
            <div className="h-12 bg-gray-200 rounded-xl w-96 mx-auto mb-4"></div>
            <div className="w-24 h-1 bg-gray-200 mx-auto rounded-full"></div>
          </div>
        ) : (
          <div className="text-center mb-16 mt-8">
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
              Employee Dashboard
            </h1>
            <div className="w-24 h-1 bg-gradient-to-r from-amber-400 to-orange-400 mx-auto rounded-full"></div>
          </div>
        )}

        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {isLoading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              <>
                <DashboardCard
                  to="/attendance-history"
                  icon={<Clock />}
                  title="Attendance History"
                  desc="View your past attendance records"
                  gradient="from-amber-100 to-yellow-50"
                  hoverGradient="hover:from-amber-200 hover:to-yellow-100"
                  iconBg="bg-amber-500"
                />
                <DashboardCard
                  to="/my-activities"
                  icon={<ClipboardList />}
                  title="My Activities"
                  desc="View and update status of tasks assigned to you"
                  gradient="from-orange-100 to-amber-50"
                  hoverGradient="hover:from-orange-200 hover:to-amber-100"
                  iconBg="bg-orange-500"
                />
              </>
            )}
          </div>
        </div>
      </div>

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
          {React.cloneElement(icon, { className: "w-8 h-8 text-white" })}
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

function SkeletonCard() {
  return (
    <div className="relative w-full bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-amber-100 animate-pulse">
      <div className="flex items-center justify-center mb-6">
        <div className="p-4 bg-gray-200 rounded-2xl w-16 h-16"></div>
      </div>
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded-xl w-3/4 mx-auto"></div>
        <div className="h-5 bg-gray-200 rounded-lg w-5/6 mx-auto"></div>
        <div className="h-5 bg-gray-200 rounded-lg w-4/6 mx-auto"></div>
      </div>
      <div className="mt-6 h-1 bg-gray-200 rounded-full"></div>
    </div>
  );
}

export default EmployeeDashboard;