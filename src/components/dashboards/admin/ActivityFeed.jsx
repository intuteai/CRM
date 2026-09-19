import { Activity, X } from 'lucide-react';

function ActivityFeed({ items, onCollapse }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-navy-800">Recent Activity</h3>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="text-gray-400 hover:text-navy-800 transition-colors"
            aria-label="Collapse recent activity"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No recent activity yet — live updates will appear here.</p>
      ) : (
        <ul className="space-y-3 max-h-96 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 text-sm">
              <Activity size={14} className="mt-0.5 text-gold-500 shrink-0" />
              <div>
                <p className="text-navy-800">{item.message}</p>
                <p className="text-xs text-gray-400">{item.time}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ActivityFeed;
