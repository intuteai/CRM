// CRM/src/components/admin/GenericPdiGeneratorForm.jsx
import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { ImageUploadCard, CropModal } from '../shared/PdiImageUpload';
import { fileToDataUri, MAX_RAW_IMAGE_BYTES } from '../../utils/pdiImageUpload';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

const INPUT_CLS =
  'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const SELECT_CLS =
  'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-gray-700 bg-amber-100 border border-gray-200 whitespace-nowrap';

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

// Builds a blank form-data object covering every dataKey/role the definition
// references, mirroring CRM_BACKEND's own buildSampleData (same walk, but
// blank values instead of sample placeholder text, since this is a genuinely
// empty new draft, not a PDF preview).
function buildDefaultFormData(definition) {
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

function makeEmptyRow(columns) {
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
          className="flex items-center gap-1 px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-xs font-medium"
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
                {cols.map((c) => (
                  <td key={c.key} className="py-1 px-1 border border-gray-100">
                    {(!c.cell || c.cell.source === 'row') ? (
                      <input className={INPUT_CLS} value={row[c.key] || ''} onChange={(e) => setCell(section.dataKey, idx, c.key, e.target.value)} />
                    ) : (
                      <span className="text-sm text-gray-400 px-2">—</span>
                    )}
                  </td>
                ))}
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
                        <select className={SELECT_CLS} value={value} onChange={(e) => setCell(section.dataKey, row.key, c.cell.subfield, e.target.value)}>
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
          className="flex items-center gap-1 px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-xs font-medium"
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

function renderSection(section, ctx) {
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

export default function GenericPdiGeneratorForm() {
  const { templateId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { notifySuccess, notifyError } = useNotify();

  const [definition, setDefinition] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [loadError, setLoadError] = useState(null);

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [form, setForm] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Fetch the template definition once on mount.
  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('token');
      if (!token) { notifyError('Please log in first.'); return; }
      try {
        const response = await axios.get(`${API_URL}/api/pdi/templates/${templateId}/definition`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDefinition(response.data.definition);
        setTemplateName(response.data.name);
      } catch (err) {
        setLoadError(err.response?.data?.error || 'Could not load this PDI template.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Resume: if the dashboard linked here with ?report=<id>, load that report
  // and open pre-filled instead of waiting for the card click. Only runs once
  // the definition has loaded, since building the merged form needs it.
  useEffect(() => {
    if (!definition) return;
    const resumeId = searchParams.get('report');
    if (!resumeId) return;

    (async () => {
      const token = localStorage.getItem('token');
      if (!token) { notifyError('Please log in first.'); setSearchParams({}, { replace: true }); return; }
      try {
        const response = await axios.get(`${API_URL}/api/pdi/reports/${resumeId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const report = response.data;
        const base = buildDefaultFormData(definition);
        const reportPhotos = report.photos;
        const hasRealPhotos = reportPhotos && (Array.isArray(reportPhotos) ? reportPhotos.length > 0 : Object.keys(reportPhotos).length > 0);
        setForm({
          ...base,
          ...(report.data || {}),
          photos: hasRealPhotos ? reportPhotos : base.photos,
        });
        setReportId(report.report_id);
        setHasSaved(true);
        setActiveTab(0);
        setIsOpen(true);
      } catch (err) {
        notifyError(err.response?.data?.error || 'Could not load that PDI report.');
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const addRepeatableRow = useCallback((dataKey, columns) => {
    setForm((prev) => ({ ...prev, [dataKey]: [...(prev[dataKey] || []), makeEmptyRow(columns)] }));
  }, []);
  const removeRepeatableRow = useCallback((dataKey, idx) => {
    setForm((prev) => ({ ...prev, [dataKey]: prev[dataKey].filter((_, i) => i !== idx) }));
  }, []);
  const setRepeatableCell = useCallback((dataKey, idx, colKey, value) => {
    setForm((prev) => {
      const rows = [...(prev[dataKey] || [])];
      rows[idx] = { ...rows[idx], [colKey]: value };
      return { ...prev, [dataKey]: rows };
    });
  }, []);

  const setFixedCell = useCallback((dataKey, rowKey, subfield, value) => {
    setForm((prev) => ({
      ...prev,
      [dataKey]: { ...prev[dataKey], [rowKey]: { ...prev[dataKey][rowKey], [subfield]: value } },
    }));
  }, []);

  const addFreeformPhoto = useCallback((dataKey) => {
    setForm((prev) => ({ ...prev, [dataKey]: [...(prev[dataKey] || []), { label: '', image: null }] }));
  }, []);
  const removeFreeformPhoto = useCallback((dataKey, idx) => {
    setForm((prev) => ({ ...prev, [dataKey]: prev[dataKey].filter((_, i) => i !== idx) }));
  }, []);
  const setFreeformPhotoLabel = useCallback((dataKey, idx, label) => {
    setForm((prev) => {
      const list = [...prev[dataKey]];
      list[idx] = { ...list[idx], label };
      return { ...prev, [dataKey]: list };
    });
  }, []);
  const setFreeformPhotoImage = useCallback((dataKey, idx, image) => {
    setForm((prev) => {
      const list = [...prev[dataKey]];
      list[idx] = { ...list[idx], image };
      return { ...prev, [dataKey]: list };
    });
  }, []);

  const setFixedSlotImage = useCallback((dataKey, slotKey, image) => {
    setForm((prev) => ({ ...prev, [dataKey]: { ...prev[dataKey], [slotKey]: image } }));
  }, []);

  const setImageField = useCallback((dataKey, image) => {
    setForm((prev) => ({ ...prev, [dataKey]: image }));
  }, []);

  const [cropTarget, setCropTarget] = useState(null); // { apply: (dataUri) => void, imageSrc } | null

  const handleFileChosen = useCallback(async (applyFn, file, inputEl) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notifyError('Please choose an image file.');
      if (inputEl) inputEl.value = '';
      return;
    }
    if (file.size > MAX_RAW_IMAGE_BYTES) {
      notifyError(`Image is too large (max ${(MAX_RAW_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB).`);
      if (inputEl) inputEl.value = '';
      return;
    }
    try {
      const dataUri = await fileToDataUri(file);
      setCropTarget({ apply: applyFn, imageSrc: dataUri });
    } catch {
      notifyError('Failed to read image file.');
    } finally {
      if (inputEl) inputEl.value = '';
    }
  }, [notifyError]);

  const applyCroppedImage = useCallback((dataUri) => {
    setCropTarget((current) => {
      if (!current) return current;
      current.apply(dataUri);
      return null;
    });
  }, []);
  const cancelCrop = useCallback(() => setCropTarget(null), []);

  const handleOpen = async () => {
    if (opening || !definition) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setOpening(true);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/reports`, { template_id: templateId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportId(response.data.report_id);
      setHasSaved(false);
      setForm(buildDefaultFormData(definition));
      setActiveTab(0);
      setIsOpen(true);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not start a new PDI report.');
    } finally {
      setOpening(false);
    }
  };

  // Combines every signature role's value (in the template's own role order)
  // into one string, matching AutoNXTGeneratorForm's pattern generalized to
  // however many roles a given template happens to define.
  const inspectedByValue = () => {
    const roleKeys = [];
    definition.pages.forEach((page) => page.sections.forEach((s) => {
      if (s.type === 'signature') s.roles.forEach((r) => roleKeys.push(r.key));
    }));
    const names = roleKeys.map((k) => (form[k] || '').trim()).filter(Boolean);
    return names.length ? names.join(' / ') : undefined;
  };

  const handleSave = async () => {
    if (!reportId) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setSaving(true);
    try {
      // See the contract note at the top of this task — this destructuring
      // is load-bearing, not optional style. Do not send `photos` inside `data`.
      const { photos, ...data } = form;
      await axios.patch(`${API_URL}/api/pdi/reports/${reportId}`, {
        data, photos, status: 'In Progress', inspected_by: inspectedByValue(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHasSaved(true);
      notifySuccess('Progress saved.');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Failed to save progress.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async (e) => {
    e.preventDefault();
    if (!form.pdi_no.trim()) { notifyError('PDI No. is required.'); return; }
    if (!reportId) { notifyError('Report not initialized yet — please close and reopen the form.'); return; }

    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const { photos, ...data } = form;
      await axios.patch(`${API_URL}/api/pdi/reports/${reportId}`, {
        data, photos, inspected_by: inspectedByValue(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      setHasSaved(true);

      const response = await axios.post(`${API_URL}/api/pdi/reports/${reportId}/finalize`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
        signal: controller.signal,
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PDI_${form.pdi_no.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      notifySuccess('PDI finalized and PDF downloaded successfully.');
      setIsOpen(false);
      setReportId(null);
      setHasSaved(false);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          notifyError(parsed.error || text || 'Failed to finalize PDI.');
        } catch {
          notifyError('Failed to finalize PDI.');
        }
      } else {
        notifyError(err.response?.data?.error || 'Failed to finalize PDI.');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleClose = async () => {
    if (abortRef.current) abortRef.current.abort();
    if (reportId && !hasSaved) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${API_URL}/api/pdi/reports/${reportId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error('Failed to clean up unsaved PDI draft:', err);
      }
    }
    setIsOpen(false);
    setReportId(null);
    setHasSaved(false);
  };

  if (loadError) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">{loadError}</div>;
  }
  if (!definition) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading template...</div>;
  }

  const ctx = form ? {
    form, setField, addRepeatableRow, removeRepeatableRow, setRepeatableCell, setFixedCell,
    addFreeformPhoto, removeFreeformPhoto, setFreeformPhotoLabel, setFreeformPhotoImage,
    setFixedSlotImage, setImageField, handleFileChosen,
  } : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">{templateName}</h1>

      <div className="max-w-3xl mx-auto">
        <div
          onClick={handleOpen}
          className="bg-white rounded-2xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow border-2 border-dashed border-amber-300 flex items-center gap-6"
        >
          <div className="p-4 bg-amber-100 rounded-xl">
            <FileText size={40} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">New {templateName}</h2>
            <p className="text-gray-500 mt-1">Fill in the details and generate a PDF report.</p>
            <span className="inline-block mt-3 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium">
              + Create PDI
            </span>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isOpen && !!form}
        onRequestClose={handleClose}
        overlayClassName="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-start justify-center z-50 overflow-y-auto py-8"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 outline-none"
        contentLabel={templateName}
      >
        {form && (
          <form onSubmit={handleFinalize}>
            <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <FileText className="text-amber-500" size={24} />
                <h2 className="text-xl font-bold text-gray-800">{templateName}</h2>
              </div>
              <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="px-8 py-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDI No. <span className="text-red-500">*</span></label>
                <input className={INPUT_CLS} value={form.pdi_no} onChange={(e) => setField('pdi_no', e.target.value)} placeholder="e.g. PDI-2026-001" />
              </div>

              {definition.pages.length > 1 && (
                <div className="border-b border-gray-200">
                  <nav className="flex gap-1">
                    {definition.pages.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveTab(i)}
                        className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                          activeTab === i
                            ? 'border-amber-500 text-amber-600 bg-amber-50'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Page {i + 1}
                      </button>
                    ))}
                  </nav>
                </div>
              )}

              {definition.pages[activeTab]?.sections.map((section, i) => (
                <div key={i}>{renderSection(section, ctx)}</div>
              ))}
            </div>

            <div className="flex justify-between gap-3 px-8 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 text-sm font-semibold"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={handleClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-semibold"
                >
                  <Download size={16} />
                  {loading ? 'Finalizing...' : 'Finalize & Generate PDF'}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {cropTarget && (
        <CropModal imageSrc={cropTarget.imageSrc} onCancel={cancelCrop} onApply={applyCroppedImage} />
      )}
    </div>
  );
}
