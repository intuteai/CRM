import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
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
import StockPage from './components/StockPage';
import StoreStockPage from './components/StoreStockPage';
import StoreInventoryPage from './components/StoreInventoryPage'; // Added import
import PriceListPage from './components/PriceListPage';
import PdiPage from './components/PdiPage';
import CustomerInvoicesPage from './components/CustomerInvoicesPage';
import PartDrawingsSelector from './components/PartDrawingsSelector';
import PartDrawingsPage from './components/PartDrawingsPage';
import PartDrawingsRawPage from './components/PartDrawingsRawPage';
import EnquiryPage from './components/EnquiryPage';
import DispatchTrackingPage from './components/DispatchTrackingPage';
import PurchaseInvoicesPage from './components/PurchaseInvoicesPage';
import BOMPage from './components/BOMPage';
import StoreBOMPage from './components/StoreBOMPage';
import ErrorBoundary from './components/ErrorBoundary';
import LoginModal from './components/LoginModal';
import logo from '/intute-ai_logo.jpeg';
import SalesDashboard from './components/SalesDashboard';
import DesignDashboard from './components/DesignDashboard';
import ProductionDashboard from './components/ProductionDashboard';
import StoreDashboard from './components/StoreDashboard';
import DispatchDashboard from './components/DispatchDashboard';
import AccountsDashboard from './components/AccountsDashboard';
import SalesQueriesPage from './components/SalesQueriesPage';
import ProductionQueriesPage from './components/ProductionQueriesPage';
import ProductionOrdersPage from './components/ProductionOrdersPage';
import ProductionStockPage from './components/ProductionStockPage';
import ProductionPartDrawingsRawPage from './components/ProductionPartDrawingsRawPage';
import ProductionPartDrawingsPage from './components/ProductionPartDrawingsPage';
import ProductionPDIPage from './components/ProductionPDIPage';
import ProductionBOMPage from './components/ProductionBOMPage';
import ProblemsPage from './components/ProblemsPage';
import './styles.css';

const ROLES = {
  ADMIN: 'admin',
  CUSTOMER: 'customer',
  SALES: 'sales',
  DESIGN: 'design',
  PRODUCTION: 'production',
  STORE: 'store',
  DISPATCH: 'dispatch',
  ACCOUNTS: 'accounts',
};

const allowedPathsByRole = {
  [ROLES.ADMIN]: [
    '/admin-dashboard', '/orders', '/queries', '/customer-list', '/inventory', '/stock',
    '/price-list', '/pdi', '/customer-invoices', '/part-drawings', '/part-drawings/finished',
    '/part-drawings/raw', '/enquiries', '/dispatch-tracking', '/purchase-invoices', '/bom',
    '/edit-profile', '/problems',
  ],
  [ROLES.CUSTOMER]: ['/customer-dashboard', '/customer-orders', '/customer-queries', '/edit-profile'],
  [ROLES.SALES]: [
    '/sales-dashboard', '/orders', '/sales-queries', '/stock', '/price-list',
    '/customer-invoices', '/enquiries', '/dispatch-tracking', '/edit-profile',
  ],
  [ROLES.DESIGN]: [
    '/design-dashboard', '/queries', '/pdi', '/part-drawings/finished', '/part-drawings/raw',
    '/bom', '/edit-profile',
  ],
  [ROLES.PRODUCTION]: [
    '/production-dashboard', '/production-orders', '/orders', '/production-queries',
    '/production-stock', '/inventory', '/production-part-drawings', '/production-part-drawings-raw',
    '/production-pdi', '/production-bom-unpriced', '/bom', '/edit-profile',
  ],
  [ROLES.STORE]: ['/store-dashboard', '/inventory', '/stock', '/bom', '/edit-profile'],
  [ROLES.DISPATCH]: ['/dispatch-dashboard', '/queries', '/stock', '/pdi', '/dispatch-tracking', '/edit-profile'],
  [ROLES.ACCOUNTS]: [
    '/accounts-dashboard', '/orders', '/customer-invoices', '/dispatch-tracking',
    '/purchase-invoices', '/edit-profile',
  ],
};

