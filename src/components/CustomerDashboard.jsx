import React from 'react';
import { Link } from 'react-router-dom';

function CustomerDashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-semibold text-gray-800 mb-10 text-center tracking-tight">Customer Dashboard</h1>
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Orders Card */}
        <Link
          to="/customer-orders"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200"
        >
          <div className="flex items-center justify-center mb-6">
            <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h18v18H3V3zM9 9h6m-6 4h6m-6 4h6" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Orders</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">Track your orders</p>
        </Link>

        {/* Queries Card */}
        <Link
          to="/customer-queries"
          className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200"
        >
          <div className="flex items-center justify-center mb-6">
            <svg className="w-12 h-12 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5v-2l3-3 4 4 7-7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 text-center">Queries</h2>
          <p className="text-gray-600 text-center mt-3 text-lg">Manage your inquiries</p>
        </Link>
      </div>
    </div>
  );
}

export default CustomerDashboard;