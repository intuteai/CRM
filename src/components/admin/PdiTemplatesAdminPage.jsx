// CRM/src/components/admin/PdiTemplatesAdminPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Eye, Upload, Archive } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

const SECTION_TYPES = ['header', 'table', 'photo', 'image', 'signature', 'text'];

function emptySection(type) {
  switch (type) {
    case 'header':
      return { type, companyName: '', formatNo: '', revNo: '', effDate: '', extraFormatLines: [], logoAsset: null, infoFields: [] };
    case 'table':
      return { type, title: '', mode: 'repeatable', dataKey: '', columns: [], headerHeight: 20, rowHeight: 14, filterKey: '', fixedRows: [] };
    case 'photo':
      return { type, mode: 'freeform', dataKey: '', slots: [] };
    case 'image':
      return { type, dataKey: '', width: null, height: 100, title: '', placeholder: null };
    case 'signature':
      return { type, roles: [] };
    case 'text':
      return { type, label: '', dataKey: '', default: '' };
    default:
      throw new Error(`Unknown section type: ${type}`);
  }
}

function emptyDefinition() {
  return { pages: [{ sections: [] }] };
}

function moveItem(arr, index, delta) {
  const next = [...arr];
  const target = index + delta;
  if (target < 0 || target >= next.length) return arr;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// ── Small reusable list-editor: add/remove/reorder rows of a fixed shape ──
function ListEditor({ items, onChange, renderRow, newRow, addLabel }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 border border-gray-200 rounded p-2">
          <div className="flex flex-col">
            <button type="button" onClick={() => onChange(moveItem(items, i, -1))} disabled={i === 0} className="disabled:opacity-30">
              <ChevronUp size={14} />
            </button>
            <button type="button" onClick={() => onChange(moveItem(items, i, 1))} disabled={i === items.length - 1} className="disabled:opacity-30">
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="flex-1">{renderRow(item, (updated) => onChange(items.map((it, idx) => (idx === i ? updated : it))))}</div>
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, newRow()])}
        className="flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-300 rounded px-2 py-1 hover:bg-amber-50"
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  );
}

const FIELD_CLS = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';

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

