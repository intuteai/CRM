// CRM/src/components/admin/PdiTemplateSectionEditors.jsx
import { createContext, useContext, useState } from 'react';
import { Plus, Trash2, GripVertical, FileText, CheckSquare, Table, Camera, Image as ImageIcon, PenLine, StickyNote } from 'lucide-react';
import { labelToKey } from '../../utils/pdiTemplateSlug';

export const FIELD_CLS = 'border border-gray-300 rounded px-2 py-1 text-sm w-full';

// One template-wide toggle controls whether every field's technical key is
// visible/editable, replacing what used to be a separate "Advanced" link
// per field (dozens of them across one template). LabeledKeyField reads
// this directly via Context rather than taking a prop, so none of the
// section-editor functions between TemplateEditor and LabeledKeyField need
// to know this setting exists or thread it through their own props.
export const ShowKeysContext = createContext(false);

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
  const showKeys = useContext(ShowKeysContext);
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
      {showKeys && (
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
//
// `getItemKey(item, i)` is optional and defaults to the plain index. Pass
// it when `renderRow` renders something with meaningful per-row local state
// of its own (e.g. an expand/collapse toggle) — with the default index key,
// a drag-reorder keeps each DOM/component slot pinned to its position, so a
// row's own local state (not its data) silently jumps onto whatever row
// moved into that slot. Passing a stable identity (independent of array
// position) avoids that.
export function ListEditor({ items, onChange, renderRow, newRow, addLabel, hideAddButton, getItemKey, canRemove }) {
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
      {items.map((item, i) => {
        // Optional: some lists have "anchor" rows that can be reordered but
        // never deleted (e.g. Checklist's Item/Result columns). Defaults to
        // always-removable so every pre-existing ListEditor call site (none
        // of which pass canRemove) behaves exactly as before.
        const removable = canRemove ? canRemove(item, i) : true;
        return (
          <div
            key={getItemKey ? getItemKey(item, i) : i}
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
            {removable && (
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 shrink-0">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        );
      })}
      {!hideAddButton && (
        <button
          type="button"
          onClick={() => onChange([...items, newRow()])}
          className="flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-300 rounded px-2 py-1 hover:bg-amber-50"
        >
          <Plus size={14} /> {addLabel}
        </button>
      )}
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
        <input className={FIELD_CLS} placeholder="Document Number (e.g. FMT-QA-01)" value={section.formatNo} onChange={(e) => onChange({ ...section, formatNo: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Revision Number (e.g. 1)" value={section.revNo} onChange={(e) => onChange({ ...section, revNo: e.target.value })} />
        <input className={FIELD_CLS} placeholder="Effective Date (e.g. 09-Sep-2026)" value={section.effDate} onChange={(e) => onChange({ ...section, effDate: e.target.value })} />
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
            // The format <select>s need the `!w-20` (important) prefix, not
            // plain `w-20` — FIELD_CLS already carries `w-full`, and two
            // same-specificity Tailwind width utilities on one element
            // resolve by CSS source order, not by which appears later in
            // the className string. Without `!`, `w-full` was winning,
            // stretching the select and squeezing its sibling LabeledKeyField
            // down to a few pixels (found live in the Task 6 browser pass —
            // no lint/build/unit-level check catches a CSS cascade fight).
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
                  <select className={FIELD_CLS + ' !w-20'} value={row.leftFormat} onChange={(e) => update({ ...row, leftFormat: e.target.value })}>
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
                  <select className={FIELD_CLS + ' !w-20'} value={row.rightFormat} onChange={(e) => update({ ...row, rightFormat: e.target.value })}>
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
      {/* The section's own dataKey is required in BOTH modes — renderer.js
          and GenericPdiSections.jsx both key the whole photo section's data
          (the slot container in fixed-slots mode, or the freeform photo
          array) off this one field. It must not live only inside the
          freeform branch. */}
      <LabeledKeyField
        label={section.label || ''}
        keyValue={section.dataKey}
        usedKeysExcludingSelf={excludingThisSection}
        placeholder="e.g. Inspection Photos"
        onChange={({ label, key }) => onChange({ ...section, label, dataKey: key })}
      />
      {section.mode === 'fixed-slots' && (
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

// The four column "types" an admin can choose for an editable (non-fixed)
// column, shared between Checklist's extra columns and every Fill-in list
// column. "Fixed value" isn't really a distinct dialect concept — it's just
// cell.source === 'constant' — but presenting it as a 4th type alongside
// Text/Number/Dropdown reads far more plainly than a separate checkbox next
// to a 3-way type picker would.
const COLUMN_FORMATS = [
  { value: 'text', label: 'Text (inspector types it per row)' },
  { value: 'fixed', label: 'Fixed value (same on every row)' },
  { value: 'number', label: 'Number (inspector types it per row)' },
  { value: 'dropdown', label: 'Dropdown (inspector picks from your list)' },
];

// Derives which of the four format choices a column is currently in.
// 'fixed' is detected from cell.source alone (a constant column's format
// hint, if any, is meaningless — it's never edited by the inspector at
// authoring-fill time, so number/dropdown validation doesn't apply to it).
function columnFormat(col) {
  if (col.cell?.source === 'constant') return 'fixed';
  if (col.format === 'number') return 'number';
  if (col.format === 'dropdown') return 'dropdown';
  return 'text';
}

// Shared column-type controls used by both ChecklistSectionEditor's extra
// columns and FillInListColumnRow (Task 4). `editableSource(col)` supplies
// the correct cell shape for a non-fixed column in the CALLER's context —
// Checklist's rows are template-fixed, so its editable columns must read
// from `sectionData[fixedRow.key][columnKey]` (matching the existing,
// locked Result column's own shape); Fill-in list's rows are
// inspector-added, so its columns read from `row[columnKey]` directly.
// This component never assumes either shape itself.
function ColumnFormatFields({ col, editableSource, onUpdateCol }) {
  const format = columnFormat(col);
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-gray-500 block">Column type</label>
      <select
        className={FIELD_CLS}
        value={format}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'fixed') {
            onUpdateCol({ ...col, cell: { source: 'constant', value: col.cell?.source === 'constant' ? col.cell.value : '' }, format: undefined, options: undefined });
          } else if (next === 'dropdown') {
            // Seed with a real, non-blank option rather than [''] -- a blank
            // seed rendered in the fill-out form as a second, selectable
            // option visually identical to the "Select…" placeholder.
            onUpdateCol({ ...col, cell: editableSource(col), format: 'dropdown', options: col.options && col.options.length ? col.options : ['Option 1'] });
          } else if (next === 'number') {
            onUpdateCol({ ...col, cell: editableSource(col), format: 'number', options: undefined });
          } else {
            onUpdateCol({ ...col, cell: editableSource(col), format: undefined, options: undefined });
          }
        }}
      >
        {COLUMN_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      {format === 'fixed' && (
        <input
          className={FIELD_CLS}
          placeholder="Value shown in every row"
          value={col.cell.value}
          onChange={(e) => onUpdateCol({ ...col, cell: { source: 'constant', value: e.target.value } })}
        />
      )}
      {format === 'dropdown' && (
        <ListEditor
          items={col.options || []}
          onChange={(options) => onUpdateCol({ ...col, options })}
          addLabel="Add option"
          newRow={() => ''}
          renderRow={(opt, updateOpt) => (
            <input className={FIELD_CLS} placeholder="Option text" value={opt} onChange={(e) => updateOpt(e.target.value)} />
          )}
        />
      )}
    </div>
  );
}

// Item and Result are the two mandatory anchor columns every Checklist
// has. Item always reads the row's own label (cell:{source:'row'} ->
// row.item); Result is permanently locked to the GO/NG/NA subfield. Extra
// columns the admin adds live alongside them in the same list and CAN be
// repositioned relative to Item/Result (matching real forms like the
// hand-coded "General" template, where a constant "Specified" column sits
// between the two) — they just can't be deleted. Shared with
// SECTION_TYPE_OPTIONS' checklist build() below so a freshly-added,
// never-yet-edited Checklist section already has valid columns from the
// moment it's created — not only after the admin's first edit.
const ITEM_COLUMN = { key: 'item', label: 'Item', cell: { source: 'row' } };
const RESULT_COLUMN = { key: 'result', label: 'Result', cell: { source: 'sectionData', subfield: 'measured', default: 'GO' } };

// Produces { type: 'table', mode: 'fixed', ... }. The result column's
// OPTIONS are ALWAYS exactly GO/NG/NA — this is deliberately NOT
// configurable. Do not add a way to change what the three options ARE,
// even though it looks like an obvious enhancement: renderer.js and
// GenericPdiSections.jsx's FixedTableSection both hard-code recognition of
// exactly ['GO','NG','NA'] (case-insensitive) to decide whether to draw a
// 3-way toggle at all — a template with different option labels would
// silently fall back to a plain text box downstream with no toggle, which
// the editor gives no indication of. What IS configurable: extra columns
// around Item/Result (their position, and whether they're fixed/text/
// number/dropdown) — see the "Columns" list below.
export function ChecklistSectionEditor({ section, onChange, definition }) {
  const excludingThisSection = new Set(collectAllKeys(definition));
  if (section.dataKey) excludingThisSection.delete(section.dataKey);
  (section.fixedRows || []).forEach((r) => { if (r.key) excludingThisSection.delete(r.key); });
  const columns = section.columns && section.columns.length ? section.columns : [ITEM_COLUMN, RESULT_COLUMN];
  columns.forEach((c) => { if (c.key && c.key !== 'item' && c.key !== 'result') excludingThisSection.delete(c.key); });

  return (
    <div className="space-y-2">
      <LabeledKeyField
        label={section.title || ''}
        keyValue={section.dataKey}
        usedKeysExcludingSelf={excludingThisSection}
        placeholder="e.g. Winding & Bearing Checks"
        onChange={({ label, key }) => onChange({ ...section, title: label, dataKey: key, columns })}
      />
      <p className="text-[11px] text-gray-400">Every item is marked GO / NG / NA by the inspector — this isn&apos;t customizable.</p>

      <div>
        <label className="text-xs font-medium text-gray-600">Columns</label>
        <ListEditor
          items={columns}
          onChange={(nextColumns) => onChange({ ...section, columns: nextColumns })}
          addLabel="Add column"
          newRow={() => ({ key: '', label: '', cell: { source: 'sectionData', subfield: '', default: '' } })}
          canRemove={(c) => c.key !== 'item' && c.key !== 'result'}
          renderRow={(col, update) => {
            if (col.key === 'item') {
              return (
                <div className="text-sm text-gray-700 py-1">
                  Item <span className="text-[10px] text-gray-400 ml-1">always the item name &middot; can&apos;t remove</span>
                </div>
              );
            }
            if (col.key === 'result') {
              return (
                <div className="text-sm text-gray-700 py-1">
                  Result (GO / NG / NA) <span className="text-[10px] text-gray-400 ml-1">fixed options &middot; can&apos;t remove</span>
                </div>
              );
            }
            const excludingThisCol = new Set(excludingThisSection);
            columns.forEach((c) => { if (c.key && c.key !== col.key && c.key !== 'item' && c.key !== 'result') excludingThisCol.add(c.key); });
            return (
              <div className="space-y-1">
                <LabeledKeyField
                  label={col.label}
                  keyValue={col.key}
                  usedKeysExcludingSelf={excludingThisCol}
                  placeholder="e.g. Remarks"
                  onChange={({ label, key }) => update({
                    ...col,
                    label,
                    key,
                    cell: col.cell?.source === 'constant' ? col.cell : { ...col.cell, subfield: key },
                  })}
                />
                <ColumnFormatFields
                  col={col}
                  editableSource={(c) => ({ source: 'sectionData', subfield: c.key, default: '' })}
                  onUpdateCol={update}
                />
              </div>
            );
          }}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600">Items</label>
        <ListEditor
          items={section.fixedRows || []}
          onChange={(fixedRows) => onChange({ ...section, fixedRows })}
          addLabel="Add checklist item"
          newRow={() => ({ key: '', item: '' })}
          renderRow={(row, update) => {
            // excludingThisSection already lacks every fixed row's own key
            // (removed up front above). Re-add every OTHER row's key here
            // so sibling checklist items can't collide with each other.
            const excludingThisRow = new Set(excludingThisSection);
            (section.fixedRows || []).forEach((r) => { if (r.key && r.key !== row.key) excludingThisRow.add(r.key); });
            return (
              <LabeledKeyField
                label={row.item || ''}
                keyValue={row.key}
                usedKeysExcludingSelf={excludingThisRow}
                placeholder="e.g. Winding Check"
                onChange={({ label, key }) => update({ key, item: label })}
              />
            );
          }}
        />
      </div>
    </div>
  );
}

function FillInListColumnRow({ col, section, excludingThisCol, update, onSectionChange }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Every not-yet-named column shares the same empty-string key, so without
  // the Boolean(col.key) guard, checking "skip empty rows" on ANY blank
  // column would make every other blank column appear checked too.
  const isFilterCol = Boolean(col.key) && section.filterKey === col.key;
  return (
    <div className="space-y-1">
      <LabeledKeyField
        label={col.label}
        keyValue={col.key}
        usedKeysExcludingSelf={excludingThisCol}
        placeholder="e.g. Motor Sr.No"
        onChange={({ label, key }) => {
          // Renaming the key this table's filterKey points at must keep the
          // reference correct, not silently orphan it. If the rename clears
          // the key back to empty, clear filterKey too rather than pointing
          // it at the same collision-prone empty string.
          //
          // This must be ONE combined write, not update() (routes through
          // ListEditor -> FillInListSectionEditor's own onChange, which
          // recomputes filterKey from `section.filterKey` before this
          // column's rename has been applied) followed by a separate
          // onSectionChange call — two writes derived from the same
          // pre-update `section` snapshot race, and the second one
          // (columns-based recompute) always won, silently clearing a
          // filterKey that this rename was trying to preserve.
          const wasFilterCol = Boolean(col.key) && section.filterKey === col.key;
          const nextColumns = (section.columns || []).map((c) => (c === col ? { ...c, label, key } : c));
          onSectionChange({
            ...section,
            columns: nextColumns,
            filterKey: wasFilterCol ? (key || undefined) : section.filterKey,
          });
        }}
      />
      <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="text-[11px] text-gray-400 hover:text-gray-600">
        {showAdvanced ? 'Hide advanced' : 'Advanced'}
      </button>
      {showAdvanced && (
        <div className="space-y-1.5 pl-2 border-l-2 border-gray-100">
          <ColumnFormatFields
            col={col}
            editableSource={() => ({ source: 'row' })}
            onUpdateCol={update}
          />
          <label className={`flex items-center gap-1.5 text-xs ${col.key ? 'text-gray-600' : 'text-gray-300'}`} title={col.key ? undefined : 'Name this column first'}>
            <input
              type="checkbox"
              checked={isFilterCol}
              disabled={!col.key}
              onChange={(e) => {
                if (!col.key) return;
                onSectionChange({ ...section, filterKey: e.target.checked ? col.key : undefined });
              }}
            />
            Only print this row once it has a value
          </label>
        </div>
      )}
    </div>
  );
}

// Produces { type: 'table', mode: 'repeatable', ... }. Every column defaults
// to { source: 'row' } (the inspector types a value per row) — the rare
// "always show this value" case is available per-column under Advanced.
export function FillInListSectionEditor({ section, onChange, definition }) {
  const excludingThisSection = new Set(collectAllKeys(definition));
  if (section.dataKey) excludingThisSection.delete(section.dataKey);
  (section.columns || []).forEach((c) => { if (c.key) excludingThisSection.delete(c.key); });

  return (
    <div className="space-y-2">
      <LabeledKeyField
        label={section.title || ''}
        keyValue={section.dataKey}
        usedKeysExcludingSelf={excludingThisSection}
        placeholder="e.g. Motor Serial Numbers"
        onChange={({ label, key }) => onChange({ ...section, title: label, dataKey: key })}
      />
      <ListEditor
        items={section.columns || []}
        onChange={(columns) => {
          // If the column that was providing filterKey got removed, drop it too.
          const stillHasFilterCol = columns.some((c) => c.key === section.filterKey);
          onChange({ ...section, columns, filterKey: stillHasFilterCol ? section.filterKey : undefined });
        }}
        addLabel="Add column"
        newRow={() => ({ key: '', label: '', cell: { source: 'row' } })}
        renderRow={(col, update) => {
          // Same sibling-collision pattern as ChecklistSectionEditor/
          // PhotoSectionEditor: excludingThisSection already lacks every
          // column's own key; re-add every OTHER column's key via .add().
          const excludingThisCol = new Set(excludingThisSection);
          (section.columns || []).forEach((c) => { if (c.key && c.key !== col.key) excludingThisCol.add(c.key); });
          return (
            <FillInListColumnRow
              col={col}
              section={section}
              excludingThisCol={excludingThisCol}
              update={update}
              onSectionChange={onChange}
            />
          );
        }}
      />
    </div>
  );
}

// Replaces the old bare <select> of raw type names. Each option's `build`
// creates a brand-new, empty section of that type — used only when adding a
// NEW section; there is no in-place "change an existing section's type"
// control anymore (switching types always discarded whatever was configured
// anyway, so removing the illusion of an in-place change and requiring
// delete-then-re-add isn't a capability loss).
export const SECTION_TYPE_OPTIONS = [
  { value: 'header', label: 'Header', icon: FileText, example: 'e.g. company name, customer, date', build: () => ({ type: 'header', companyName: '', formatNo: '', revNo: '', effDate: '', extraFormatLines: [], logoAsset: null, infoFields: [] }) },
  { value: 'checklist', label: 'Checklist', icon: CheckSquare, example: 'e.g. "Winding Check — GO/NG/NA"', build: () => ({ type: 'table', mode: 'fixed', title: '', dataKey: '', columns: [ITEM_COLUMN, RESULT_COLUMN], headerHeight: 20, rowHeight: 14, fixedRows: [] }) },
  { value: 'fillInList', label: 'Fill-in list', icon: Table, example: 'e.g. a growing list of serial numbers', build: () => ({ type: 'table', mode: 'repeatable', title: '', dataKey: '', columns: [], headerHeight: 20, rowHeight: 14, filterKey: undefined }) },
  { value: 'photo', label: 'Photos', icon: Camera, example: 'e.g. nameplate photo, damage photos', build: () => ({ type: 'photo', mode: 'freeform', dataKey: '', label: '', slots: [] }) },
  { value: 'image', label: 'Image', icon: ImageIcon, example: 'e.g. a fixed reference image', build: () => ({ type: 'image', dataKey: '', width: null, height: 100, title: '', placeholder: null }) },
  { value: 'signature', label: 'Signatures', icon: PenLine, example: 'e.g. "Inspected By ___________"', build: () => ({ type: 'signature', roles: [] }) },
  { value: 'notes', label: 'Notes', icon: StickyNote, example: 'e.g. a free-text remarks box', build: () => ({ type: 'text', label: '', dataKey: '', default: '' }) },
];

// A section's displayed type-badge/name in the picker and on its collapsed
// card — distinguishes 'table'+'fixed' (Checklist) from 'table'+'repeatable'
// (Fill-in list), which share one dialect `type` but are different editors.
export function sectionTypeOption(section) {
  if (section.type === 'table') {
    return SECTION_TYPE_OPTIONS.find((o) => o.value === (section.mode === 'fixed' ? 'checklist' : 'fillInList'));
  }
  const byType = { header: 'header', photo: 'photo', image: 'image', signature: 'signature', text: 'notes' };
  return SECTION_TYPE_OPTIONS.find((o) => o.value === byType[section.type]);
}

// A short, human name for a section's collapsed card — falls back to the
// plain type name (via sectionTypeOption) when the section has no title/
// label of its own yet (header/photo/signature never do; table/image/text
// do once the admin has typed one).
export function sectionCardTitle(section) {
  return section.title || section.label || sectionTypeOption(section)?.label || 'Section';
}

// Whether a section looks like it has real authored content yet — distinct
// from the fill-out form's own isSectionFilled check (which asks whether an
// INSPECTOR has entered data at fill time); this asks whether the ADMIN has
// put anything into the section while building the template.
export function sectionLooksFilledIn(section) {
  switch (section.type) {
    case 'header':
      return Boolean(section.companyName) || (section.infoFields || []).length > 0;
    case 'table':
      if (section.mode === 'fixed') return Boolean(section.title) && (section.fixedRows || []).length > 0;
      return Boolean(section.title) && (section.columns || []).length > 0;
    case 'photo':
      return section.mode === 'fixed-slots' ? (section.slots || []).length > 0 : Boolean(section.dataKey);
    case 'image':
      return Boolean(section.dataKey);
    case 'signature':
      return (section.roles || []).length > 0;
    case 'text':
      return Boolean(section.dataKey);
    default:
      return false;
  }
}

export function AddSectionPicker({ onAdd }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-400 hover:border-amber-300 hover:text-amber-600 transition-colors"
      >
        + Add section
      </button>
    );
  }
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-1">
      {SECTION_TYPE_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => { onAdd(opt.build()); setOpen(false); }}
            className="w-full text-left px-3 py-2 rounded hover:bg-amber-50 flex items-center gap-3"
          >
            <span className="shrink-0 w-8 h-8 rounded bg-amber-100 text-amber-700 flex items-center justify-center">
              <Icon size={16} />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium text-gray-800">{opt.label}</span>
              <span className="text-xs text-gray-500">{opt.example}</span>
            </span>
          </button>
        );
      })}
      <button type="button" onClick={() => setOpen(false)} className="w-full text-center text-xs text-gray-400 pt-1">
        Cancel
      </button>
    </div>
  );
}

// Dispatches a section to its editor by dialect shape (table further
// dispatches by mode) — the single place that maps a section's data shape
// to the component that edits it.
export function SectionEditorFor({ section, onChange, definition }) {
  if (section.type === 'header') return <HeaderSectionEditor section={section} onChange={onChange} definition={definition} />;
  if (section.type === 'table' && section.mode === 'fixed') return <ChecklistSectionEditor section={section} onChange={onChange} definition={definition} />;
  if (section.type === 'table') return <FillInListSectionEditor section={section} onChange={onChange} definition={definition} />;
  if (section.type === 'photo') return <PhotoSectionEditor section={section} onChange={onChange} definition={definition} />;
  if (section.type === 'image') return <ImageSectionEditor section={section} onChange={onChange} definition={definition} />;
  if (section.type === 'signature') return <SignatureSectionEditor section={section} onChange={onChange} definition={definition} />;
  if (section.type === 'text') return <NotesSectionEditor section={section} onChange={onChange} definition={definition} />;
  return null;
}
