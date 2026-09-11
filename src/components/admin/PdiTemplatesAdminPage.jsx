// CRM/src/components/admin/PdiTemplatesAdminPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Upload, Archive, ChevronDown, ChevronUp } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { labelToKey } from '../../utils/pdiTemplateSlug';
import {
  FIELD_CLS, ListEditor, AddSectionPicker, SectionEditorFor,
  sectionTypeOption, sectionCardTitle, ShowKeysContext,
} from './PdiTemplateSectionEditors';
import PdiTemplatePreviewPane from './PdiTemplatePreviewPane';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function emptyDefinition() {
  return { pages: [{ sections: [] }] };
}

let uiKeySeq = 0;
// A client-only, harmless-to-persist id (the backend has no schema
// validation rejecting unknown section fields, and the PDF renderer/
// fill-out form only ever read specific known keys) that survives a
// drag-reorder AND an edit (since every editor writes back via `{...section,
// field: value}`, which preserves this field along with everything else).
// Used as ListEditor's React key for sections specifically, so a
// SectionCard's own expand/collapse state stays pinned to the section it
// belongs to rather than to its current array position.
function newSectionUiKey() {
  uiKeySeq += 1;
  return `sec_${Date.now().toString(36)}_${uiKeySeq}`;
}

// Stamps every section in a freshly-loaded definition with a stable ui key,
// once, so the ListEditor-in-PageEditor can key by it from the start. Only
// called from TemplateEditor's useState lazy initializer (runs exactly once
// per template opened) — never on every render, or every edit would count
// as "no key yet" and get a fresh one, defeating the whole point.
function withSectionUiKeys(definition) {
  return {
    ...definition,
    pages: (definition.pages || []).map((page) => ({
      ...page,
      sections: (page.sections || []).map((section) => (section._uiKey ? section : { ...section, _uiKey: newSectionUiKey() })),
    })),
  };
}

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-700',
  archived: 'bg-amber-100 text-amber-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A section's collapsed-by-default card — expands to its editor on click.
// Collapsed by default keeps a multi-section page scannable instead of one
// long wall of open editors.
function SectionCard({ section, onChange, definition }) {
  const [expanded, setExpanded] = useState(false);
  const typeOption = sectionTypeOption(section);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden w-full">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-medium text-gray-500 bg-gray-200 rounded px-1.5 py-0.5 shrink-0">{typeOption?.label || section.type}</span>
          <span className="text-sm font-medium text-gray-800 truncate">{sectionCardTitle(section)}</span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>
      {expanded && (
        <div className="p-3 border-t border-gray-200">
          <SectionEditorFor section={section} onChange={onChange} definition={definition} />
        </div>
      )}
    </div>
  );
}

