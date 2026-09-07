// CRM/src/components/shared/PdiTemplatePicker.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotify } from '../../hooks/useNotify';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function PdiTemplatePicker() {
  const navigate = useNavigate();
  const { notifyError } = useNotify();
  const [templates, setTemplates] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/pdi/templates`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
        const list = await response.json();
        if (cancelled) return;

        if (list.length === 1) {
          navigate(`/pdi-generator/${list[0].id}`, { replace: true });
          return;
        }
        setTemplates(list);
      } catch (err) {
        if (!cancelled) notifyError(err.message || 'Could not load PDI templates.', { autoClose: 3000 });
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, notifyError]);

  if (!templates) {
    return <div className="p-8 text-center text-gray-500">Loading PDI templates…</div>;
  }

  return (
    <div className="max-w-lg mx-auto mt-16 p-6">
      <h1 className="text-xl font-semibold mb-4">Choose a PDI Template</h1>
      <div className="flex flex-col gap-3">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => navigate(`/pdi-generator/${tpl.id}`)}
            className="text-left p-4 border rounded-lg hover:bg-amber-50 hover:border-amber-400 transition-colors"
          >
            <div className="font-medium">{tpl.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
