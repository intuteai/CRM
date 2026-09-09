// CRM/src/components/admin/GenericPdiGeneratorForm.jsx
import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useParams, useSearchParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { CropModal } from '../shared/PdiImageUpload';
import { fileToDataUri, MAX_RAW_IMAGE_BYTES } from '../../utils/pdiImageUpload';
import { INPUT_CLS, MAX_PHOTOS, MAX_ROWS, buildDefaultFormData, makeEmptyRow, renderSection } from './GenericPdiSections';
import GenericPdiSidebar from './GenericPdiSidebar';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

const SAVE_STATUS_LABEL = {
  idle: '',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: "Couldn't save — retrying",
};

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

function ReviewPanel({ items, onFinalizeAnyway, finalizing }) {
  const incomplete = items.filter((i) => !i.filled);
  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-gray-800 mb-2">Review &amp; Finalize</h2>
      {incomplete.length === 0 ? (
        <p className="text-sm text-gray-500 mb-6">Every section has at least some data filled in. You&apos;re good to finalize.</p>
      ) : (
        <p className="text-sm text-amber-700 mb-4">
          {incomplete.length} section{incomplete.length === 1 ? '' : 's'} still empty: {incomplete.map((i) => i.label).join(', ')}.
        </p>
      )}
      <ul className="space-y-1.5 mb-6">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-sm">
            <span className={i.filled ? 'text-green-600' : 'text-gray-300'}>{i.filled ? '✓' : '○'}</span>
            <span className={i.filled ? 'text-gray-700' : 'text-gray-400'}>{i.label}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onFinalizeAnyway}
        disabled={finalizing}
        className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-semibold"
      >
        <Download size={16} />
        {finalizing ? 'Finalizing...' : 'Finalize Anyway'}
      </button>
    </div>
  );
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
  const [form, setForm] = useState(null);
  const [activeKey, setActiveKey] = useState(null); // one of the flattened keys, or 'review'

  const flatSections = definition ? labelFlattenedSections(flattenSections(definition)) : [];
  const sidebarItems = form
    ? flatSections.map(({ key, section, label }) => ({ key, section, label, filled: isSectionFilled(section, form) }))
    : [];
  const activeIndex = sidebarItems.findIndex((i) => i.key === activeKey);
  const activeEntry = activeIndex >= 0 ? sidebarItems[activeIndex] : null;

  const [reportId, setReportId] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

  // "Latest ref" pattern: these mirror the newest render's values so the
  // stable (useCallback([])) save functions below never act on stale data,
  // without needing to be recreated (and therefore re-scheduled) every render.
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);
  const reportIdRef = useRef(reportId);
  useEffect(() => { reportIdRef.current = reportId; }, [reportId]);
  const inspectedByRef = useRef(() => undefined);
  const inspectionDateRef = useRef(() => undefined);

  const dataSaveTimerRef = useRef(null);
  const dataInFlightRef = useRef(false);
  const dataPendingRef = useRef(false);
  const photosInFlightRef = useRef(false);
  const photosPendingRef = useRef(false);
  // Guards against the initial setForm(base) in handleOpen/resume itself
  // triggering an autosave of a still-blank draft — reset to false whenever
  // a fresh form is established (see Step 3).
  const skippedFirstDataChangeRef = useRef(false);
  const skippedFirstPhotosChangeRef = useRef(false);

  const runDataSave = useCallback(async () => {
    if (!reportIdRef.current) return;
    if (dataInFlightRef.current) { dataPendingRef.current = true; return; }
    dataInFlightRef.current = true;
    setSaveStatus('saving');
    try {
      const token = localStorage.getItem('token');
      // photos is intentionally excluded from the data-channel payload (see
      // the CRITICAL CONTRACT note above) — it has its own save channel.
      // eslint-disable-next-line no-unused-vars
      const { photos, ...data } = formRef.current;
      await axios.patch(`${API_URL}/api/pdi/reports/${reportIdRef.current}`, {
        data, status: 'In Progress',
        inspected_by: inspectedByRef.current(), inspection_date: inspectionDateRef.current(formRef.current),
      }, { headers: { Authorization: `Bearer ${token}` } });
      setHasSaved(true);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      dataInFlightRef.current = false;
      if (dataPendingRef.current) {
        dataPendingRef.current = false;
        runDataSave();
      }
    }
  }, []);

  const runPhotosSave = useCallback(async () => {
    if (!reportIdRef.current) return;
    if (photosInFlightRef.current) { photosPendingRef.current = true; return; }
    photosInFlightRef.current = true;
    setSaveStatus('saving');
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_URL}/api/pdi/reports/${reportIdRef.current}`, {
        photos: formRef.current.photos,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setHasSaved(true);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      photosInFlightRef.current = false;
      if (photosPendingRef.current) {
        photosPendingRef.current = false;
        runPhotosSave();
      }
    }
  }, []);

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
        skippedFirstDataChangeRef.current = false;
        skippedFirstPhotosChangeRef.current = false;
        setForm({
          ...base,
          ...(report.data || {}),
          photos: hasRealPhotos ? reportPhotos : base.photos,
        });
        setActiveKey(flattenSections(definition)[0]?.key ?? 'review');
        setReportId(report.report_id);
        setHasSaved(true);
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
      skippedFirstDataChangeRef.current = false;
      skippedFirstPhotosChangeRef.current = false;
      setForm(base);
      setActiveKey(flattenSections(definition)[0]?.key ?? 'review');
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

  useEffect(() => {
    inspectedByRef.current = inspectedByValue;
    inspectionDateRef.current = inspectionDateValue;
  });

  // eslint-disable-next-line no-unused-vars
  const dataSignature = form ? JSON.stringify((({ photos, ...rest }) => rest)(form)) : null;
  useEffect(() => {
    if (!form || !isOpen) return;
    if (!skippedFirstDataChangeRef.current) { skippedFirstDataChangeRef.current = true; return; }
    setSaveStatus('unsaved');
    if (dataSaveTimerRef.current) clearTimeout(dataSaveTimerRef.current);
    dataSaveTimerRef.current = setTimeout(runDataSave, 1500);
    return () => clearTimeout(dataSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature]);

  const photosSignature = form ? JSON.stringify(form.photos) : null;
  useEffect(() => {
    if (!form || !isOpen) return;
    if (!skippedFirstPhotosChangeRef.current) { skippedFirstPhotosChangeRef.current = true; return; }
    runPhotosSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosSignature]);

  const handleSave = async () => {
    if (!reportId) return;
    if (dataSaveTimerRef.current) clearTimeout(dataSaveTimerRef.current);
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setSaving(true);
    setSaveStatus('saving');
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
      setSaveStatus('saved');
      notifySuccess('Progress saved.');
    } catch (err) {
      setSaveStatus('error');
      notifyError(err.response?.data?.error || 'Failed to save progress.');
    } finally {
      setSaving(false);
    }
  };

  const doFinalize = async (force) => {
    if (!form.pdi_no.trim()) { notifyError('PDI No. is required.'); return; }
    if (!reportId) { notifyError('Report not initialized yet — please close and reopen the form.'); return; }
    if (!force && sidebarItems.some((i) => !i.filled)) {
      setActiveKey('review');
      return;
    }

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
    // A still-armed timer means there's an edit debounced but not yet sent —
    // flush it via a direct save instead of silently dropping it, since the
    // UI's "Unsaved changes" / "Saving…" status implies autosave is
    // continuous and authoritative, not best-effort.
    if (dataSaveTimerRef.current) {
      clearTimeout(dataSaveTimerRef.current);
      await runDataSave();
    }
    // An autosave PATCH already sent to the server (in-flight) or queued to
    // fire immediately after one resolves (pending) means the report now has
    // — or is about to have — real saved content, even though `hasSaved`
    // itself hasn't flipped true yet (it only flips after the request
    // resolves). Racing a DELETE against that in-flight PATCH has no
    // ordering guarantee and could silently wipe the user's just-saved edit,
    // so treat in-flight/pending exactly like `hasSaved` for this decision.
    const saveInProgressOrPending =
      dataInFlightRef.current || photosInFlightRef.current || dataPendingRef.current || photosPendingRef.current;
    if (reportId && !hasSaved && !saveInProgressOrPending) {
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

  const goToIndex = (idx) => {
    if (idx < 0 || idx >= sidebarItems.length) return;
    setActiveKey(sidebarItems[idx].key);
  };
  const goPrevious = () => goToIndex(activeIndex - 1);
  // activeIndex is -1 while on the virtual 'review' entry (not a real section) —
  // guard explicitly rather than relying on the Next button's disabled state to
  // be the only thing preventing a jump to section 0 from there.
  const goNext = () => { if (activeIndex < 0) return; goToIndex(activeIndex + 1); };

  if (isOpen && form) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="text-amber-500 shrink-0" size={22} />
            <h1 className="text-lg font-bold text-gray-800 truncate">{templateName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">PDI No.</label>
              <input className={INPUT_CLS + ' w-40'} value={form.pdi_no} onChange={(e) => setField('pdi_no', e.target.value)} placeholder="e.g. PDI-2026-001" />
            </div>
            <span className="text-xs text-gray-400 w-36 text-right shrink-0">{SAVE_STATUS_LABEL[saveStatus]}</span>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <GenericPdiSidebar templateName={templateName} items={sidebarItems} activeKey={activeKey} onSelect={setActiveKey} />
          <div className="flex-1 overflow-y-auto px-10 py-8">
            {activeKey === 'review' ? (
              <ReviewPanel items={sidebarItems} onFinalizeAnyway={() => doFinalize(true)} finalizing={loading} />
            ) : (
              activeEntry && renderSection(activeEntry.section, ctx)
            )}
          </div>
        </div>

        <div className="flex justify-between gap-3 px-8 py-4 border-t border-gray-200 bg-white shrink-0">
          <button type="button" onClick={handleSave} disabled={saving} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 text-sm font-semibold">
            {saving ? 'Saving...' : 'Save Progress'}
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={goPrevious} disabled={activeIndex <= 0} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-40 text-sm">
              &larr; Previous
            </button>
            <button type="button" onClick={goNext} disabled={activeIndex < 0 || activeIndex >= sidebarItems.length - 1} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-40 text-sm">
              Next &rarr;
            </button>
            <button type="button" onClick={handleClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
              Back
            </button>
            <button
              type="button"
              onClick={() => doFinalize(false)}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-semibold"
            >
              <Download size={16} />
              {loading ? 'Finalizing...' : 'Finalize & Generate PDF'}
            </button>
          </div>
        </div>

        {cropTarget && <CropModal imageSrc={cropTarget.imageSrc} onCancel={cancelCrop} onApply={applyCroppedImage} />}
      </div>
    );
  }

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
    </div>
  );
}
