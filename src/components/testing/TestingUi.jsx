// Small shared pieces for the Motor Testing screens.
import { useEffect } from 'react';
import { X, AlertTriangle, Lock, Loader2 } from 'lucide-react';
import { OUTCOME_STYLES, VERSION_STATUS_STYLES, CORRECTION_STATUS_STYLES, CARD } from './testingFormat';

export function Pill({ className, children, title }) {
  return (
    <span title={title} className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

export function OutcomeBadge({ outcome }) {
  return <Pill className={OUTCOME_STYLES[outcome] || 'bg-gray-100 text-gray-600'}>{outcome || '—'}</Pill>;
}

export function VersionStatusBadge({ status }) {
  return <Pill className={VERSION_STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}>{(status || '—').replace('_', ' ')}</Pill>;
}

export function CorrectionStatusBadge({ status }) {
  return <Pill className={CORRECTION_STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}>{status || '—'}</Pill>;
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-gray-400">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

/** Error box. A TESTING_ROLE_REQUIRED / 403 shows as a permission notice, not a failure. */
export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  const forbidden = error.isForbidden;
  const message = typeof error === 'string' ? error : error.message;
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${forbidden ? 'border-navy-100 bg-navy-50 text-navy-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
      {forbidden ? <Lock size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{forbidden ? 'No permission' : 'Something went wrong'}</div>
        <div className="break-words">{message}</div>
      </div>
      {onRetry && !forbidden && (
        <button type="button" onClick={onRetry} className="shrink-0 text-xs font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children }) {
  return <div className="p-8 text-center text-sm text-gray-400">{children}</div>;
}

export function SectionCard({ title, actions, children, className = '' }) {
  return (
    <section className={`${CARD} ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-navy-100">
          {title && <h2 className="font-display text-base font-bold text-navy-800">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-3 sm:p-4" role="dialog" aria-modal="true">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-lg'} max-h-[92vh] flex flex-col`}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-navy-100">
          <h2 className="font-display text-lg font-bold text-navy-800">{title}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-navy-800 transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-navy-100">{footer}</div>}
      </div>
    </div>
  );
}

export function Fact({ label, children, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className={`text-sm text-navy-800 mt-0.5 break-words ${mono ? 'font-mono text-xs' : ''}`}>{children ?? '—'}</dd>
    </div>
  );
}
