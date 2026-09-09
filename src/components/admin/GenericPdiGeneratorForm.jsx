// CRM/src/components/admin/GenericPdiGeneratorForm.jsx
import { useState, useRef, useCallback, useEffect } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { CropModal } from '../shared/PdiImageUpload';
import { fileToDataUri, MAX_RAW_IMAGE_BYTES } from '../../utils/pdiImageUpload';
import { INPUT_CLS, MAX_PHOTOS, MAX_ROWS, buildDefaultFormData, makeEmptyRow, renderSection } from './GenericPdiSections';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

function flattenSections(definition) {
  const flat = [];
  definition.pages.forEach((page, pageIdx) => {
    page.sections.forEach((section, sectionIdx) => {
      flat.push({ key: `${pageIdx}-${sectionIdx}`, section });
    });
  });
  return flat;
}

function baseSectionLabel(section) {
  switch (section.type) {
    case 'header': return 'Header';
    case 'table': return section.title || 'Table';
    case 'photo': return 'Photos';
    case 'image': return section.title || 'Image';
    case 'signature': return 'Signatures';
    case 'text': return section.label || 'Notes';
    default: return 'Section';
  }
}

// Disambiguates sections that would otherwise share an identical label
// (whether both fell back to the same default, or both used the same
// custom title) by appending " (2)", " (3)", ... in order of appearance.
function labelFlattenedSections(flat) {
  const seenCounts = new Map();
  return flat.map(({ key, section }) => {
    const base = baseSectionLabel(section);
    const count = (seenCounts.get(base) || 0) + 1;
    seenCounts.set(base, count);
    return { key, section, label: count === 1 ? base : `${base} (${count})` };
  });
}

function isSectionFilled(section, form) {
  switch (section.type) {
    case 'header':
      return section.infoFields.some((f) =>
        (f.leftKey && String(form[f.leftKey] || '').trim()) ||
        (f.rightKey && String(form[f.rightKey] || '').trim())
      );
    case 'table':
      if (section.mode === 'repeatable') {
        return (form[section.dataKey] || []).length > 0;
      }
      {
        const sectionData = form[section.dataKey] || {};
        const editableCols = section.columns.filter((c) => c.cell && c.cell.source === 'sectionData');
        return (section.fixedRows || []).some((row) =>
          editableCols.some((c) => String((sectionData[row.key] && sectionData[row.key][c.cell.subfield]) || '').trim())
        );
      }
    case 'photo':
      if (section.mode === 'fixed-slots') {
        const slotData = form[section.dataKey] || {};
        return section.slots.some((s) => !!slotData[s.key]);
      }
      return (form[section.dataKey] || []).some((p) => !!p.image);
    case 'image':
      return !!form[section.dataKey];
    case 'signature':
      return section.roles.some((r) => String(form[r.key] || '').trim());
    case 'text':
      return String(form[section.dataKey] || '').trim().length > 0;
    default:
      return false;
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
  const [activeKey, setActiveKey] = useState(null); // one of the flattened keys, or 'review'

  const flatSections = definition ? labelFlattenedSections(flattenSections(definition)) : [];
  const sidebarItems = form
    ? flatSections.map(({ key, section, label }) => ({ key, section, label, filled: isSectionFilled(section, form) }))
    : [];
  const activeIndex = sidebarItems.findIndex((i) => i.key === activeKey);
  // eslint-disable-next-line no-unused-vars -- consumed by the content-area render wired in the next task
  const activeEntry = activeIndex >= 0 ? sidebarItems[activeIndex] : null;

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
        setActiveKey(flattenSections(definition)[0]?.key ?? 'review');
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
    setForm((prev) => {
      if ((prev[dataKey] || []).length >= MAX_ROWS) {
        notifyError(`Maximum of ${MAX_ROWS} rows reached.`);
        return prev;
      }
      return { ...prev, [dataKey]: [...(prev[dataKey] || []), makeEmptyRow(columns)] };
    });
  }, [notifyError]);
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
    setForm((prev) => {
      if ((prev[dataKey] || []).length >= MAX_PHOTOS) {
        notifyError(`Maximum of ${MAX_PHOTOS} photos reached.`);
        return prev;
      }
      return { ...prev, [dataKey]: [...(prev[dataKey] || []), { label: '', image: null }] };
    });
  }, [notifyError]);
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
      const base = buildDefaultFormData(definition);
      const response = await axios.post(`${API_URL}/api/pdi/reports`, {
        template_id: templateId, inspection_date: inspectionDateValue(base),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportId(response.data.report_id);
      setHasSaved(false);
      setForm(base);
      setActiveKey(flattenSections(definition)[0]?.key ?? 'review');
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

  // The dashboard's Inspection Date column reads a separate top-level column,
  // not anything inside `data` — unlike General/AutoNXT, a generic template
  // has no fixed "date" key, so find whichever header infoField the author
  // mapped to a date format and use its value. Falls back to undefined (not
  // sent) if the template defines no date field at all, matching how
  // inspectedByValue() omits the field rather than sending a blank string.
  const inspectionDateValue = (formObj) => {
    for (const page of definition.pages) {
      for (const section of page.sections) {
        if (section.type !== 'header') continue;
        for (const f of section.infoFields) {
          if (f.leftFormat === 'date' && f.leftKey && formObj[f.leftKey]) return formObj[f.leftKey];
          if (f.rightFormat === 'date' && f.rightKey && formObj[f.rightKey]) return formObj[f.rightKey];
        }
      }
    }
    return undefined;
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
        inspection_date: inspectionDateValue(form),
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
        inspection_date: inspectionDateValue(form),
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
