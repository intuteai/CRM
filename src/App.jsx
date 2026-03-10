import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
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
import logo from "/intute-ai_logo.jpeg";
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

        {/* Landing page */}
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
                    onClick={() => dispatch(toggleLogin(true))}
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
