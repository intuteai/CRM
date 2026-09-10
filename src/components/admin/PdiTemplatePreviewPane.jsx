// CRM/src/components/admin/PdiTemplatePreviewPane.jsx
import { useEffect, useRef, useState } from 'react';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Debounced live preview: POSTs the current definition to the EXISTING,
// unmodified /preview endpoint (the same one today's "Preview PDF" button
// already calls) and renders the returned PDF inline via an iframe pointed
// at a blob URL. A definition that's mid-edit and therefore invalid 400s
// from the backend's own existing validation — shown as a small inline
// notice, without clearing whatever was last successfully rendered, so the
// pane doesn't go blank on every single invalid keystroke.
export default function PdiTemplatePreviewPane({ templateId, definition }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const currentUrlRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current;
      setLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/api/pdi/admin/templates/${templateId}/preview`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify({ definition }),
        });
        // A slower-than-expected earlier request landing after a newer one
        // must not clobber the newer result — only the most recent request
        // this effect has fired is allowed to update state.
        if (thisRequestId !== requestIdRef.current) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || 'Could not render a preview.');
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = url;
        setPdfUrl(url);
        setError(null);
      } catch {
        if (thisRequestId === requestIdRef.current) setError('Could not reach the server to render a preview.');
      } finally {
        if (thisRequestId === requestIdRef.current) setLoading(false);
      }
    }, 800);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(definition), templateId]);

  useEffect(() => {
    return () => { if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current); };
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-2 flex items-center justify-between shrink-0">
        <span>Live Preview</span>
        {loading && <span className="normal-case text-gray-400">Updating…</span>}
      </div>
      {error && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2 shrink-0">
          Can&apos;t preview — {error}
        </div>
      )}
      <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
        {pdfUrl ? (
          <iframe src={pdfUrl} title="Template preview" className="w-full h-full" />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400 p-4 text-center">
            {error ? 'Add a section to see a preview.' : 'Preview will appear here once the template has at least one section.'}
          </div>
        )}
      </div>
    </div>
  );
}
