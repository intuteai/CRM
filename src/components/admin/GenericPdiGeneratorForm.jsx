// CRM/src/components/admin/GenericPdiGeneratorForm.jsx
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
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

// The JSON signature of everything in a form object EXCEPT `photos` — used
// both to detect real data-channel edits (the render-body `dataSignature`
// below) and to record exactly what a save actually sent (see runDataSave).
// A plain module-level function, not a hook: needs no closure over
// component state, and using the identical function at both "did this
// change" and "what did I just save" call sites is what makes the two
// comparable at all.
function dataOnlySignature(formObj) {
  if (!formObj) return null;
  // eslint-disable-next-line no-unused-vars
  const { photos, ...rest } = formObj;
  return JSON.stringify(rest);
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
  // useLayoutEffect, not useEffect: formRef is read from several
  // click-driven paths (handleClose, the unmount flush, and the undo
  // restore-index lookups in removeRepeatableRow/removeFreeformPhoto) where
  // it matters that the mirror has already committed before the user can
  // possibly interact again — passive effects (useEffect) are scheduled on
  // a macrotask after paint, leaving a narrow window where a click landing
  // right after a form-changing render could still see a one-render-stale
  // formRef.current.
  const formRef = useRef(form);
  useLayoutEffect(() => { formRef.current = form; }, [form]);
  const reportIdRef = useRef(reportId);
  useEffect(() => { reportIdRef.current = reportId; }, [reportId]);
  const inspectedByRef = useRef(() => undefined);
  const inspectionDateRef = useRef(() => undefined);

  const dataSaveTimerRef = useRef(null);
  const photosSaveTimerRef = useRef(null);

  // The signature (see dataOnlySignature above) of the data most recently
  // CONFIRMED saved to the server — set to the baseline's own signature the
  // instant a session starts (handleOpen/resume, right alongside setForm),
  // and updated to whatever was actually just sent every time a save
  // succeeds (runDataSave/handleSave/doFinalize). "Is there anything
  // unsaved right now" is then always just "does the live signature still
  // equal this," computed fresh wherever it's needed — never a separately-
  // maintained boolean/counter that itself needs to be kept in sync and can
  // drift out of true. This one field replaces three earlier, each-narrower
  // attempts at the same idea:
  //   1. A raw "has the debounce timer fired" check — wrong the moment any
  //      timer had EVER fired, since a setTimeout handle is a plain integer
  //      that's never reset to null afterward.
  //   2. A reportId-keyed "have I armed the baseline yet" ref — correctly
  //      distinguished "the initial setForm(base) snapshot" from a real
  //      edit, but said nothing about whether a *later* edit had actually
  //      been saved.
  //   3. A boolean "dirty" flag, cleared unconditionally on save success —
  //      wrong if a newer edit arrived while that save was still in flight:
  //      the flag would read "clean" even though the just-sent payload no
  //      longer matched the live form.
  // Comparing actual content sidesteps all three at once.
  const photosSavedSignatureRef = useRef(null);
  const dataSavedSignatureRef = useRef(null);

  // Each channel's saves are chained onto a single promise rather than
  // guarded by an in-flight/pending boolean pair. A caller (a debounce
  // timer, handleClose, the unmount flush, doFinalize) always gets back a
  // promise for a real request that reflects formRef.current AT THE MOMENT
  // ITS TURN IN THE CHAIN ACTUALLY RUNS — not a promise that can resolve
  // instantly without sending anything just because something else happened
  // to be in flight. That "resolves without doing anything" behavior was
  // the earlier boolean-mutex design's actual bug: handleClose would await
  // it, believe the flush had happened, and proceed to null out reportId —
  // permanently disarming the queued retry's own guard clause before it
  // ever got a chance to run.
  const dataSaveChainRef = useRef(Promise.resolve());
  const photosSaveChainRef = useRef(Promise.resolve());

  const runDataSave = useCallback(() => {
    const next = dataSaveChainRef.current.then(async () => {
      if (!reportIdRef.current || !formRef.current) return;
      // photos is intentionally excluded from the data-channel payload —
      // it has its own channel/column, saved by runPhotosSave below (see
      // the backend's `patchReport`, which treats `data` and `photos` as
      // independent, individually-optional columns).
      // eslint-disable-next-line no-unused-vars
      const { photos, ...data } = formRef.current;
      const sentSignature = JSON.stringify(data);
      if (sentSignature === dataSavedSignatureRef.current) return; // nothing new since we were queued
      setSaveStatus('saving');
      try {
        const token = localStorage.getItem('token');
        await axios.patch(`${API_URL}/api/pdi/reports/${reportIdRef.current}`, {
          data, status: 'In Progress',
          inspected_by: inspectedByRef.current(), inspection_date: inspectionDateRef.current(formRef.current),
        }, { headers: { Authorization: `Bearer ${token}` } });
        hasSavedRef.current = true;
        dataSavedSignatureRef.current = sentSignature;
        // Compares against a FRESH read of formRef.current, not the
        // sentSignature we just confirmed — if something changed again
        // while this request was in flight, the live signature has already
        // moved past what was just saved, and the status should say so.
        setSaveStatus(sentSignature === dataOnlySignature(formRef.current) ? 'saved' : 'unsaved');
      } catch {
        setSaveStatus('error');
      }
    });
    dataSaveChainRef.current = next;
    return next;
  }, []);

  const runPhotosSave = useCallback(() => {
    const next = photosSaveChainRef.current.then(async () => {
      if (!reportIdRef.current || !formRef.current) return;
      const photos = formRef.current.photos;
      const sentSignature = JSON.stringify(photos);
      if (sentSignature === photosSavedSignatureRef.current) return;
      setSaveStatus('saving');
      try {
        const token = localStorage.getItem('token');
        await axios.patch(`${API_URL}/api/pdi/reports/${reportIdRef.current}`, { photos }, {
          headers: { Authorization: `Bearer ${token}` },
        });
        hasSavedRef.current = true;
        photosSavedSignatureRef.current = sentSignature;
        setSaveStatus(sentSignature === JSON.stringify(formRef.current.photos) ? 'saved' : 'unsaved');
      } catch {
        setSaveStatus('error');
      }
    });
    photosSaveChainRef.current = next;
    return next;
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
        const resumedForm = {
          ...base,
          ...(report.data || {}),
          photos: hasRealPhotos ? reportPhotos : base.photos,
        };
        // Whatever we just loaded IS what's saved server-side — record its
        // own signature as the baseline, same reasoning as handleOpen above.
        dataSavedSignatureRef.current = dataOnlySignature(resumedForm);
        photosSavedSignatureRef.current = JSON.stringify(resumedForm.photos);
        setForm(resumedForm);
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
      // The freshly-built baseline IS what's "saved" (the server just created
      // exactly this row) — recording its own signature here, rather than
      // leaving these refs at whatever a previous session last left them,
      // means the debounce effects and handleClose both correctly see "no
      // edits yet" from the first render of this new session onward.
      dataSavedSignatureRef.current = dataOnlySignature(base);
      photosSavedSignatureRef.current = JSON.stringify(base.photos);
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

  const dataSignature = dataOnlySignature(form);
  useEffect(() => {
    // Also bail while closing/finalizing — those paths do their own
    // explicit, complete save of whatever's in `form` at that moment, so a
    // freshly-scheduled autosave here would be redundant at best and, if it
    // fires after finalize's own PATCH, would overwrite a just-Completed
    // report's status back to 'In Progress' at worst.
    if (!form || !isOpen || !reportId || closing || loading) return;
    // Nothing to do if the live content already matches what's saved —
    // covers both the initial setForm(base)/setForm(resumed data) snapshot
    // (handleOpen/resume set the saved-signature refs to match it exactly,
    // see their own comments) and the moment right after a save succeeds.
    if (dataSignature === dataSavedSignatureRef.current) return;
    setSaveStatus('unsaved');
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
    if (photosSignature === photosSavedSignatureRef.current) return;
    setSaveStatus('unsaved');
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
  // Compares live content against the saved-signature refs (via formRef, not
  // the closure `form`, since this cleanup can run long after the render
  // that created it) rather than checking the raw timer refs' truthiness — a
  // setTimeout handle is a plain integer that's never reset to null after it
  // fires, so `dataSaveTimerRef.current` being truthy only ever means "a
  // timer was scheduled at some point during this mount," not "one is
  // pending right now."
  useEffect(() => {
    return () => {
      if (!formRef.current) return;
      if (dataOnlySignature(formRef.current) !== dataSavedSignatureRef.current) {
        clearTimeout(dataSaveTimerRef.current);
        runDataSave();
      }
      if (JSON.stringify(formRef.current.photos) !== photosSavedSignatureRef.current) {
        clearTimeout(photosSaveTimerRef.current);
        runPhotosSave();
      }
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
      const sentDataSignature = JSON.stringify(data);
      const sentPhotosSignature = JSON.stringify(photos);
      await axios.patch(`${API_URL}/api/pdi/reports/${reportId}`, {
        data, photos, status: 'In Progress', inspected_by: inspectedByValue(),
        inspection_date: inspectionDateValue(form),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      hasSavedRef.current = true;
      dataSavedSignatureRef.current = sentDataSignature;
      photosSavedSignatureRef.current = sentPhotosSignature;
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

    // Cancel any scheduled-but-not-yet-fired debounce timer first, so no NEW
    // autosave gets scheduled once loading=true takes effect (the debounce
    // effects also bail on `loading` themselves, but this covers the window
    // before that re-render lands).
    if (dataSaveTimerRef.current) clearTimeout(dataSaveTimerRef.current);
    if (photosSaveTimerRef.current) clearTimeout(photosSaveTimerRef.current);

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      // Let any already-queued or in-flight autosave finish first — it
      // reads formRef.current fresh when its turn actually comes, so this
      // can't send stale data, and it guarantees this function's own
      // combined save below (which the code right after this depends on
      // being the LAST write before finalize) can't be overtaken by an
      // autosave landing on the wire afterward and reverting
      // status: 'In Progress' over what finalize is about to set to
      // 'Completed'.
      await runDataSave();
      await runPhotosSave();

      // Read via formRef/the latest-ref function mirrors, not the closure
      // `form`/`inspectedByValue`/`inspectionDateValue` — this function has
      // now awaited twice above, and inputs aren't disabled while that
      // happens, so an edit made in that window would otherwise be invisible
      // to a read of the plain closure variables (those were captured once,
      // when this specific invocation of doFinalize started, and don't
      // update just because state changed elsewhere).
      const { photos, ...data } = formRef.current;
      const sentDataSignature = JSON.stringify(data);
      const sentPhotosSignature = JSON.stringify(photos);
      await axios.patch(`${API_URL}/api/pdi/reports/${reportId}`, {
        data, photos, inspected_by: inspectedByRef.current(),
        inspection_date: inspectionDateRef.current(formRef.current),
      }, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      hasSavedRef.current = true;
      dataSavedSignatureRef.current = sentDataSignature;
      photosSavedSignatureRef.current = sentPhotosSignature;

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
      if (dataSaveTimerRef.current) clearTimeout(dataSaveTimerRef.current);
      if (photosSaveTimerRef.current) clearTimeout(photosSaveTimerRef.current);
      // Always flush both channels rather than pre-checking whether they
      // look dirty — each one internally no-ops if the live content already
      // matches what's saved (see runDataSave/runPhotosSave above), and
      // awaiting them here genuinely waits for a real request that reflects
      // formRef.current at the moment it actually runs — including anything
      // already queued or in flight ahead of this call, not merely for a
      // flag saying "something is pending." A prior version of this function
      // awaited a promise that could resolve instantly without sending
      // anything whenever a save happened to already be in flight, then
      // proceeded to null out reportId — permanently disarming that queued
      // save's own guard clause before it ever got to run, silently losing
      // the edit it was supposed to cover.
      await runDataSave();
      await runPhotosSave();

      // Re-check against formRef.current AFTER the flush, not before — this
      // is what tells apart "the flush actually saved everything" from "the
      // flush ran but failed" (runDataSave/runPhotosSave swallow their own
      // errors into `saveStatus: 'error'` rather than throwing, so `await`
      // alone can't distinguish the two).
      const stillDirty =
        (formRef.current && dataOnlySignature(formRef.current) !== dataSavedSignatureRef.current) ||
        (formRef.current && JSON.stringify(formRef.current.photos) !== photosSavedSignatureRef.current);

      if (stillDirty) {
        // Don't delete a draft that might still hold real, unsaved work —
        // leave it as a resumable "In Progress" draft and tell the user,
        // rather than silently discarding whatever the flush above failed
        // to persist.
        notifyError("Couldn't save your latest changes before closing — this draft was kept so you can resume and try again.");
      } else if (reportId && !hasSavedRef.current) {
        // Nothing was ever dirty this session (matches the pristine baseline
        // handleOpen/resume seeded) AND nothing was ever successfully saved
        // — a genuinely abandoned, untouched draft. Safe to clean up.
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
