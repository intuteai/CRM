import React from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, PenTool, FileText, BarChart, CheckSquare, Mail, Wrench
} from 'lucide-react';

function DesignDashboard({ socket }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-10 text-center tracking-tight">Design Dashboard</h1>

      <div className="max-w-7xl mx-auto space-y-12">
        {/* Design & QA */}
        <Section title="Design & QA">
          <DashboardCard to="/queries" icon={<MessageSquare />} title="Queries" desc="Manage customer and internal queries" />
          <DashboardCard to="/part-drawings/raw" icon={<PenTool />} title="Raw Part Drawings" desc="Access raw material drawings" />
          <DashboardCard to="/part-drawings/finished" icon={<PenTool />} title="Finished Part Drawings" desc="Access finished good drawings" />
          <DashboardCard to="/design/enquiries" icon={<Mail />} title="Enquiries" desc="Manage enquiries" />
          <DashboardCard to="/pdi" icon={<CheckSquare />} title="PDI Reports" desc="Pre-dispatch inspection details" />
          <DashboardCard to="/bom" icon={<BarChart />} title="Unpriced BOM" desc="Bill of Materials (view only)" />
          <DashboardCard to="/design/part-creation" icon={<PenTool />} title="Part Creation" desc="Create and manage part creation" />
          <DashboardCard to="/motor-recipes" icon={<Wrench />} title="Motor Recipes" desc="View and manage motor winding recipes" />
        </Section>
      </div>
    </div>
  );
}

function DashboardCard({ to, icon, title, desc }) {
  return (
    <Link
      to={to}
      className="bg-white p-5 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
      aria-label={`Navigate to ${title}`}
    >
      <div className="flex items-center justify-center mb-3">
        {React.cloneElement(icon, { className: 'w-9 h-9 text-gray-700' })}
      </div>
      <h2 className="text-xl font-semibold text-gray-800 text-center">{title}</h2>
      <p className="text-gray-600 text-center mt-1 text-base">{desc}</p>
    </Link>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-700 mb-4">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {children}
      </div>
    </div>
  );
}

export default DesignDashboard;