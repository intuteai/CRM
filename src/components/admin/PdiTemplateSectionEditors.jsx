// CRM/src/components/admin/PdiTemplateSectionEditors.jsx
import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { labelToKey } from '../../utils/pdiTemplateSlug';

export const FIELD_CLS = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';

// Walks a template definition and collects every dataKey/key currently in
// use, across every page and section — dataKeys must be unique across the
// WHOLE template (they all land in one flattened `data` object at fill
// time), not just within the section currently being edited.
export function collectAllKeys(definition) {
  const keys = new Set();
  (definition.pages || []).forEach((page) => {
    (page.sections || []).forEach((section) => {
      if (section.type === 'header') {
        (section.infoFields || []).forEach((f) => {
          if (f.leftKey) keys.add(f.leftKey);
          if (f.rightKey) keys.add(f.rightKey);
        });
      } else if (section.type === 'table') {
        if (section.dataKey) keys.add(section.dataKey);
        (section.columns || []).forEach((c) => { if (c.key) keys.add(c.key); });
        (section.fixedRows || []).forEach((r) => { if (r.key) keys.add(r.key); });
      } else if (section.type === 'photo') {
        if (section.dataKey) keys.add(section.dataKey);
        (section.slots || []).forEach((s) => { if (s.key) keys.add(s.key); });
      } else if (section.type === 'image' || section.type === 'text') {
        if (section.dataKey) keys.add(section.dataKey);
      } else if (section.type === 'signature') {
        (section.roles || []).forEach((r) => { if (r.key) keys.add(r.key); });
      }
    });
  });
  return keys;
}

// A plain-language label input with its derived key auto-generated and
// hidden behind a small "Advanced" toggle — the pattern used everywhere a
// field used to need a hand-typed dataKey. `usedKeysExcludingSelf` must
// already have this field's OWN current key removed by the caller (via
// collectAllKeys(...) minus the one key this field owns), or renaming a
// field would immediately "collide" with its own old key and get a
// spurious _2 suffix. `onChange` is called with `{ label, key }`.
export function LabeledKeyField({ label, keyValue, usedKeysExcludingSelf, onChange, placeholder }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <div>
      <input
        className={FIELD_CLS}
        placeholder={placeholder}
        value={label}
        onChange={(e) => {
          const newLabel = e.target.value;
          onChange({ label: newLabel, key: labelToKey(newLabel, usedKeysExcludingSelf) });
        }}
      />
      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="text-[11px] text-gray-400 hover:text-gray-600 mt-0.5"
      >
        {showAdvanced ? 'Hide key' : 'Advanced'}
      </button>
      {showAdvanced && (
        <input
          className={FIELD_CLS + ' mt-1 text-xs text-gray-500'}
          placeholder="key"
          value={keyValue}
          onChange={(e) => onChange({ label, key: e.target.value })}
        />
      )}
    </div>
  );
}

