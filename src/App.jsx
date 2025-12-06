// src/App.jsx
import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import io from "socket.io-client";

// dashboards
import AdminDashboard from "./components/dashboards/AdminDashboard";
import SalesDashboard from "./components/dashboards/SalesDashboard";
import ProductionDashboard from "./components/dashboards/ProductionDashboard";
import DesignDashboard from "./components/dashboards/DesignDashboard";
import StoreDashboard from "./components/dashboards/StoreDashboard";
import AccountsDashboard from "./components/dashboards/AccountsDashboard";
import CustomerDashboard from "./components/dashboards/CustomerDashboard";
import DispatchDashboard from "./components/dashboards/DispatchDashboard";
import EmployeeDashboard from "./components/dashboards/EmployeeDashboard";
import HRDashboard from "./components/dashboards/HRDashboard";

// admin
import EnquiryPage from "./components/admin/EnquiryPage";
import ProblemsPage from "./components/admin/ProblemsPage";
import ProformaForm from "./components/admin/ProformaForm";
import QueriesPage from "./components/admin/QueriesPage";
import QuotationForm from "./components/admin/QuotationForm";
import WorkOrderPage from "./components/admin/WorkOrderPage";
import BOMPage from "./components/admin/BOMPage";
import CustomerList from "./components/admin/CustomerList";
import InventoryPage from "./components/admin/InventoryPage";
import StockPage from "./components/admin/StockPage";
import PriceListPage from "./components/admin/PriceListPage";
import PdiPage from "./components/admin/PdiPage";
import CustomerInvoicesPage from "./components/admin/CustomerInvoicesPage";
import PartDrawingsSelector from "./components/admin/PartDrawingsSelector";
import PartDrawingsPage from "./components/admin/PartDrawingsPage";
import PartDrawingsRawPage from "./components/admin/PartDrawingsRawPage";
import PurchaseInvoicesPage from "./components/admin/PurchaseInvoicesPage";
import SelectOrderPage from "./components/admin/SelectOrderPage";
import CreateMotorProcess from "./components/admin/CreateMotorProcess";
import CreateNonMotorProcess from "./components/admin/CreateNonMotorProcess";

// sales
import SalesQueriesPage from "./components/sales/SalesQueriesPage";
import SalesEnquiryPage from "./components/sales/SalesEnquiryPage";
import SalesQuotationForm from "./components/sales/SalesQuotationForm"; 
import SalesProformaForm from "./components/sales/SalesProformaForm"; 

// design 
import DesignEnquiryPage from "./components/design/DesignEnquiryPage";

// production
import ProductionQueriesPage from "./components/production/ProductionQueriesPage";
import ProductionOrdersPage from "./components/production/ProductionOrdersPage";
import ProductionStockPage from "./components/production/ProductionStockPage";
import ProductionPartDrawingsRawPage from "./components/production/ProductionPartDrawingsRawPage";
import ProductionPartDrawingsPage from "./components/production/ProductionPartDrawingsPage";
import ProductionPDIPage from "./components/production/ProductionPDIPage";
import ProductionBOMPage from "./components/production/ProductionBOMPage";

// employees
import AttendanceHistory from "./components/employees/AttendanceHistory";

// hr
import HRPayslipForm from "./components/hr/HRPayslipForm"; 
import AttendanceSummary from "./components/hr/AttendanceSummary"; 

// customers
import CustomerOrdersPage from "./components/customers/CustomerOrdersPage";
import CustomerQueriesPage from "./components/customers/CustomerQueriesPage";

// stores
import StoreStockPage from "./components/stores/StoreStockPage";
import StoreInventoryPage from "./components/stores/StoreInventoryPage";
import StoreBOMPage from "./components/stores/StoreBOMPage";

// pages
import ActivitiesPage from "./components/pages/ActivitiesPage";
import OrdersPage from "./components/pages/OrdersPage";
import EditProfile from "./components/pages/EditProfile";
import DispatchTrackingPage from "./components/pages/DispatchTrackingPage";
import LoginModal from "./components/pages/LoginModal";
import Navbar from "./components/pages/Navbar"; 

import ErrorBoundary from "./components/ErrorBoundary";
import logo from "/intute-ai_logo.jpeg";
import "./styles.css";

const ROLES = {
  ADMIN: "admin",
  CUSTOMER: "customer",
  SALES: "sales",
  DESIGN: "design",
  PRODUCTION: "production",
  STORE: "store",
  DISPATCH: "dispatch",
  ACCOUNTS: "accounts",
  EMPLOYEE: "employee",
  HR: "hr",
};

