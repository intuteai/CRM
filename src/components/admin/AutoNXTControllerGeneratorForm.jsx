import { useState, useRef, useCallback, useEffect } from 'react';
import Modal from 'react-modal';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText, ClipboardCheck, Image as ImageIcon, X, Camera } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

Modal.setAppElement('#root');

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

// Same image pipeline as AutoNXTGeneratorForm.jsx / PDIGeneratorForm.jsx —
// duplicated rather than shared, matching this project's deliberate choice
// to keep each PDI template's form as its own standalone component.
const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024;
const CROP_ASPECT = 4 / 3;
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.85;

const fileToDataUri = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });

async function cropAndCompress(imageSrc, cropPixels) {
  const img = await loadImage(imageSrc);
  const { x, y, width, height } = cropPixels;
  let outW = width;
  let outH = height;
  if (Math.max(outW, outH) > COMPRESS_MAX_DIM) {
    const scale = COMPRESS_MAX_DIM / Math.max(outW, outH);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, x, y, width, height, 0, 0, outW, outH);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))), 'image/jpeg', COMPRESS_QUALITY);
  });
  return fileToDataUri(blob);
}

// ── Keys MUST match CRM_BACKEND/models/operations/pdi/templates/
// autonxt_controller.js exactly (same duplicated-not-shared convention as
// AutoNXTGeneratorForm.jsx's own row/section definitions). ──
const CONTROLLER_TYPE_PRESETS = {
  CASHV38140: [
    { parameter: 'F01.00', specification: '11' },
    { parameter: 'F01.01', specification: '1' },
    { parameter: 'F01.02', specification: '2' },
    { parameter: 'F01.09', specification: '90' },
    { parameter: 'F01.10', specification: '90' },
    { parameter: 'F01.12', specification: '90' },
    { parameter: 'F01.22', specification: '5' },
    { parameter: 'F01.23', specification: '14' },
    { parameter: 'F02.00', specification: '1' },
    { parameter: 'F02.01', specification: '6' },
    { parameter: 'F02.02', specification: '32' },
    { parameter: 'F02.03', specification: '90' },
    { parameter: 'F02.04', specification: '1800' },
    { parameter: 'F02.05', specification: '270' },
    { parameter: 'F02.06', specification: '60' },
    { parameter: 'F02.07', specification: '1' },
    { parameter: 'F05.50', specification: '8.5' },
    { parameter: 'F05.52', specification: '50' },
    { parameter: 'F10.01', specification: '100' },
    { parameter: 'F10.43', specification: '0' },
    { parameter: 'F10.17', specification: '250' },
    { parameter: 'F10.21', specification: '10' },
    { parameter: 'F10.28', specification: '110' },
    { parameter: 'F10.30', specification: '200' },
    { parameter: 'F10.31', specification: '0001' },
    { parameter: 'F10.32', specification: '0001' },
    { parameter: 'F10.34', specification: '1.0' },
    { parameter: 'F10.35', specification: '100' },
    { parameter: 'F10.50', specification: '3' },
    { parameter: 'F10.57', specification: '1' },
    { parameter: 'F07.10', specification: '1' },
    { parameter: 'F07.12', specification: '0.000' },
    { parameter: 'F07.23', specification: '0.00' },
    { parameter: 'F03.15', specification: '100' },
    { parameter: 'F01.13', specification: '37.50' },
  ],
};
const DEFAULT_CONTROLLER_TYPE = 'CASHV38140';

const CONTROLLER_GENERAL_CHECK_ROWS = [
  { key: 'can_card',        label: 'CAN CARD CHECK',            spec: 'Go/NG', method: 'VI' },
  { key: 'io_card',         label: 'I/O CARD CHECK',            spec: 'Go/NG', method: 'VI' },
  { key: 'power_connector', label: 'Power Connector check',     spec: 'Go/NG', method: 'VI' },
  { key: 'pin14_connector', label: '14PIN Connector check',     spec: 'Go/NG', method: 'VI' },
  { key: 'resolver_conn',   label: 'Resolver connector',        spec: 'Go/NG', method: 'VI' },
  { key: 'rj45_connector',  label: 'Rj45 connector check',      spec: 'Go/NG', method: 'VI' },
  { key: 'harness_check',   label: 'HARNESS CHECK',             spec: 'Go/NG', method: 'VI' },
  { key: 'drive_on_key',    label: 'DRIVE ON WHEN KEY S/W ON',  spec: 'Go/NG', method: 'TESTING' },
  { key: 'run_750_rpm',     label: 'RUN @750 RPM WHEN START',   spec: 'Go/NG', method: 'TESTING' },
  { key: 'physical_check',  label: 'PHYSICAL CHECK',            spec: 'Go/NG', method: 'VI' },
];