function PageEditor({ page, onChange, onRemove, definition }) {
  return (
    <div className="space-y-3">
      <ListEditor
        items={page.sections}
        onChange={(sections) => onChange({ ...page, sections })}
        hideAddButton
        newRow={() => null}
        getItemKey={(section, i) => section._uiKey ?? i}
        renderRow={(section, update) => <SectionCard section={section} onChange={update} definition={definition} />}
      />
      <AddSectionPicker onAdd={(newSection) => onChange({ ...page, sections: [...page.sections, { ...newSection, _uiKey: newSectionUiKey() }] })} />
      <button type="button" onClick={onRemove} className="text-xs text-gray-400 hover:text-red-500">
        Remove page
      </button>
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved }) {
  const [name, setName] = useState(template.name);
  const [definition, setDefinition] = useState(() => withSectionUiKeys(template.definition));
  const [saving, setSaving] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const { notifySuccess, notifyError } = useNotify();

  const save = async (statusPath) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/pdi/admin/templates/${template.id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ name, definition }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      if (statusPath) {
        const pubRes = await fetch(`${BASE_URL}/api/pdi/admin/templates/${template.id}/${statusPath}`, {
          method: 'POST', headers: authHeaders(),
        });
        if (!pubRes.ok) throw new Error((await pubRes.json()).error || 'Action failed');
      }
      notifySuccess('Template saved.');
      onSaved();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removePage = (i) => {
    const page = definition.pages[i];
    if ((page.sections || []).length > 0) {
      if (!window.confirm(`Remove this page and its ${page.sections.length} section(s)? This can't be undone.`)) return;
    }
    setDefinition({ ...definition, pages: definition.pages.filter((_, idx) => idx !== i) });
  };

  return (
    <ShowKeysContext.Provider value={showKeys}>
    <div className="flex gap-4 items-start" style={{ minHeight: '70vh' }}>
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center gap-3">
          <input className={FIELD_CLS + ' text-lg font-semibold'} value={name} onChange={(e) => setName(e.target.value)} />
          <span className="text-xs text-gray-400 shrink-0">id: {template.id}</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 ml-auto cursor-pointer">
            <input type="checkbox" checked={showKeys} onChange={(e) => setShowKeys(e.target.checked)} />
            Show technical keys
          </label>
        </div>
        <div className="space-y-4">
          {definition.pages.map((page, i) => (
            <div key={i} className="border border-gray-300 rounded p-3">
              <div className="text-sm font-semibold mb-2">Page {i + 1}</div>
              <PageEditor
                page={page}
                definition={definition}
                onChange={(p) => {
                  const pages = [...definition.pages];
                  pages[i] = p;
                  setDefinition({ ...definition, pages });
                }}
                onRemove={() => removePage(i)}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDefinition({ ...definition, pages: [...definition.pages, { sections: [] }] })}
            className="flex items-center gap-1 text-sm font-medium text-amber-700 border border-amber-300 rounded px-3 py-1.5 hover:bg-amber-50"
          >
            <Plus size={16} /> Add page
          </button>
        </div>
        <div className="flex gap-2 pt-3 border-t border-gray-200">
          <button type="button" disabled={saving} onClick={() => save(null)} className="px-3 py-2 border rounded text-sm">Save</button>
          <button type="button" disabled={saving} onClick={() => save('publish')} className="flex items-center gap-1 px-3 py-2 bg-amber-500 text-white rounded text-sm"><Upload size={16} /> Save &amp; Publish</button>
          <button type="button" disabled={saving} onClick={() => save('archive')} className="flex items-center gap-1 px-3 py-2 border rounded text-sm text-gray-600"><Archive size={16} /> Archive</button>
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500">Close</button>
        </div>
      </div>
      <div className="w-96 shrink-0 sticky top-4" style={{ height: '70vh' }}>
        <PdiTemplatePreviewPane templateId={template.id} definition={definition} />
      </div>
    </div>
    </ShowKeysContext.Provider>
  );
}

export default function PdiTemplatesAdminPage() {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // full template row being edited, or null
  const { notifyError, notifySuccess } = useNotify();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/pdi/admin/templates`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Could not load templates');
      setList(await res.json());
    } catch (err) {
      notifyError(err.message);
    }
  }, [notifyError]);

  useEffect(() => { refresh(); }, [refresh]);

  const openEditor = async (id) => {
    try {
      const res = await fetch(`${BASE_URL}/api/pdi/admin/templates/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Could not load template');
      setEditing(await res.json());
    } catch (err) {
      notifyError(err.message);
    }
  };

  const deleteTemplate = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"? This removes all ${t.version} version(s) and cannot be undone.`)) return;
    try {
      const res = await fetch(`${BASE_URL}/api/pdi/admin/templates/${t.id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Delete failed');
      }
      notifySuccess(`Template "${t.name}" deleted.`);
      await refresh();
    } catch (err) {
      notifyError(err.message);
    }
  };

  const [creatingName, setCreatingName] = useState('');
  const [creatingIdOverride, setCreatingIdOverride] = useState(null); // null = auto-generated; string once the admin edits it directly
  const [showIdAdvanced, setShowIdAdvanced] = useState(false);
  const [creating, setCreating] = useState(false);
  // The id that most recently 409'd, so a Name edit that follows can tell
  // "admin hasn't touched the id since the failure" (resume auto-deriving
  // from the new name) apart from "admin deliberately typed this id"
  // (leave it alone). Without this, editing the name after a conflict would
  // resubmit the exact same already-known-to-conflict id every time.
  const lastConflictIdRef = useRef(null);

  const handleNameChange = (value) => {
    setCreatingName(value);
    if (lastConflictIdRef.current !== null && creatingIdOverride === lastConflictIdRef.current) {
      setCreatingIdOverride(null);
      lastConflictIdRef.current = null;
    }
  };

  const createTemplate = async () => {
    const trimmedName = creatingName.trim();
    if (!trimmedName) {
      notifyError('A name is required to create a template.');
      return;
    }
    setCreating(true);
    try {
      const baseId = creatingIdOverride !== null ? creatingIdOverride.trim() : labelToKey(trimmedName, []);
      const attempt = async (id) => {
        const res = await fetch(`${BASE_URL}/api/pdi/admin/templates`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ id, name: trimmedName, definition: emptyDefinition() }),
        });
        const body = await res.json();
        return { ok: res.ok, status: res.status, body };
      };

      let result = await attempt(baseId);
      // A 409 (id already exists) on an auto-generated id gets one silent
      // retry with a "-2" suffix — the admin never typed this id, so a
      // collision isn't something to surface immediately. If a manually-
      // entered id (creatingIdOverride set) 409s, don't auto-retry — go
      // straight to showing the error so they can pick deliberately.
      if (!result.ok && result.status === 409 && creatingIdOverride === null) {
        result = await attempt(`${baseId}-2`);
      }
      if (!result.ok) {
        if (result.status === 409) {
          setShowIdAdvanced(true);
          setCreatingIdOverride(baseId);
          lastConflictIdRef.current = baseId;
        }
        throw new Error(result.body.error || 'Create failed');
      }

      notifySuccess('Template created.');
      lastConflictIdRef.current = null;
      setCreatingName(''); setCreatingIdOverride(null); setShowIdAdvanced(false);
      await refresh();
      setEditing(result.body);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (editing) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        {/* Wider than the list view's max-w-4xl — this view now hosts a
            two-column layout (editor + a w-96 live preview pane beside it),
            which max-w-4xl left too cramped for the editor column. */}
        <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-6">
          <TemplateEditor
            template={editing}
            onClose={() => { setEditing(null); refresh(); }}
            onSaved={() => openEditor(editing.id)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">PDI Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Author, publish, and manage the PDI templates end users can fill out and generate.</p>
        </div>

        <div className="bg-white rounded-xl shadow p-4 mb-6">
          <div className="text-sm font-semibold text-gray-700 mb-3">Create a new template</div>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input className={FIELD_CLS} value={creatingName} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Acme Motor PDI" />
              <button type="button" onClick={() => setShowIdAdvanced((s) => !s)} className="text-[11px] text-gray-400 hover:text-gray-600 mt-0.5">
                {showIdAdvanced ? 'Hide id' : 'Advanced'}
              </button>
              {showIdAdvanced && (
                <input
                  className={FIELD_CLS + ' mt-1 text-xs text-gray-500'}
                  placeholder="id (auto-generated from the name if left blank)"
                  value={creatingIdOverride ?? labelToKey(creatingName.trim(), [])}
                  onChange={(e) => setCreatingIdOverride(e.target.value)}
                />
              )}
            </div>
            <button type="button" disabled={creating} onClick={createTemplate} className="flex items-center gap-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50">
              <Plus size={16} /> New Template
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow divide-y">
          {!list && <div className="p-6 text-gray-400 text-sm">Loading...</div>}
          {list && list.length === 0 && <div className="p-6 text-gray-400 text-sm">No authored templates yet. Create one above to get started.</div>}
          {list && list.map((t) => (
            <div key={t.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-900 truncate">{t.name}</div>
                  <StatusBadge status={t.status} />
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t.id} · v{t.version}{t.created_at ? ` · created ${formatDate(t.created_at)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <button type="button" onClick={() => openEditor(t.id)} className="text-sm text-amber-700 font-medium hover:text-amber-800">Edit</button>
                <button
                  type="button"
                  onClick={() => deleteTemplate(t)}
                  className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
                  title="Delete this template"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
