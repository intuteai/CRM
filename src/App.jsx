import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import { setAuth, logout, toggleLogin, setSocketStatus } from "./features/auth/authSlice.js";
import { connectSocket, disconnectSocket, getSocket } from "./services/socket.js";
import { ROLES, DASHBOARD_ROUTES, allowedPathsByRole } from "./constants.js";
import { routeConfig, renderRoute } from "./routeConfig.jsx";
import { useNotify } from "./hooks/useNotify.js";

import LoginModal from "./components/pages/LoginModal.jsx";
import Navbar from "./components/pages/Navbar.jsx";
import AppShell from "./components/layout/AppShell.jsx";
import { getRoleNav } from "./config/roleNav";
import NotificationCenter from "./components/pages/NotificationCenter.jsx";
import ConnectionBanner from "./components/pages/ConnectionBanner.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ChatbotWidget from "./chatbot/ChatbotWidget.jsx";
import "./styles.css";

function App() {
  const dispatch = useDispatch();
  const { userRole, userName, token, showLogin, socketStatus } = useSelector(
    (state) => state.auth
  );
  const location = useLocation();
  const navigate = useNavigate();
  const { notifySuccess, notifyError } = useNotify();

  // Socket connection management
  useEffect(() => {
    if (!userRole || !token) return;
    const sock = connectSocket(token);

    if (sock.connected) dispatch(setSocketStatus("connected"));

    const onConnect = () => dispatch(setSocketStatus("connected"));
    const onConnectError = () => dispatch(setSocketStatus("error"));

    sock.on("connect", onConnect);
    sock.on("connect_error", onConnectError);

    return () => {
      sock.off("connect", onConnect);
      sock.off("connect_error", onConnectError);
      disconnectSocket();
      dispatch(setSocketStatus("idle"));
    };
  }, [token, userRole, dispatch]);

  // Role-based redirect
  useEffect(() => {
    if (!userRole) return;

    const allowedPaths = allowedPathsByRole[userRole] || [];
    const targetPath = DASHBOARD_ROUTES[userRole];
    const normalizedPath = location.pathname.replace(/\/+$/, "");

    const isAllowedPath = allowedPaths.some((path) => {
      if (path.includes(":")) {
        // Match any ":param" segment generically (not just the couple of
        // param names this used to hardcode) so newly added dynamic routes
        // (e.g. "/pdi-generator/:templateId") are recognized here too.
        const regexPattern = `^${path.replace(/:[^/]+/g, "[^/]+")}$`;
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

  // Load auth from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedRole = localStorage.getItem("role");
    const storedName = localStorage.getItem("name");

    if (storedToken && storedRole) {
      dispatch(
        setAuth({
          userRole: storedRole,
          userName: storedName,
          token: storedToken,
        })
      );
      dispatch(toggleLogin(false));
    } else {
      dispatch(toggleLogin(true));
    }
  }, [dispatch]);

  const handleLoginSubmit = (role, name, submittedToken, userId) => {
    dispatch(
      setAuth({
        userRole: role,
        userName: name,
        token: submittedToken,
      })
    );

    localStorage.setItem("role", role);
    localStorage.setItem("name", name);
    localStorage.setItem("token", submittedToken);
    // Design/Representative pages read this to know "is this enquiry assigned
    // to me" (e.g. the Mark Done button) — role/name/token alone don't carry
    // the user's own id.
    if (userId != null) {
      localStorage.setItem(
        "user",
        JSON.stringify({ user_id: userId, role_name: role, name })
      );
    }

    dispatch(toggleLogin(false));
  };

  const handleLogout = () => {
    localStorage.clear();
    dispatch(logout());
    disconnectSocket();
    dispatch(toggleLogin(true));
  };

  // Mirrors Navbar's own logout flow (backend invalidation + toast) so the
  // AppShell header behaves the same way as the classic Navbar's logout button.
  const handleAppShellLogout = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
    fetch(`${backendUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    })
      .then(() => {
        handleLogout();
        navigate("/");
        notifySuccess("Logged out successfully", { autoClose: 3000 });
      })
      .catch((err) => {
        console.error("Logout error:", err);
        notifyError("Failed to logout. Please try again.", { autoClose: 3000 });
      });
  };

  const showNavbar = userRole && location.pathname !== "/";
  const roleNav = getRoleNav(userRole);
  const useAppShell = showNavbar && !!roleNav;
  const socket = getSocket();

  const mainRoutes = (
    <Routes>
      {/* Generate routes from config */}
      {routeConfig.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={renderRoute(route, userRole, socket)}
        />
      ))}

      {/* Root path: empty while unauthenticated (LoginModal overlays), or invalid-role message */}
      <Route
        path="/"
        element={
          userRole ? (
            <div className="min-h-screen flex items-center justify-center bg-navy-50 p-4">
              <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-navy-100 p-6 sm:p-8 text-center">
                <h1 className="font-display text-xl font-bold text-navy-800 mb-2">
                  Invalid Role
                </h1>
                <p className="text-sm text-gray-500 mb-6">
                  Your user role ({userRole}) is not recognized. Please log
                  out and try again.
                </p>
                <button
                  onClick={handleLogout}
                  className="bg-navy-800 text-white font-medium px-5 py-2.5 rounded-lg hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
                >
                  Log Out
                </button>
              </div>
            </div>
          ) : null
        }
      />
    </Routes>
  );

  return (
    <>
      {showNavbar && !useAppShell && (
        <Navbar
          userRole={userRole}
          userName={userName}
          token={token}
          handleLogout={handleLogout}
          socket={socket}
        />
      )}
      <NotificationCenter />
      {socketStatus === "error" && userRole && !showLogin && (
        <ConnectionBanner
          onReconnect={handleLogout}
          onDismiss={() => dispatch(setSocketStatus("idle"))}
        />
      )}
      {userRole === ROLES.ADMIN && <ChatbotWidget />}

      {useAppShell ? (
        <AppShell nav={roleNav} userName={userName} onLogout={handleAppShellLogout}>
          {mainRoutes}
        </AppShell>
      ) : (
        mainRoutes
      )}

      {/* LoginModal now owns the landing page + login form */}
      {showLogin && (
        <LoginModal
          onClose={() => dispatch(toggleLogin(false))}
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