const PHOTO_SLOTS = [
  { key: 'overall_controller', label: 'Overall Controller Photo' },
  { key: 'name_plate', label: 'Controller Name Plate' },
  { key: 'can_io_card', label: 'CAN & I/O Card Inside Drive' },
  { key: 'harness_photo', label: 'Harness Photo' },
  { key: 'packing_photo', label: 'Packing Photo' },
];

const MEASURED_OPTIONS = ['GO', 'NG', 'NA'];

// Mirrors CRM_BACKEND/models/operations/pdi/templates/autonxt_controller.js's
// computeRemarks exactly (same duplicated-rather-than-shared convention as
// every other PDI template formula in this codebase). An explicit
// `remarksOverride` (set via the Remarks dropdown below, currently only
// ever 'NA') always wins; otherwise OK/NG is derived from an exact
// (trimmed) string match between Measured and Specification.
function computeRemarks(row) {
  if (row.remarksOverride) return row.remarksOverride;
  const measured = String(row.measured ?? '').trim();
  if (!measured) return '';
  const specification = String(row.specification ?? '').trim();
  return measured === specification ? 'OK' : 'NG';
}

// Recomputes every row's final `remarks` string right before sending — this
// is the actual save-time source of truth, same principle as AutoNXT
// Motor's withComputedSpecDisplays. `remarksOverride` is kept in the sent
// row (not stripped) so reloading the report round-trips whether a row was
// manually set to NA.
function withComputedParameterRows(data) {
  return {
    ...data,
    parameter_rows: (data.parameter_rows || []).map((row) => ({ ...row, remarks: computeRemarks(row) })),
  };
}

const seedParameterRows = (type) =>
  (CONTROLLER_TYPE_PRESETS[type] || []).map((r) => ({ ...r, measured: '', remarksOverride: null }));

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

const initChecklist = (rows) => Object.fromEntries(rows.map((r) => [r.key, { measured: 'GO' }]));

const defaultForm = () => ({
  customer_name: '', date: todayIST(), product_id: '', drawing_no: '',
  product_specifications: '', pdi_no: '', controller_sr_no: '', controller_type: DEFAULT_CONTROLLER_TYPE,
  parameter_rows: seedParameterRows(DEFAULT_CONTROLLER_TYPE),
  general_check: initChecklist(CONTROLLER_GENERAL_CHECK_ROWS),
  page1_remarks: 'ALL OK, PASSED.',
  page2_remarks: 'ALL OK, PASSED.',
  prepared_by: '', approved_by: '',
  photos: Object.fromEntries(PHOTO_SLOTS.map((s) => [s.key, []])),
});

const INPUT_CLS =
  'w-full border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const SELECT_CLS =
  'border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-navy-800 bg-navy-50 border border-navy-100 whitespace-nowrap';
const TD_CLS = 'py-1 px-1 border border-navy-100 text-sm text-gray-500 text-center';

