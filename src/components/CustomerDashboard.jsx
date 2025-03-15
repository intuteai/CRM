import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, MessageSquare } from 'lucide-react'; // Importing lucide-react icons
import { io } from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Use the environment variable for the backend URL
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function CustomerDashboard() {
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      reconnection: true, // Enable reconnection attempts
      reconnectionAttempts: 5, // Number of reconnection attempts
      reconnectionDelay: 1000, // Delay between reconnection attempts (ms)
    });

    socket.on('connect', () => {
      console.log('Connected to Socket.IO');
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

    // Customer-specific real-time notifications
    socket.on('orderUpdate', (updatedOrder) => {
      toast.info(`Your order #${updatedOrder.id} updated`, { autoClose: 3000 });
    });
    socket.on('queryUpdate', (updatedQuery) => {
      toast.info(`Your query #${updatedQuery.queryId} updated`, { autoClose: 3000 });
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      console.log('Socket.IO disconnected');
    };
  }, []); // Empty dependency array since SOCKET_URL is constant

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
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

export default CustomerDashboard;