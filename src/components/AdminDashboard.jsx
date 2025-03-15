import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, MessageSquare, Truck, Users } from 'lucide-react';
import { toast } from 'react-toastify';

function AdminDashboard({ socket }) {
  useEffect(() => {
    if (!socket) return;

    // Real-time event listeners (unchanged from your backend setup)
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

    // Cleanup listeners on unmount
    return () => {
      socket.off('orderUpdate');
      socket.off('newQuery');
      socket.off('queryUpdate');
      socket.off('stockUpdate');
      socket.off('customerUpdate');
    };
  }, [socket]); // Depend on socket prop

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-12 text-center tracking-tight">Admin Dashboard</h1>
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        {/* Orders Card */}
        <Link
          to="/orders"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Navigate to Orders page"
        >
          <div className="flex items-center justify-center mb-6">
            <Truck className="w-12 h-12 text-gray-700" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Orders</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">Track and process orders</p>
        </Link>

        {/* Queries Card */}
        <Link
          to="/queries"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Navigate to Queries page"
        >
          <div className="flex items-center justify-center mb-6">
            <MessageSquare className="w-12 h-12 text-gray-700" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Queries</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">Manage customer inquiries</p>
        </Link>

        {/* Inventory Card */}
        <Link
          to="/inventory"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Navigate to Inventory page"
        >
          <div className="flex items-center justify-center mb-6">
            <Package className="w-12 h-12 text-gray-700" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Inventory</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">Manage stock levels</p>
        </Link>

        {/* Customers Card */}
        <Link
          to="/customer-list"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Navigate to Customers page"
        >
          <div className="flex items-center justify-center mb-6">
            <Users className="w-12 h-12 text-gray-700" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Customers</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">View customer details</p>
        </Link>
      </div>
    </div>
  );
}

export default AdminDashboard;