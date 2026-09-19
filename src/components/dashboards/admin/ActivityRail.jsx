import { Bell } from 'lucide-react';

function ActivityRail({ count, onExpand }) {
  return (
    <button
      onClick={onExpand}
      aria-label="Show recent activity"
      className="flex lg:flex-col items-center justify-center gap-2 w-full lg:w-12 lg:shrink-0 bg-white rounded-xl shadow-sm py-3 lg:py-4 hover:shadow-md transition-shadow"
    >
      <Bell size={16} className="text-gold-500" />
      <span className="text-xs lg:text-[10px] font-semibold text-gray-500 lg:[writing-mode:vertical-rl]">
        Activity
      </span>
      {count > 0 && (
        <span className="text-[10px] font-bold text-navy-800 bg-gold-400/30 rounded-full px-1.5 py-0.5 leading-none">
          {count}
        </span>
      )}
    </button>
  );
}

export default ActivityRail;
