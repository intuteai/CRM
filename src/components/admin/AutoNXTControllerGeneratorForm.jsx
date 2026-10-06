import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileText, ClipboardCheck, Image as ImageIcon, X, Camera } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { pdiFormPath, pdiBatchPath } from '../../utils/pdiRoutes';

Modal.setAppElement('#root');

const API_URL = import.meta.env.VITE_BACKEND_URL || '';
const TEMPLATE_ID = 'autonxt_controller';

// Same image pipeline as AutoNXTGeneratorForm.jsx / PDIGeneratorForm.jsx —
// duplicated rather than shared, matching this project's deliberate choice
// to keep each PDI template's form as its own standalone component.
const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024;
const CROP_ASPECT = 4 / 3;
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.85;

// The server's body limit is 40 MB; stay clear of it so the user gets a
// readable message instead of a bare 413.
const MAX_SAVE_PAYLOAD_BYTES = 35 * 1024 * 1024;

const LOCKED_BATCH_STATUSES = ['Completed', 'Finalizing'];
const ALL_OK_REMARK_RE = /^all ok,?\s*passed\.?$/i;

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

const DECIMAL_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const isOkNg = (v) => /^(ok|ng)$/i.test(v);
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNgValue = (v) => String(v ?? '').trim().toUpperCase() === 'NG';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Mirrors CRM_BACKEND/models/operations/pdi/templates/autonxt_controller.js's
// computeRemarks (same duplicated-rather-than-shared convention as every
// other PDI template formula in this codebase). The backend reads the
// override from `remarks`; here it lives in the UI-only `remarksOverride`.
// OK/NG is never an override, so a stale stored OK can't hide a mismatch.
function computeRemarks(row) {
  const explicit = String(row.remarksOverride ?? '').trim();
  if (explicit && !isOkNg(explicit)) return explicit;
  const measured = String(row.measured ?? '').trim();
  if (!measured) return '';
  const specification = String(row.specification ?? '').trim();
  if (DECIMAL_RE.test(measured) && DECIMAL_RE.test(specification)) {
    return Number(measured) === Number(specification) ? 'OK' : 'NG';
  }
  return measured === specification ? 'OK' : 'NG';
}

function toUiRow(raw) {
  const row = isPlainObject(raw) ? raw : {};
  const stored = String(row.remarks ?? '').trim();
  const uiRow = {
    ...row,
    parameter: String(row.parameter ?? ''),
    specification: String(row.specification ?? ''),
    measured: String(row.measured ?? ''),
    remarksOverride: stored && !isOkNg(stored) ? stored : null,
  };
  delete uiRow.remarks;
  return uiRow;
}

// The save-time source of truth: the override is folded into `remarks`
// (matching the mobile app's storage) and `remarksOverride` never leaves
// the browser.
function toSavedRow(row) {
  const saved = { ...row, remarks: computeRemarks(row) };
  delete saved.remarksOverride;
  return saved;
}

function withComputedParameterRows(data) {
  return {
    ...data,
    parameter_rows: (Array.isArray(data.parameter_rows) ? data.parameter_rows : []).map(toSavedRow),
  };
}

function parameterSummary(rows) {
  let ng = 0;
  let notMeasured = 0;
  rows.forEach((row) => {
    const remark = computeRemarks(row);
    if (remark === 'NG') ng += 1;
    else if (!remark) notMeasured += 1;
  });
  return { ng, notMeasured };
}

const seedParameterRows = (type) =>
  (CONTROLLER_TYPE_PRESETS[type] || []).map((r) => ({ ...r, measured: '', remarksOverride: null }));

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

function normalizeDate(value) {
  const s = String(value ?? '').trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
  if (iso) return iso[1];
  const dmy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : '';
}

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

const TEXT_FIELDS = [
  'customer_name', 'product_id', 'drawing_no', 'product_specifications', 'pdi_no',
  'controller_sr_no', 'controller_type', 'page1_remarks', 'page2_remarks', 'prepared_by', 'approved_by',
];

function buildFormFromReport(report) {
  const base = defaultForm();
  const data = isPlainObject(report.data) ? report.data : {};
  const form = { ...base, ...data };
  TEXT_FIELDS.forEach((key) => { form[key] = String(data[key] ?? base[key]); });
  form.date = normalizeDate(data.date ?? report.inspection_date);

  const storedRows = Array.isArray(data.parameter_rows) ? data.parameter_rows : [];
  form.parameter_rows = storedRows.length > 0
    ? storedRows.map(toUiRow)
    : seedParameterRows(form.controller_type.trim() || DEFAULT_CONTROLLER_TYPE);

  const storedChecks = isPlainObject(data.general_check) ? data.general_check : {};
  form.general_check = {
    ...storedChecks,
    ...Object.fromEntries(CONTROLLER_GENERAL_CHECK_ROWS.map((r) => {
      const entry = isPlainObject(storedChecks[r.key]) ? storedChecks[r.key] : {};
      return [r.key, { ...entry, measured: String(entry.measured ?? 'GO') }];
    })),
  };

  const loadedPhotos = isPlainObject(report.photos) ? report.photos : {};
  form.photos = {
    ...loadedPhotos,
    ...Object.fromEntries(PHOTO_SLOTS.map((s) => {
      const raw = loadedPhotos[s.key];
      return [s.key, Array.isArray(raw) ? raw : (raw ? [raw] : [])];
    })),
  };
  return form;
}

