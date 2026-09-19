import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

function ModuleShowcase({ sections }) {
  const [activeTitle, setActiveTitle] = useState(sections[0].title);
  const activeSection = sections.find((s) => s.title === activeTitle) || sections[0];

  // The gold underline glides between tabs: measure the active tab and move one shared element.
  const tabRefs = useRef({});
  const [ink, setInk] = useState(null);

  useLayoutEffect(() => {
    const measure = () => {
      const tab = tabRefs.current[activeSection.title];
      if (tab) setInk({ left: tab.offsetLeft, width: tab.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeSection.title, sections]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h3 className="font-display font-semibold text-navy-800 mb-3">Modules</h3>

      <div
        role="tablist"
        aria-label="Module categories"
        className="relative flex gap-1 border-b border-navy-100 mb-5 overflow-x-auto"
      >
        {sections.map((section) => {
          const isActive = section.title === activeSection.title;
          return (
            <button
              key={section.title}
              ref={(el) => { tabRefs.current[section.title] = el; }}
              role="tab"
              aria-selected={isActive}
              title={section.title}
              onClick={() => setActiveTitle(section.title)}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'text-navy-800' : 'text-gray-400 hover:text-navy-600'
              }`}
            >
              {section.shortLabel}
            </button>
          );
        })}
        {ink && (
          <span
            aria-hidden="true"
            className="absolute bottom-0 h-0.5 rounded bg-gold-400 transition-[left,width] duration-300 ease-out"
            style={{ left: ink.left, width: ink.width }}
          />
        )}
      </div>

      {/* Keyed so the cards replay a lighter entrance every time the tab changes. */}
      <div
        key={activeSection.title}
        role="tabpanel"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
        style={{ '--anim-dist': '16px', '--anim-scale': 0.97, '--anim-stagger': '50ms', '--anim-dur': '0.5s' }}
      >
        {activeSection.items.map((item, index) => (
          <Link
            key={item.to}
            to={item.to}
            style={{ '--i': index }}
            className="group anim-in flex items-start gap-3 p-4 rounded-xl border border-navy-100 hover:border-gold-400 hover:shadow-lg hover:-translate-y-2 transition-all"
            aria-label={item.label}
          >
            <span className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-transform group-hover:scale-110 group-hover:-rotate-6 ${activeSection.accent.bg}`}>
              <item.icon size={19} className={activeSection.accent.text} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-navy-800 text-sm truncate">{item.label}</span>
              <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{item.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default ModuleShowcase;
