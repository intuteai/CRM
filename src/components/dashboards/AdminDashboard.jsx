import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, MessageSquare, Truck, Users, FileText, BarChart,
  PenTool, DollarSign, CheckSquare, Mail, MapPin, AlertTriangle, Wrench
} from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

function AdminDashboard({ socket }) {
  const { notifyInfo } = useNotify();
  useEffect(() => {
    if (!socket) return;

    socket.on('orderUpdate', (updatedOrder) => {
      notifyInfo(`Order #${updatedOrder.id} updated`, { autoClose: 3000 });
    });
    socket.on('newQuery', (query) => {
      notifyInfo(`New query #${query.queryId} received`, { autoClose: 3000 });
    });
    socket.on('queryUpdate', (updatedQuery) => {
      notifyInfo(`Query #${updatedQuery.queryId} updated`, { autoClose: 3000 });
    });
    socket.on('stockUpdate', () => {
      notifyInfo('Inventory stock levels updated', { autoClose: 3000 });
    });
    socket.on('customerUpdate', (updatedCustomer) => {
      notifyInfo(`Customer ${updatedCustomer.name} updated`, { autoClose: 3000 });
    });
    socket.on('problem:created', (newProblem) => {
      notifyInfo(`New problem #${newProblem.id} reported`, { autoClose: 3000 });
    });
    socket.on('solution:created', (data) => {
      notifyInfo(`Solution added to problem #${data.problem_id}`, { autoClose: 3000 });
    });
    socket.on('processUpdate', () => {
      notifyInfo('Work orders updated', { autoClose: 3000 });
    });

    return () => {
      socket.off('orderUpdate');
      socket.off('newQuery');
      socket.off('queryUpdate');
      socket.off('stockUpdate');
      socket.off('customerUpdate');
      socket.off('problem:created');
      socket.off('solution:created');
      socket.off('processUpdate');
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-10 text-center tracking-tight">Admin Dashboard</h1>

      <div className="max-w-7xl mx-auto space-y-12">
        <Section title="Sales & Customer Management">
          <DashboardCard to="/orders" icon={<Truck />} title="Orders" desc="Track and process orders" />
          <DashboardCard to="/customer-invoices" icon={<FileText />} title="Customer Invoices" desc="View customer invoices" />
          <DashboardCard to="/customer-list" icon={<Users />} title="Customers" desc="View customer details" />
          <DashboardCard to="/enquiries" icon={<Mail />} title="Enquiries" desc="Manage enquiries" />
          <DashboardCard to="/queries" icon={<MessageSquare />} title="Queries" desc="Manage customer inquiries" />
          <DashboardCard to="/quotation" icon={<FileText />} title="Quotations" desc="Create and manage quotations" />
          <DashboardCard to="/proforma" icon={<FileText />} title="Proforma Invoices" desc="Create and manage proforma invoices" />
          <DashboardCard to="/delivery-challan" icon={<FileText />} title="Delivery Challan" desc="Create and manage delivery challans" />
        </Section>

        <Section title="Inventory & Materials">
          <DashboardCard to="/inventory" icon={<Package />} title="Finished Goods" desc="Manage finished goods inventory" />
          <DashboardCard to="/stock" icon={<Package />} title="Raw Materials" desc="Monitor raw material levels" />
          <DashboardCard to="/price-list" icon={<DollarSign />} title="Price List" desc="View pricing details" />
          <DashboardCard to="/bom" icon={<BarChart />} title="Bill of Materials" desc="Bill of materials" />
          <DashboardCard to="/part-drawings" icon={<PenTool />} title="Part Drawings" desc="Access part drawings" />
          <DashboardCard to="/part-creation" icon={<PenTool />} title="Part Creation" desc="Create and manage part creation" />
        </Section>

        {/* Production Management */}
        <Section title="Production Management">
          <DashboardCard to="/work-orders" icon={<Wrench />} title="Work Orders" desc="Manage work orders for production" />
          <DashboardCard to="/motor-recipes" icon={<Wrench />} title="Motor Recipes" desc="Winding specs per customer motor" />
        </Section>

        {/* Quality & Logistics */}
        <Section title="Quality & Logistics">
          <DashboardCard to="/pdi" icon={<CheckSquare />} title="PDI" desc="Pre-dispatch inspections" />
          <DashboardCard to="/dispatch-tracking" icon={<MapPin />} title="Dispatch Tracking" desc="Track dispatch status" />
          <DashboardCard to="/problems" icon={<AlertTriangle />} title="Problems" desc="Manage reported problems" />
        </Section>

        {/* Procurement */}
        <Section title="Procurement">
          <DashboardCard to="/purchase-order"   icon={<FileText />} title="Purchase Orders"   desc="Create and manage purchase orders" />
          <DashboardCard to="/purchase-invoices" icon={<FileText />} title="Purchase Invoices" desc="View supplier invoices" />
        </Section>

        {/* Service & Repair */}
        <Section title="Service &amp; Repair">
          <DashboardCard to="/service-repair" icon={<Wrench />} title="Repair Records" desc="Log and manage service & repair jobs" />
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