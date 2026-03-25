import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import { setAuth, logout, toggleLogin } from "./features/auth/authSlice.js";
import { connectSocket, disconnectSocket, getSocket } from "./services/socket.js";
import { ROLES, DASHBOARD_ROUTES, allowedPathsByRole } from "./constants.js";
import { routeConfig, renderRoute } from "./routeConfig.jsx";

import LoginModal from "./components/pages/LoginModal.jsx";
import Navbar from "./components/pages/Navbar.jsx";
import NotificationCenter from "./components/pages/NotificationCenter.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "./styles.css";

function App() {
  const dispatch = useDispatch();
  const { userRole, userName, token, showLogin } = useSelector(
    (state) => state.auth
  );
  const location = useLocation();
  const navigate = useNavigate();

  // Socket connection management
  useEffect(() => {
    if (!userRole || !token) return;
    const socket = connectSocket(token);
    return () => {
      disconnectSocket();
    };
  }, [token]);

  // Role-based redirect
  useEffect(() => {
    if (!userRole) return;

    const allowedPaths = allowedPathsByRole[userRole] || [];
    const targetPath = DASHBOARD_ROUTES[userRole];
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

  const handleLoginSubmit = (role, name, submittedToken) => {
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

    dispatch(toggleLogin(false));
  };

  const handleLogout = () => {
    localStorage.clear();
    dispatch(logout());
    disconnectSocket();
    dispatch(toggleLogin(true));
  };

  const showNavbar = userRole && location.pathname !== "/";
  const socket = getSocket();

  return (
    <>
      {showNavbar && (
        <Navbar
          userRole={userRole}
          userName={userName}
          token={token}
          handleLogout={handleLogout}
          socket={socket}
        />
      )}
      <NotificationCenter />

      <Routes>
        {/* Generate routes from config */}
        {routeConfig.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={renderRoute(route, userRole, socket)}
          />
        ))}

        {/* Invalid role fallback — only reached if userRole exists but is unrecognized */}
        {userRole && (
          <Route
            path="/"
            element={
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
            }
          />
        )}
      </Routes>

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