// ── Small reusable list-editor: add/remove/drag-reorder rows of a fixed shape ──
// Reordering only commits on drop, not on every dragover — this keeps the
// underlying `items` array (and therefore each row's key={i}-based DOM
// identity) stable for the full duration of a drag gesture, avoiding the
// index-key/DOM-recycling jank that a live-reorder-during-drag approach
// would risk (React reassigning the dragged browser element to a different
// logical row mid-gesture).
export function ListEditor({ items, onChange, renderRow, newRow, addLabel }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const handleDrop = (dropIndex) => (e) => {
    e.preventDefault();
    setOverIndex(null);
    if (dragIndex === null || dragIndex === dropIndex) { setDragIndex(null); return; }
    const reordered = [...items];
    const [moved] = reordered.splice(dragIndex, 1);
    // Reinserting at dropIndex (unadjusted) lands `moved` at exactly index
    // dropIndex in the resulting array regardless of drag direction — no
    // special-casing needed. An earlier version subtracted 1 for downward
    // drags, which made dropping an item onto its very next sibling a no-op.
    reordered.splice(dropIndex, 0, moved);
    onChange(reordered);
    setDragIndex(null);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          draggable
          onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { e.preventDefault(); if (dragIndex !== null && dragIndex !== i) setOverIndex(i); }}
          onDragLeave={() => setOverIndex((cur) => (cur === i ? null : cur))}
          onDrop={handleDrop(i)}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
          className={`flex items-center gap-2 border rounded p-2 transition-colors ${
            overIndex === i ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
          } ${dragIndex === i ? 'opacity-40' : ''}`}
        >
          <span className="text-gray-300 cursor-grab shrink-0" title="Drag to reorder">
            <GripVertical size={14} />
          </span>
          <div className="flex-1">{renderRow(item, (updated) => onChange(items.map((it, idx) => (idx === i ? updated : it))))}</div>
          <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 shrink-0">
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

// Deliberately doesn't expose logoAsset or extraFormatLines — both are rare
// fields (only the hand-coded General/AutoNXT templates have ever needed a
// logo or a 4th format-box line); a template authored through this UI simply
// can't set them yet. Accepted v1 scope limit, carried over unchanged from
// before this redesign.
export function HeaderSectionEditor({ section, onChange, definition }) {
  const ownKeys = new Set();
  (section.infoFields || []).forEach((f) => { if (f.leftKey) ownKeys.add(f.leftKey); if (f.rightKey) ownKeys.add(f.rightKey); });
  const otherKeys = collectAllKeys(definition);
  ownKeys.forEach((k) => otherKeys.delete(k));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={FIELD_CLS} placeholder="Company name" value={section.companyName} onChange={(e) => onChange({ ...section, companyName: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Format No." value={section.formatNo} onChange={(e) => onChange({ ...section, formatNo: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Rev No." value={section.revNo} onChange={(e) => onChange({ ...section, revNo: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Eff. Date" value={section.effDate} onChange={(e) => onChange({ ...section, effDate: e.target.value })} />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">Detail rows (shown at the top of the page, e.g. Customer / Date)</label>
        <ListEditor
          items={section.infoFields}
          onChange={(infoFields) => onChange({ ...section, infoFields })}
          addLabel="Add detail row"
          newRow={() => ({ leftLabel: '', leftKey: '', leftFormat: 'text', rightLabel: '', rightKey: '', rightFormat: 'text' })}
          renderRow={(row, update) => {
            // otherKeys already lacks every info-field row's own left/right
            // keys (removed up front above). Re-add every OTHER row's keys
            // here so sibling rows in this same list can't collide with each
            // other — a plain new Set(otherKeys) with no re-adding would
            // silently allow two rows to share one generated key, since
            // there'd be nothing left in the set to collide against.
            const siblingKeys = new Set(otherKeys);
            (section.infoFields || []).forEach((f) => {
              if (f === row) return;
              if (f.leftKey) siblingKeys.add(f.leftKey);
              if (f.rightKey) siblingKeys.add(f.rightKey);
            });
            const excludingLeft = new Set(siblingKeys);
            if (row.rightKey) excludingLeft.add(row.rightKey);
            const excludingRight = new Set(siblingKeys);
            if (row.leftKey) excludingRight.add(row.leftKey);
            return (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex gap-1 items-start">
                  <div className="flex-1">
                    <LabeledKeyField
                      label={row.leftLabel}
                      keyValue={row.leftKey}
                      usedKeysExcludingSelf={excludingLeft}
                      placeholder="e.g. Customer Name"
                      onChange={({ label, key }) => update({ ...row, leftLabel: label, leftKey: key })}
                    />
                  </div>
                  <select className={FIELD_CLS + ' w-20'} value={row.leftFormat} onChange={(e) => update({ ...row, leftFormat: e.target.value })}>
                    <option value="text">text</option><option value="date">date</option>
                  </select>
                </div>
                <div className="flex gap-1 items-start">
                  <div className="flex-1">
                    <LabeledKeyField
                      label={row.rightLabel}
                      keyValue={row.rightKey}
                      usedKeysExcludingSelf={excludingRight}
                      placeholder="e.g. Date"
                      onChange={({ label, key }) => update({ ...row, rightLabel: label, rightKey: key })}
                    />
                  </div>
                  <select className={FIELD_CLS + ' w-20'} value={row.rightFormat} onChange={(e) => update({ ...row, rightFormat: e.target.value })}>
                    <option value="text">text</option><option value="date">date</option>
                  </select>
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

export function PhotoSectionEditor({ section, onChange, definition }) {
  const excludingThisSection = new Set(collectAllKeys(definition));
  if (section.dataKey) excludingThisSection.delete(section.dataKey);
  (section.slots || []).forEach((s) => { if (s.key) excludingThisSection.delete(s.key); });

  return (
    <div className="space-y-2">
      <select className={FIELD_CLS} value={section.mode} onChange={(e) => onChange({ ...section, mode: e.target.value })}>
        <option value="freeform">Inspector adds their own photos</option>
        <option value="fixed-slots">Fixed photo slots (you name each one)</option>
      </select>
      {section.mode === 'fixed-slots' ? (
        <ListEditor
          items={section.slots}
          onChange={(slots) => onChange({ ...section, slots })}
          addLabel="Add photo slot"
          newRow={() => ({ key: '', label: '' })}
          renderRow={(slot, update) => {
            // excludingThisSection already lacks every slot's own key (they
            // were all removed up front). Re-add every OTHER slot's key here
            // so sibling slots in this list can't collide with each other.
            const excludingThisSlot = new Set(excludingThisSection);
            (section.slots || []).forEach((s) => { if (s.key && s.key !== slot.key) excludingThisSlot.add(s.key); });
            return (
              <LabeledKeyField
                label={slot.label}
                keyValue={slot.key}
                usedKeysExcludingSelf={excludingThisSlot}
                placeholder="e.g. Nameplate Photo"
                onChange={({ label, key }) => update({ label, key })}
              />
            );
          }}
        />
      ) : (
        <LabeledKeyField
          label={section.label || ''}
          keyValue={section.dataKey}
          usedKeysExcludingSelf={excludingThisSection}
          placeholder="e.g. Inspection Photos"
          onChange={({ label, key }) => onChange({ ...section, label, dataKey: key })}
        />
      )}
    </div>
  );
}

// Deliberately doesn't expose `width` (defaults to full content width via
// the backend's `section.width || CW` fallback) — same rare-field reasoning
// as HeaderSectionEditor's logoAsset/extraFormatLines above.
export function ImageSectionEditor({ section, onChange, definition }) {
  const excludingThisSection = new Set(collectAllKeys(definition));
  if (section.dataKey) excludingThisSection.delete(section.dataKey);

  return (
    <div className="space-y-2">
      <LabeledKeyField
        label={section.title || ''}
        keyValue={section.dataKey}
        usedKeysExcludingSelf={excludingThisSection}
        placeholder="e.g. Nameplate"
        onChange={({ label, key }) => onChange({ ...section, title: label, dataKey: key })}
      />
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

export function SignatureSectionEditor({ section, onChange, definition }) {
  const excludingThisSection = new Set(collectAllKeys(definition));
  (section.roles || []).forEach((r) => { if (r.key) excludingThisSection.delete(r.key); });

  return (
    <ListEditor
      items={section.roles}
      onChange={(roles) => onChange({ ...section, roles })}
      addLabel="Add signer"
      newRow={() => ({ key: '', label: '' })}
      renderRow={(role, update) => {
        // excludingThisSection already lacks every role's own key (they were
        // all removed up front). Re-add every OTHER role's key here so
        // sibling roles in this list can't collide with each other.
        const excludingThisRole = new Set(excludingThisSection);
        (section.roles || []).forEach((r) => { if (r.key && r.key !== role.key) excludingThisRole.add(r.key); });
        return (
          <LabeledKeyField
            label={role.label}
            keyValue={role.key}
            usedKeysExcludingSelf={excludingThisRole}
            placeholder="e.g. Inspected By"
            onChange={({ label, key }) => update({ label, key })}
          />
        );
      }}
    />
  );
}

export function NotesSectionEditor({ section, onChange, definition }) {
  const excludingThisSection = new Set(collectAllKeys(definition));
  if (section.dataKey) excludingThisSection.delete(section.dataKey);

  return (
    <div className="space-y-2">
      <LabeledKeyField
        label={section.label}
        keyValue={section.dataKey}
        usedKeysExcludingSelf={excludingThisSection}
        placeholder="e.g. Remarks"
        onChange={({ label, key }) => onChange({ ...section, label, dataKey: key })}
      />
      <input className={FIELD_CLS} placeholder="Default text (optional)" value={section.default || ''} onChange={(e) => onChange({ ...section, default: e.target.value })} />
    </div>
  );
}
