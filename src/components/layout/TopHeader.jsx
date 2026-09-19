import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Search, Bell, LogOut, User, Clock, Menu } from 'lucide-react';
import { useClock } from '../../hooks/useClock';

// Colour sets. `dark` is for roles whose page background is warm/cream (no sidebar), where a white bar
// would blend in; it uses the same navy as the sidebar.
const TONES = {
  light: {
    header: 'bg-white border-b border-navy-100',
    menu: 'text-navy-800 hover:bg-navy-50',
    brand: 'text-navy-800',
    divider: 'bg-navy-100',
    title: 'text-navy-800',
    searchIcon: 'text-gray-400',
    search: 'bg-navy-50 text-navy-800 placeholder:text-gray-400',
    meta: 'text-gray-500',
    profile: 'hover:text-navy-800',
    logout: 'bg-navy-800 text-white font-medium hover:bg-navy-700',
  },
  dark: {
    header: 'bg-navy-800 border-b border-white/10',
    menu: 'text-white hover:bg-white/10',
    brand: 'text-gold-400',
    divider: 'bg-white/15',
    title: 'text-white',
    searchIcon: 'text-navy-100/70',
    search: 'bg-white/10 text-white placeholder:text-navy-100/60',
    meta: 'text-navy-100',
    profile: 'hover:text-white',
    logout: 'bg-gold-500 text-navy-900 font-semibold hover:bg-gold-400',
  },
};

// `showBrand` puts the logo + name at the left, for roles that have no sidebar to carry it.
// `onMenuClick` shows a menu button on phones (the sidebar becomes a drawer there).
function TopHeader({ sections, dashboardPath, userName, onLogout, onMenuClick, showBrand = false, dark = false }) {
  const tone = dark ? TONES.dark : TONES.light;
  const location = useLocation();
  const navigate = useNavigate();
  const currentTime = useClock();
  const notificationCount = useSelector((state) => state.notifications.length);
  const [query, setQuery] = useState('');

  const allLinks = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const pageTitles = useMemo(
    () => ({
      [dashboardPath]: 'Dashboard',
      '/edit-profile': 'Edit Profile',
      ...Object.fromEntries(allLinks.map((item) => [item.to, item.label])),
    }),
    [allLinks, dashboardPath]
  );

  const title = pageTitles[location.pathname] || 'Dashboard';

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allLinks.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allLinks]);

  const goTo = (to) => {
    setQuery('');
    navigate(to);
  };

  return (
    <header className={`sticky top-0 z-20 flex items-center gap-3 md:gap-6 px-4 md:px-6 py-3 ${tone.header}`}>
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className={`md:hidden -ml-1 p-1.5 rounded-lg shrink-0 transition-colors ${tone.menu}`}
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
      )}
      {showBrand && (
        <Link to={dashboardPath} className="flex items-center gap-2 shrink-0" aria-label="Go to Dashboard">
          <img src="/IntuteAIYellow.png" alt="" className="w-7 h-7 object-contain shrink-0" />
          <span className={`hidden sm:inline font-display font-extrabold text-lg tracking-tight ${tone.brand}`}>intute</span>
        </Link>
      )}
      {showBrand && <span className={`hidden md:block w-px h-6 shrink-0 ${tone.divider}`} aria-hidden="true" />}
      <h1 className={`font-display font-bold text-base md:text-lg truncate min-w-0 max-w-[8rem] sm:max-w-none ${tone.title}`}>{title}</h1>

      <div className="relative flex-1 min-w-0">
        <Search size={18} className={`absolute left-4 top-1/2 -translate-y-1/2 ${tone.searchIcon}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search modules…"
          className={`w-full rounded-full pl-11 pr-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-gold-400 ${tone.search}`}
          aria-label="Search modules"
        />
        {matches.length > 0 && (
          <ul className="absolute mt-1 w-full bg-white border border-navy-100 rounded-lg shadow-lg overflow-hidden z-50">
            {matches.map((item) => (
              <li key={item.to}>
                <button
                  onClick={() => goTo(item.to)}
                  className="w-full text-left px-4 py-2.5 text-sm text-navy-800 hover:bg-navy-50 flex items-center gap-2"
                >
                  <item.icon size={14} className="text-gray-400" />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`flex items-center gap-3 md:gap-4 shrink-0 text-sm ${tone.meta}`}>
        <span className="hidden lg:flex items-center gap-1.5">
          <Clock size={14} />
          {currentTime}
        </span>

        <span className="relative anim-ring-host">
          <Bell size={18} className="anim-ring" />
          {notificationCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-gold-500 text-navy-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {notificationCount}
            </span>
          )}
        </span>

        <Link
          to="/edit-profile"
          className={`flex items-center gap-1.5 transition-colors ${tone.profile}`}
          aria-label="Edit Profile"
        >
          <User size={16} />
          <span className="hidden md:inline">{userName}</span>
        </Link>

        <button
          onClick={onLogout}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${tone.logout}`}
          aria-label="Logout"
        >
          <LogOut size={14} />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}

export default TopHeader;
