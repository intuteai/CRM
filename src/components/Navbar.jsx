// src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Navbar({ userRole, userName, setUserRole, setShowLogin }) {
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

  const handleLogout = () => {
    fetch('http://localhost:5000/api/auth/logout', { method: 'POST' })
      .then(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('name');
        setUserRole(null);
        navigate('/');
      })
      .catch(err => console.error('Logout error:', err));
  };

  return (
    <nav className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 shadow-lg">
      <div className="container mx-auto flex justify-between items-center">
        <Link
          to={userRole === 'admin' ? '/admin-dashboard' : '/customer-dashboard'}
          className="text-amber-300 text-3xl font-bold hover:text-amber-400 transition-all duration-300 transform hover:scale-105"
        >
          Intute.ai
        </Link>
        <div className="flex items-center space-x-8">
          {userRole === 'admin' && (
            <div className="flex space-x-6">
              <Link
                to="/admin-dashboard"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-110 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50"
              >
                Dashboard
              </Link>
              <Link
                to="/orders"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-110 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50"
              >
                Orders
              </Link>
              <Link
                to="/queries"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-110 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50"
              >
                Queries
              </Link>
              <Link
                to="/customer-list"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-110 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50"
              >
                Customers
              </Link>
            </div>
          )}
          {userRole === 'customer' && (
            <div className="flex space-x-6">
              <Link
                to="/customer-dashboard"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-110 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50"
              >
                Dashboard
              </Link>
              <Link
                to="/customer-orders"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-110 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50"
              >
                Orders
              </Link>
              <Link
                to="/customer-queries"
                className="text-gray-200 text-lg font-medium hover:text-amber-300 transition-all duration-300 transform hover:scale-110 hover:shadow-md px-4 py-2 rounded-lg bg-gray-700 bg-opacity-50"
              >
                Queries
              </Link>
            </div>
          )}
          {userRole && (
            <div className="flex items-center space-x-6">
              <span className="text-gray-200 text-lg font-medium">
                Hello, {userName} | {currentTime} (IST)
              </span>
              <button
                onClick={handleLogout}
                className="bg-amber-400 text-gray-900 text-lg font-semibold px-6 py-3 rounded-lg shadow-md hover:bg-amber-500 transition-all duration-300 transform hover:scale-105"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;