function lotFromReport(report) {
  if (report.batch_id == null) return null;
  return {
    batchId: report.batch_id,
    lotIndex: report.lot_index ?? null,
    lotQuantity: report.lot_quantity ?? null,
    status: report.batch_status ?? null,
    pdiNo: String(report.batch_pdi_no ?? ''),
  };
}

// Photos are excluded: stringifying every base64 image on each render is
// too slow, so photo changes are tracked by a version counter instead.
const signatureOf = (form) => JSON.stringify(form, (key, value) => (key === 'photos' ? undefined : value));

function finalizeWarnings(form) {
  const warnings = [];
  if (!String(form.controller_sr_no ?? '').trim()) warnings.push('Controller Sr.No is blank');
  const rows = Array.isArray(form.parameter_rows) ? form.parameter_rows : [];
  const { ng, notMeasured } = parameterSummary(rows);
  if (notMeasured) warnings.push(`${plural(notMeasured, 'parameter row')} with no Measured value`);
  if (ng) warnings.push(`${plural(ng, 'parameter row')} NG`);
  const ngChecks = CONTROLLER_GENERAL_CHECK_ROWS.filter((r) => isNgValue(form.general_check?.[r.key]?.measured));
  if (ngChecks.length) warnings.push(`General Check NG: ${ngChecks.map((r) => r.label).join(', ')}`);
  const photoCount = PHOTO_SLOTS.reduce((n, s) => n + (Array.isArray(form.photos?.[s.key]) ? form.photos[s.key].length : 0), 0);
  if (!photoCount) warnings.push('No photos added');
  if (ng && ALL_OK_REMARK_RE.test(String(form.page1_remarks ?? '').trim())) {
    warnings.push('Page 1 remark says "ALL OK, PASSED." but page 1 has NG rows');
  }
  if (ngChecks.length && ALL_OK_REMARK_RE.test(String(form.page2_remarks ?? '').trim())) {
    warnings.push('Page 2 remark says "ALL OK, PASSED." but page 2 has NG checks');
  }
  return warnings;
}

async function readErrorPayload(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isPlainObject(data) ? data : {};
}

function saveBlobAsFile(data, fileName) {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

const pdfFileName = (pdiNo, reportId) =>
  `PDI_${String(pdiNo ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '_') || reportId}.pdf`;

const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

const INPUT_CLS =
  'w-full border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const LOCKED_INPUT_CLS = `${INPUT_CLS} bg-gray-50 text-gray-500 cursor-not-allowed`;
const SELECT_CLS =
  'border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-navy-800 bg-navy-50 border border-navy-100 whitespace-nowrap';
const TD_CLS = 'py-1 px-1 border border-navy-100 text-sm text-gray-500 text-center';
const FIELDSET_CLS = 'min-w-0 border-0 p-0 m-0';

function TextField({ id, label, required, value, onChange, placeholder, type = 'text', lockedOnLot }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-navy-800 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type={type}
        className={lockedOnLot ? LOCKED_INPUT_CLS : INPUT_CLS}
        value={value}
        readOnly={lockedOnLot}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {lockedOnLot && <p className="text-[11px] text-gray-400 mt-0.5">Set on the lot page</p>}
    </div>
  );
}