// Deliberately doesn't expose logoAsset or extraFormatLines — both are rare
// fields (only the hand-coded General/AutoNXT templates have ever needed a
// logo or a 4th format-box line); a template authored through this UI simply
// can't set them yet. Accepted v1 scope limit, not an oversight.
function HeaderSectionEditor({ section, onChange }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={FIELD_CLS} placeholder="Company name" value={section.companyName} onChange={(e) => onChange({ ...section, companyName: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Format No." value={section.formatNo} onChange={(e) => onChange({ ...section, formatNo: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Rev No." value={section.revNo} onChange={(e) => onChange({ ...section, revNo: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Eff. Date" value={section.effDate} onChange={(e) => onChange({ ...section, effDate: e.target.value })} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Info fields (top-of-page label/value rows)</label>
        <ListEditor
          items={section.infoFields}
          onChange={(infoFields) => onChange({ ...section, infoFields })}
          addLabel="Add info row"
          newRow={() => ({ leftLabel: '', leftKey: '', leftFormat: 'text', rightLabel: '', rightKey: '', rightFormat: 'text' })}
          renderRow={(row, update) => (
            <div className="grid grid-cols-6 gap-1 text-xs">
              <input className={FIELD_CLS} placeholder="Left label" value={row.leftLabel} onChange={(e) => update({ ...row, leftLabel: e.target.value })} />
              <input className={FIELD_CLS} placeholder="Left data key" value={row.leftKey} onChange={(e) => update({ ...row, leftKey: e.target.value })} />
              <select className={FIELD_CLS} value={row.leftFormat} onChange={(e) => update({ ...row, leftFormat: e.target.value })}>
                <option value="text">text</option><option value="date">date</option>
              </select>
              <input className={FIELD_CLS} placeholder="Right label" value={row.rightLabel} onChange={(e) => update({ ...row, rightLabel: e.target.value })} />
              <input className={FIELD_CLS} placeholder="Right data key" value={row.rightKey} onChange={(e) => update({ ...row, rightKey: e.target.value })} />
              <select className={FIELD_CLS} value={row.rightFormat} onChange={(e) => update({ ...row, rightFormat: e.target.value })}>
                <option value="text">text</option><option value="date">date</option>
              </select>
            </div>
          )}
        />
      </div>
    </div>
  );
}

function CellSourceEditor({ cell, onChange }) {
  const source = cell?.source || 'row';
  return (
    <div className="flex gap-1 items-center">
      <select className={FIELD_CLS} value={source} onChange={(e) => {
        const s = e.target.value;
        if (s === 'row') onChange({ source: 'row' });
        else if (s === 'constant') onChange({ source: 'constant', value: '' });
        else onChange({ source: 'sectionData', subfield: 'measured', default: 'GO' });
      }}>
        <option value="row">row field</option>
        <option value="constant">constant</option>
        <option value="sectionData">per-inspection value</option>
      </select>
      {source === 'constant' && (
        <input className={FIELD_CLS} placeholder="Value" value={cell.value} onChange={(e) => onChange({ ...cell, value: e.target.value })} />
      )}
      {source === 'sectionData' && (
        <>
          <input className={FIELD_CLS} placeholder="Subfield" value={cell.subfield} onChange={(e) => onChange({ ...cell, subfield: e.target.value })} />
          <input className={FIELD_CLS} placeholder="Default" value={cell.default} onChange={(e) => onChange({ ...cell, default: e.target.value })} />
        </>
      )}
    </div>
  );
}

function TableSectionEditor({ section, onChange }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={FIELD_CLS} placeholder="Title (optional caption above the table)" value={section.title || ''} onChange={(e) => onChange({ ...section, title: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Data key" value={section.dataKey} onChange={(e) => onChange({ ...section, dataKey: e.target.value })} />
        <select className={FIELD_CLS} value={section.mode} onChange={(e) => onChange({ ...section, mode: e.target.value })}>
          <option value="repeatable">repeatable (one row per item)</option>
          <option value="fixed">fixed (template-defined rows)</option>
        </select>
        {section.mode === 'repeatable' && (
          <input className={FIELD_CLS} placeholder="Filter key (row is skipped if this field is empty)" value={section.filterKey || ''} onChange={(e) => onChange({ ...section, filterKey: e.target.value })} />
        )}
        <input className={FIELD_CLS} type="number" placeholder="Header height" value={section.headerHeight} onChange={(e) => onChange({ ...section, headerHeight: Number(e.target.value) })} />
        <input className={FIELD_CLS} type="number" placeholder="Row height" value={section.rowHeight} onChange={(e) => onChange({ ...section, rowHeight: Number(e.target.value) })} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Columns</label>
        <ListEditor
          items={section.columns}
          onChange={(columns) => onChange({ ...section, columns })}
          addLabel="Add column"
          newRow={() => ({ key: '', label: '', w: null, align: 'left', group: '', cell: { source: 'row' } })}
          renderRow={(col, update) => (
            <div className="grid grid-cols-5 gap-1 text-xs items-center">
              <input className={FIELD_CLS} placeholder="key" value={col.key} onChange={(e) => update({ ...col, key: e.target.value })} />
              <input className={FIELD_CLS} placeholder="label" value={col.label} onChange={(e) => update({ ...col, label: e.target.value })} />
              <input className={FIELD_CLS} type="number" placeholder="width (blank=flex)" value={col.w ?? ''} onChange={(e) => update({ ...col, w: e.target.value ? Number(e.target.value) : null })} />
              <input className={FIELD_CLS} placeholder="group (optional)" value={col.group || ''} onChange={(e) => update({ ...col, group: e.target.value || undefined })} />
              <CellSourceEditor cell={col.cell} onChange={(cell) => update({ ...col, cell })} />
            </div>
          )}
        />
      </div>
      {section.mode === 'fixed' && (
        <div>
          <label className="text-xs font-medium text-gray-600">Fixed rows (one per checklist item — &quot;key&quot; links this row&apos;s per-inspection value)</label>
          <ListEditor
            items={section.fixedRows}
            onChange={(fixedRows) => onChange({ ...section, fixedRows })}
            addLabel="Add row"
            newRow={() => ({ key: '' })}
            renderRow={(row, update) => (
              <div className="grid gap-1 text-xs" style={{ gridTemplateColumns: `repeat(${section.columns.length + 1}, 1fr)` }}>
                <input className={FIELD_CLS} placeholder="row key" value={row.key || ''} onChange={(e) => update({ ...row, key: e.target.value })} />
                {section.columns.filter((c) => !c.cell || c.cell.source === 'row').map((c) => (
                  <input key={c.key} className={FIELD_CLS} placeholder={c.label || c.key} value={row[c.key] || ''} onChange={(e) => update({ ...row, [c.key]: e.target.value })} />
                ))}
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}

function PhotoSectionEditor({ section, onChange }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select className={FIELD_CLS} value={section.mode} onChange={(e) => onChange({ ...section, mode: e.target.value })}>
          <option value="freeform">freeform (user adds photos)</option>
          <option value="fixed-slots">fixed slots</option>
        </select>
        <input className={FIELD_CLS} placeholder="Data key" value={section.dataKey} onChange={(e) => onChange({ ...section, dataKey: e.target.value })} />
      </div>
      {section.mode === 'fixed-slots' && (
        <ListEditor
          items={section.slots}
          onChange={(slots) => onChange({ ...section, slots })}
          addLabel="Add slot"
          newRow={() => ({ key: '', label: '' })}
          renderRow={(slot, update) => (
            <div className="grid grid-cols-2 gap-1 text-xs">
              <input className={FIELD_CLS} placeholder="key" value={slot.key} onChange={(e) => update({ ...slot, key: e.target.value })} />
              <input className={FIELD_CLS} placeholder="label" value={slot.label} onChange={(e) => update({ ...slot, label: e.target.value })} />
            </div>
          )}
        />
      )}
    </div>
  );
}

// Deliberately doesn't expose `width` (defaults to full content width via
// the backend's `section.width || CW` fallback) — same rare-field reasoning
// as HeaderSectionEditor's logoAsset/extraFormatLines above.
function ImageSectionEditor({ section, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input className={FIELD_CLS} placeholder="Data key" value={section.dataKey} onChange={(e) => onChange({ ...section, dataKey: e.target.value })} />
      <input className={FIELD_CLS} placeholder="Title (optional)" value={section.title || ''} onChange={(e) => onChange({ ...section, title: e.target.value })} />
      <input className={FIELD_CLS} type="number" placeholder="Height" value={section.height} onChange={(e) => onChange({ ...section, height: Number(e.target.value) })} />
      <input
        className={FIELD_CLS}
        placeholder="Placeholder text (shown when no image supplied)"
        value={section.placeholder?.text || ''}
        onChange={(e) => onChange({ ...section, placeholder: e.target.value ? { text: e.target.value, annotations: section.placeholder?.annotations || [] } : null })}
      />
    </div>
  );
}

function SignatureSectionEditor({ section, onChange }) {
  return (
    <ListEditor
      items={section.roles}
      onChange={(roles) => onChange({ ...section, roles })}
      addLabel="Add signer"
      newRow={() => ({ key: '', label: '' })}
      renderRow={(role, update) => (
        <div className="grid grid-cols-2 gap-1 text-xs">
          <input className={FIELD_CLS} placeholder="key" value={role.key} onChange={(e) => update({ ...role, key: e.target.value })} />
          <input className={FIELD_CLS} placeholder="label" value={role.label} onChange={(e) => update({ ...role, label: e.target.value })} />
        </div>
      )}
    />
  );
}

function TextSectionEditor({ section, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <input className={FIELD_CLS} placeholder="Label" value={section.label} onChange={(e) => onChange({ ...section, label: e.target.value })} />
      <input className={FIELD_CLS} placeholder="Data key" value={section.dataKey} onChange={(e) => onChange({ ...section, dataKey: e.target.value })} />
      <input className={FIELD_CLS} placeholder="Default text" value={section.default || ''} onChange={(e) => onChange({ ...section, default: e.target.value })} />
    </div>
  );
}

function SectionEditor({ section, onChange }) {
  const Editor = {
    header: HeaderSectionEditor, table: TableSectionEditor, photo: PhotoSectionEditor,
    image: ImageSectionEditor, signature: SignatureSectionEditor, text: TextSectionEditor,
  }[section.type];
  return (
    <div className="bg-gray-50 rounded p-3">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">{section.type} section</div>
      <Editor section={section} onChange={onChange} />
    </div>
  );
}

function PageEditor({ page, onChange }) {
  return (
    <div className="space-y-3">
      <ListEditor
        items={page.sections}
        onChange={(sections) => onChange({ ...page, sections })}
        addLabel="Add section"
        newRow={() => emptySection('header')}
        renderRow={(section, update) => (
          <div className="space-y-2">
            <select className={FIELD_CLS} value={section.type} onChange={(e) => update(emptySection(e.target.value))}>
              {SECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <SectionEditor section={section} onChange={update} />
          </div>
        )}
      />
    </div>
  );
}

function TemplateEditor({ template, onClose, onSaved }) {
  const [name, setName] = useState(template.name);
  const [definition, setDefinition] = useState(template.definition);
  const [saving, setSaving] = useState(false);
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

  const preview = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/pdi/admin/templates/${template.id}/preview`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ definition }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Preview failed');
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      notifyError(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input className={FIELD_CLS + ' text-lg font-semibold'} value={name} onChange={(e) => setName(e.target.value)} />
        <span className="text-xs text-gray-400">id: {template.id}</span>
      </div>
      <div className="space-y-4">
        {definition.pages.map((page, i) => (
          <div key={i} className="border border-gray-300 rounded p-3">
            <div className="text-sm font-semibold mb-2">Page {i + 1}</div>
            <PageEditor page={page} onChange={(p) => {
              const pages = [...definition.pages];
              pages[i] = p;
              setDefinition({ ...definition, pages });
            }} />
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
        <button type="button" onClick={preview} className="flex items-center gap-1 px-3 py-2 border rounded text-sm"><Eye size={16} /> Preview PDF</button>
        <button type="button" disabled={saving} onClick={() => save(null)} className="px-3 py-2 border rounded text-sm">Save</button>
        <button type="button" disabled={saving} onClick={() => save('publish')} className="flex items-center gap-1 px-3 py-2 bg-amber-500 text-white rounded text-sm"><Upload size={16} /> Save &amp; Publish</button>
        <button type="button" disabled={saving} onClick={() => save('archive')} className="flex items-center gap-1 px-3 py-2 border rounded text-sm text-gray-600"><Archive size={16} /> Archive</button>
        <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-gray-500">Close</button>
      </div>
    </div>
  );
}

export default function PdiTemplatesAdminPage() {
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // full template row being edited, or null
  const [creatingId, setCreatingId] = useState('');
  const [creatingName, setCreatingName] = useState('');
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

  const createTemplate = async () => {
    if (!creatingId.trim() || !creatingName.trim()) {
      notifyError('Both an id and a name are required to create a template.');
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/api/pdi/admin/templates`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ id: creatingId.trim(), name: creatingName.trim(), definition: emptyDefinition() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Create failed');
      notifySuccess('Template created.');
      setCreatingId(''); setCreatingName('');
      await refresh();
      setEditing(body);
    } catch (err) {
      notifyError(err.message);
    }
  };

  if (editing) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow p-6">
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
              <label className="block text-xs font-medium text-gray-600 mb-1">New template id (slug)</label>
              <input className={FIELD_CLS} value={creatingId} onChange={(e) => setCreatingId(e.target.value)} placeholder="e.g. acme-motor-pdi" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input className={FIELD_CLS} value={creatingName} onChange={(e) => setCreatingName(e.target.value)} placeholder="e.g. Acme Motor PDI" />
            </div>
            <button type="button" onClick={createTemplate} className="flex items-center gap-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm font-medium transition-colors">
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
