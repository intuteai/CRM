import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Navbar from './components/Navbar';
import AdminDashboard from './components/AdminDashboard';
import OrdersPage from './components/OrdersPage';
import QueriesPage from './components/QueriesPage';
import CustomerList from './components/CustomerList';
import CustomerDashboard from './components/CustomerDashboard';
import CustomerOrdersPage from './components/CustomerOrdersPage';
import CustomerQueriesPage from './components/CustomerQueriesPage';
import EditProfile from './components/EditProfile';
import InventoryPage from './components/InventoryPage';
import ErrorBoundary from './components/ErrorBoundary';
import LoginModal from './components/LoginModal';
import logo from '/intute-ai_logo.jpeg';

function App() {
  const [userRole, setUserRole] = useState(localStorage.getItem('role') || null);
  const [userName, setUserName] = useState(localStorage.getItem('name') || 'User');
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  // Initialize showLogin based on whether token exists in localStorage
  const [showLogin, setShowLogin] = useState(!localStorage.getItem('token'));
  const [socket, setSocket] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    console.log('VITE_BACKEND_URL in App:', import.meta.env.VITE_BACKEND_URL);
    const newSocket = io(backendUrl, {
      withCredentials: true,
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('Connected to Socket.IO');
      toast.success('Connected to real-time updates!', {
        autoClose: 2000,
        toastId: 'socket-connect',
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      console.log('Socket.IO disconnected from App');
    };
  }, []);

  // Ensure state persists correctly on refresh
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setUserRole(localStorage.getItem('role'));
      setUserName(localStorage.getItem('name'));
      setToken(storedToken);
      setShowLogin(false); // Don't show login if token exists
    } else {
      setShowLogin(true); // Show login if no token
    }
  }, []); // Runs only on mount

  const handleLoginSubmit = (role, name, token) => {
    setUserRole(role);
    setUserName(name);
    setToken(token);
    localStorage.setItem('role', role);
    localStorage.setItem('name', name);
    localStorage.setItem('token', token);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setUserRole(null);
    setUserName('User');
    setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('name');
    localStorage.removeItem('token');
    setShowLogin(true); // Show login modal after logout
    if (socket) socket.disconnect();
  };

  const showNavbar = userRole && location.pathname !== '/';

  return (
    <>
      {showNavbar && (
        <Navbar
          userRole={userRole}
          userName={userName}
          setUserRole={setUserRole}
          setShowLogin={() => setShowLogin(true)}
          handleLogout={handleLogout}
        />
      )}
      <Routes>
        <Route path="/admin-dashboard" element={<AdminDashboard socket={socket} />} />
        <Route path="/orders" element={userRole === 'admin' ? <OrdersPage socket={socket} /> : <Navigate to="/" replace />} />
        <Route path="/queries" element={userRole === 'admin' ? <QueriesPage socket={socket} /> : <Navigate to="/" replace />} />
        <Route path="/customer-list" element={userRole === 'admin' ? <CustomerList socket={socket} /> : <Navigate to="/" replace />} />
        <Route path="/customer-dashboard" element={userRole === 'customer' ? <CustomerDashboard socket={socket} /> : <Navigate to="/" replace />} />
        <Route path="/customer-orders" element={userRole === 'customer' ? <CustomerOrdersPage socket={socket} /> : <Navigate to="/" replace />} />
        <Route path="/customer-queries" element={userRole === 'customer' ? <CustomerQueriesPage socket={socket} /> : <Navigate to="/" replace />} />
        <Route path="/edit-profile" element={userRole ? <EditProfile socket={socket} /> : <Navigate to="/" replace />} />
        <Route path="/inventory" element={userRole === 'admin' ? <InventoryPage userRole={userRole} socket={socket} /> : <Navigate to="/" replace />} />
        <Route
          path="/"
          element={
            !userRole ? (
              <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-gray-100 to-amber-100">
                <div className="relative text-center transform transition-all duration-700 animate-fade-in">
                  <img
                    src={logo}
                    alt="Intute.ai Logo"
                    className="h-72 w-auto mx-auto mb-12 drop-shadow-2xl animate-float"
                    style={{ animation: 'float 6s ease-in-out infinite' }}
                  />
                  <div className="relative">
                    <p
                      className="text-5xl font-semibold text-gray-800 mb-10 tracking-wider uppercase relative z-10"
                      style={{
                        textShadow: '0 2px 4px rgba(0,0,0,0.1), 0 8px 16px rgba(222,170,50,0.2)',
                        letterSpacing: '0.15em',
                      }}
                    >
                      <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-amber-900">Business</span>
                      <span className="px-3 text-gray-700">Planner</span>
                    </p>
                    <div className="absolute -inset-1 blur-sm bg-gradient-to-r from-amber-200 via-transparent to-amber-200 opacity-20 z-0"></div>
                  </div>
                  <button
                    onClick={() => setShowLogin(true)}
                    className="relative overflow-hidden bg-gradient-to-r from-amber-300 to-amber-400 text-gray-900 text-2xl font-medium px-16 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-500 transform hover:-translate-y-1 border border-amber-500 group"
                  >
                    <span className="relative z-10">Login</span>
                    <span className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"></span>
                    <span className="absolute -inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-200 to-transparent transform translate-y-0 group-hover:translate-y-full transition-all duration-1000"></span>
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
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </>
  );
}

const styleTag = document.createElement('style');
styleTag.textContent = `
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
`;
document.head.appendChild(styleTag);

export default function AppWrapper() {
  return (
    <Router>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Router>
  );
}