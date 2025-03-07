import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import Navbar from './components/Navbar';
import AdminDashboard from './components/AdminDashboard';
import OrdersPage from './components/OrdersPage';
import QueriesPage from './components/QueriesPage';
import CustomerList from './components/CustomerList';
import CustomerDashboard from './components/CustomerDashboard';
import CustomerOrdersPage from './components/CustomerOrdersPage';
import CustomerQueriesPage from './components/CustomerQueriesPage';
import ErrorBoundary from './components/ErrorBoundary';
import LoginModal from './components/LoginModal';
import logo from './assets/intute-ai_logo.jpeg';

function App() {
  const [userRole, setUserRole] = useState(localStorage.getItem('role') || null);
  const [userName, setUserName] = useState(localStorage.getItem('name') || 'User');
  const [showLogin, setShowLogin] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const socket = io('http://localhost:5000');
    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => console.error('Socket connection error:', err));
    return () => socket.disconnect();
  }, []);

  const handleLoginSubmit = (role, name) => {
    setUserRole(role);
    setUserName(name);
    localStorage.setItem('role', role);
    localStorage.setItem('name', name);
    setShowLogin(false);
  };

  const showNavbar = userRole && location.pathname !== '/';

  return (
    <>
      {showNavbar && (
        <Navbar
          userRole={userRole}
          userName={userName}
          setUserRole={(role) => {
            setUserRole(role);
            localStorage.setItem('role', role || '');
            if (!role) localStorage.removeItem('name');
          }}
          setShowLogin={() => setShowLogin(true)}
        />
      )}
      <Routes>
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/orders" element={userRole === 'admin' ? <OrdersPage /> : <Navigate to="/" replace />} />
        <Route path="/queries" element={userRole === 'admin' ? <QueriesPage /> : <Navigate to="/" replace />} />
        <Route path="/customer-list" element={userRole === 'admin' ? <CustomerList /> : <Navigate to="/" replace />} />
        <Route path="/customer-dashboard" element={userRole === 'customer' ? <CustomerDashboard /> : <Navigate to="/" replace />} />
        <Route path="/customer-orders" element={userRole === 'customer' ? <CustomerOrdersPage /> : <Navigate to="/" replace />} />
        <Route path="/customer-queries" element={userRole === 'customer' ? <CustomerQueriesPage /> : <Navigate to="/" replace />} />
        <Route
          path="/"
          element={
            !userRole ? (
              <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-gray-100 to-amber-100">
                <div className="relative text-center transform transition-all duration-700 animate-fade-in">
                  <img
                    src={logo}
                    alt="Intute.ai Logo"
                    className="h-72 w-auto mx-auto mb-12 drop-shadow-2xl"
                  />
                  <p className="text-5xl font-semibold text-gray-800 mb-10 tracking-widest uppercase shadow-text">ERP System</p>
                  <button
                    onClick={() => setShowLogin(true)}
                    className="relative bg-gradient-to-r from-amber-300 to-amber-400 text-gray-900 text-2xl font-medium px-16 py-6 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-amber-500 hover:bg-gradient-to-r hover:from-amber-400 hover:to-amber-500"
                  >
                    Login
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-200 to-transparent opacity-0 hover:opacity-30 transition-opacity duration-300 rounded-xl"></span>
                  </button>
                </div>
              </div>
            ) : (
              userRole === 'admin' ? <Navigate to="/admin-dashboard" replace /> : <Navigate to="/customer-dashboard" replace />
            )
          }
        />
      </Routes>
      {showLogin && (
        <LoginModal
          setShowLogin={setShowLogin}
          onSubmit={handleLoginSubmit}
        />
      )}
    </>
  );
}

export default function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}