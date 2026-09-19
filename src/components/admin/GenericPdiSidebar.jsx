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
    <div className="w-full lg:w-60 lg:shrink-0 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-200 px-3 lg:px-4 py-3 lg:py-5 lg:overflow-y-auto">
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 truncate" title={templateName}>
        {templateName}
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-3 lg:mb-4">
        <div className="h-full bg-gold-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-stretch lg:block gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      <div className="flex lg:flex-col gap-1 lg:gap-0.5">
        {items.map((item) => {
          const active = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm text-left transition-colors whitespace-nowrap lg:whitespace-normal shrink-0 lg:shrink ${
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
      <div className="shrink-0 lg:border-t lg:border-gray-200 lg:mt-3 lg:pt-3">
        <button
          type="button"
          onClick={() => onSelect('review')}
          className={`w-full flex items-center px-2.5 py-2 rounded-lg text-sm text-left whitespace-nowrap lg:whitespace-normal transition-colors ${
            activeKey === 'review' ? 'bg-white shadow-sm text-gold-600 font-semibold' : 'text-gold-600 hover:bg-white/70 font-medium'
          }`}
        >
          Review &amp; Finalize
        </button>
      </div>
      </div>
    </div>
  );
}
