import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopHeader from './TopHeader';

const COLLAPSE_KEY = 'sidebar:collapsed';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

// Sidebar + header shell. The menu comes from `nav` (see config/roleNav.js);
// roles without a nav config use the people-management header instead (pages/Navbar.jsx).
// On phones (< md) the sidebar is an off-canvas drawer opened from the header's menu button;
// from md up it is the fixed, collapsible sidebar.
function AppShell({ nav, userName, onLogout, children }) {
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Close the drawer after navigating.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable — collapse state just won't persist
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-navy-50">
      <Sidebar
        sections={nav.sections}
        dashboardPath={nav.dashboardPath}
        collapsed={isDesktop && collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapsed={isDesktop ? toggleCollapsed : () => setMobileOpen(false)}
      />
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-navy-900/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`flex flex-col min-h-screen transition-all duration-200 ${
          collapsed ? 'md:pl-16' : 'md:pl-64'
        }`}
      >
        <TopHeader
          sections={nav.sections}
          dashboardPath={nav.dashboardPath}
          userName={userName}
          onLogout={onLogout}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