function App() {
  const [userRole, setUserRole] = useState(localStorage.getItem('role') || null);
  const [userName, setUserName] = useState(localStorage.getItem('name') || 'User');
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [showLogin, setShowLogin] = useState(!localStorage.getItem('token'));
  const [socket, setSocket] = useState(null);
  const [socketReady, setSocketReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Socket.IO connection
  useEffect(() => {
    if (!userRole || !token || socket) return;

    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    console.log('VITE_BACKEND_URL in App:', backendUrl);
    const newSocket = io(backendUrl, {
      withCredentials: true,
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('Connected to Socket.IO in App');
      setSocketReady(true);
    });
    newSocket.on('connect_error', (err) => {
      console.error('Socket.IO connection error in App:', err.message);
    });
    newSocket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected in App:', reason);
      setSocketReady(false);
    });

    setSocket(newSocket);

    const timeout = setTimeout(() => {
      if (!newSocket.connected) {
        console.warn('Socket.IO connection timeout; proceeding without real-time updates');
        setSocketReady(true);
      }
    }, 10000);

    return () => {
      clearTimeout(timeout);
      newSocket.disconnect();
      console.log('Socket.IO disconnected from App');
      setSocketReady(false);
    };
  }, [userRole, token, socket]);

  // Navigation logic
  useEffect(() => {
    if (!userRole) return;

    const dashboardMap = {
      [ROLES.ADMIN]: '/admin-dashboard',
      [ROLES.SALES]: '/sales-dashboard',
      [ROLES.DESIGN]: '/design-dashboard',
      [ROLES.PRODUCTION]: '/production-dashboard',
      [ROLES.STORE]: '/store-dashboard',
      [ROLES.DISPATCH]: '/dispatch-dashboard',
      [ROLES.ACCOUNTS]: '/accounts-dashboard',
      [ROLES.CUSTOMER]: '/customer-dashboard',
    };

    const allowedPaths = allowedPathsByRole[userRole] || [];
    const targetPath = dashboardMap[userRole];
    const normalizedPath = location.pathname.replace(/\/+$/, '');

    if (!targetPath) {
      console.warn(`Unknown userRole: ${userRole}, redirecting to /`);
      navigate('/', { replace: true });
    } else if (normalizedPath === '' || normalizedPath === '/' || !allowedPaths.includes(normalizedPath)) {
      if (normalizedPath !== targetPath) {
        console.log(`Redirecting: userRole=${userRole}, from=${normalizedPath}, to=${targetPath}`);
        navigate(targetPath, { replace: true });
      }
    }
  }, [userRole, location.pathname, navigate]);

  // Persist state on refresh
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      const storedRole = localStorage.getItem('role');
      if (Object.values(ROLES).includes(storedRole)) {
        setUserRole(storedRole);
        setUserName(localStorage.getItem('name'));
        setToken(storedToken);
        setShowLogin(false);
      } else {
        localStorage.removeItem('role');
        localStorage.removeItem('name');
        localStorage.removeItem('token');
        setShowLogin(true);
      }
    } else {
      setShowLogin(true);
    }
  }, []);

  const handleLoginSubmit = (role, name, submittedToken) => {
    if (!Object.values(ROLES).includes(role)) {
      console.error('Invalid role:', role);
      return;
    }
    setUserRole(role);
    setUserName(name);
    setToken(submittedToken);
    localStorage.setItem('role', role);
    localStorage.setItem('name', name);
    localStorage.setItem('token', submittedToken);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setUserRole(null);
    setUserName('User');
    setToken(null);
    localStorage.removeItem('role');
    localStorage.removeItem('name');
    localStorage.removeItem('token');
    setShowLogin(true);
    if (socket) socket.disconnect();
    setSocket(null);
    setSocketReady(false);
  };

  const showNavbar = userRole && location.pathname !== '/';

  return (
    <>
      {showNavbar && (
        <Navbar
          userRole={userRole}
          userName={userName}
          token={token}
          setUserRole={setUserRole}
          setShowLogin={setShowLogin}
          handleLogout={handleLogout}
          socket={socket}
        />
      )}
      <Routes>
        <Route path="/admin-dashboard" element={<ErrorBoundary><AdminDashboard socket={socket} /></ErrorBoundary>} />
        <Route path="/orders" element={
          userRole === 'production' ? (
            <ErrorBoundary><ProductionOrdersPage socket={socket} userRole={userRole} /></ErrorBoundary>
          ) : ['admin', 'sales', 'accounts'].includes(userRole) ? (
            <ErrorBoundary><OrdersPage socket={socket} /></ErrorBoundary>
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="/queries" element={['admin', 'design', 'dispatch'].includes(userRole) ? <ErrorBoundary><QueriesPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/customer-list" element={userRole === 'admin' ? <ErrorBoundary><CustomerList socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/customer-dashboard" element={userRole === 'customer' ? <ErrorBoundary><CustomerDashboard socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/customer-orders" element={userRole === 'customer' ? <ErrorBoundary><CustomerOrdersPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/customer-queries" element={userRole === 'customer' ? <ErrorBoundary><CustomerQueriesPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/edit-profile" element={userRole ? <ErrorBoundary><EditProfile socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/inventory" element={
          ['admin', 'store', 'production'].includes(userRole) ? (
            <ErrorBoundary> 
              {userRole === 'store' ? (
                <StoreInventoryPage socket={socket} userRole={userRole} />
              ) : (
                <InventoryPage userRole={userRole} socket={socket} />
              )}
            </ErrorBoundary>
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="/stock" element={
          ['admin', 'sales', 'dispatch', 'store'].includes(userRole) ? (
            <ErrorBoundary>
              {userRole === 'store' ? (
                <StoreStockPage socket={socket} />
              ) : userRole === 'production' ? (
                <ProductionStockPage socket={socket} />
              ) : (
                <StockPage socket={socket} />
              )}
            </ErrorBoundary>
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="/price-list" element={['admin', 'sales'].includes(userRole) ? <ErrorBoundary><PriceListPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/pdi" element={['admin', 'design', 'dispatch'].includes(userRole) ? <ErrorBoundary><PdiPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/dispatch-tracking" element={['admin', 'sales', 'dispatch', 'accounts'].includes(userRole) ? <ErrorBoundary><DispatchTrackingPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/customer-invoices" element={['admin', 'sales', 'accounts'].includes(userRole) ? <ErrorBoundary><CustomerInvoicesPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/sales-dashboard" element={userRole === 'sales' ? <ErrorBoundary><SalesDashboard socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/design-dashboard" element={userRole === 'design' ? <ErrorBoundary><DesignDashboard socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-dashboard" element={userRole === 'production' ? <ErrorBoundary><ProductionDashboard socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/store-dashboard" element={userRole === 'store' ? <ErrorBoundary><StoreDashboard socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/dispatch-dashboard" element={userRole === 'dispatch' ? <ErrorBoundary><DispatchDashboard socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/accounts-dashboard" element={userRole === 'accounts' ? <ErrorBoundary><AccountsDashboard socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/account-dashboard" element={<Navigate to="/accounts-dashboard" replace />} />
        <Route path="/part-drawings" element={userRole === 'admin' ? <ErrorBoundary><PartDrawingsSelector /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/part-drawings/finished" element={['admin', 'design'].includes(userRole) ? <ErrorBoundary><PartDrawingsPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/part-drawings/raw" element={['admin', 'design'].includes(userRole) ? <ErrorBoundary><PartDrawingsRawPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/enquiries" element={['admin', 'sales'].includes(userRole) ? <ErrorBoundary><EnquiryPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/purchase-invoices" element={['admin', 'accounts'].includes(userRole) ? <ErrorBoundary><PurchaseInvoicesPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/bom" element={
          ['admin', 'design', 'store', 'production'].includes(userRole) ? (
            <ErrorBoundary>
              {userRole === 'store' ? (
                <StoreBOMPage socket={socket} userRole={userRole} />
              ) : userRole === 'production' ? (
                <ProductionBOMPage socket={socket} userRole={userRole} />
              ) : (
                <BOMPage socket={socket} />
              )}
            </ErrorBoundary>
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="/sales-queries" element={userRole === 'sales' ? <ErrorBoundary><SalesQueriesPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-queries" element={userRole === 'production' ? <ErrorBoundary><ProductionQueriesPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-orders" element={userRole === 'production' ? <ErrorBoundary><ProductionOrdersPage socket={socket} userRole={userRole} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-stock" element={userRole === 'production' ? <ErrorBoundary><ProductionStockPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-part-drawings-raw" element={userRole === 'production' ? <ErrorBoundary><ProductionPartDrawingsRawPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-part-drawings" element={userRole === 'production' ? <ErrorBoundary><ProductionPartDrawingsPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-pdi" element={userRole === 'production' ? <ErrorBoundary><ProductionPDIPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route path="/production-bom-unpriced" element={userRole === 'production' ? <ErrorBoundary><ProductionBOMPage socket={socket} /></ErrorBoundary> : <Navigate to="/" replace />} />
        <Route
          path="/problems"
          element={
            userRole === 'admin' ? (
              <ErrorBoundary>
                <ProblemsPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
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
              <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-gray-100 to-amber-100">
                <div className="text-center">
                  <h1 className="text-3xl font-bold text-gray-800 mb-4">Invalid Role</h1>
                  <p className="text-gray-600 mb-6">Your user role ({userRole}) is not recognized. Please log out and try again.</p>
                  <button
                    onClick={handleLogout}
                    className="bg-amber-400 text-gray-900 font-medium px-6 py-3 rounded-xl hover:bg-amber-500 transition-all"
                  >
                    Log Out
                  </button>
                </div>
              </div>
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
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </Router>
  );
}