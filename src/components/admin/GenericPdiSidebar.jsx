// CRM/src/components/admin/GenericPdiSidebar.jsx
import { Check } from 'lucide-react';

// items: [{ key: string, label: string, filled: boolean }]
// activeKey: string — one of items[].key, or the literal 'review'
// onSelect: (key: string) => void
export default function GenericPdiSidebar({ templateName, items, activeKey, onSelect }) {
  const filledCount = items.filter((i) => i.filled).length;
  const totalCount = items.length;
  const pct = totalCount ? Math.round((filledCount / totalCount) * 100) : 0;

  return (
    <div className="w-60 shrink-0 bg-gray-50 border-r border-gray-200 px-4 py-5 overflow-y-auto">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 truncate" title={templateName}>
        {templateName}
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${
                active ? 'bg-white shadow-sm text-gray-900 font-semibold' : 'text-gray-600 hover:bg-white/70'
              }`}
            >
              <span className="truncate">{item.label}</span>
              {item.filled ? (
                <Check size={14} className="text-green-600 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      <div className="border-t border-gray-200 mt-3 pt-3">
        <button
          type="button"
          onClick={() => onSelect('review')}
          className={`w-full flex items-center px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${
            activeKey === 'review' ? 'bg-white shadow-sm text-amber-700 font-semibold' : 'text-amber-700 hover:bg-white/70 font-medium'
          }`}
        >
          Review &amp; Finalize
        </button>
      </div>
    </div>
  );
}