const allowedPathsByRole = {
  [ROLES.ADMIN]: [
    "/admin-dashboard",
    "/orders",
    "/queries",
    "/customer-list",
    "/inventory",
    "/stock",
    "/price-list",
    "/pdi",
    "/customer-invoices",
    "/part-drawings",
    "/part-drawings/finished",
    "/part-drawings/raw",
    "/enquiries",
    "/dispatch-tracking",
    "/purchase-invoices",
    "/bom",
    "/edit-profile",
    "/problems",
    "/work-orders",
    "/select-component/:orderId/:action",
    "/processes/:orderId",
    "/processes/non-motor/:orderId",
    "/quotation", // admin quotation page
    "/proforma", // admin proforma page
  ],
  [ROLES.CUSTOMER]: [
    "/customer-dashboard",
    "/customer-orders",
    "/customer-queries",
    "/edit-profile",
  ],
  [ROLES.SALES]: [
    "/sales-dashboard",
    "/orders",
    "/inventory",
    "/sales-queries",
    "/stock",
    "/price-list",
    "/customer-invoices",
    "/sales/enquiries",
    "/dispatch-tracking",
    "/edit-profile",
    "/sales/quotations", 
    "/proforma", 
  ],
  [ROLES.DESIGN]: [
    "/design-dashboard",
    "/queries",
    "/design/enquiries",
    "/pdi",
    "/part-drawings/finished",
    "/part-drawings/raw",
    "/bom",
    "/edit-profile",
  ],
  [ROLES.PRODUCTION]: [
    "/production-dashboard",
    "/production-orders",
    "/orders",
    "/production-queries",
    "/production-stock",
    "/inventory",
    "/production-part-drawings",
    "/production-part-drawings-raw",
    "/production-pdi",
    "/production-bom-unpriced",
    "/bom",
    "/edit-profile",
  ],
  [ROLES.STORE]: [
    "/store-dashboard",
    "/inventory",
    "/stock",
    "/bom",
    "/edit-profile",
  ],
  [ROLES.DISPATCH]: [
    "/dispatch-dashboard",
    "/queries",
    "/stock",
    "/pdi",
    "/dispatch-tracking",
    "/edit-profile",
  ],
  [ROLES.ACCOUNTS]: [
    "/accounts-dashboard",
    "/orders",
    "/customer-invoices",
    "/dispatch-tracking",
    "/purchase-invoices",
    "/edit-profile",
  ],
  [ROLES.EMPLOYEE]: [
    "/employee-dashboard",
    "/attendance-history",
    "/edit-profile",
    "/activities",
  ],
  [ROLES.HR]: [
    "/hr-dashboard",
    "/attendance-summary",
    "/edit-profile",
    "/activities",
    "/hr-payslips", // ← NEW: Payslip Generator
  ],
};

