// CRM/src/components/admin/GenericPdiSections.jsx
import { Fragment } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ImageUploadCard } from '../shared/PdiImageUpload';

export const INPUT_CLS =
  'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const TH_CLS = 'py-3 px-3 text-xs font-semibold text-gray-700 bg-amber-100 border border-gray-200 whitespace-nowrap';

// Same ceilings as PDIGeneratorForm.jsx, for the same reason: server.js's
// express.json({ limit: '25mb' }) caps the request body Save/Finalize send.
export const MAX_PHOTOS = 12;
export const MAX_ROWS = 100;

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

// Builds a blank form-data object covering every dataKey/role the definition
// references, mirroring CRM_BACKEND's own buildSampleData (same walk, but
// blank values instead of sample placeholder text, since this is a genuinely
// empty new draft, not a PDF preview).
export function buildDefaultFormData(definition) {
  const data = { pdi_no: '' };
  definition.pages.forEach((page) => {
    page.sections.forEach((section) => {
      if (section.type === 'header') {
        section.infoFields.forEach((f) => {
          if (f.leftKey && data[f.leftKey] === undefined) data[f.leftKey] = f.leftFormat === 'date' ? todayIST() : '';
          if (f.rightKey && data[f.rightKey] === undefined) data[f.rightKey] = f.rightFormat === 'date' ? todayIST() : '';
        });
      } else if (section.type === 'table') {
        if (section.mode === 'repeatable') {
          data[section.dataKey] = [];
        } else {
          const sectionData = {};
          (section.fixedRows || []).forEach((row) => {
            const rowData = {};
            section.columns.forEach((c) => {
              if (c.cell && c.cell.source === 'sectionData') rowData[c.cell.subfield] = c.cell.default || '';
            });
            sectionData[row.key] = rowData;
          });
          data[section.dataKey] = sectionData;
        }
      } else if (section.type === 'text') {
        data[section.dataKey] = section.default || '';
      } else if (section.type === 'signature') {
        section.roles.forEach((r) => { data[r.key] = ''; });
      } else if (section.type === 'photo') {
        data[section.dataKey] = section.mode === 'fixed-slots' ? {} : [];
      } else if (section.type === 'image') {
        data[section.dataKey] = null;
      }
    });
  });
  return data;
}

export function makeEmptyRow(columns) {
  const row = {};
  columns.forEach((c) => { row[c.key] = ''; });
  return row;
}

