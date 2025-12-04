import React from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  FileText,
  MessageSquare,
  DollarSign,
  Mail,
  Package,
  MapPin,
  FilePlus
} from 'lucide-react';

function SalesDashboard({ socket }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Sales Dashboard
      </h1>

      <div className="max-w-7xl mx-auto space-y-12">
        {/* Sales & Customer Management */}
        <Section title="Sales & Customer Management">
          <DashboardCard
            to="/orders"
            icon={<Truck />}
            title="Orders"
            desc="Track and process orders"
          />
          <DashboardCard
            to="/customer-invoices"
            icon={<FileText />}
            title="Customer Invoices"
            desc="View customer invoices"
          />
          <DashboardCard
            to="/sales/quotations"
            icon={<FilePlus />}
            title="Quotations"
            desc="Generate customer quotations"
          />
          <DashboardCard
            to="/proforma"
            icon={<FileText />}
            title="Proforma Invoices"
            desc="Create and manage proforma invoices"
          />
          <DashboardCard
            to="/sales/enquiries"
            icon={<Mail />}
            title="Enquiries"
            desc="Manage enquiries"
          />
          <DashboardCard
            to="/queries"
            icon={<MessageSquare />}
            title="Queries"
            desc="Manage customer inquiries"
          />
        </Section>

        {/* Inventory & Pricing */}
        <Section title="Inventory & Pricing">
          <DashboardCard
            to="/inventory"
            icon={<Package />}
            title="Inventory"
            desc="View finished goods inventory"
          />
          <DashboardCard
            to="/price-list"
            icon={<DollarSign />}
            title="Price List"
            desc="Access product pricing"
          />
        </Section>

        {/* Logistics */}
        <Section title="Logistics">
          <DashboardCard
            to="/dispatch-tracking"
            icon={<MapPin />}
            title="Dispatch Tracking"
            desc="Track dispatch status"
          />
        </Section>
      </div>
    </div>
  );
}

// Card Component
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
      <h2 className="text-xl font-semibold text-gray-800 text-center">{title}</h2>
      <p className="text-gray-600 text-center mt-1 text-base">{desc}</p>
    </Link>
  );
}

// Grid Section Wrapper
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

export default SalesDashboard;
