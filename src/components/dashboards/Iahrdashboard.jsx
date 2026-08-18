import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Download, FileText, Package, Sparkles } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

function IAHRDashboard({ socket, userRole }) {
  const { notifySuccess, notifyInfo } = useNotify();
  useEffect(() => {
    if (!socket) return;
    socket.on('leaveRequestCreated', (data) => {
      notifyInfo(`New leave request from ${data?.name || 'employee'}`, { autoClose: 4000 });
    });
    socket.on('payrollProcessed', (data) => {
      notifySuccess(`Payroll for ${data?.month || 'month'} processed`, { autoClose: 4000 });
    });
    socket.on('activities:created', (data) => {
      notifyInfo(`New activity: ${data?.summary || ''}`, { autoClose: 3000 });
    });
    socket.on('ia_orders:created', (data) => {
      notifySuccess(`New order: ${data?.invoice_number || ''}`, { autoClose: 3000 });
    });
    return () => {
      socket.off('leaveRequestCreated');
      socket.off('payrollProcessed');
      socket.off('activities:created');
      socket.off('ia_orders:created');
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-25 to-gray-100 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-1000"></div>
      <div className="absolute -bottom-32 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse delay-2000"></div>

      <div className="relative z-10 p-6">
        <div className="text-center mb-16 mt-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>
          <div className="flex justify-center mb-3">
            <span className="inline-flex items-center bg-white border border-amber-200 text-amber-700 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm">
              INTUTE AI
            </span>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-800 via-gray-700 to-amber-700 bg-clip-text text-transparent mb-4 tracking-tight">
            HR Dashboard
          </h1>
          <div className="w-24 h-1 bg-gradient-to-r from-amber-400 to-orange-400 mx-auto rounded-full"></div>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <DashboardCard
              to="/ia-attendance-summary"
              icon={<CalendarCheck />}
              title="Attendance Summary"
              desc="Daily / monthly attendance reports for all employees"
              gradient="from-teal-100 to-cyan-50"
              hoverGradient="hover:from-teal-200 hover:to-cyan-100"
              iconBg="bg-teal-500"
            />
            <DashboardCard
              to="/activities"
              icon={<CalendarDays />}
              title="Activities"
              desc="Manage team tasks and assignments"
              gradient="from-orange-100 to-red-50"
              hoverGradient="hover:from-orange-200 hover:to-red-100"
              iconBg="bg-orange-500"
            />
            <DashboardCard
              to="/ia-orders"
              icon={<Package />}
              title="Dispatch Orders"
              desc="Track VCU and HMI dispatch with serial numbers"
              gradient="from-purple-100 to-violet-50"
              hoverGradient="hover:from-purple-200 hover:to-violet-100"
              iconBg="bg-purple-500"
            />
            <DashboardCard
              to="/hr-payslips"
              icon={<Download />}
              title="Payslip Generator"
              desc="Generate manual payslips with PDF download"
              gradient="from-green-100 to-emerald-50"
              hoverGradient="hover:from-green-200 hover:to-emerald-100"
              iconBg="bg-green-500"
            />
            <DashboardCard
              to="/ia-invoices"
              icon={<FileText />}
              title="Invoice Generator"
              desc="Generate customer invoices with auto GST and PDF download"
              gradient="from-blue-100 to-sky-50"
              hoverGradient="hover:from-blue-200 hover:to-sky-100"
              iconBg="bg-blue-500"
            />
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

export default IAHRDashboard;