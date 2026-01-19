import React from "react";
import { Link } from "react-router-dom";
import {
  Truck,
  Package,
  PenTool,
  CheckSquare,
  BarChart,
  MessageSquare,
  Wrench
} from "lucide-react";

function ProductionDashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Production Dashboard
      </h1>

      <div className="max-w-7xl mx-auto space-y-12">
        {/* Production & Process Management */}
        <Section title="Production Management">
          <DashboardCard
            to="/production-orders"
            icon={<Truck />}
            title="Orders"
            desc="Track and manage orders"
          />
          <DashboardCard
            to="/production-queries"
            icon={<MessageSquare />}
            title="Queries"
            desc="Manage production queries"
          />
          <DashboardCard
            to="/production-stock"
            icon={<Package />}
            title="Raw Materials"
            desc="Monitor raw material levels"
          />
          <DashboardCard
            to="/production-inventory"
            icon={<Package />}
            title="Finished Goods"
            desc="Monitor finished goods stock"
          />
          <DashboardCard
            to="/production-part-drawings-raw"
            icon={<PenTool />}
            title="Raw Material Drawings"
            desc="Access raw material drawings"
          />
          <DashboardCard
            to="/production-part-drawings"
            icon={<PenTool />}
            title="Finished Goods Drawings"
            desc="Access finished goods drawings"
          />
          <DashboardCard
            to="/production-pdi"
            icon={<CheckSquare />}
            title="PDI Reports"
            desc="Pre-dispatch inspections"
          />
          <DashboardCard
            to="/production-bom-unpriced"
            icon={<BarChart />}
            title="Bill of Materials (Unpriced)"
            desc="View unpriced BOMs"
          />
          <DashboardCard
            to="/work-orders"
            icon={<Wrench />}
            title="Work Orders"
            desc="Manage work orders for production"
          />
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
        {React.cloneElement(icon, { className: "w-9 h-9 text-gray-700" })}
      </div>
      <h2 className="text-xl font-semibold text-gray-800 text-center">
        {title}
      </h2>
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

export default ProductionDashboard;
