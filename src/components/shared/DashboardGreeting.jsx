import { useSelector } from 'react-redux';

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Role names shown under the greeting for the roles that use the module-launcher dashboards.
// All of these roles belong to Compage (the IA roles, which belong to Intute AI, use PeopleDashboard).
const ROLE_LABELS = {
  admin: 'Admin',
  sales: 'Sales',
  production: 'Production',
  store: 'Stores',
  design: 'Design',
  dispatch: 'Dispatch',
  accounts: 'Accounts',
  customer: 'Customer',
  service_repair: 'Service & Repair',
};

// Date, time-of-day greeting with the logged-in user's name, and a "Role · Company" line.
// Used at the top of every dashboard. Pass `subtitle` to override the line, or `userRole`
// to build it from ROLE_LABELS.
function DashboardGreeting({ userRole, subtitle, className = 'mb-6' }) {
  const userName = useSelector((state) => state.auth.userName);
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const line = subtitle ?? (ROLE_LABELS[userRole] ? `${ROLE_LABELS[userRole]} · Compage` : null);

  return (
    <div className={`anim-in ${className}`} style={{ '--i': 0 }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gold-600 mb-1">{dateLabel}</p>
      <h2 className="font-display text-2xl font-bold text-navy-800">
        {greetingFor(now)}{userName ? `, ${userName}` : ''}
      </h2>
      {line && <p className="text-sm text-gray-500 mt-1">{line}</p>}
    </div>
  );
}

export default DashboardGreeting;
