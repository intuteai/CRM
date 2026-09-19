import { useEffect } from 'react';
import { getRoleNav } from '../../config/roleNav';
import { useNotify } from '../../hooks/useNotify';
import ModuleShowcase from './admin/ModuleShowcase';
import DashboardGreeting from '../shared/DashboardGreeting';

// Generic module-launcher dashboard for any role that has a sidebar nav config.
// Admin keeps its own dashboard (KPI row + activity rail); this is the lighter
// version for roles that have no stats endpoint yet.
function RoleDashboard({ userRole, socket }) {
  const nav = getRoleNav(userRole);
  const { notifyInfo } = useNotify();

  // Optional per-role toasts for socket events (see `socketToasts` in roleNav.js).
  useEffect(() => {
    const toasts = nav?.socketToasts;
    if (!socket || !toasts?.length) return undefined;

    const handlers = toasts.map(({ event, message }) => {
      const handler = (payload) => notifyInfo(message(payload), { autoClose: 3000 });
      socket.on(event, handler);
      return { event, handler };
    });

    return () => handlers.forEach(({ event, handler }) => socket.off(event, handler));
  }, [socket, nav, notifyInfo]);

  if (!nav) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <DashboardGreeting userRole={userRole} className="" />
      <div className="anim-in" style={{ '--i': 1 }}>
        <ModuleShowcase sections={nav.sections} />
      </div>
    </div>
  );
}

export default RoleDashboard;