// Multi-image version, ported from AutoNXTGeneratorForm.jsx's own copy
// (same "duplicated rather than shared" convention).
function ImageUploadCard({ label, hint, images = [], onFilesSelected, onRemove, heightCls = 'h-32', maxImages = 10 }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const atLimit = images.length >= maxImages;

  const handleDragOver = (e) => { e.preventDefault(); if (!atLimit) setDragActive(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragActive(false); };
  const selectFiles = (fileList) => {
    if (!fileList?.length) return;
    const remaining = maxImages - images.length;
    if (remaining <= 0) return;
    onFilesSelected(Array.from(fileList).slice(0, remaining));
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (atLimit) return;
    selectFiles(e.dataTransfer.files);
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium text-navy-800 mb-1">{label}</label>}
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed bg-gray-50 ${heightCls} overflow-hidden ${dragActive ? 'border-gold-400 bg-gold-400/10' : 'border-gray-300'}`}
      >
        {images.length > 0 ? (
          <div className="h-full w-full overflow-y-auto p-1.5 grid grid-cols-3 gap-1.5">
            {images.map((src, i) => (
              <div key={i} className="relative aspect-square bg-white rounded overflow-hidden border border-gray-200">
                <img src={src} alt={`${label || 'Photo'} ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-white/90 rounded-full shadow hover:bg-white text-gray-600 hover:text-red-500"
                  title="Remove image"
                  aria-label={`Remove ${label || 'photo'} ${i + 1}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {!atLimit && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded border-2 border-dashed border-navy-100 flex items-center justify-center text-gray-400 hover:text-gold-600 hover:border-gold-400"
                title="Add more photos"
                aria-label="Add more photos"
              >
                <ImageIcon size={20} />
              </button>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400">
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center gap-1.5 hover:text-gold-600 transition-colors">
                <Camera size={22} />
                <span className="text-xs font-medium">Take Photo</span>
              </button>
              <div className="w-px h-9 bg-gray-200" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1.5 hover:text-gold-600 transition-colors">
                <ImageIcon size={22} />
                <span className="text-xs font-medium">Choose Files</span>
              </button>
            </div>
            <span className="text-[11px] text-gray-300">or drag photos here — pick several at once</span>
          </div>
        )}
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => { selectFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { selectFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

function CropModal({ imageSrc, onCancel, onApply }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const { notifyError } = useNotify();

  const handleCropComplete = useCallback((_area, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    try {
      const dataUri = await cropAndCompress(imageSrc, croppedAreaPixels);
      onApply(dataUri);
    } catch {
      notifyError('Failed to process image. Please try a different photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onRequestClose={onCancel}
      overlayClassName="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-[60] p-4"
      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto outline-none max-h-[95vh] overflow-y-auto"
      contentLabel="Crop Image"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-display text-base font-semibold text-navy-800">Adjust photo</h3>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-navy-800 text-xl leading-none transition-colors">&times;</button>
      </div>
      <div className="relative bg-gray-900" style={{ height: 320 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={CROP_ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>
      <div className="px-5 py-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !croppedAreaPixels}
            className="px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50 text-sm font-semibold"
          >
            {busy ? 'Processing...' : 'Apply'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AutoNXTControllerGeneratorForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('parameters');
  const [form, setForm] = useState(defaultForm);
  const [reportId, setReportId] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [revisionNo, setRevisionNo] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [hasConflict, setHasConflict] = useState(false);
  const { notifySuccess, notifyError } = useNotify();
  const abortRef = useRef(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
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
        const base = defaultForm();
        const loadedPhotos = report.photos && typeof report.photos === 'object' && !Array.isArray(report.photos)
          ? report.photos
          : {};
        setForm({
          ...base,
          ...(report.data || {}),
          photos: Object.fromEntries(
            PHOTO_SLOTS.map((s) => {
              const raw = loadedPhotos[s.key];
              return [s.key, Array.isArray(raw) ? raw : (raw ? [raw] : [])];
            })
          ),
        });
        setReportId(report.report_id);
        setRevisionNo(report.revision_no ?? null);
        setReportStatus(report.status ?? null);
        setHasSaved(true);
        setHasConflict(false);
        setActiveTab('parameters');
        setIsOpen(true);
      } catch (err) {
        notifyError(err.response?.data?.error || 'Could not load that PDI report.');
      } finally {
        setSearchParams({}, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setChecklistField = useCallback((section, key, subfield, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: { ...prev[section][key], [subfield]: value } },
    }));
  }, []);

  // Changing Controller Type reseeds Section A from that type's preset —
  // this wipes any already-entered Measured values for the OLD type's rows,
  // which is correct: the two types' parameter lists aren't the same rows
  // with different specs, they're a genuinely different list. Expected
  // workflow is to pick the type once, up front, before filling anything in.
  const updateControllerType = useCallback((type) => {
    setForm((prev) => ({ ...prev, controller_type: type, parameter_rows: seedParameterRows(type) }));
  }, []);

  const updateParameterRow = useCallback((idx, field, value) => {
    setForm((prev) => {
      const rows = [...prev.parameter_rows];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, parameter_rows: rows };
    });
  }, []);

  const [cropTarget, setCropTarget] = useState(null); // { slotKey, imageSrc }

  const MAX_IMAGES_PER_SLOT = 10;

  const addSlotImage = useCallback((slotKey, dataUri) => {
    setForm((prev) => ({
      ...prev,
      photos: { ...prev.photos, [slotKey]: [...(prev.photos[slotKey] || []), dataUri].slice(0, MAX_IMAGES_PER_SLOT) },
    }));
  }, []);

  const removeSlotImage = useCallback((slotKey, imgIdx) => {
    setForm((prev) => ({
      ...prev,
      photos: { ...prev.photos, [slotKey]: (prev.photos[slotKey] || []).filter((_, i) => i !== imgIdx) },
    }));
  }, []);

  const handleFileChosen = useCallback(async (slotKey, file, inputEl) => {
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
      setCropTarget({ slotKey, imageSrc: dataUri });
    } catch {
      notifyError('Failed to read image file.');
    } finally {
      if (inputEl) inputEl.value = '';
    }
  }, [notifyError]);

  const cropQueueFilesRef = useRef([]);
  const cropQueueSlotRef = useRef(null);

  const handleFilesChosen = useCallback((slotKey, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (cropQueueFilesRef.current.length > 0 || cropQueueSlotRef.current) {
      notifyError('Finish cropping the current batch of photos before adding more.');
      return;
    }
    const [first, ...rest] = files;
    cropQueueFilesRef.current = rest;
    cropQueueSlotRef.current = slotKey;
    handleFileChosen(slotKey, first);
  }, [handleFileChosen, notifyError]);

  const applyCroppedImage = useCallback((dataUri) => {
    setCropTarget((current) => {
      if (!current) return current;
      addSlotImage(current.slotKey, dataUri);
      return null;
    });
    if (cropQueueFilesRef.current.length > 0) {
      const [next, ...rest] = cropQueueFilesRef.current;
      cropQueueFilesRef.current = rest;
      handleFileChosen(cropQueueSlotRef.current, next);
    } else {
      cropQueueSlotRef.current = null;
    }
  }, [addSlotImage, handleFileChosen]);

  const cancelCrop = useCallback(() => {
    const remaining = cropQueueFilesRef.current.length;
    cropQueueFilesRef.current = [];
    cropQueueSlotRef.current = null;
    setCropTarget(null);
    if (remaining > 0) {
      notifyError(`Cancelled — ${remaining} more photo${remaining === 1 ? '' : 's'} in this batch were not added.`);
    }
  }, [notifyError]);

  const handleOpen = async () => {
    if (opening) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setOpening(true);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/reports`, { template_id: 'autonxt_controller', inspection_date: todayIST() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportId(response.data.report_id);
      setRevisionNo(response.data.revision_no ?? null);
      setReportStatus(response.data.status ?? null);
      setHasSaved(false);
      setHasConflict(false);
      setForm(defaultForm());
      setActiveTab('parameters');
      setIsOpen(true);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not start a new PDI report.');
    } finally {
      setOpening(false);
    }
  };

  const inspectedByValue = () => (form.prepared_by || '').trim() || undefined;

  // Omits `status` and adds `expected_revision` when the loaded report is
  // already Completed — same pattern as AutoNXTGeneratorForm.jsx (this logic
  // is fully template-agnostic, copied verbatim).
  const finalizedEditExtras = () =>
    reportStatus === 'Completed' ? { expected_revision: revisionNo } : { status: 'In Progress' };

  const handleSaveError = async (err) => {
    const code = err.response?.data?.code;
    if (code === 'FINALIZED_REPORT_FORBIDDEN') {
      notifyError('You don’t have permission to edit a finalized report.');
      return;
    }
    if (code === 'REPORT_VERSION_CONFLICT') {
      notifyError('This report changed since you loaded it. Close and reopen it to see the latest version before saving again.');
      setHasConflict(true);
      if (!reportId) return;
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/pdi/reports/${reportId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRevisionNo(response.data.revision_no ?? null);
        setReportStatus(response.data.status ?? null);
      } catch {
        // If the reload itself fails, the next save attempt will just hit
        // the same 409 again and re-trigger this same path.
      }
      return;
    }
    notifyError(err.response?.data?.error || 'Failed to save progress.');
  };

  const handleSave = async () => {
    if (!reportId) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setSaving(true);
    try {
      const { photos, ...data } = form;
      const response = await axios.patch(`${API_URL}/api/pdi/reports/${reportId}`, {
        data: withComputedParameterRows(data), photos, inspected_by: inspectedByValue(),
        inspection_date: form.date || undefined,
        ...finalizedEditExtras(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRevisionNo(response.data.revision_no ?? revisionNo);
      setHasSaved(true);
      notifySuccess('Progress saved.');
    } catch (err) {
      await handleSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) { notifyError('Customer name is required.'); return; }
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
      const saveResponse = await axios.patch(`${API_URL}/api/pdi/reports/${reportId}`, {
        data: withComputedParameterRows(data), photos, inspected_by: inspectedByValue(),
        inspection_date: form.date || undefined,
        ...finalizedEditExtras(),
      }, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      setRevisionNo(saveResponse.data.revision_no ?? revisionNo);
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
      const code = err.response?.data?.code;
      if (code === 'FINALIZED_REPORT_FORBIDDEN' || code === 'REPORT_VERSION_CONFLICT') {
        await handleSaveError(err);
        return;
      }
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

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="max-w-3xl mx-auto">
        <div
          onClick={handleOpen}
          className="bg-white rounded-xl shadow-sm p-5 sm:p-8 cursor-pointer border-2 border-dashed border-navy-100 hover:border-gold-400 transition-colors flex items-center gap-4 sm:gap-6"
        >
          <div className="p-3 sm:p-4 bg-navy-50 rounded-xl shrink-0">
            <ClipboardCheck size={40} className="text-gold-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-navy-800">New AutoNXT Controller Pre-Dispatch Inspection</h2>
            <p className="text-gray-500 mt-1">
              Fill in controller parameter checks and generate a 2-page PDI report PDF (Format No: CASPL/QA/F/26)
            </p>
            <span className="inline-block mt-3 px-4 py-1.5 bg-gold-500 text-navy-900 rounded-lg text-sm font-semibold">
              + Create PDI
            </span>
          </div>
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          Click the card above to open the PDI form and generate the PDF
        </p>
        <p className="text-center text-sm mt-2">
          <a href="/pdi-generator/autonxt-controller-batch" className="text-gold-600 hover:underline font-medium">
            Creating several controllers in one lot? Use batch creation instead →
          </a>
        </p>
      </div>

      <Modal
        isOpen={isOpen}
        onRequestClose={handleClose}
        overlayClassName="fixed inset-0 bg-navy-900/50 flex items-start justify-center z-50 overflow-y-auto py-4 sm:py-8"
        className="bg-white rounded-2xl shadow-2xl w-full min-w-0 max-w-5xl mx-4 outline-none"
        contentLabel="AutoNXT Controller PDI Generator Form"
      >
        <form onSubmit={handleFinalize}>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <FileText className="text-gold-600" size={24} />
              <div>
                <h2 className="font-display text-xl font-bold text-navy-800">Pre-Dispatch Inspection (PDI) — AutoNXT Controller</h2>
                <p className="text-xs text-gray-400">Format No: CASPL/QA/F/26 · Rev. No:01 · Eff. Dt:20-06-2025</p>
              </div>
            </div>
            <button type="button" onClick={handleClose} className="shrink-0 px-2 text-gray-400 hover:text-navy-800 text-2xl leading-none transition-colors">&times;</button>
          </div>

          <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-6 max-h-[62vh] sm:max-h-[80vh] overflow-y-auto">

            {/* ── Header fields ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Customer Name <span className="text-red-500">*</span></label>
                <input className={INPUT_CLS} value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} placeholder="e.g. Autonxt" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Date</label>
                <input type="date" className={INPUT_CLS} value={form.date} onChange={(e) => setField('date', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Product ID</label>
                <input className={INPUT_CLS} value={form.product_id} onChange={(e) => setField('product_id', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Drawing No.</label>
                <input className={INPUT_CLS} value={form.drawing_no} onChange={(e) => setField('drawing_no', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Product Specifications</label>
                <input className={INPUT_CLS} value={form.product_specifications} onChange={(e) => setField('product_specifications', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">PDI No. <span className="text-red-500">*</span></label>
                <input className={INPUT_CLS} value={form.pdi_no} onChange={(e) => setField('pdi_no', e.target.value)} placeholder="e.g. CASPL-QA-PDI-202509008" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Controller Sr.No</label>
                <input className={INPUT_CLS} value={form.controller_sr_no} onChange={(e) => setField('controller_sr_no', e.target.value)} placeholder="e.g. 2500-00184" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Controller Type</label>
                <select className={SELECT_CLS + ' w-full'} value={form.controller_type} onChange={(e) => updateControllerType(e.target.value)}>
                  {Object.keys(CONTROLLER_TYPE_PRESETS).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="border-b border-navy-100">
              <nav className="flex gap-1">
                {[
                  { key: 'parameters', label: 'Parameter Check (Pg 1)' },
                  { key: 'general', label: 'General Check (Pg 2)' },
                  { key: 'photos', label: 'Photos (Pg 2)' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-navy-800 text-navy-800 bg-navy-50'
                        : 'border-transparent text-gray-500 hover:text-navy-700 hover:bg-navy-50/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* ── Parameter Check Tab ── */}
            {activeTab === 'parameters' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-navy-800 mb-2">A. Parameter Check</h3>
                  <div className="overflow-x-auto rounded-lg border border-navy-100">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          <th className={TH_CLS}>S.No</th>
                          <th className={TH_CLS}>Parameter</th>
                          <th className={TH_CLS}>Specification</th>
                          <th className={TH_CLS}>Measured Value</th>
                          <th className={TH_CLS}>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.parameter_rows.map((row, idx) => {
                          const computed = computeRemarks(row);
                          return (
                            <tr key={`${row.parameter}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className={TD_CLS}>{idx + 1}</td>
                              <td className={TD_CLS}>{row.parameter}</td>
                              <td className={TD_CLS}>{row.specification}</td>
                              <td className="py-1 px-1 border border-navy-100">
                                <input
                                  className={`${INPUT_CLS} ${computed === 'NG' ? 'border-red-500 bg-red-50' : ''}`}
                                  value={row.measured}
                                  onChange={(e) => updateParameterRow(idx, 'measured', e.target.value)}
                                />
                              </td>
                              <td className="py-1 px-1 border border-navy-100">
                                <select
                                  className={SELECT_CLS}
                                  value={row.remarksOverride || 'auto'}
                                  onChange={(e) => updateParameterRow(idx, 'remarksOverride', e.target.value === 'auto' ? null : e.target.value)}
                                >
                                  <option value="auto">{computed || '—'}</option>
                                  <option value="NA">NA</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-1">Page 1 Remarks</label>
                  <textarea
                    rows={2}
                    className={INPUT_CLS}
                    value={form.page1_remarks}
                    onChange={(e) => setField('page1_remarks', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ── General Check Tab ── */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-navy-800 mb-2">B. General Check</h3>
                  <div className="overflow-x-auto rounded-lg border border-navy-100">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className={TH_CLS + ' text-left'}>Parameter</th>
                          <th className={TH_CLS}>Specification</th>
                          <th className={TH_CLS}>Method</th>
                          <th className={TH_CLS}>Measurement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CONTROLLER_GENERAL_CHECK_ROWS.map((row) => (
                          <tr key={row.key} className="border-t border-navy-100 hover:bg-navy-50/60 transition-colors">
                            <td className="py-2 px-3 text-sm text-gray-700">{row.label}</td>
                            <td className={TD_CLS}>{row.spec}</td>
                            <td className={TD_CLS}>{row.method}</td>
                            <td className="py-1 px-2 border border-navy-100 text-center">
                              <select
                                className={SELECT_CLS}
                                value={form.general_check[row.key].measured}
                                onChange={(e) => setChecklistField('general_check', row.key, 'measured', e.target.value)}
                              >
                                {MEASURED_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-1">Page 2 Remarks</label>
                  <textarea
                    rows={2}
                    className={INPUT_CLS}
                    value={form.page2_remarks}
                    onChange={(e) => setField('page2_remarks', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ── Photos Tab ── */}
            {activeTab === 'photos' && (
              <div className="space-y-5">
                <p className="text-xs text-gray-400">Take or choose several photos per slot — you&rsquo;ll crop each one before it&rsquo;s added.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {PHOTO_SLOTS.map((slot) => (
                    <ImageUploadCard
                      key={slot.key}
                      label={slot.label}
                      images={form.photos[slot.key] || []}
                      onFilesSelected={(fileList) => handleFilesChosen(slot.key, fileList)}
                      onRemove={(idx) => removeSlotImage(slot.key, idx)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Signature (2-way: one preparer, one approver — no electrical/mechanical split) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Prepared By</label>
                <input className={INPUT_CLS} value={form.prepared_by} onChange={(e) => setField('prepared_by', e.target.value)} placeholder="Name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Approved By</label>
                <input className={INPUT_CLS} value={form.approved_by} onChange={(e) => setField('approved_by', e.target.value)} placeholder="Name" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:justify-between gap-3 px-4 sm:px-8 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || hasConflict}
              className="px-5 py-2.5 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50 text-sm font-semibold"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <div className="contents sm:flex sm:gap-3">
              <button type="button" onClick={handleClose} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || hasConflict}
                className="col-span-2 sm:col-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                <Download size={16} />
                {loading ? 'Finalizing...' : 'Finalize & Generate PDF'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {cropTarget && (
        <CropModal imageSrc={cropTarget.imageSrc} onCancel={cancelCrop} onApply={applyCroppedImage} />
      )}
    </div>
  );
}
