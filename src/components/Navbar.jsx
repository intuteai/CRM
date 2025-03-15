import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User, Clock, Menu, X } from 'lucide-react';
import { io } from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function Navbar({ userRole, userName, token, setUserRole, setShowLogin, handleLogout }) {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    console.log('Socket.IO connecting to:', backendUrl);
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ['websocket'],
    });
    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

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

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const AdminLinks = () => (
    <div className="flex flex-col lg:flex-row lg:space-x-5 space-y-2 lg:space-y-0">
      <Link
        to="/admin-dashboard"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Admin Dashboard"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Dashboard
      </Link>
      <Link
        to="/orders"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Orders"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Orders
      </Link>
      <Link
        to="/queries"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Queries"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Queries
      </Link>
      <Link
        to="/customer-list"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Customers"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Customers
      </Link>
      <Link
        to="/inventory"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Inventory"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Inventory
      </Link>
    </div>
  );

  const CustomerLinks = () => (
    <div className="flex flex-col lg:flex-row lg:space-x-5 space-y-2 lg:space-y-0">
      <Link
        to="/customer-dashboard"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Customer Dashboard"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Dashboard
      </Link>
      <Link
        to="/customer-orders"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Customer Orders"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Orders
      </Link>
      <Link
        to="/customer-queries"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Go to Customer Queries"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Queries
      </Link>
    </div>
  );

  const UserControls = () => (
    <div className="flex flex-col lg:flex-row lg:items-center lg:space-x-5 space-y-2 lg:space-y-0">
      <Link
        to="/edit-profile"
        className="text-gray-200 text-sm lg:text-base font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-105 hover:shadow-md px-3 py-2 rounded-lg bg-gray-700 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Edit Profile"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        <User className="inline-block mr-1.5 w-4 h-4" aria-hidden="true" />
        Edit Profile
      </Link>
      <span className="text-gray-200 text-sm lg:text-base font-medium flex items-center break-words">
        <Clock className="mr-1.5 w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="flex-wrap">Hello, {userName} | {currentTime} (IST)</span>
      </span>
      <button
        onClick={() => { handleLogoutClick(); setIsMobileMenuOpen(false); }}
        className="bg-amber-400 text-gray-900 text-sm lg:text-base font-semibold px-4 py-2 rounded-lg shadow-md hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 transform hover:scale-105 flex items-center"
        aria-label="Logout"
      >
        <LogOut className="mr-1.5 w-4 h-4" aria-hidden="true" />
        Logout
      </button>
    </div>
  );

  return (
    <nav className="bg-gradient-to-r from-gray-800 to-gray-900 p-5 shadow-lg">
      <div className="container mx-auto">
        {/* Desktop Navigation */}
        <div className="hidden lg:flex justify-between items-center">
          <Link
            to={userRole === 'admin' ? '/admin-dashboard' : '/customer-dashboard'}
            className="text-amber-300 text-2xl font-bold hover:text-amber-400 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300"
            aria-label="Go to Dashboard"
          >
            <span className="relative group">
              intute.ai
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-amber-400 group-hover:w-full transition-all duration-300"></span>
            </span>
          </Link>
          <div className="flex items-center space-x-6">
            {userRole === 'admin' && <AdminLinks />}
            {userRole === 'customer' && <CustomerLinks />}
            {userRole && <UserControls />}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="flex lg:hidden justify-between items-center">
          <Link
            to={userRole === 'admin' ? '/admin-dashboard' : '/customer-dashboard'}
            className="text-amber-300 text-xl font-bold hover:text-amber-400 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300"
            aria-label="Go to Dashboard"
          >
            <span className="relative group">
              intute.ai
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-amber-400 group-hover:w-full transition-all duration-300"></span>
            </span>
          </Link>
          <button
            onClick={toggleMobileMenu}
            className="p-2 text-gray-200 hover:text-amber-300 transition-all duration-300"
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden mt-5 space-y-4 py-5 border-t border-gray-700">
            {userRole === 'admin' && <AdminLinks />}
            {userRole === 'customer' && <CustomerLinks />}
            {userRole && <UserControls />}
          </div>
        )}
      </div>
      <ToastContainer 
        position="top-right" 
        autoClose={3000} 
        hideProgressBar={false} 
        closeOnClick 
        pauseOnHover 
        draggable 
        className="mt-16"
      />
    </nav>
  );
}

export default Navbar;