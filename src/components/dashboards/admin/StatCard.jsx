import { Link } from 'react-router-dom';
import { useCountUp } from '../../../hooks/useCountUp';

const ACCENT_BARS = {
  navy: 'bg-navy-600',
  gold: 'bg-gold-400',
  red: 'bg-red-500',
  green: 'bg-emerald-500',
};

// `index` is the card's slot in the dashboard's entrance sequence (0 = first).
function StatCard({ to, icon: Icon, label, value, accent = 'navy', isLoading, hasError, index = 0 }) {
  const shown = useCountUp(value, { delay: (index + 1) * 150 + 250 });

  return (
    <Link
      to={to}
      style={{ '--i': index + 1 }}
      className="group anim-in relative overflow-hidden bg-white rounded-xl shadow-sm p-4 pl-5 flex items-center justify-between hover:-translate-y-2 hover:shadow-lg transition-all"
    >
      <span aria-hidden="true" className={`anim-bar-y absolute left-0 inset-y-0 w-1 ${ACCENT_BARS[accent]}`} />
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        {isLoading ? (
          <div className="h-7 w-10 mt-1 bg-gray-100 rounded animate-pulse" />
        ) : hasError ? (
          <p className="text-2xl font-display font-bold text-gray-300" title="Failed to load">—</p>
        ) : (
          <p className="text-2xl font-display font-bold text-navy-800 tabular-nums">{shown}</p>
        )}
      </div>
      <Icon className="w-8 h-8 text-navy-400/60 transition-transform group-hover:scale-110 group-hover:-rotate-6" />
    </Link>
  );
}

export default StatCard;
