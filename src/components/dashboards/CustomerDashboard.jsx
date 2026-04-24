import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, MessageSquare } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

function CustomerDashboard({ socket }) {
  const { notifyInfo } = useNotify();

  useEffect(() => {
    if (!socket) return;

    const onOrderUpdate = (updatedOrder) => {
      notifyInfo(`Your order #${updatedOrder.id} updated`, { autoClose: 3000 });
    };
    const onQueryUpdate = (updatedQuery) => {
      notifyInfo(`Your query #${updatedQuery.queryId} updated`, { autoClose: 3000 });
    };

    socket.on('orderUpdate', onOrderUpdate);
    socket.on('queryUpdate', onQueryUpdate);

    return () => {
      socket.off('orderUpdate', onOrderUpdate);
      socket.off('queryUpdate', onQueryUpdate);
    };
  }, [socket]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-12 text-center tracking-tight">Customer Dashboard</h1>
      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-8">
        {/* Orders Card */}
        <Link
          to="/customer-orders"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Navigate to Orders page"
        >
          <div className="flex items-center justify-center mb-6">
            <Package className="w-12 h-12 text-gray-700" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Orders</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">Track your orders</p>
        </Link>

        {/* Queries Card */}
        <Link
          to="/customer-queries"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Navigate to Queries page"
        >
          <div className="flex items-center justify-center mb-6">
            <MessageSquare className="w-12 h-12 text-gray-700" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Queries</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">Manage your inquiries</p>
        </Link>
      </div>
</div>
  );
}

export default CustomerDashboard;