// Multi-image version, ported from AutoNXTGeneratorForm.jsx's own copy
// (same "duplicated rather than shared" convention).
function ImageUploadCard({ label, hint, images = [], onFilesSelected, onRemove, heightCls = 'h-32', maxImages = 10, disabled = false }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const atLimit = images.length >= maxImages;
  const blocked = disabled || atLimit;

  const handleDragOver = (e) => { e.preventDefault(); if (!blocked) setDragActive(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragActive(false); };
  const selectFiles = (fileList) => {
    if (disabled || !fileList?.length) return;
    const remaining = maxImages - images.length;
    if (remaining <= 0) return;
    onFilesSelected(Array.from(fileList).slice(0, remaining));
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (blocked) return;
    selectFiles(e.dataTransfer.files);
  };

  return (
    <div>
      {label && <p className="block text-sm font-medium text-navy-800 mb-1">{label}</p>}
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
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-white/90 rounded-full shadow hover:bg-white text-gray-600 hover:text-red-500"
                    title="Remove image"
                    aria-label={`Remove ${label || 'photo'} ${i + 1}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            {!blocked && (
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
            {disabled ? (
              <span className="text-xs">No photos</span>
            ) : (
              <>
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
              </>
            )}
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
        aria-label={`Take photo for ${label || 'photo slot'}`}
        onChange={(e) => { selectFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label={`Choose photos for ${label || 'photo slot'}`}
        onChange={(e) => { selectFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

function CropModal({ imageSrc, onCancel, onApply, onSkip, hasMore }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const { notifyError } = useNotify();

  // Browsers that can't decode a format (typically HEIC) would otherwise
  // leave an empty cropper with Apply permanently disabled.
  useEffect(() => {
    let active = true;
    loadImage(imageSrc).catch(() => { if (active) setDecodeFailed(true); });
    return () => { active = false; };
  }, [imageSrc]);

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
        <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-navy-800 text-xl leading-none transition-colors">&times;</button>
      </div>
      {decodeFailed ? (
        <div className="px-5 py-6 space-y-4">
          <p className="text-sm text-red-600">
            This photo couldn&rsquo;t be opened. Its format (for example HEIC) isn&rsquo;t supported by this browser. Convert it to JPEG or PNG and add it again.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
              Cancel
            </button>
            <button type="button" onClick={onSkip} className="px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors text-sm font-semibold">
              {hasMore ? 'Skip to next photo' : 'Skip this photo'}
            </button>
          </div>
        </div>
      ) : (
        <>
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
              <label htmlFor="ctrl-crop-zoom" className="block text-xs font-medium text-gray-500 mb-1">Zoom</label>
              <input
                id="ctrl-crop-zoom"
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
        </>
      )}
    </Modal>
  );
}

export default function AutoNXTControllerGeneratorForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState('parameters');
  const [form, setForm] = useState(defaultForm);
  const [reportId, setReportId] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [revisionNo, setRevisionNo] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [lot, setLot] = useState(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [savedBaseline, setSavedBaseline] = useState(() => ({ sig: signatureOf(defaultForm()), photoVersion: 0 }));
  const { notifySuccess, notifyError } = useNotify();
  const navigate = useNavigate();
  const abortRef = useRef(null);
  // Bumped on every open/close/finalize so a save that resolves afterwards
  // can't toast "Progress saved" or touch the next session's state.
  const sessionRef = useRef(0);
  const reportIdRef = useRef(null);
  const hasSavedRef = useRef(false);

  useEffect(() => {
    reportIdRef.current = reportId;
    hasSavedRef.current = hasSaved;
  }, [reportId, hasSaved]);

  useEffect(() => () => {
    abortRef.current?.abort();
    const draftId = reportIdRef.current;
    if (draftId && !hasSavedRef.current) {
      const token = localStorage.getItem('token');
      axios.delete(`${API_URL}/api/pdi/reports/${draftId}`, { headers: authHeaders(token) })
        .catch((err) => console.error('Failed to clean up unsaved PDI draft:', err));
    }
  }, []);

  // Same for a reload or tab close; keepalive lets the request outlive the page.
  useEffect(() => {
    const onPageHide = (e) => {
      // persisted = page kept in the back/forward cache and may be restored.
      if (e.persisted) return;
      const id = reportIdRef.current;
      const token = localStorage.getItem('token');
      if (!id || hasSavedRef.current || !token) return;
      fetch(`${API_URL}/api/pdi/reports/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  const readOnly = !!lot && LOCKED_BATCH_STATUSES.includes(lot.status);
  const isCompletedReport = !lot && reportStatus === 'Completed';
  const formSig = useMemo(() => signatureOf(form), [form]);
  const isDirty = isOpen && !readOnly
    && (formSig !== savedBaseline.sig || photoVersion !== savedBaseline.photoVersion);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const [cropTarget, setCropTarget] = useState(null); // { id, slotKey, imageSrc }
  const cropQueueFilesRef = useRef([]);
  const cropQueueSlotRef = useRef(null);
  const cropGenRef = useRef(0);
  const cropKeyRef = useRef(0);

  const resetCropQueue = useCallback(() => {
    cropQueueFilesRef.current = [];
    cropQueueSlotRef.current = null;
    cropGenRef.current += 1;
    setCropTarget(null);
  }, []);

  const applyLoadedReport = useCallback((report) => {
    const next = buildFormFromReport(report);
    setForm(next);
    setPhotoVersion(0);
    setSavedBaseline({ sig: signatureOf(next), photoVersion: 0 });
    setReportId(report.report_id);
    setRevisionNo(report.revision_no ?? null);
    setReportStatus(report.status ?? null);
    setLot(lotFromReport(report));
    setHasSaved(true);
    setHasConflict(false);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const resumeParam = searchParams.get('report');

  useEffect(() => {
    if (!resumeParam) return;
    let redirected = false;

    (async () => {
      const token = localStorage.getItem('token');
      if (!token) { notifyError('Please log in first.'); setSearchParams({}, { replace: true }); return; }
      try {
        const response = await axios.get(`${API_URL}/api/pdi/reports/${resumeParam}`, {
          headers: authHeaders(token),
        });
        const report = response.data;
        if (report.template_id && report.template_id !== TEMPLATE_ID) {
          notifyError('That report uses a different PDI template. Opening it in the right form.');
          redirected = true;
          navigate(pdiFormPath(report.template_id, report.report_id ?? resumeParam), { replace: true });
          return;
        }
        sessionRef.current += 1;
        resetCropQueue();
        setSaving(false);
        applyLoadedReport(report);
        setActiveTab('parameters');
        setIsOpen(true);
      } catch (err) {
        notifyError(err.response?.data?.error || 'Could not load that PDI report.');
      } finally {
        if (!redirected) setSearchParams({}, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeParam]);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setChecklistField = useCallback((section, key, subfield, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: { ...prev[section]?.[key], [subfield]: value } },
    }));
  }, []);

  // Changing Controller Type reseeds Section A from that type's preset —
  // the two types' parameter lists aren't the same rows with different
  // specs, they're a genuinely different list, so entered values can't carry over.
  const updateControllerType = (type) => {
    if (!CONTROLLER_TYPE_PRESETS[type] || type === form.controller_type) return;
    const hasMeasured = form.parameter_rows.some((r) => String(r.measured ?? '').trim());
    if (hasMeasured && !window.confirm('Changing the controller type replaces the parameter list and clears every Measured value entered so far. Continue?')) return;
    setForm((prev) => ({ ...prev, controller_type: type, parameter_rows: seedParameterRows(type) }));
  };

  const updateParameterRow = useCallback((idx, field, value) => {
    setForm((prev) => {
      const rows = [...prev.parameter_rows];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, parameter_rows: rows };
    });
  }, []);

  const MAX_IMAGES_PER_SLOT = 10;

  const addSlotImage = useCallback((slotKey, dataUri) => {
    setForm((prev) => ({
      ...prev,
      photos: { ...prev.photos, [slotKey]: [...(prev.photos[slotKey] || []), dataUri].slice(0, MAX_IMAGES_PER_SLOT) },
    }));
    setPhotoVersion((v) => v + 1);
  }, []);

  const removeSlotImage = useCallback((slotKey, imgIdx) => {
    setForm((prev) => ({
      ...prev,
      photos: { ...prev.photos, [slotKey]: (prev.photos[slotKey] || []).filter((_, i) => i !== imgIdx) },
    }));
    setPhotoVersion((v) => v + 1);
  }, []);

  // Works through the queued files until one is ready to crop. Unusable
  // files are skipped with a message rather than stalling the queue.
  const openNextQueuedFile = useCallback(async () => {
    const gen = cropGenRef.current;
    while (cropQueueFilesRef.current.length > 0) {
      const [file, ...rest] = cropQueueFilesRef.current;
      cropQueueFilesRef.current = rest;
      const slotKey = cropQueueSlotRef.current;
      const name = file?.name ? `"${file.name}"` : 'A file';
      if (!String(file?.type ?? '').startsWith('image/')) {
        notifyError(`${name} isn't an image, so it was skipped.`);
        continue;
      }
      if (file.size > MAX_RAW_IMAGE_BYTES) {
        notifyError(`${name} is too large (max ${(MAX_RAW_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB), so it was skipped.`);
        continue;
      }
      try {
        const dataUri = await fileToDataUri(file);
        if (gen !== cropGenRef.current) return;
        cropKeyRef.current += 1;
        setCropTarget({ id: cropKeyRef.current, slotKey, imageSrc: dataUri });
        return;
      } catch {
        if (gen !== cropGenRef.current) return;
        notifyError(`Failed to read ${name === 'A file' ? 'a file' : name}, so it was skipped.`);
      }
    }
    cropQueueFilesRef.current = [];
    cropQueueSlotRef.current = null;
  }, [notifyError]);

  const handleFilesChosen = useCallback((slotKey, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (cropQueueSlotRef.current) {
      notifyError('Finish cropping the current batch of photos before adding more.');
      return;
    }
    cropQueueFilesRef.current = files;
    cropQueueSlotRef.current = slotKey;
    openNextQueuedFile();
  }, [openNextQueuedFile, notifyError]);

  const applyCroppedImage = useCallback((dataUri) => {
    if (!cropTarget) return;
    addSlotImage(cropTarget.slotKey, dataUri);
    setCropTarget(null);
    openNextQueuedFile();
  }, [cropTarget, addSlotImage, openNextQueuedFile]);

  const skipCrop = useCallback(() => {
    setCropTarget(null);
    openNextQueuedFile();
  }, [openNextQueuedFile]);

  const cancelCrop = useCallback(() => {
    const remaining = cropQueueFilesRef.current.length;
    resetCropQueue();
    if (remaining > 0) {
      notifyError(`Cancelled — ${remaining} more photo${remaining === 1 ? '' : 's'} in this batch were not added.`);
    }
  }, [notifyError, resetCropQueue]);

  const handleOpen = async () => {
    if (opening) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setOpening(true);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/reports`, { template_id: TEMPLATE_ID, inspection_date: todayIST() }, {
        headers: authHeaders(token),
      });
      const next = defaultForm();
      sessionRef.current += 1;
      resetCropQueue();
      setSaving(false);
      setReportId(response.data.report_id);
      setRevisionNo(response.data.revision_no ?? null);
      setReportStatus(response.data.status ?? null);
      setLot(null);
      setHasSaved(false);
      setHasConflict(false);
      setForm(next);
      setPhotoVersion(0);
      setSavedBaseline({ sig: signatureOf(next), photoVersion: 0 });
      setActiveTab('parameters');
      setIsOpen(true);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not start a new PDI report.');
    } finally {
      setOpening(false);
    }
  };

  // Sends `expected_revision` whenever it's known, and `status` only for
  // reports that aren't Completed (Completed is only ever set by finalize).
  // Photos ride along only when they changed since the last successful save.
  const saveCurrentForm = async ({ token, signal }) => {
    const sentForm = form;
    const sentPhotoVersion = photoVersion;
    const { photos, ...data } = sentForm;
    const body = {
      data: withComputedParameterRows(data),
      inspected_by: String(sentForm.prepared_by ?? '').trim() || undefined,
      inspection_date: sentForm.date || undefined,
      ...(revisionNo != null ? { expected_revision: revisionNo } : {}),
      ...(reportStatus === 'Completed' ? {} : { status: 'In Progress' }),
    };
    if (sentPhotoVersion !== savedBaseline.photoVersion) body.photos = photos;

    const approxBytes = JSON.stringify(body).length;
    if (approxBytes > MAX_SAVE_PAYLOAD_BYTES) {
      const err = new Error('Payload too large');
      err.localMessage = `This save is about ${Math.ceil(approxBytes / (1024 * 1024))} MB, over the 35 MB limit. Remove some photos and try again.`;
      throw err;
    }

    const response = await axios.patch(`${API_URL}/api/pdi/reports/${reportId}?photos=summary`, body, {
      headers: authHeaders(token),
      signal,
    });
    return { response, sentForm, sentPhotoVersion };
  };

  const applySaveSuccess = ({ response, sentForm, sentPhotoVersion }) => {
    setRevisionNo(response.data?.revision_no ?? revisionNo);
    if (response.data?.status) setReportStatus(response.data.status);
    setHasSaved(true);
    setSavedBaseline({ sig: signatureOf(sentForm), photoVersion: sentPhotoVersion });
  };

  const handleRequestError = async (err, fallback) => {
    if (err.localMessage) { notifyError(err.localMessage); return; }
    const { error: message, code } = await readErrorPayload(err);
    if (code === 'FINALIZED_REPORT_FORBIDDEN') {
      notifyError('You don’t have permission to edit a finalized report.');
      return;
    }
    if (code === 'REPORT_VERSION_CONFLICT') {
      notifyError('This report changed since you loaded it. Use "Reload latest" to load the newest version.');
      setHasConflict(true);
      return;
    }
    if (code === 'BATCH_MEMBER_LOCKED') {
      notifyError(message || 'This report belongs to a finalized lot and can’t be edited.');
      setLot((prev) => (prev ? { ...prev, status: 'Completed' } : prev));
      return;
    }
    if (code === 'BATCH_MEMBER_USE_LOT') {
      notifyError(message || 'This report is part of a lot. Finalize it from the lot page.');
      return;
    }
    if (!message && err.response?.status === 413) {
      notifyError('The photos are too large to save in one go. Remove some and try again.');
      return;
    }
    notifyError(message || fallback);
  };

  const handleSave = async () => {
    if (!reportId || saving || loading || readOnly) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    const session = sessionRef.current;
    setSaving(true);
    try {
      const result = await saveCurrentForm({ token });
      if (session !== sessionRef.current) return;
      applySaveSuccess(result);
      notifySuccess(isCompletedReport ? 'Changes saved.' : 'Progress saved.');
    } catch (err) {
      if (session !== sessionRef.current) return;
      await handleRequestError(err, 'Failed to save progress.');
    } finally {
      if (session === sessionRef.current) setSaving(false);
    }
  };

  const handleReloadLatest = async () => {
    if (!reportId) return;
    if (!window.confirm('Reload the latest saved version of this report? Your unsaved changes here will be lost.')) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    try {
      const response = await axios.get(`${API_URL}/api/pdi/reports/${reportId}`, { headers: authHeaders(token) });
      resetCropQueue();
      applyLoadedReport(response.data);
      notifySuccess('Loaded the latest version.');
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not reload the report.');
    }
  };

  const closeModalState = () => {
    sessionRef.current += 1;
    resetCropQueue();
    setIsOpen(false);
    setReportId(null);
    setHasSaved(false);
    setLot(null);
    setHasConflict(false);
    setSaving(false);
  };

  const handleFinalize = async () => {
    if (loading || saving || readOnly || lot || isCompletedReport) return;
    if (!String(form.customer_name ?? '').trim()) { notifyError('Customer name is required.'); return; }
    if (!String(form.pdi_no ?? '').trim()) { notifyError('PDI No. is required.'); return; }
    if (!reportId) { notifyError('Report not initialized yet — please close and reopen the form.'); return; }

    const warnings = finalizeWarnings(form);
    if (warnings.length > 0
      && !window.confirm(`Before finalizing, please check:\n\n• ${warnings.join('\n• ')}\n\nFinalize anyway?`)) return;

    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const result = await saveCurrentForm({ token, signal: controller.signal });
      applySaveSuccess(result);

      const response = await axios.post(`${API_URL}/api/pdi/reports/${reportId}/finalize`, {}, {
        headers: authHeaders(token),
        responseType: 'blob',
        signal: controller.signal,
      });

      saveBlobAsFile(response.data, pdfFileName(result.sentForm.pdi_no, reportId));
      notifySuccess('PDI finalized and PDF downloaded successfully.');
      closeModalState();
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      await handleRequestError(err, 'Failed to finalize PDI.');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportId || downloading) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setDownloading(true);
    try {
      const response = await axios.get(`${API_URL}/api/pdi/reports/${reportId}/pdf`, {
        headers: authHeaders(token),
        responseType: 'blob',
      });
      saveBlobAsFile(response.data, pdfFileName(lot?.pdiNo || form.pdi_no, reportId));
    } catch (err) {
      await handleRequestError(err, 'Failed to download the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handleClose = async () => {
    if (abortRef.current) abortRef.current.abort();
    const draftId = reportId && !hasSaved ? reportId : null;
    closeModalState();
    if (draftId) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${API_URL}/api/pdi/reports/${draftId}`, { headers: authHeaders(token) });
      } catch (err) {
        console.error('Failed to clean up unsaved PDI draft:', err);
      }
    }
  };

  const requestClose = () => {
    if (loading) return;
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    handleClose();
  };

  const handleBackToLot = () => {
    if (!lot) return;
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    navigate(pdiBatchPath(TEMPLATE_ID, lot.batchId));
  };

  const paramRows = Array.isArray(form.parameter_rows) ? form.parameter_rows : [];
  const { ng: ngCount, notMeasured: notMeasuredCount } = parameterSummary(paramRows);
  const controllerType = String(form.controller_type ?? '');
  const isKnownType = !!CONTROLLER_TYPE_PRESETS[controllerType];
  const busy = saving || loading;
  const lotLocked = !!lot;

  const renderRemarkField = (field, id, label) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="block text-sm font-medium text-navy-800">{label}</label>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setField(field, '')}
            className="text-xs text-gray-500 hover:text-navy-800 underline"
          >
            Clear
          </button>
        )}
      </div>
      <textarea
        id={id}
        rows={2}
        className={INPUT_CLS}
        value={form[field]}
        onChange={(e) => setField(field, e.target.value)}
      />
    </div>
  );

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
          <Link to={pdiBatchPath(TEMPLATE_ID)} className="text-gold-600 hover:underline font-medium">
            Creating several controllers in one lot? Use batch creation instead →
          </Link>
        </p>
      </div>

      <Modal
        isOpen={isOpen}
        onRequestClose={requestClose}
        shouldCloseOnOverlayClick={false}
        shouldCloseOnEsc={!loading}
        overlayClassName="fixed inset-0 bg-navy-900/50 flex items-start justify-center z-50 overflow-y-auto py-4 sm:py-8"
        className="bg-white rounded-2xl shadow-2xl w-full min-w-0 max-w-5xl mx-4 outline-none"
        contentLabel="AutoNXT Controller PDI Generator Form"
      >
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <FileText className="text-gold-600" size={24} />
              <div>
                <h2 className="font-display text-xl font-bold text-navy-800">Pre-Dispatch Inspection (PDI) — AutoNXT Controller</h2>
                <p className="text-xs text-gray-400">Format No: CASPL/QA/F/26 · Rev. No:01 · Eff. Dt:20-06-2025</p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={loading}
              aria-label="Close"
              className="shrink-0 px-2 text-gray-400 hover:text-navy-800 text-2xl leading-none transition-colors disabled:opacity-40"
            >
              &times;
            </button>
          </div>

          {(lot || isCompletedReport || hasConflict) && (
            <div className="px-4 sm:px-8 pt-4 space-y-2">
              {lot && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-sm text-navy-800">
                  <span className="font-medium">
                    Lot {lot.lotIndex ?? '?'} of {lot.lotQuantity ?? '?'}{lot.pdiNo ? ` · PDI ${lot.pdiNo}` : ''}
                  </span>
                  <button type="button" onClick={handleBackToLot} className="text-gold-600 hover:underline font-medium">
                    ← Back to lot
                  </button>
                </div>
              )}
              {readOnly && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  <span className="font-medium">This lot is finalized. The report can no longer be edited.</span>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 text-xs font-semibold"
                  >
                    <Download size={14} />
                    {downloading ? 'Downloading...' : 'Download PDF'}
                  </button>
                </div>
              )}
              {isCompletedReport && (
                <p className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-sm text-navy-800">
                  This report is finalized. Saving changes records a new revision.
                </p>
              )}
              {hasConflict && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span>This report changed since you loaded it, so saving is paused.</span>
                  <button
                    type="button"
                    onClick={handleReloadLatest}
                    className="px-3 py-1.5 bg-white border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-colors text-xs font-semibold"
                  >
                    Reload latest
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-6 max-h-[62vh] sm:max-h-[80vh] overflow-y-auto">

            {/* ── Header fields ── */}
            <fieldset disabled={readOnly} className={FIELDSET_CLS}>
              <div className="grid grid-cols-2 gap-4">
                <TextField
                  id="ctrl-customer-name" label="Customer Name" required lockedOnLot={lotLocked}
                  value={form.customer_name} onChange={(v) => setField('customer_name', v)} placeholder="e.g. Autonxt"
                />
                <TextField id="ctrl-date" label="Date" type="date" value={form.date} onChange={(v) => setField('date', v)} />
                <TextField
                  id="ctrl-product-id" label="Product ID" lockedOnLot={lotLocked}
                  value={form.product_id} onChange={(v) => setField('product_id', v)}
                />
                <TextField
                  id="ctrl-drawing-no" label="Drawing No." lockedOnLot={lotLocked}
                  value={form.drawing_no} onChange={(v) => setField('drawing_no', v)}
                />
                <TextField
                  id="ctrl-product-specifications" label="Product Specifications" lockedOnLot={lotLocked}
                  value={form.product_specifications} onChange={(v) => setField('product_specifications', v)}
                />
                <TextField
                  id="ctrl-pdi-no" label="PDI No." required lockedOnLot={lotLocked}
                  value={form.pdi_no} onChange={(v) => setField('pdi_no', v)} placeholder="e.g. CASPL-QA-PDI-202509008"
                />
                <TextField
                  id="ctrl-controller-sr-no" label="Controller Sr.No"
                  value={form.controller_sr_no} onChange={(v) => setField('controller_sr_no', v)} placeholder="e.g. 2500-00184"
                />
                <div>
                  <label htmlFor="ctrl-controller-type" className="block text-sm font-medium text-navy-800 mb-1">Controller Type</label>
                  <select
                    id="ctrl-controller-type"
                    className={SELECT_CLS + ' w-full' + (lotLocked ? ' bg-gray-50 text-gray-500' : '')}
                    value={controllerType}
                    disabled={lotLocked}
                    onChange={(e) => updateControllerType(e.target.value)}
                  >
                    {!isKnownType && <option value="" disabled>Select type…</option>}
                    {!isKnownType && controllerType && (
                      <option value={controllerType} disabled>{`${controllerType} (unknown)`}</option>
                    )}
                    {Object.keys(CONTROLLER_TYPE_PRESETS).map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  {lotLocked && <p className="text-[11px] text-gray-400 mt-0.5">Set on the lot page</p>}
                </div>
              </div>
            </fieldset>

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
              <fieldset disabled={readOnly} className={`${FIELDSET_CLS} space-y-5`}>
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-navy-800">A. Parameter Check</h3>
                    {paramRows.length > 0 && (
                      <p className="text-xs font-medium" aria-live="polite">
                        {ngCount === 0 && notMeasuredCount === 0 ? (
                          <span className="text-green-700">All {paramRows.length} rows OK</span>
                        ) : (
                          <>
                            {ngCount > 0 && <span className="text-red-600">{ngCount} NG</span>}
                            {ngCount > 0 && notMeasuredCount > 0 && <span className="text-gray-400"> · </span>}
                            {notMeasuredCount > 0 && <span className="text-gray-500">{notMeasuredCount} not measured</span>}
                          </>
                        )}
                      </p>
                    )}
                  </div>
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
                        {paramRows.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-4 px-3 text-sm text-gray-500 text-center">
                              No parameter list for this controller type. Pick a controller type above.
                            </td>
                          </tr>
                        )}
                        {paramRows.map((row, idx) => {
                          const computed = computeRemarks(row);
                          const isNg = computed === 'NG';
                          const override = row.remarksOverride;
                          const rowCls = isNg ? 'bg-red-50' : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50');
                          return (
                            <tr key={`${row.parameter}-${idx}`} className={rowCls}>
                              <td className={TD_CLS}>{idx + 1}</td>
                              <td className={TD_CLS}>{row.parameter}</td>
                              <td className={TD_CLS}>{row.specification}</td>
                              <td className="py-1 px-1 border border-navy-100">
                                <input
                                  className={`${INPUT_CLS} ${isNg ? 'border-red-500 bg-red-50' : ''}`}
                                  value={row.measured}
                                  inputMode="decimal"
                                  aria-label={`Measured value for ${row.parameter}`}
                                  onChange={(e) => updateParameterRow(idx, 'measured', e.target.value)}
                                />
                              </td>
                              <td className="py-1 px-1 border border-navy-100">
                                <select
                                  className={`${SELECT_CLS} ${isNg ? 'text-red-600 font-semibold' : ''}`}
                                  value={override || 'auto'}
                                  aria-label={`Remarks for ${row.parameter}`}
                                  onChange={(e) => updateParameterRow(idx, 'remarksOverride', e.target.value === 'auto' ? null : e.target.value)}
                                >
                                  <option value="auto">{override ? 'Auto' : (computed || '—')}</option>
                                  <option value="NA">NA</option>
                                  {override && override !== 'NA' && <option value={override}>{override}</option>}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {renderRemarkField('page1_remarks', 'ctrl-page1-remarks', 'Page 1 Remarks')}
              </fieldset>
            )}

            {/* ── General Check Tab ── */}
            {activeTab === 'general' && (
              <fieldset disabled={readOnly} className={`${FIELDSET_CLS} space-y-5`}>
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
                        {CONTROLLER_GENERAL_CHECK_ROWS.map((row) => {
                          const value = String(form.general_check?.[row.key]?.measured ?? '');
                          const isNg = isNgValue(value);
                          return (
                            <tr
                              key={row.key}
                              className={`border-t border-navy-100 transition-colors ${isNg ? 'bg-red-50' : 'hover:bg-navy-50/60'}`}
                            >
                              <td className="py-2 px-3 text-sm text-gray-700">{row.label}</td>
                              <td className={TD_CLS}>{row.spec}</td>
                              <td className={TD_CLS}>{row.method}</td>
                              <td className="py-1 px-2 border border-navy-100 text-center">
                                <select
                                  className={`${SELECT_CLS} ${isNg ? 'text-red-600 font-semibold' : ''}`}
                                  value={value}
                                  aria-label={`Measurement for ${row.label}`}
                                  onChange={(e) => setChecklistField('general_check', row.key, 'measured', e.target.value)}
                                >
                                  {!MEASURED_OPTIONS.includes(value) && (
                                    <option value={value}>{value ? `Other: ${value}` : '—'}</option>
                                  )}
                                  {MEASURED_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {renderRemarkField('page2_remarks', 'ctrl-page2-remarks', 'Page 2 Remarks')}
              </fieldset>
            )}

            {/* ── Photos Tab ── */}
            {activeTab === 'photos' && (
              <fieldset disabled={readOnly} className={`${FIELDSET_CLS} space-y-5`}>
                {!readOnly && (
                  <p className="text-xs text-gray-400">Take or choose several photos per slot — you&rsquo;ll crop each one before it&rsquo;s added.</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {PHOTO_SLOTS.map((slot) => (
                    <ImageUploadCard
                      key={slot.key}
                      label={slot.label}
                      images={Array.isArray(form.photos?.[slot.key]) ? form.photos[slot.key] : []}
                      disabled={readOnly}
                      onFilesSelected={(fileList) => handleFilesChosen(slot.key, fileList)}
                      onRemove={(idx) => removeSlotImage(slot.key, idx)}
                    />
                  ))}
                </div>
              </fieldset>
            )}

            {/* ── Signature (2-way: one preparer, one approver — no electrical/mechanical split) ── */}
            <fieldset disabled={readOnly} className={FIELDSET_CLS}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <TextField
                  id="ctrl-prepared-by" label="Prepared By"
                  value={form.prepared_by} onChange={(v) => setField('prepared_by', v)} placeholder="Name"
                />
                <TextField
                  id="ctrl-approved-by" label="Approved By"
                  value={form.approved_by} onChange={(v) => setField('approved_by', v)} placeholder="Name"
                />
              </div>
            </fieldset>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:justify-between gap-3 px-4 sm:px-8 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            {readOnly ? (
              <span className="hidden sm:block" />
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || hasConflict}
                className="px-5 py-2.5 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                {saving ? 'Saving...' : (isCompletedReport ? 'Save changes' : 'Save')}
              </button>
            )}
            <div className="contents sm:flex sm:gap-3">
              <button
                type="button"
                onClick={requestClose}
                disabled={loading}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {lot && (
                <button
                  type="button"
                  onClick={handleBackToLot}
                  className="col-span-2 sm:col-auto px-6 py-2.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors text-sm font-semibold"
                >
                  ← Back to lot
                </button>
              )}
              {!lot && isCompletedReport && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className="col-span-2 sm:col-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 text-sm font-semibold"
                >
                  <Download size={16} />
                  {downloading ? 'Downloading...' : 'Download PDF'}
                </button>
              )}
              {!lot && !isCompletedReport && (
                <button
                  type="button"
                  onClick={handleFinalize}
                  disabled={busy || hasConflict}
                  className="col-span-2 sm:col-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 text-sm font-semibold"
                >
                  <Download size={16} />
                  {loading ? 'Finalizing...' : 'Finalize & Generate PDF'}
                </button>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {cropTarget && (
        <CropModal
          key={cropTarget.id}
          imageSrc={cropTarget.imageSrc}
          hasMore={cropQueueFilesRef.current.length > 0}
          onCancel={cancelCrop}
          onApply={applyCroppedImage}
          onSkip={skipCrop}
        />
      )}
    </div>
  );
}