// Renders a text/number/dropdown input for one editable (non-constant,
// non-GO/NG/NA) table cell — shared between FixedTableSection and
// RepeatableTableSection so a fix here covers both call sites at once.
// Handles two data-quality cases the authoring editors don't prevent:
// an admin can delete every dropdown option down to zero, and can edit a
// column's options after inspectors have already saved values that are no
// longer in that list. Neither case should silently corrupt or hide data.
function EditableCellInput({ value, format, options, onChange }) {
  if (format === 'dropdown') {
    // A blank-string option is never meaningfully different from "nothing
    // selected" — the placeholder already covers that — so filter it out.
    // Without this, a freshly-created dropdown column (which starts with
    // one blank option) would render a second, selectable option visually
    // identical to the disabled placeholder.
    const cleanOptions = (options || []).filter((opt) => opt !== '');
    // If the currently-saved value isn't in the (cleaned) options list —
    // the admin edited/removed it after this value was already saved —
    // keep it visible and selected rather than silently blanking the
    // select out from under the inspector's already-entered answer.
    const effectiveOptions = value && !cleanOptions.includes(value) ? [...cleanOptions, value] : cleanOptions;
    const hasOptions = effectiveOptions.length > 0;
    return (
      <select className={INPUT_CLS} value={value} onChange={onChange} disabled={!hasOptions}>
        <option value="" disabled>{hasOptions ? 'Select…' : 'No options configured'}</option>
        {effectiveOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  return <input type={format === 'number' ? 'number' : 'text'} className={INPUT_CLS} value={value} onChange={onChange} />;
}

/* ── Section renderers — one per type, mirroring CRM_BACKEND's renderer.js drawers ── */

function HeaderSection({ section, form, setField }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-4">
      {section.infoFields.map((f, i) => (
        <Fragment key={i}>
          {f.leftKey && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.leftLabel}</label>
              <input
                type={f.leftFormat === 'date' ? 'date' : 'text'}
                className={INPUT_CLS}
                value={form[f.leftKey] || ''}
                onChange={(e) => setField(f.leftKey, e.target.value)}
              />
            </div>
          )}
          {f.rightKey && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.rightLabel}</label>
              <input
                type={f.rightFormat === 'date' ? 'date' : 'text'}
                className={INPUT_CLS}
                value={form[f.rightKey] || ''}
                onChange={(e) => setField(f.rightKey, e.target.value)}
              />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function RepeatableTableSection({ section, form, addRow, removeRow, setCell }) {
  const cols = section.columns;
  const rows = form[section.dataKey] || [];
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        {section.title ? <h3 className="text-sm font-semibold text-gray-700">{section.title}</h3> : <span />}
        <button
          type="button"
          onClick={() => addRow(section.dataKey, cols)}
          disabled={rows.length >= MAX_ROWS}
          className="flex items-center gap-1 px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-transparent text-xs font-medium"
        >
          <Plus size={14} /> Add Row
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left">
          <thead>
            <tr>
              {cols.map((c) => <th key={c.key} className={TH_CLS}>{c.label}</th>)}
              <th className={TH_CLS} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {cols.map((c) => {
                  if (!c.cell || c.cell.source === 'row') {
                    return (
                      <td key={c.key} className="py-2 px-2 border border-gray-100">
                        <EditableCellInput
                          value={row[c.key] || ''}
                          format={c.format}
                          options={c.options}
                          onChange={(e) => setCell(section.dataKey, idx, c.key, e.target.value)}
                        />
                      </td>
                    );
                  }
                  // 'constant' is the same value in every row; a repeatable row has no
                  // fixed row.key to look up in sectionData the way FixedTableSection
                  // does, so 'sectionData' here has no live per-row value — show the
                  // configured default instead, matching authoredTemplate.js's own
                  // resolveOverride fallback (sectionData[row.key] is always undefined
                  // for a repeatable row, so the renderer always prints cell.default too).
                  const displayVal = c.cell.source === 'constant' ? c.cell.value : c.cell.default;
                  return (
                    <td key={c.key} className="py-3 px-3 text-sm text-gray-500">{displayVal ?? ''}</td>
                  );
                })}
                <td className="py-2 px-2 border border-gray-100 text-center">
                  <button type="button" onClick={() => removeRow(section.dataKey, idx)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FixedTableSection({ section, form, setCell }) {
  const cols = section.columns;
  const sectionData = form[section.dataKey] || {};
  return (
    <div className="mb-6">
      {section.title && <h3 className="text-sm font-semibold text-gray-700 mb-2">{section.title}</h3>}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left">
          <thead>
            <tr>{cols.map((c) => <th key={c.key} className={TH_CLS}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {(section.fixedRows || []).map((row) => (
              <tr key={row.key} className="border-t border-gray-100">
                {cols.map((c) => {
                  const editable = c.cell && c.cell.source === 'sectionData';
                  if (!editable) {
                    const displayVal = c.cell && c.cell.source === 'constant' ? c.cell.value : row[c.key];
                    return <td key={c.key} className="py-3 px-3 text-sm text-gray-500">{displayVal ?? ''}</td>;
                  }
                  const value = (sectionData[row.key] && sectionData[row.key][c.cell.subfield]) || '';
                  const isSelect = ['GO', 'NG', 'NA'].includes(String(c.cell.default || '').toUpperCase());
                  return (
                    <td key={c.key} className="py-2 px-3 border border-gray-100 text-center">
                      {isSelect ? (
                        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden" role="group" aria-label="GO/NG/NA result">
                          {['GO', 'NG', 'NA'].map((o) => {
                            const active = value === o;
                            const activeCls = o === 'GO' ? 'bg-green-600 text-white' : o === 'NG' ? 'bg-red-600 text-white' : 'bg-gray-500 text-white';
                            return (
                              <button
                                key={o}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setCell(section.dataKey, row.key, c.cell.subfield, o)}
                                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${active ? activeCls : 'bg-white text-gray-500 hover:bg-gray-50'} ${o !== 'GO' ? 'border-l border-gray-300' : ''}`}
                              >
                                {o}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <EditableCellInput
                          value={value}
                          format={c.format}
                          options={c.options}
                          onChange={(e) => setCell(section.dataKey, row.key, c.cell.subfield, e.target.value)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FreeformPhotoSection({ section, form, addPhoto, removePhoto, setLabel, handleFilesChosen, addImage, removeImage }) {
  const photos = form[section.dataKey] || [];
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Photos</h3>
        <button
          type="button"
          onClick={() => addPhoto(section.dataKey)}
          disabled={photos.length >= MAX_PHOTOS}
          className="flex items-center gap-1 px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-transparent text-xs font-medium"
        >
          <Plus size={14} /> Add Photo
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {photos.map((photo, idx) => (
          // Keyed and labeled by display position (idx) — fine for React's
          // own diffing and for the human-facing "Photo N" label since this
          // list has no reorder affordance, but every handler below is
          // addressed by the entry's stable `photo.id`, not idx, so a
          // still-in-flight crop-queue callback for one entry can't land on
          // a different entry that has since slid into its old index (e.g.
          // an earlier photo was removed while this one's batch upload was
          // still mid-flight).
          <div key={photo.id} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input className={INPUT_CLS} value={photo.label} onChange={(e) => setLabel(section.dataKey, photo.id, e.target.value)} placeholder={`Photo ${idx + 1} label`} />
              <button type="button" onClick={() => removePhoto(section.dataKey, photo.id)} className="shrink-0 p-1.5 text-gray-400 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
            <ImageUploadCard
              images={photo.images || []}
              onFilesSelected={(fileList) => handleFilesChosen((dataUri) => addImage(section.dataKey, photo.id, dataUri), fileList)}
              onRemove={(imgIdx) => removeImage(section.dataKey, photo.id, imgIdx)}
              heightCls="h-32"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FixedSlotPhotoSection({ section, form, handleFilesChosen, addSlotImage, removeSlotImage }) {
  const slotData = form[section.dataKey] || {};
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Photos</h3>
      <div className="grid grid-cols-2 gap-4">
        {section.slots.map((slot) => (
          <ImageUploadCard
            key={slot.key}
            label={slot.label}
            images={slotData[slot.key] || []}
            onFilesSelected={(fileList) => handleFilesChosen((dataUri) => addSlotImage(section.dataKey, slot.key, dataUri), fileList)}
            onRemove={(imgIdx) => removeSlotImage(section.dataKey, slot.key, imgIdx)}
          />
        ))}
      </div>
    </div>
  );
}

function ImageSection({ section, form, handleFilesChosen, setImageField }) {
  const value = form[section.dataKey];
  return (
    <div className="mb-6">
      <ImageUploadCard
        label={section.title || 'Image'}
        images={value ? [value] : []}
        maxImages={1}
        onFilesSelected={(fileList) => handleFilesChosen((dataUri) => setImageField(section.dataKey, dataUri), fileList)}
        onRemove={() => setImageField(section.dataKey, null)}
        heightCls="h-28"
      />
    </div>
  );
}

function SignatureSection({ section, form, setField }) {
  return (
    <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${section.roles.length}, 1fr)` }}>
      {section.roles.map((role) => (
        <div key={role.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{role.label}</label>
          <input className={INPUT_CLS} value={form[role.key] || ''} onChange={(e) => setField(role.key, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

function TextSection({ section, form, setField }) {
  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-1">{section.label}</label>
      <textarea rows={2} className={INPUT_CLS} value={form[section.dataKey] ?? ''} onChange={(e) => setField(section.dataKey, e.target.value)} />
    </div>
  );
}

export function renderSection(section, ctx) {
  switch (section.type) {
    case 'header':
      return <HeaderSection key="header" section={section} form={ctx.form} setField={ctx.setField} />;
    case 'table':
      return section.mode === 'fixed'
        ? <FixedTableSection key={section.dataKey} section={section} form={ctx.form} setCell={ctx.setFixedCell} />
        : <RepeatableTableSection key={section.dataKey} section={section} form={ctx.form} addRow={ctx.addRepeatableRow} removeRow={ctx.removeRepeatableRow} setCell={ctx.setRepeatableCell} />;
    case 'photo':
      return section.mode === 'fixed-slots'
        ? <FixedSlotPhotoSection key={section.dataKey} section={section} form={ctx.form} handleFilesChosen={ctx.handleFilesChosen} addSlotImage={ctx.addFixedSlotImage} removeSlotImage={ctx.removeFixedSlotImage} />
        : <FreeformPhotoSection key={section.dataKey} section={section} form={ctx.form} addPhoto={ctx.addFreeformPhoto} removePhoto={ctx.removeFreeformPhoto} setLabel={ctx.setFreeformPhotoLabel} handleFilesChosen={ctx.handleFilesChosen} addImage={ctx.addFreeformPhotoImage} removeImage={ctx.removeFreeformPhotoImage} />;
    case 'image':
      return <ImageSection key={section.dataKey} section={section} form={ctx.form} handleFilesChosen={ctx.handleFilesChosen} setImageField={ctx.setImageField} />;
    case 'signature':
      return <SignatureSection key="signature" section={section} form={ctx.form} setField={ctx.setField} />;
    case 'text':
      return <TextSection key={section.dataKey} section={section} form={ctx.form} setField={ctx.setField} />;
    default:
      return null;
  }
}
