import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User, Clock } from 'lucide-react'; // Importing lucide-react icons
import { io } from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function Navbar({ userRole, userName, token, setUserRole, setShowLogin, handleLogout }) {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const istTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      setCurrentTime(istTime);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    console.log('Socket.IO connecting to:', backendUrl); // Debug log
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ['websocket'], // Prefer WebSocket over polling
    });
    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

    // Role-based notifications
    if (userRole === 'admin') {
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
    } else if (userRole === 'customer') {
      socket.on('orderUpdate', (updatedOrder) => {
        toast.info(`Your order #${updatedOrder.id} updated`, { autoClose: 3000 });
      });
      socket.on('queryUpdate', (updatedQuery) => {
        toast.info(`Your query #${updatedQuery.queryId} updated`, { autoClose: 3000 });
      });
    }

    return () => socket.disconnect();
  }, [userRole]);

  const handleLogoutClick = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    fetch(`${backendUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    })
      .then(() => {
        handleLogout();
        navigate('/');
        toast.success('Logged out successfully', { autoClose: 3000 });
      })
      .catch(err => {
        console.error('Logout error:', err);
        toast.error('Failed to logout. Please try again.', { autoClose: 3000 });
      });
  };

  return (
    <nav className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 shadow-lg">
      <div className="container mx-auto flex justify-between items-center">
        <Link
          to={userRole === 'admin' ? '/admin-dashboard' : '/customer-dashboard'}
          className="text-amber-300 text-3xl font-bold hover:text-amber-400 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Go to Dashboard"
        >
          intute.ai
        </Link>
        <div className="flex items-center space-x-8">
          {userRole === 'admin' && (
            <div className="flex space-x-6">
              <Link
                to="/admin-dashboard"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Admin Dashboard"
              >
                Dashboard
              </Link>
              <Link
                to="/orders"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Orders"
              >
                Orders
              </Link>
              <Link
                to="/queries"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Queries"
              >
                Queries
              </Link>
              <Link
                to="/customer-list"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Customers"
              >
                Customers
              </Link>
              <Link
                to="/inventory"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Inventory"
              >
                Inventory
              </Link>
            </div>
          )}
          {userRole === 'customer' && (
            <div className="flex space-x-6">
              <Link
                to="/customer-dashboard"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Customer Dashboard"
              >
                Dashboard
              </Link>
              <Link
                to="/customer-orders"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Customer Orders"
              >
                Orders
              </Link>
              <Link
                to="/customer-queries"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Go to Customer Queries"
              >
                Queries
              </Link>
            </div>
          )}
          {userRole && (
            <div className="flex items-center space-x-6">
              <Link
                to="/edit-profile"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Edit Profile"
              >
                <User className="inline-block mr-2 w-5 h-5" aria-hidden="true" />
                Edit Profile
              </Link>
              <span className="text-gray-200 text-lg font-medium flex items-center">
                <Clock className="mr-2 w-5 h-5" aria-hidden="true" />
                Hello, {userName} | {currentTime} (IST)
              </span>
              <button
                onClick={handleLogoutClick}
                className="bg-amber-400 text-gray-900 text-lg font-semibold px-6 py-3 rounded-lg shadow-md hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 transform hover:scale-105 flex items-center"
                aria-label="Logout"
              >
                <LogOut className="mr-2 w-5 h-5" aria-hidden="true" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </nav>
  );
}

export default Navbar;