import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useNotify } from '../../hooks/useNotify';
import { getPeopleDashboard } from '../../config/peopleNav';
import { PeopleBackdrop } from '../shared/PeoplePage';
import DashboardGreeting from '../shared/DashboardGreeting';

// Literal class strings so Tailwind keeps them. Five cards wrap 3 + 2 instead of getting too narrow.
const GRID_COLS = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-3',
};

// Dashboard for the people-management roles (HR / Employee / IA HR / IA Employee).
// Menu, copy and live toasts come from config/peopleNav.js.
function PeopleDashboard({ userRole, socket }) {
  const config = getPeopleDashboard(userRole);
  const { notifySuccess, notifyInfo } = useNotify();

  useEffect(() => {
    const toasts = config?.socketToasts;
    if (!socket || !toasts?.length) return undefined;

    const handlers = toasts.map(({ event, type, message }) => {
      const notify = type === 'success' ? notifySuccess : notifyInfo;
      const handler = (payload) => notify(message(payload));
      socket.on(event, handler);
      return { event, handler };
    });

    return () => handlers.forEach(({ event, handler }) => socket.off(event, handler));
  }, [socket, config, notifySuccess, notifyInfo]);

  if (!config) return null;

  const count = config.cards.length;

  return (
    <PeopleBackdrop>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <DashboardGreeting subtitle={config.title} />

        <div className={`grid grid-cols-1 sm:grid-cols-2 ${GRID_COLS[count] || 'lg:grid-cols-4'} gap-4 ${count <= 2 ? 'max-w-2xl' : ''}`}>
          {config.cards.map(({ to, icon: Icon, title, desc, accent }, index) => (
            <Link
              key={to}
              to={to}
              style={{ '--i': index + 1 }}
              className="group anim-in relative flex flex-col overflow-hidden bg-white rounded-xl border border-[#f0e6c8] p-4 shadow-sm hover:shadow-lg hover:-translate-y-2 transition-all"
              aria-label={`Open ${title}`}
            >
              {/* Straight accent bar, clipped by the rounded corners (a border-top would curve at the corners) */}
              <span aria-hidden="true" className={`anim-bar-x absolute inset-x-0 top-0 h-[3px] ${accent.bar}`} />
              <span className={`flex items-center justify-center w-10 h-10 rounded-lg mb-3 transition-transform group-hover:scale-110 group-hover:-rotate-6 ${accent.tile}`}>
                <Icon size={19} />
              </span>
              <span className="font-display text-sm font-bold text-navy-800">{title}</span>
              <span className="text-xs text-gray-500 mt-1 flex-1">{desc}</span>
              <span className={`text-xs font-semibold mt-3 ${accent.link}`}>
                Open <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </PeopleBackdrop>
  );
}

export default PeopleDashboard;
