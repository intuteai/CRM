import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, MessageSquare, Truck, Users, FileText, BarChart,
  PenTool, DollarSign, CheckSquare, Mail, MapPin
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function AdminDashboard({ socket }) {
  useEffect(() => {
    if (!socket) return;

    socket.on('orderUpdate', (updatedOrder) => {
      toast.info(`Order #${updatedOrder.id} updated`, { autoClose: 3000 });
    });
    socket.on('newQuery', (query) => {
      toast.info(`New query #${query.queryId} received`, { autoClose: 3000 });
    });
    socket.on('queryUpdate', (updatedQuery) => {
      toast.info(`Query #${updatedQuery.queryId} updated`, { autoClose: 3000 });
    });
    socket.on('stockUpdate', () => {
      toast.info('Inventory stock levels updated', { autoClose: 3000 });
    });
    socket.on('customerUpdate', (updatedCustomer) => {
      toast.info(`Customer ${updatedCustomer.name} updated`, { autoClose: 3000 });
    });

    return () => {
      socket.off('orderUpdate');
      socket.off('newQuery');
      socket.off('queryUpdate');
      socket.off('stockUpdate');
      socket.off('customerUpdate');
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-10 text-center tracking-tight">Admin Dashboard</h1>

      <div className="max-w-7xl mx-auto space-y-12">
        {/* Sales & Customer Management */}
        <Section title="Sales & Customer Management">
          <DashboardCard to="/orders" icon={<Truck />} title="Orders" desc="Track and process orders" />
          <DashboardCard to="/customer-invoices" icon={<FileText />} title="Customer Invoices" desc="View customer invoices" />
          <DashboardCard to="/customer-list" icon={<Users />} title="Customers" desc="View customer details" />
          <DashboardCard to="/enquiries" icon={<Mail />} title="Enquiries" desc="Manage enquiries" />
          <DashboardCard to="/queries" icon={<MessageSquare />} title="Queries" desc="Manage customer inquiries" />
        </Section>

        {/* Inventory & Materials */}
        <Section title="Inventory & Materials">
          <DashboardCard to="/inventory" icon={<Package />} title="Finished Goods" desc="Manage finished goods inventory" />
          <DashboardCard to="/stock" icon={<Package />} title="Raw Materials" desc="Monitor raw material levels" />
          <DashboardCard to="/price-list" icon={<DollarSign />} title="Price List" desc="View pricing details" />
          <DashboardCard to="/bom" icon={<BarChart />} title="Bill of Materials" desc="Bill of materials" />
          <DashboardCard to="/part-drawings" icon={<PenTool />} title="Part Drawings" desc="Access part drawings" />
        </Section>

        {/* Quality & Logistics */}
        <Section title="Quality & Logistics">
          <DashboardCard to="/pdi" icon={<CheckSquare />} title="PDI" desc="Pre-dispatch inspections" />
          <DashboardCard to="/dispatch-tracking" icon={<MapPin />} title="Dispatch Tracking" desc="Track dispatch status" />
        </Section>

        {/* Procurement */}
        <Section title="Procurement">
          <DashboardCard to="/purchase-invoices" icon={<FileText />} title="Purchase Invoices" desc="View supplier invoices" />
        </Section>
      </div>

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
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
        {React.cloneElement(icon, { className: 'w-9 h-9 text-gray-700' })}
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

export default AdminDashboard;