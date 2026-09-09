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
        // A cell still sitting at its own author-configured default (e.g. a
        // GO/NG/NA column defaulting to 'GO') hasn't actually been looked at
        // by anyone yet, even though buildDefaultFormData pre-fills it —
        // don't let that pre-fill alone mark a mechanical-check section
        // "filled" and wave it through the Review & Finalize gate unread.
        // Re-selecting the same option the default already showed won't
        // register as a change either; that's an accepted, safety-conservative
        // trade-off (under-reports completion rather than over-reports it).
        return (section.fixedRows || []).some((row) =>
          editableCols.some((c) => {
            const value = String((sectionData[row.key] && sectionData[row.key][c.cell.subfield]) || '').trim();
            if (!value) return false;
            return value !== String(c.cell.default || '').trim();
          })
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

function UndoToast({ message, onUndo }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 z-50"
    >
      <span className="text-sm">{message}</span>
      <button type="button" onClick={onUndo} className="text-amber-400 text-sm font-semibold hover:text-amber-300">
        Undo
      </button>
    </div>
  );
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
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
  const [closing, setClosing] = useState(false);

  // Whether the current draft has ever been successfully saved — used only
  // by handleClose to decide whether to delete an abandoned draft. This is a
  // plain ref, not useState: handleClose can itself trigger a save (awaiting
  // runDataSave) and then, in that same function call, needs to know the
  // *post-save* result. A useState value captured by closure when this
  // render's handleClose was created would not retroactively reflect a state
  // update that happened later in the same call — awaiting an async function
  // does not "refresh" an already-captured const. hasSavedRef.current is
  // written inline, synchronously, at the exact moment each save succeeds
  // (see runDataSave/runPhotosSave/handleSave/doFinalize below), so reading
  // it here always sees the latest truth regardless of render timing.
  const hasSavedRef = useRef(false);

  const [undoState, setUndoState] = useState(null); // { message, restore: () => void } | null
  const undoTimerRef = useRef(null);
  // Latest-ref mirror for undoState, used only by handleUndo (see below) —
  // fine to update via effect since handleUndo only runs from an explicit
  // click well after state has settled, unlike hasSavedRef's tighter timing.
  const undoStateRef = useRef(null);
  useEffect(() => { undoStateRef.current = undoState; }, [undoState]);

  const showUndo = useCallback((message, restore) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ message, restore });
    undoTimerRef.current = setTimeout(() => setUndoState(null), 5000);
  }, []);

  // Reads the restore closure via a ref and calls it OUTSIDE the setState
  // updater — calling setForm (which is what `restore` does) from inside a
  // setUndoState updater function is an impure updater (React may invoke
  // updaters more than once, e.g. under StrictMode, double-firing the restore).
  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const current = undoStateRef.current;
    setUndoState(null);
    current?.restore();
  }, []);

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
  const photosSaveTimerRef = useRef(null);
  const photosInFlightRef = useRef(false);
  const photosPendingRef = useRef(false);
  // Tracks which reportId each channel's "baseline" (the setForm(base) from
  // handleOpen/resume, not a real user edit) has already been seen for.
  // A content-based "have we skipped the first change yet" boolean (the
  // previous design) breaks the moment two different sessions happen to
  // produce byte-identical form snapshots (e.g. open, don't touch anything,
  // close, reopen — buildDefaultFormData() returns the same JSON both times):
  // React's effect dependency comparison then sees no change at all and
  // never re-fires, so the boolean never gets a chance to reset, and the
  // user's actual first edit in the new session gets silently swallowed as
  // if it were still the old baseline. Keying the "seen" marker to reportId
  // instead sidesteps this — reportId is always freshly assigned by the
  // server on every open/resume and always passes through `null` while
  // closed, so it can never spuriously collide across sessions the way
  // JSON-stringified form content can.
  const dataArmedForReportRef = useRef(null);
  const photosArmedForReportRef = useRef(null);

  // Whether there is an edit that's been debounced/scheduled but not yet
  // successfully sent. This is DELIBERATELY separate from
  // "dataSaveTimerRef.current is truthy" — a setTimeout handle is a plain
  // positive integer that's never reset to null after it fires, so checking
  // its truthiness really means "has a timer EVER been scheduled during this
  // component's lifetime," not "is one pending right now." Every place that
  // used to gate a flush on the raw timer ref's truthiness must use these
  // dirty flags instead, or a stale handle from an earlier, already-completed
  // session silently triggers a same-outcome-as-"unsaved" flush on a report
  // that was never actually touched.
  const dataDirtyRef = useRef(false);
  const photosDirtyRef = useRef(false);

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
      hasSavedRef.current = true;
      dataDirtyRef.current = false;
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
      hasSavedRef.current = true;
      photosDirtyRef.current = false;
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

  // A drop that misses an ImageUploadCard's own drop-zone (a few pixels off,
  // or a genuine mis-drop) still bubbles to the window — without this guard
  // the browser's default behavior is to navigate the whole tab to the
  // dropped file, tearing down the form and losing anything unsaved.
  useEffect(() => {
    if (!isOpen) return;
    const preventDefault = (e) => e.preventDefault();
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, [isOpen]);

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
        hasSavedRef.current = true;
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
    const removedRow = formRef.current[dataKey][idx];
    showUndo('Row removed', () => {
      setForm((p2) => {
        const rows = [...p2[dataKey]];
        rows.splice(idx, 0, removedRow);
        return { ...p2, [dataKey]: rows };
      });
    });
    setForm((prev) => ({ ...prev, [dataKey]: prev[dataKey].filter((_, i) => i !== idx) }));
  }, [showUndo]);
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
    const removedPhoto = formRef.current[dataKey][idx];
    showUndo('Photo removed', () => {
      setForm((p2) => {
        const list = [...p2[dataKey]];
        list.splice(idx, 0, removedPhoto);
        return { ...p2, [dataKey]: list };
      });
    });
    setForm((prev) => ({ ...prev, [dataKey]: prev[dataKey].filter((_, i) => i !== idx) }));
  }, [showUndo]);
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
  const cropTargetRef = useRef(null);
  useEffect(() => { cropTargetRef.current = cropTarget; }, [cropTarget]);

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

  // Same reasoning as handleUndo above: read the target via a ref and apply
  // it outside the setCropTarget updater, rather than calling setForm
  // (via current.apply) from inside the updater itself.
  const applyCroppedImage = useCallback((dataUri) => {
    const current = cropTargetRef.current;
    setCropTarget(null);
    current?.apply(dataUri);
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
      hasSavedRef.current = false;
      setSaveStatus('idle'); // a previous session's "All changes saved" shouldn't carry into this new one
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
    // Also bail while closing/finalizing — those paths do their own
    // explicit, complete save of whatever's in `form` at that moment, so a
    // freshly-scheduled autosave here would be redundant at best and, if it
    // fires after finalize's own PATCH, would overwrite a just-Completed
    // report's status back to 'In Progress' at worst.
    if (!form || !isOpen || !reportId || closing || loading) return;
    if (dataArmedForReportRef.current !== reportId) {
      // First time this effect has seen THIS report's form — this is the
      // setForm(base)/setForm(resumed data) snapshot from handleOpen/resume,
      // not a real user edit. Arm the baseline and stop, regardless of
      // whether dataSignature's text happens to match a previous session's
      // (see the long comment on dataArmedForReportRef above for why content
      // comparison alone isn't reliable here).
      dataArmedForReportRef.current = reportId;
      return;
    }
    setSaveStatus('unsaved');
    dataDirtyRef.current = true;
    if (dataSaveTimerRef.current) clearTimeout(dataSaveTimerRef.current);
    dataSaveTimerRef.current = setTimeout(runDataSave, 1500);
    return () => clearTimeout(dataSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature, reportId, closing, loading]);

  // Photos get their own debounce timer too (not truly "immediate") — a
  // freeform photo's label is a plain text field living inside this same
  // array, and without debouncing, every keystroke in that label would fire
  // its own full-payload (base64 image data included) PATCH. 1.5s is still
  // effectively instant for the discrete add/remove/crop actions this
  // channel exists for.
  const photosSignature = form ? JSON.stringify(form.photos) : null;
  useEffect(() => {
    if (!form || !isOpen || !reportId || closing || loading) return;
    if (photosArmedForReportRef.current !== reportId) {
      photosArmedForReportRef.current = reportId;
      return;
    }
    setSaveStatus('unsaved');
    photosDirtyRef.current = true;
    if (photosSaveTimerRef.current) clearTimeout(photosSaveTimerRef.current);
    photosSaveTimerRef.current = setTimeout(runPhotosSave, 1500);
    return () => clearTimeout(photosSaveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosSignature, reportId, closing, loading]);

  // Best-effort flush on unmount (e.g. the user navigates away via the app's
  // own nav rather than the in-page Back button, which has its own explicit
  // flush in handleClose below). This only helps for in-SPA navigation —
  // the JS runtime keeps running and the fire-and-forget request can still
  // complete. It cannot do anything for a hard tab close/reload; there is no
  // navigation-blocking guard in this app for that case.
  //
  // Gated on the dirty flags, not the raw timer refs' truthiness — a
  // setTimeout handle is a plain integer that's never reset to null after it
  // fires, so `dataSaveTimerRef.current` being truthy only ever means "a
  // timer was scheduled at some point during this mount," not "one is
  // pending right now." Checking that instead of the dirty flag would flush
  // (and, worse, count as "saved" for handleClose's abandoned-draft check)
  // on every close, even a session where nothing was ever actually edited.
  useEffect(() => {
    return () => {
      if (dataDirtyRef.current) { clearTimeout(dataSaveTimerRef.current); runDataSave(); }
      if (photosDirtyRef.current) { clearTimeout(photosSaveTimerRef.current); runPhotosSave(); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!reportId) return;
    if (dataSaveTimerRef.current) clearTimeout(dataSaveTimerRef.current);
    if (photosSaveTimerRef.current) clearTimeout(photosSaveTimerRef.current);
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
      hasSavedRef.current = true;
      dataDirtyRef.current = false;
      photosDirtyRef.current = false;
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

    // A scheduled-but-not-yet-fired autosave must not be allowed to land
    // after finalize — the finalize PATCH below already carries the latest
    // data, and a stray later autosave PATCH sends status: 'In Progress',
    // which would flip a just-Completed report back to In Progress on the
    // dashboard. Clearing the *pending* flags too (not just the timers)
    // matters just as much: if an autosave happened to be in flight right as
    // finalize started, its own finally-block would otherwise still queue
    // and fire a follow-up save after this function's PATCH — a request
    // created after finalize began, not merely one already in transit.
    if (dataSaveTimerRef.current) clearTimeout(dataSaveTimerRef.current);
    if (photosSaveTimerRef.current) clearTimeout(photosSaveTimerRef.current);
    dataPendingRef.current = false;
    photosPendingRef.current = false;

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
      hasSavedRef.current = true;
      dataDirtyRef.current = false;
      photosDirtyRef.current = false;

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
      hasSavedRef.current = false;
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
    if (closing) return; // guards against a double-click issuing two flushes/deletes
    setClosing(true);
    try {
      if (abortRef.current) abortRef.current.abort();
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoState(null);
      // A dirty flag means there's an edit debounced but not yet sent — flush
      // it via a direct save instead of silently dropping it, since the UI's
      // "Unsaved changes" / "Saving…" status implies autosave is continuous
      // and authoritative, not best-effort. Gated on the dirty flags, not the
      // raw timer refs' truthiness — see the long comment on the unmount-
      // flush effect above for why a setTimeout handle alone can't tell
      // "a save is pending" from "a timer merely fired at some point in this
      // mount's history."
      if (dataDirtyRef.current) {
        clearTimeout(dataSaveTimerRef.current);
        await runDataSave();
      }
      if (photosDirtyRef.current) {
        clearTimeout(photosSaveTimerRef.current);
        await runPhotosSave();
      }
      // An autosave PATCH already sent to the server (in-flight) or queued to
      // fire immediately after one resolves (pending) means the report now has
      // — or is about to have — real saved content, even though hasSavedRef
      // itself hasn't flipped true yet (it only flips after the request
      // resolves). Racing a DELETE against that in-flight PATCH has no
      // ordering guarantee and could silently wipe the user's just-saved edit,
      // so treat in-flight/pending exactly like hasSavedRef for this decision.
      const saveInProgressOrPending =
        dataInFlightRef.current || photosInFlightRef.current || dataPendingRef.current || photosPendingRef.current;
      if (reportId && !hasSavedRef.current && !saveInProgressOrPending) {
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
      hasSavedRef.current = false;
    } finally {
      setClosing(false);
    }
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
            <button type="button" onClick={handleClose} disabled={closing} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 text-sm">
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
        {undoState && <UndoToast message={undoState.message} onUndo={handleUndo} />}
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
