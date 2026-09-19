import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

function sectionContainingPath(sections, pathname) {
  return sections.find((section) =>
    section.items.some((item) => item.to === pathname)
  )?.title;
}

function Sidebar({ sections, dashboardPath, collapsed, onToggleCollapsed, mobileOpen = false }) {
  const location = useLocation();
  const [openSection, setOpenSection] = useState(() => sectionContainingPath(sections, location.pathname));

  useEffect(() => {
    const active = sectionContainingPath(sections, location.pathname);
    if (active) setOpenSection(active);
  }, [sections, location.pathname]);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col w-64 bg-gradient-to-b from-navy-800 to-navy-600 text-navy-100 transition-all duration-200 md:translate-x-0 ${
        collapsed ? 'md:w-16' : 'md:w-64'
      } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
        {!collapsed && (
          <span className="flex items-center gap-2">
            <img src="/IntuteAIYellow.png" alt="" className="w-7 h-7 object-contain shrink-0" />
            <span className="font-display font-extrabold text-gold-400 text-lg tracking-tight">
              intute
            </span>
          </span>
        )}
        <button
          onClick={onToggleCollapsed}
          className="p-1.5 rounded-md text-navy-100 hover:bg-white/10 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <SidebarLink
          to={dashboardPath}
          icon={LayoutDashboard}
          label="Dashboard"
          collapsed={collapsed}
          active={location.pathname === dashboardPath}
        />

        {collapsed ? (
          <div className="mt-2 border-t border-white/10 pt-2">
            {sections.flatMap((section) => section.items).map((item) => (
              <SidebarLink
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                collapsed
                active={location.pathname === item.to}
              />
            ))}
          </div>
        ) : (
          <div className="mt-2 space-y-1 px-2">
            {sections.map((section) => {
              const isOpen = openSection === section.title;
              return (
                <div key={section.title}>
                  <button
                    onClick={() => setOpenSection(isOpen ? null : section.title)}
                    className="w-full flex items-center justify-between px-2 py-2 text-xs font-semibold uppercase tracking-wide text-navy-100/70 hover:text-white transition-colors"
                  >
                    <span>{section.title}</span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="space-y-0.5 mb-2">
                      {section.items.map((item) => (
                        <SidebarLink
                          key={item.to}
                          to={item.to}
                          icon={item.icon}
                          label={item.label}
                          collapsed={false}
                          active={location.pathname === item.to}
                          indent
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({ to, icon: Icon, label, collapsed, active, indent }) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      aria-label={label}
      className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors border-l-2 ${
        indent ? 'pl-6' : ''
      } ${
        active
          ? 'border-gold-400 bg-white/10 text-white font-medium'
          : 'border-transparent text-navy-100/80 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export default Sidebar;
