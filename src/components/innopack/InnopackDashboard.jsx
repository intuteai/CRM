import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, CheckCircle2, HelpCircle, Factory, ShoppingCart, AlertTriangle, ArrowRight } from 'lucide-react';
import { getRoleNav } from '../../config/roleNav';
import DashboardGreeting from '../shared/DashboardGreeting';
import StatCard from '../dashboards/admin/StatCard';
import ModuleShowcase from '../dashboards/admin/ModuleShowcase';
import { ErrorNote } from '../testing/TestingUi';
import {
  ROSTER_PATH, useInnopackParts, sectionOf, sectionOrder, missingInfo,
  isReleased, isUndecided, isInHouse, isBoughtOut,
} from './innopackParts';

const rosterLink = (params) => {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${ROSTER_PATH}?${qs}` : ROSTER_PATH;
};

// Largest sections shown on the dashboard; the roster has the full list.
const SECTION_PREVIEW = 5;

// Innopack design dashboard, laid out like the Compage dashboards: greeting, modules first,
// then the KPI row and two short summary cards (largest sections, missing info).
// Every figure is computed in the browser from GET /api/innopack/parts.
function InnopackDashboard({ userRole, socket }) {
  const nav = getRoleNav(userRole) || getRoleNav('innopack_design');
  const { parts, loading, error, reload } = useInnopackParts(socket);

  const stats = useMemo(() => {
    const missing = parts.filter((p) => missingInfo(p).length > 0);
    const rows = new Map(sectionOrder(parts).map((s) => [s, { section: s, count: 0, released: 0, missing: 0 }]));
    parts.forEach((p) => {
      const row = rows.get(sectionOf(p));
      row.count += 1;
      if (isReleased(p)) row.released += 1;
      if (missingInfo(p).length) row.missing += 1;
    });
    const count = (fn) => parts.filter(fn).length;
    return {
      total: parts.length,
      released: count(isReleased),
      undecided: count(isUndecided),
      inHouse: count(isInHouse),
      boughtOut: count(isBoughtOut),
      sections: [...rows.values()],
      missing,
      missingBy: {
        'part name': missing.filter((p) => missingInfo(p).includes('part name')).length,
        qty: missing.filter((p) => missingInfo(p).includes('qty')).length,
        'design status': missing.filter((p) => missingInfo(p).includes('design status')).length,
      },
    };
  }, [parts]);

  const topSections = [...stats.sections].sort((a, b) => b.count - a.count).slice(0, SECTION_PREVIEW);
  const hasError = !!error;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <DashboardGreeting subtitle="Design · Innopack" className="" />

      {nav && (
        <div className="anim-in" style={{ '--i': 1 }}>
          <ModuleShowcase sections={nav.sections} />
        </div>
      )}

      {hasError && <ErrorNote error={error} onRetry={() => reload()} />}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard to={ROSTER_PATH} index={0} icon={Boxes} label="Total parts" value={stats.total} accent="navy" isLoading={loading} hasError={hasError} />
        <StatCard to={rosterLink({ design: 'RELEASED' })} index={1} icon={CheckCircle2} label="Released" value={stats.released} accent="green" isLoading={loading} hasError={hasError} />
        <StatCard to={rosterLink({ design: 'undecided' })} index={2} icon={HelpCircle} label="TBD / not decided" value={stats.undecided} accent="gold" isLoading={loading} hasError={hasError} />
        <StatCard to={rosterLink({ sourcing: 'INNOPACK' })} index={3} icon={Factory} label="In-house" value={stats.inHouse} accent="navy" isLoading={loading} hasError={hasError} />
        <StatCard to={rosterLink({ sourcing: 'BOP' })} index={4} icon={ShoppingCart} label="Bought-out" value={stats.boughtOut} accent="gold" isLoading={loading} hasError={hasError} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Largest sections: released share */}
        <section className="anim-in lg:col-span-2 bg-white rounded-xl shadow-sm p-5 min-w-0" style={{ '--i': 7 }}>
          <div className="flex items-baseline justify-between gap-2 mb-3">
            <h3 className="font-display font-semibold text-navy-800">Largest sections</h3>
            <span className="text-xs text-gray-400">Released / total parts</span>
          </div>
          {loading ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : hasError ? (
            <p className="text-sm text-gray-400 py-2">Section figures are unavailable until the parts load.</p>
          ) : topSections.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No parts yet. <Link to={ROSTER_PATH} className="text-navy-700 font-medium underline">Open the Parts Roster</Link> to add the first one.
            </p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {topSections.map((s) => (
                  <li key={s.section}>
                    <Link to={rosterLink({ section: s.section })} className="group grid grid-cols-[minmax(0,9rem)_1fr_auto] sm:grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 text-sm">
                      <span className="truncate font-medium text-navy-800 group-hover:text-gold-600">{s.section}</span>
                      <span className="h-2 bg-navy-50 rounded-full overflow-hidden" aria-hidden="true">
                        <span className="anim-bar-x block h-full bg-emerald-500 rounded-full" style={{ width: `${(s.released / s.count) * 100}%` }} />
                      </span>
                      <span className="w-16 text-right tabular-nums text-xs text-gray-500 whitespace-nowrap">
                        <span className="text-green-700 font-semibold">{s.released}</span> / {s.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {stats.sections.length > topSections.length && (
                <Link to={ROSTER_PATH} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:text-gold-600">
                  All {stats.sections.length} sections in the roster <ArrowRight size={14} />
                </Link>
              )}
            </>
          )}
        </section>

        {/* Needs attention */}
        <section className="anim-in bg-white rounded-xl shadow-sm p-5 min-w-0" style={{ '--i': 8 }}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="font-display font-semibold text-navy-800">Needs attention</h3>
          </div>
          {loading ? (
            <div className="h-24 bg-gray-100 rounded animate-pulse" aria-hidden="true" />
          ) : hasError ? (
            <p className="text-sm text-gray-400">Unavailable until the parts load.</p>
          ) : stats.missing.length === 0 ? (
            <p className="text-sm text-gray-500">Every part has a name, quantity and design status.</p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                <span className="font-display text-2xl font-bold text-amber-600 tabular-nums mr-1">{stats.missing.length}</span>
                {stats.missing.length === 1 ? 'part is' : 'parts are'} missing information.
              </p>
              <ul className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(stats.missingBy).filter(([, n]) => n > 0).map(([field, n]) => (
                  <li key={field} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    No {field}: <span className="font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={rosterLink({ filter: 'missing' })}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:text-gold-600"
              >
                Review all in the roster <ArrowRight size={14} />
              </Link>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default InnopackDashboard;