function App() {
  const [userRole, setUserRole] = useState(
    localStorage.getItem("role") || null
  );
  const [userName, setUserName] = useState(
    localStorage.getItem("name") || "User"
  );
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [showLogin, setShowLogin] = useState(!localStorage.getItem("token"));
  const [socket, setSocket] = useState(null);
  const [socketReady, setSocketReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!userRole || !token || socket) return;

    const backendUrl = import.meta.env.VITE_BACKEND_URL;
    if (!backendUrl) {
      console.error("VITE_BACKEND_URL is not defined in .env");
      return;
    }

    const newSocket = io(backendUrl, {
      withCredentials: true,
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      auth: { token },
    });

    newSocket.on("connect", () => {
      console.log("Connected to Socket.IO in App");
      setSocketReady(true);
    });
    newSocket.on("connect_error", (err) => {
      console.error("Socket.IO connection error in App:", err.message);
      setSocketReady(false);
    });
    newSocket.on("disconnect", (reason) => {
      console.log("Socket.IO disconnected in App:", reason);
      setSocketReady(false);
    });

    setSocket(newSocket);
    return () => {
      newSocket.disconnect();
      setSocketReady(false);
    };
  }, [userRole, token, socket]);

  useEffect(() => {
    if (!userRole) return;

    const dashboardMap = {
      [ROLES.ADMIN]: "/admin-dashboard",
      [ROLES.SALES]: "/sales-dashboard",
      [ROLES.DESIGN]: "/design-dashboard",
      [ROLES.PRODUCTION]: "/production-dashboard",
      [ROLES.STORE]: "/store-dashboard",
      [ROLES.DISPATCH]: "/dispatch-dashboard",
      [ROLES.ACCOUNTS]: "/accounts-dashboard",
      [ROLES.CUSTOMER]: "/customer-dashboard",
      [ROLES.EMPLOYEE]: "/employee-dashboard",
      [ROLES.HR]: "/hr-dashboard",
    };

    const allowedPaths = allowedPathsByRole[userRole] || [];
    const targetPath = dashboardMap[userRole];
    const normalizedPath = location.pathname.replace(/\/+$/, "");

    const isAllowedPath = allowedPaths.some((path) => {
      if (path.includes(":")) {
        let regexPattern = path
          .replace(":orderId", "[^/]+")
          .replace(":action", "[a-zA-Z]+");
        regexPattern = `^${regexPattern}$`;
        const regex = new RegExp(regexPattern);
        return regex.test(normalizedPath);
      }
      return path === normalizedPath;
    });

    if (!targetPath) {
      console.warn(`Unknown userRole: ${userRole}`);
      navigate("/", { replace: true });
    } else if (
      normalizedPath === "" ||
      normalizedPath === "/" ||
      !isAllowedPath
    ) {
      if (normalizedPath !== targetPath) {
        console.log(`Redirecting ${userRole} to ${targetPath}`);
        navigate(targetPath, { replace: true });
      }
    }
  }, [userRole, location.pathname, navigate]);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) {
      const storedRole = localStorage.getItem("role");
      if (Object.values(ROLES).includes(storedRole)) {
        setUserRole(storedRole);
        setUserName(localStorage.getItem("name"));
        setToken(storedToken);
        setShowLogin(false);
      } else {
        localStorage.clear();
        setShowLogin(true);
      }
    } else {
      setShowLogin(true);
    }
  }, []);

  const handleLoginSubmit = (role, name, submittedToken) => {
    if (!Object.values(ROLES).includes(role)) {
      console.error("Invalid role:", role);
      return;
    }
    setUserRole(role);
    setUserName(name);
    setToken(submittedToken);
    localStorage.setItem("role", role);
    localStorage.setItem("name", name);
    localStorage.setItem("token", submittedToken);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setUserRole(null);
    setUserName("User");
    setToken(null);
    localStorage.clear();
    setShowLogin(true);
    if (socket) socket.disconnect();
    setSocket(null);
    setSocketReady(false);
  };

  const showNavbar = userRole && location.pathname !== "/";

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
        {/* HR */}
        <Route
          path="/hr-dashboard"
          element={
            userRole === "hr" ? (
              <ErrorBoundary>
                <HRDashboard socket={socket} userRole={userRole} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/attendance-summary"
          element={
            userRole === "hr" ? (
              <ErrorBoundary>
                <AttendanceSummary socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/hr-payslips"
          element={
            userRole === "hr" ? (
              <ErrorBoundary>
                <HRPayslipForm socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Activities Page - ALL employees & HR */}
        <Route
          path="/activities"
          element={
            userRole === "employee" || userRole === "hr" ? (
              <ErrorBoundary>
                <ActivitiesPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Other Dashboards */}
        <Route
          path="/admin-dashboard"
          element={
            <ErrorBoundary>
              <AdminDashboard socket={socket} />
            </ErrorBoundary>
          }
        />

        {/* NEW: Quotation route (admin only) */}
        <Route
          path="/quotation"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <QuotationForm />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* PROFORMA route - available to ADMIN and SALES */}
        <Route
          path="/proforma"
          element={
            userRole === "admin" || userRole === "sales" ? (
              <ErrorBoundary>
                {userRole === "sales" ? (
                  <SalesProformaForm />
                ) : (
                  <ProformaForm />
                )}
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Sales Dashboard */}
        <Route
          path="/sales-dashboard"
          element={
            userRole === "sales" ? (
              <ErrorBoundary>
                <SalesDashboard socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* NEW: Sales Quotations route (sales only) */}
        <Route
          path="/sales/quotations"
          element={
            userRole === "sales" ? (
              <ErrorBoundary>
                <SalesQuotationForm socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/design-dashboard"
          element={
            userRole === "design" ? (
              <ErrorBoundary>
                <DesignDashboard socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-dashboard"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionDashboard socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/store-dashboard"
          element={
            userRole === "store" ? (
              <ErrorBoundary>
                <StoreDashboard socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/dispatch-dashboard"
          element={
            userRole === "dispatch" ? (
              <ErrorBoundary>
                <DispatchDashboard socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/accounts-dashboard"
          element={
            userRole === "accounts" ? (
              <ErrorBoundary>
                <AccountsDashboard socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/account-dashboard"
          element={<Navigate to="/accounts-dashboard" replace />}
        />

        <Route
          path="/customer-dashboard"
          element={
            userRole === "customer" ? (
              <ErrorBoundary>
                <CustomerDashboard socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/employee-dashboard"
          element={
            userRole === "employee" ? (
              <ErrorBoundary>
                <EmployeeDashboard socket={socket} userRole={userRole} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Core Pages */}
        <Route
          path="/orders"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionOrdersPage socket={socket} userRole={userRole} />
              </ErrorBoundary>
            ) : ["admin", "sales", "accounts"].includes(userRole) ? (
              <ErrorBoundary>
                <OrdersPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/queries"
          element={
            ["admin", "design", "dispatch"].includes(userRole) ? (
              <ErrorBoundary>
                <QueriesPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/customer-list"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <CustomerList socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/customer-orders"
          element={
            userRole === "customer" ? (
              <ErrorBoundary>
                <CustomerOrdersPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/customer-queries"
          element={
            userRole === "customer" ? (
              <ErrorBoundary>
                <CustomerQueriesPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/edit-profile"
          element={
            userRole ? (
              <ErrorBoundary>
                <EditProfile socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/inventory"
          element={
            ["admin", "store", "production", "sales"].includes(userRole) ? (
              <ErrorBoundary>
                {userRole === "store" ? (
                  <StoreInventoryPage socket={socket} userRole={userRole} />
                ) : (
                  <InventoryPage userRole={userRole} socket={socket} />
                )}
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/stock"
          element={
            ["admin", "sales", "dispatch", "store"].includes(userRole) ? (
              <ErrorBoundary>
                {userRole === "store" ? (
                  <StoreStockPage socket={socket} />
                ) : userRole === "production" ? (
                  <ProductionStockPage socket={socket} />
                ) : (
                  <StockPage socket={socket} />
                )}
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/price-list"
          element={
            ["admin", "sales"].includes(userRole) ? (
              <ErrorBoundary>
                <PriceListPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/pdi"
          element={
            ["admin", "design", "dispatch"].includes(userRole) ? (
              <ErrorBoundary>
                <PdiPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/dispatch-tracking"
          element={
            ["admin", "sales", "dispatch", "accounts"].includes(userRole) ? (
              <ErrorBoundary>
                <DispatchTrackingPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/customer-invoices"
          element={
            ["admin", "sales", "accounts"].includes(userRole) ? (
              <ErrorBoundary>
                <CustomerInvoicesPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/part-drawings"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <PartDrawingsSelector />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/part-drawings/finished"
          element={
            ["admin", "design"].includes(userRole) ? (
              <ErrorBoundary>
                <PartDrawingsPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/part-drawings/raw"
          element={
            ["admin", "design"].includes(userRole) ? (
              <ErrorBoundary>
                <PartDrawingsRawPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/enquiries"
          element={
            ["admin"].includes(userRole) ? (
              <ErrorBoundary>
                <EnquiryPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/sales/enquiries"
          element={
            ["sales"].includes(userRole) ? (
              <ErrorBoundary>
                <SalesEnquiryPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/design/enquiries"
          element={
            ["design"].includes(userRole) ? (
              <ErrorBoundary>
                <DesignEnquiryPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/purchase-invoices" 
          element={
            ["admin", "accounts"].includes(userRole) ? (
              <ErrorBoundary>
                <PurchaseInvoicesPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace /> 
            )
          }
        />
        <Route
          path="/bom"
          element={
            ["admin", "design", "store", "production"].includes(userRole) ? (
              <ErrorBoundary>
                {userRole === "store" ? (
                  <StoreBOMPage socket={socket} userRole={userRole} />
                ) : userRole === "production" ? (
                  <ProductionBOMPage socket={socket} userRole={userRole} />
                ) : (
                  <BOMPage socket={socket} />
                )}
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/work-orders"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <WorkOrderPage />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/select-component/:orderId/:action"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <SelectOrderPage />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/processes/:orderId"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <CreateMotorProcess socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/processes/non-motor/:orderId"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <CreateNonMotorProcess />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/sales-queries"
          element={
            userRole === "sales" ? (
              <ErrorBoundary>
                <SalesQueriesPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-queries"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionQueriesPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-orders"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionOrdersPage socket={socket} userRole={userRole} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-stock"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionStockPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-part-drawings-raw"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionPartDrawingsRawPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-part-drawings"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionPartDrawingsPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-pdi"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionPDIPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/production-bom-unpriced"
          element={
            userRole === "production" ? (
              <ErrorBoundary>
                <ProductionBOMPage socket={socket} userRole={userRole} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        {/* Attendance */}
        <Route
          path="/attendance-history"
          element={
            userRole === "employee" ? (
              <ErrorBoundary>
                <AttendanceHistory socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/problems"
          element={
            userRole === "admin" ? (
              <ErrorBoundary>
                <ProblemsPage socket={socket} />
              </ErrorBoundary>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Home / Login */}
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
                        textShadow:
                          "0 2px 4px rgba(0,0,0,0.1), 0 8px 16px rgba(222,170,50,0.2)",
                        letterSpacing: "0.15em",
                      }}
                    >
                      <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-amber-900">
                        Business
                      </span>
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
                  <h1 className="text-3xl font-bold text-gray-800 mb-4">
                    Invalid Role
                  </h1>
                  <p className="text-gray-600 mb-6">
                    Your user role ({userRole}) is not recognized. Please log
                    out and try again.
                  </p>
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
        <LoginModal setShowLogin={setShowLogin} onSubmit={handleLoginSubmit} />
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
