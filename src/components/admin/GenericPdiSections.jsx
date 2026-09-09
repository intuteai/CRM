// CRM/src/components/admin/GenericPdiSections.jsx
import { Fragment } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ImageUploadCard } from '../shared/PdiImageUpload';

export const INPUT_CLS =
  'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-gray-700 bg-amber-100 border border-gray-200 whitespace-nowrap';

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
                      <td key={c.key} className="py-1 px-1 border border-gray-100">
                        <input className={INPUT_CLS} value={row[c.key] || ''} onChange={(e) => setCell(section.dataKey, idx, c.key, e.target.value)} />
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
                    <td key={c.key} className="py-2 px-3 text-sm text-gray-500">{displayVal ?? ''}</td>
                  );
                })}
                <td className="py-1 px-1 border border-gray-100 text-center">
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
                    return <td key={c.key} className="py-2 px-3 text-sm text-gray-500">{displayVal ?? ''}</td>;
                  }
                  const value = (sectionData[row.key] && sectionData[row.key][c.cell.subfield]) || '';
                  const isSelect = ['GO', 'NG', 'NA'].includes(String(c.cell.default || '').toUpperCase());
                  return (
                    <td key={c.key} className="py-1 px-2 border border-gray-100 text-center">
                      {isSelect ? (
                        <select className={INPUT_CLS} value={value} onChange={(e) => setCell(section.dataKey, row.key, c.cell.subfield, e.target.value)}>
                          {['GO', 'NG', 'NA'].map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input className={INPUT_CLS} value={value} onChange={(e) => setCell(section.dataKey, row.key, c.cell.subfield, e.target.value)} />
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

function FreeformPhotoSection({ section, form, addPhoto, removePhoto, setLabel, handleFileChosen, setImage }) {
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
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input className={INPUT_CLS} value={photo.label} onChange={(e) => setLabel(section.dataKey, idx, e.target.value)} placeholder={`Photo ${idx + 1} label`} />
              <button type="button" onClick={() => removePhoto(section.dataKey, idx)} className="shrink-0 p-1.5 text-gray-400 hover:text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
            <ImageUploadCard
              value={photo.image}
              onSelect={(file, el) => handleFileChosen((dataUri) => setImage(section.dataKey, idx, dataUri), file, el)}
              onClear={() => setImage(section.dataKey, idx, null)}
              heightCls="h-32"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FixedSlotPhotoSection({ section, form, handleFileChosen, setSlotImage }) {
  const slotData = form[section.dataKey] || {};
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Photos</h3>
      <div className="grid grid-cols-2 gap-4">
        {section.slots.map((slot) => (
          <ImageUploadCard
            key={slot.key}
            label={slot.label}
            value={slotData[slot.key]}
            onSelect={(file, el) => handleFileChosen((dataUri) => setSlotImage(section.dataKey, slot.key, dataUri), file, el)}
            onClear={() => setSlotImage(section.dataKey, slot.key, null)}
          />
        ))}
      </div>
    </div>
  );
}

function ImageSection({ section, form, handleFileChosen, setImageField }) {
  return (
    <div className="mb-6">
      <ImageUploadCard
        label={section.title || 'Image'}
        value={form[section.dataKey]}
        onSelect={(file, el) => handleFileChosen((dataUri) => setImageField(section.dataKey, dataUri), file, el)}
        onClear={() => setImageField(section.dataKey, null)}
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
        ? <FixedSlotPhotoSection key={section.dataKey} section={section} form={ctx.form} handleFileChosen={ctx.handleFileChosen} setSlotImage={ctx.setFixedSlotImage} />
        : <FreeformPhotoSection key={section.dataKey} section={section} form={ctx.form} addPhoto={ctx.addFreeformPhoto} removePhoto={ctx.removeFreeformPhoto} setLabel={ctx.setFreeformPhotoLabel} handleFileChosen={ctx.handleFileChosen} setImage={ctx.setFreeformPhotoImage} />;
    case 'image':
      return <ImageSection key={section.dataKey} section={section} form={ctx.form} handleFileChosen={ctx.handleFileChosen} setImageField={ctx.setImageField} />;
    case 'signature':
      return <SignatureSection key="signature" section={section} form={ctx.form} setField={ctx.setField} />;
    case 'text':
      return <TextSection key={section.dataKey} section={section} form={ctx.form} setField={ctx.setField} />;
    default:
      return null;
  }
}
