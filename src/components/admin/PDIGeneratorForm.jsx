import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, FileText, ClipboardCheck, Image as ImageIcon, X, Trash2, Plus, Camera } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { pdiFormPath, pdiBatchPath } from '../../utils/pdiRoutes';

Modal.setAppElement('#root');

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

// Every image goes through crop + client-side compression before upload (see
// cropAndCompress below), so the *sent* payload stays small regardless of
// source size — this raw cap is just a backstop against absurd files before
// we even try to decode them.
const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PHOTOS = 12;
// Per-slot and whole-report photo ceilings. MAX_PHOTOS (slots) x
// MAX_IMAGES_PER_SLOT would allow 300 images in theory, but nobody needs
// that many on one report and the combined base64 payload would blow well
// past server.js's JSON body limit even with compression — so the total
// across every slot is capped separately in addPhotoImage below.
const MAX_IMAGES_PER_SLOT = 25;
const MAX_TOTAL_PHOTOS = 60;
// The generated PDF auto-paginates the motor tables with no hard limit
// (verified up to 150 rows) — this is just a sane UI ceiling.
const MAX_ROWS = 100;
const CROP_ASPECT = 4 / 3; // matches the printed photo box shape (see pdi_generator.js drawPhotoCell)
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.85;
const TEMPLATE_ID = 'general';
// server.js caps JSON bodies at 40 MB; leave headroom for encoding overhead.
const MAX_SAVE_PAYLOAD_BYTES = 35 * 1024 * 1024;
const PASSED_REMARK = 'ALL MOTORS OK, PASSED.';

const str = (x) => String(x ?? '');

let photoIdCounter = 0;
let cropSeq = 0;
const makePhotoId = () => `photo-${Date.now()}-${photoIdCounter++}`;

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

// Crops to the selected pixel region, downsizes so the long edge is at most
// COMPRESS_MAX_DIM, and re-encodes as JPEG — keeps even a 15-20MB camera
// photo down to a few hundred KB regardless of the original format/size.
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

const ELECTRICAL_CHECKS = [
  { key: 'sound',          label: 'All Motors Sound' },
  { key: 'high_voltage',   label: 'All Motors High Voltage Breakdown Check' },
  { key: 'insulation',     label: 'All Motors Insulation Check' },
  { key: 'phase_resistance', label: 'All Motors Phase Resistance Check' },
  { key: 'hall_sensor',    label: 'All Motors Hall Sensor Connector Check' },
];

const MECHANICAL_CHECKS = [
  { key: 'power_cable',     label: 'All Motor Power Cable Length 1250±50mm' },
  { key: 'sensor_cable',    label: 'All Motor Sensor Cable Length 1250±50mm' },
  { key: 'bolt_tightening', label: 'All Motor Bolt Tightening Check' },
  { key: 'paint_check',     label: 'All Motor Paint Check (If Applicable)' },
];

const MEASURED_OPTIONS = ['GO', 'NG', 'NA', 'OK'];

// power_cable / sensor_cable labels embed a user-editable length spec
// (form.power_cable_length / sensor_cable_length); everything else is fixed.
const mechanicalCheckLabel = (check, form) => {
  if (check.key === 'power_cable')  return `All Motor Power Cable Length ${form.power_cable_length || '1250±50mm'}`;
  if (check.key === 'sensor_cable') return `All Motor Sensor Cable Length ${form.sensor_cable_length || '1250±50mm'}`;
  return check.label;
};

const makeRow = (sno) => ({
  sno,
  motor_sr_no: '',
  // Electrical — one row per motor. current_measured/rpm_measured hold raw
  // text like "2/4" (forward/reverse), "2" (one direction), parsed on the fly
  // via parseForwardReverse for display/validation and re-serialized the same
  // way on save — no separate forward/reverse React state, the raw string IS
  // the source of truth, matching how every other free-text cell works here.
  voltage: '',
  current_measured: '',
  rpm_measured: '',
  electrical_remarks: '',
  // Mechanical
  motor_length: '',
  shaft_length: '',
  shaft_diameter: '',
  mounting_pcd: '',
  mtg: '',
  key_dim_result: 'GO',
  locating_dia_result: '',
  mechanical_remarks: '',
});

const makeRows = () => Array.from({ length: 20 }, (_, i) => makeRow(i + 1));

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

// Returns { outOfRange: boolean } for a single numeric reading against a
// Mirrors CRM_BACKEND/models/operations/pdi/tolerance.js's checkTolerance --
// kept as a duplicate since frontend and backend don't share a build
// pipeline. Any change here must be mirrored there, and vice versa. A third,
// independent implementation also lives in pdi-erp-app/src/services/
// tolerance.ts (TypeScript, different shape) — the FORMULA below must stay
// identical across all three, since the same report can be edited from any
// of the three apps and must get the same pass/fail result everywhere.
//
// Three modes:
//   '±'  (Symmetric):  range = [nominal - tol,  nominal + tol]
//   '%'  (Percentage): range = [nominal - nominal*tol/100, nominal + nominal*tol/100]
//   'bilateral':        range = [nominal + min(tol, tol2), nominal + max(tol, tol2)]
// Bilateral's min/max wrapping is deliberate — same defensive reasoning as
// the existing Math.abs guard below, so a mistyped sign on either field
// can't silently invert the range.
function checkTolerance(measuredStr, nominalStr, toleranceMode, toleranceAmountStr, toleranceAmount2Str) {
  const measured = parseFloat(measuredStr);
  const nominal = parseFloat(nominalStr);
  if (!Number.isFinite(measured) || !Number.isFinite(nominal)) {
    return { outOfRange: false };
  }

  // Note: any toleranceMode value that isn't exactly the literal string
  // 'bilateral' falls through to the symmetric/percentage branch below,
  // which reads only toleranceAmountStr and silently ignores
  // toleranceAmount2Str. This is intentional -- consistent with this
  // function's existing philosophy of gracefully skipping validation on
  // malformed input rather than throwing -- not an oversight. The mode
  // string is driven by a fixed <select> in both UI clients, not free
  // text, so a real-world typo reaching this function is unlikely, but
  // this comment exists so a future reader doesn't mistake the fallthrough
  // for a bug.
  if (toleranceMode === 'bilateral') {
    const plus = parseFloat(toleranceAmountStr);
    const minus = parseFloat(toleranceAmount2Str);
    if (!Number.isFinite(plus) || !Number.isFinite(minus)) {
      return { outOfRange: false };
    }
    const low = nominal + Math.min(plus, minus);
    const high = nominal + Math.max(plus, minus);
    return { outOfRange: measured < low || measured > high };
  }

  const toleranceAmount = parseFloat(toleranceAmountStr);
  if (!Number.isFinite(toleranceAmount)) {
    return { outOfRange: false };
  }
  // Math.abs on the tolerance amount itself — a negative value typed by
  // mistake would otherwise invert the range (nominal - delta > nominal +
  // delta) and flag nearly every row at once.
  const amount = Math.abs(toleranceAmount);
  const delta = toleranceMode === '%' ? Math.abs(nominal) * (amount / 100) : amount;
  const outOfRange = measured < nominal - delta || measured > nominal + delta;
  return { outOfRange };
}

// Parses a Current/RPM Measured cell's raw text into { forward, reverse }.
// "2/4" -> forward=2, reverse=4. A bare number with no "/" is stored as
// forward by convention (documented here, not configurable) — a
// single-direction test defaults to Forward unless the column is the R-only
// variant, which this template doesn't currently have.
function parseForwardReverse(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { forward: '', reverse: '' };
  if (trimmed.includes('/')) {
    const [f, r] = trimmed.split('/');
    return { forward: (f || '').trim(), reverse: (r || '').trim() };
  }
  return { forward: trimmed, reverse: '' };
}

const initGeneralChecks = (checks, defaultMeasured = 'GO') =>
  Object.fromEntries(
    checks.map((c) => [c.key, { measured: defaultMeasured, remarks: 'OK' }])
  );

const defaultForm = () => ({
  customer_name: '',
  date: todayIST(),
  product_id: '',
  drawing_no: '',
  product_specifications: '',
  // Electrical table's spec row — one nominal + tolerance for Current and
  // RPM, shared across every motor row in this PDI (not re-typed per row).
  spec_current_standard: '',
  spec_current_tol_mode: '±',
  spec_current_tol: '',
  spec_current_tol_minus: '',
  spec_rpm_specified: '',
  spec_rpm_tol_mode: '±',
  spec_rpm_tol: '',
  spec_rpm_tol_minus: '',
  pdi_no: '',
  prepared_by: '',
  approved_by: '',
  electrical_remarks: 'ALL MOTORS OK, PASSED.',
  mechanical_remarks: 'ALL MOTORS OK, PASSED.',
  power_cable_length: '1250±50mm',
  sensor_cable_length: '1250±50mm',
  // Mechanical table's "Specification" row — manual entry, varies by product.
  // Motor Length, Shaft Length, Shaft Diameter, Mounting PCD, and Locating
  // Dia. are real numeric specs and get a tolerance mode + amount alongside
  // the nominal.
  // MTG stays a free-text compound description (two sub-specs in one string,
  // e.g. "1.M6 / 2.Ø8.0") — informational only, no tolerance math. Key Dim.
  // stays a GO/NG pass/fail check, also no tolerance math.
  spec_motor_length: '',
  spec_motor_length_tol_mode: '±',
  spec_motor_length_tol: '',
  spec_motor_length_tol_minus: '',
  spec_shaft_length: '',
  spec_shaft_length_tol_mode: '±',
  spec_shaft_length_tol: '',
  spec_shaft_length_tol_minus: '',
  spec_shaft_diameter: '',
  spec_shaft_diameter_tol_mode: '±',
  spec_shaft_diameter_tol: '',
  spec_shaft_diameter_tol_minus: '',
  spec_mounting_pcd: '',
  spec_mounting_pcd_tol_mode: '±',
  spec_mounting_pcd_tol: '',
  spec_mounting_pcd_tol_minus: '',
  spec_mtg: '',
  spec_key_dim: 'Go/NG',
  spec_locating_dia: '',
  spec_locating_dia_tol_mode: '±',
  spec_locating_dia_tol: '',
  spec_locating_dia_tol_minus: '',
  drawing_image: null,
  photos: [
    { id: makePhotoId(), label: 'Overall Motor', images: [] },
    { id: makePhotoId(), label: 'Name Plate', images: [] },
  ],
  rows: makeRows(),
  general_electrical: {
    ...initGeneralChecks(ELECTRICAL_CHECKS),
    hall_sensor: { measured: 'NA', remarks: 'OK' },
  },
  general_mechanical: {
    ...initGeneralChecks(MECHANICAL_CHECKS),
    power_cable: { measured: 'NA', remarks: 'OK' },
    sensor_cable: { measured: 'NA', remarks: 'OK' },
  },
});

const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Keeps YYYY-MM-DD, converts DD-MM-YYYY / DD/MM/YYYY, drops anything else.
function normalizeDate(raw) {
  const s = str(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function mergeChecks(defaults, saved) {
  const src = isPlainObject(saved) ? saved : {};
  const merged = { ...src };
  for (const [key, def] of Object.entries(defaults)) {
    const v = isPlainObject(src[key]) ? src[key] : {};
    merged[key] = { ...v, measured: str(v.measured ?? def.measured), remarks: str(v.remarks ?? def.remarks) };
  }
  return merged;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return makeRows();
  return rows.map((r, i) => {
    const src = isPlainObject(r) ? r : {};
    const out = { ...src };
    for (const [key, def] of Object.entries(makeRow(i + 1))) {
      out[key] = key === 'sno' ? (src.sno ?? def) : str(src[key] ?? def);
    }
    return out;
  });
}

function normalizePhotos(photos) {
  const list = Array.isArray(photos) ? photos.filter(isPlainObject) : [];
  if (!list.length) return defaultForm().photos;
  return list.map((p) => ({
    ...p,
    id: p.id || makePhotoId(),
    label: str(p.label),
    images: Array.isArray(p.images) ? p.images : [],
  }));
}

function formFromReport(report) {
  const base = defaultForm();
  const data = isPlainObject(report?.data) ? report.data : {};
  const out = { ...base, ...data };
  for (const [key, def] of Object.entries(base)) {
    if (typeof def === 'string') out[key] = str(data[key] ?? def);
  }
  out.date = data.date == null ? base.date : normalizeDate(data.date);
  out.drawing_image = typeof data.drawing_image === 'string' && data.drawing_image ? data.drawing_image : null;
  out.rows = normalizeRows(data.rows);
  out.general_electrical = mergeChecks(base.general_electrical, data.general_electrical);
  out.general_mechanical = mergeChecks(base.general_mechanical, data.general_mechanical);
  out.photos = normalizePhotos(report?.photos);
  return out;
}

// Unsaved-change detection. Images are reduced to length + tail so a
// multi-MB data URI never goes through JSON.stringify on every keystroke.
const imageSig = (src) => {
  const s = str(src);
  return `${s.length}:${s.slice(-24)}`;
};
const formSignature = (f) =>
  JSON.stringify({ ...f, photos: undefined, drawing_image: f.drawing_image ? imageSig(f.drawing_image) : null });
const photoSignature = (f) =>
  JSON.stringify((f.photos || []).map((p) => [p.id, p.label, (p.images || []).map(imageSig)]));

const MECHANICAL_TOLERANCE_FIELDS = [
  ['motor_length', 'spec_motor_length'],
  ['shaft_length', 'spec_shaft_length'],
  ['shaft_diameter', 'spec_shaft_diameter'],
  ['mounting_pcd', 'spec_mounting_pcd'],
  ['locating_dia_result', 'spec_locating_dia'],
];

const isNg = (v) => str(v).trim().toUpperCase() === 'NG';
const isPassedRemark = (v) => str(v).trim().toUpperCase() === PASSED_REMARK;

// Same flags the tables paint red, gathered for the finalize pre-check.
function finalizeWarnings(form) {
  const rows = Array.isArray(form.rows) ? form.rows : [];
  const specOut = (value, spec) =>
    checkTolerance(value, form[spec], form[`${spec}_tol_mode`], form[`${spec}_tol`], form[`${spec}_tol_minus`]).outOfRange;
  const currentOut = (raw) => {
    const { forward, reverse } = parseForwardReverse(str(raw));
    return [forward, reverse].some((v) =>
      checkTolerance(v, form.spec_current_standard, form.spec_current_tol_mode, form.spec_current_tol, form.spec_current_tol_minus).outOfRange);
  };
  const rpmOut = (raw) => {
    const { forward, reverse } = parseForwardReverse(str(raw));
    return [forward, reverse].some((v) =>
      checkTolerance(v, form.spec_rpm_specified, form.spec_rpm_tol_mode, form.spec_rpm_tol, form.spec_rpm_tol_minus).outOfRange);
  };

  let elecTol = false, mechTol = false, elecNg = false, mechNg = false;
  for (const r of rows) {
    if (currentOut(r.current_measured) || rpmOut(r.rpm_measured)) elecTol = true;
    if (MECHANICAL_TOLERANCE_FIELDS.some(([field, spec]) => specOut(r[field], spec))) mechTol = true;
    if (isNg(r.electrical_remarks)) elecNg = true;
    if (isNg(r.key_dim_result) || isNg(r.mechanical_remarks)) mechNg = true;
  }
  const checksNg = (checks) => Object.values(isPlainObject(checks) ? checks : {})
    .some((c) => isNg(c?.measured) || isNg(c?.remarks));
  if (checksNg(form.general_electrical)) elecNg = true;
  if (checksNg(form.general_mechanical)) mechNg = true;

  const warnings = [];
  if (!rows.some((r) => str(r.motor_sr_no).trim())) warnings.push('No motor row has a Motor Sr. No.');
  if (elecTol) warnings.push('Electrical readings outside tolerance.');
  if (mechTol) warnings.push('Mechanical readings outside tolerance.');
  if (elecNg) warnings.push('NG result in the electrical checks.');
  if (mechNg) warnings.push('NG result in the mechanical checks.');
  const photoCount = (form.photos || []).reduce((n, p) => n + (p.images?.length || 0), 0);
  if (photoCount === 0) warnings.push('No photos attached.');
  if ((elecTol || elecNg) && isPassedRemark(form.electrical_remarks)) {
    warnings.push(`Electrical Remarks still say "${PASSED_REMARK}"`);
  }
  if ((mechTol || mechNg) && isPassedRemark(form.mechanical_remarks)) {
    warnings.push(`Mechanical Remarks still say "${PASSED_REMARK}"`);
  }
  return warnings;
}

// Error bodies arrive as a Blob when the request asked for responseType 'blob'.
async function readErrorPayload(err) {
  let data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try { data = JSON.parse(await data.text()); } catch { data = null; }
  }
  if (!isPlainObject(data)) return { error: '', code: '' };
  return { error: typeof data.error === 'string' ? data.error : '', code: str(data.code) };
}

function downloadPdf(data, filename) {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

function deleteDraft(id) {
  const token = localStorage.getItem('token');
  if (!id || !token) return Promise.resolve();
  return axios.delete(`${API_URL}/api/pdi/reports/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).catch((err) => {
    console.error('Failed to clean up unsaved PDI draft:', err);
  });
}

const INPUT_CLS =
  'w-full border border-navy-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const SELECT_CLS =
  'border border-navy-100 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-navy-800 bg-navy-50 border border-navy-100 whitespace-nowrap';
const TD_CLS = 'py-1 px-1 border border-gray-100 text-sm text-gray-500 text-center';

// Shared by every spec-row tolerance group in this form (7 total after this
// task: Motor Length, Shaft Length, Shaft Diameter, Mounting PCD, Locating
// Dia., Current, RPM) -- renders the nominal value, the tolerance-mode
// select, and either one tolerance-amount input (Symmetric/Percentage) or
// two signed "+"/"-" inputs (Bilateral). The existing `tol` value doubles
// as the "+" field in Bilateral mode (matching every other codebase's
// identical reuse of the single existing tolerance field) -- `tolMinus` is
// the only genuinely new value.
function ToleranceSpecInput({
  id, label,
  nominalValue, onNominalChange, nominalPlaceholder,
  mode, onModeChange,
  tol, onTolChange,
  tolMinus, onTolMinusChange,
}) {
  const prefix = label ? `${label} ` : '';
  return (
    <div className="flex gap-1 flex-wrap">
      <input id={id} className={INPUT_CLS} value={nominalValue} onChange={(e) => onNominalChange(e.target.value)} placeholder={nominalPlaceholder} aria-label={`${prefix}specification`} />
      <select className={SELECT_CLS} value={mode} onChange={(e) => onModeChange(e.target.value)} aria-label={`${prefix}tolerance mode`}>
        <option value="±">±</option>
        <option value="%">±%</option>
        <option value="bilateral">Bilateral</option>
      </select>
      <input
        className={INPUT_CLS}
        value={tol}
        onChange={(e) => onTolChange(e.target.value)}
        placeholder={mode === 'bilateral' ? '+' : 'tol.'}
        aria-label={`${prefix}${mode === 'bilateral' ? 'plus tolerance' : 'tolerance amount'}`}
        style={{ maxWidth: mode === 'bilateral' ? 50 : 60 }}
      />
      {mode === 'bilateral' && (
        <input
          className={INPUT_CLS}
          value={tolMinus}
          onChange={(e) => onTolMinusChange(e.target.value)}
          placeholder="-"
          aria-label={`${prefix}minus tolerance`}
          style={{ maxWidth: 50 }}
        />
      )}
    </div>
  );
}

function ImageUploadCard({ label, hint, images = [], onFilesSelected, onRemove, heightCls = 'h-40', maxImages = 10, disabled = false }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const atLimit = disabled || images.length >= maxImages;

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!atLimit) setDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragActive(false);
  };
  // Clamps a batch to however many slots are actually left — a caller could
  // otherwise be handed a batch that overshoots maxImages.
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
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed bg-gray-50 ${heightCls} overflow-hidden ${
          dragActive ? 'border-gold-400 bg-gold-400/10' : images.length ? 'border-navy-100' : 'border-navy-100'
        }`}
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
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 hover:text-gold-600 transition-colors"
              >
                <Camera size={26} />
                <span className="text-xs font-medium">Take Photo</span>
              </button>
              <div className="w-px h-9 bg-gray-200" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 hover:text-gold-600 transition-colors"
              >
                <ImageIcon size={26} />
                <span className="text-xs font-medium">Choose Files</span>
              </button>
            </div>
            <span className="text-[11px] text-gray-300">or drag photos here — pick several at once</span>
          </div>
        )}
      </div>
      {/* capture="environment" opens the device camera directly — needed because
          Android's system Photo Picker (the default gallery chooser) has no camera
          shortcut of its own, by design (it's a privacy-scoped media picker). */}
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

// Drag-to-crop + pinch-zoom overlay shown after a file is picked, before it's
// attached to the form. Crops to CROP_ASPECT then hands the result to onApply
// as a compressed JPEG data URI (see cropAndCompress).
function CropModal({ imageSrc, onCancel, onApply, onSkip }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const { notifyError } = useNotify();

  // The browser can read some formats (e.g. HEIC) as a file but not decode
  // them, which would leave Apply disabled forever with no explanation.
  useEffect(() => {
    let cancelled = false;
    loadImage(imageSrc).catch(() => {
      if (!cancelled) setDecodeFailed(true);
    });
    return () => { cancelled = true; };
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
      className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-auto outline-none max-h-[95vh] overflow-y-auto"
      contentLabel="Crop Image"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-800">Adjust photo</h3>
        <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      {decodeFailed ? (
        <div className="px-5 py-8 text-sm text-red-600 bg-red-50 border-b border-red-100">
          This photo couldn&rsquo;t be opened. HEIC and some camera formats aren&rsquo;t supported here, so convert it to JPEG or PNG, or skip it.
        </div>
      ) : (
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
      )}
      <div className="px-5 py-4 space-y-3">
        {!decodeFailed && (
          <div>
            <label htmlFor="pdi-gen-crop-zoom" className="block text-xs font-medium text-gray-500 mb-1">Zoom</label>
            <input
              id="pdi-gen-crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
            Cancel
          </button>
          {decodeFailed && (
            <button type="button" onClick={onSkip} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm font-semibold">
              Skip this photo
            </button>
          )}
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || decodeFailed || !croppedAreaPixels}
            className="px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50 text-sm font-semibold"
          >
            {busy ? 'Processing...' : 'Apply'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function PDIGeneratorForm() {
  const [isOpen, setIsOpen] = useState(false);
  // `loading` = finalizing.
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState('electrical');
  const [form, setForm] = useState(defaultForm);
  const [reportId, setReportId] = useState(null);
  const [revisionNo, setRevisionNo] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [hasConflict, setHasConflict] = useState(false);
  // General reports are never lot members; a non-null batch_id is handled
  // defensively by showing the form read-only.
  const [lotInfo, setLotInfo] = useState(null);
  // Signatures of the last loaded/saved form, split so photos never go
  // through the per-keystroke stringify.
  const [savedSig, setSavedSig] = useState({ form: '', photos: '' });
  // Tracks whether Save has fired at least once on the current draft — a
  // never-saved draft gets deleted on Cancel so opening the form by mistake
  // doesn't leave an empty row behind; once saved, Cancel just closes.
  const [hasSaved, setHasSaved] = useState(false);
  const { notifySuccess, notifyError } = useNotify();
  const navigate = useNavigate();
  const abortRef = useRef(null);
  const saveAbortRef = useRef(null);
  const busyRef = useRef(false);
  // Bumped whenever the open form is replaced or closed, so a response that
  // lands afterwards can tell it belongs to a session that no longer exists.
  const sessionRef = useRef(0);
  const reportIdRef = useRef(null);
  const hasSavedRef = useRef(false);

  // Queued files from a multi-file selection still waiting to be cropped,
  // plus the target they belong to, so the next queued file (advanced from
  // applyCroppedImage/cancelCrop) reopens the crop modal against the right
  // destination. Refs, not useState: the re-entrancy guard in
  // handleFilesChosen below needs to see the queue update the instant a read
  // begins, with no async gap — a useState-based queue leaves a window (after
  // the last file's setCropQueue({files: [], ...}) but before the async
  // FileReader resolves and sets cropTarget) where a concurrent
  // handleFilesChosen call would read both conditions as false and slip
  // through. A ref write is synchronous, so that window doesn't exist.
  const cropQueueFilesRef = useRef([]);
  const cropQueueTargetRef = useRef(null);
  // { target: { type: 'drawing' } | { type: 'photo', id }, imageSrc, seq }
  // identifying where a crop result should land, plus the source image.
  const [cropTarget, setCropTarget] = useState(null);

  useEffect(() => {
    reportIdRef.current = reportId;
    hasSavedRef.current = hasSaved;
  }, [reportId, hasSaved]);

  // Unmounting (e.g. navigating to another page) with a never-saved draft
  // open deletes it, the same as Cancel would.
  useEffect(() => () => {
    abortRef.current?.abort();
    saveAbortRef.current?.abort();
    if (reportIdRef.current && !hasSavedRef.current) deleteDraft(reportIdRef.current);
  }, []);

  // Same for a reload or tab close; keepalive lets the request outlive the page.
  useEffect(() => {
    const onPageHide = (e) => {
      // persisted = page kept in the back/forward cache and may be restored.
      if (e.persisted) return;
      const id = reportIdRef.current;
      const token = localStorage.getItem('token');
      if (!id || hasSavedRef.current || !token) return;
      try {
        fetch(`${API_URL}/api/pdi/reports/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      } catch {
        // best effort
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  const formSig = useMemo(() => formSignature(form), [form]);
  const photoSig = useMemo(() => photoSignature(form), [form]);
  const isDirty = isOpen && (formSig !== savedSig.form || photoSig !== savedSig.photos);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const readOnly = !!lotInfo;
  const lotFinalized = !!lotInfo && ['Completed', 'Finalizing'].includes(lotInfo.batch_status);
  const isCompleted = reportStatus === 'Completed' && !lotInfo;
  const busy = saving || loading;

  const resetCropQueue = () => {
    cropQueueFilesRef.current = [];
    cropQueueTargetRef.current = null;
    setCropTarget(null);
  };

  const applyLoadedReport = (report) => {
    const nextForm = formFromReport(report);
    sessionRef.current += 1;
    resetCropQueue();
    setForm(nextForm);
    setSavedSig({ form: formSignature(nextForm), photos: photoSignature(nextForm) });
    setReportId(report.report_id);
    setRevisionNo(report.revision_no ?? null);
    setReportStatus(report.status ?? null);
    setLotInfo(report.batch_id != null ? {
      batch_id: report.batch_id,
      lot_index: report.lot_index ?? null,
      lot_quantity: report.lot_quantity ?? null,
      batch_status: report.batch_status ?? null,
      batch_pdi_no: report.batch_pdi_no ?? null,
    } : null);
    setHasConflict(false);
    // It already exists server-side — Cancel should close, never delete it.
    setHasSaved(true);
  };

  const closeSession = () => {
    sessionRef.current += 1;
    reportIdRef.current = null;
    resetCropQueue();
    setIsOpen(false);
    setReportId(null);
    setHasSaved(false);
    setHasConflict(false);
    setLotInfo(null);
  };

  const [searchParams, setSearchParams] = useSearchParams();

  // Resume: if the dashboard linked here with ?report=<id>, load that report
  // and open pre-filled instead of waiting for "+ Create PDI".
  useEffect(() => {
    const resumeId = searchParams.get('report');
    if (!resumeId) return;

    (async () => {
      const token = localStorage.getItem('token');
      if (!token) { notifyError('Please log in first.'); setSearchParams({}, { replace: true }); return; }
      let redirected = false;
      try {
        const response = await axios.get(`${API_URL}/api/pdi/reports/${resumeId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const report = response.data || {};
        const templateId = report.template_id || TEMPLATE_ID;
        if (templateId !== TEMPLATE_ID) {
          notifyError('This report uses a different PDI template. Opening it in the right form.');
          redirected = true;
          navigate(pdiFormPath(templateId, report.report_id ?? resumeId), { replace: true });
          return;
        }
        applyLoadedReport(report);
        setActiveTab('electrical');
        setIsOpen(true);
      } catch (err) {
        const { error } = await readErrorPayload(err);
        notifyError(error || 'Could not load that PDI report.');
      } finally {
        if (!redirected) setSearchParams({}, { replace: true });
      }
    })();
    // Only ever run this for the query param present on initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setRowField = useCallback((idx, field, value) => {
    setForm((prev) => {
      const rows = [...prev.rows];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, rows };
    });
  }, []);

  const addRow = useCallback(() => {
    setForm((prev) => (
      prev.rows.length >= MAX_ROWS
        ? prev
        : { ...prev, rows: [...prev.rows, makeRow(prev.rows.length + 1)] }
    ));
  }, []);

  const setCheck = useCallback((type, key, subfield, value) => {
    setForm((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: { ...prev[type][key], [subfield]: value } },
    }));
  }, []);

  // Opens the crop modal for `file`. A file that can't be used (not an image,
  // too large, unreadable) is reported and the next queued file is tried, so
  // one bad file can't strand the rest of the batch or leave the queue
  // looking busy. Bails out if the queue was cancelled or the form closed
  // while a read was in flight (the target ref no longer matches).
  const handleFileChosen = useCallback(async (target, file) => {
    let next = file;
    while (next) {
      if (cropQueueTargetRef.current !== target) return;
      let problem = null;
      if (!str(next.type).startsWith('image/')) {
        problem = 'Please choose an image file.';
      } else if (next.size > MAX_RAW_IMAGE_BYTES) {
        problem = `Image is too large (max ${(MAX_RAW_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB).`;
      } else {
        try {
          const dataUri = await fileToDataUri(next);
          if (cropQueueTargetRef.current !== target) return;
          setCropTarget({ target, imageSrc: dataUri, seq: cropSeq++ });
          return;
        } catch {
          problem = 'Failed to read image file.';
        }
      }
      notifyError(problem);
      next = cropQueueFilesRef.current[0];
      cropQueueFilesRef.current = cropQueueFilesRef.current.slice(1);
    }
    if (cropQueueTargetRef.current === target) {
      cropQueueFilesRef.current = [];
      cropQueueTargetRef.current = null;
    }
  }, [notifyError]);

  // Photo entries are addressed by their stable `id` (assigned once via
  // makePhotoId(), never by array index), so removing/reordering an unrelated
  // entry — even while a crop for a different entry is still queued — can't
  // make an in-flight add land on the wrong photo.
  // Declared above applyCroppedImage/handleFilesChosen (below) because both
  // reference it — declaring it later would be a temporal-dead-zone
  // ReferenceError on every render (it's a `const`, not hoisted like a
  // function declaration).
  const addPhotoImage = useCallback((id, dataUri) => {
    setForm((prev) => {
      const totalImages = prev.photos.reduce((sum, p) => sum + (p.images?.length || 0), 0);
      if (totalImages >= MAX_TOTAL_PHOTOS) {
        notifyError(`Reached the ${MAX_TOTAL_PHOTOS}-photo limit for this report — remove some photos before adding more.`);
        return prev;
      }
      return {
        ...prev,
        photos: prev.photos.map((p) => (p.id === id ? { ...p, images: [...(p.images || []), dataUri].slice(0, MAX_IMAGES_PER_SLOT) } : p)),
      };
    });
  }, [notifyError]);

  const removePhotoImage = useCallback((id, imgIdx) => {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.map((p) => (p.id === id ? { ...p, images: (p.images || []).filter((_, i) => i !== imgIdx) } : p)),
    }));
  }, []);

  // Turns a multi-file selection into a sequence of single-file crop steps —
  // handleFileChosen opens CropModal for the first file; applying or
  // skipping that crop advances to the next queued file.
  // Guarded against re-entrancy: if a queue or crop is already in flight, a
  // second file-selection is rejected with a notification rather than
  // silently clobbering the in-flight batch.
  const handleFilesChosen = useCallback((target, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    // Busy check reads cropQueueTargetRef, NOT the cropTarget state — the ref
    // is set synchronously the instant any file starts processing (below)
    // and only clears once the queue truly drains or is cancelled, so it
    // correctly reads "busy" through the async FileReader gap where
    // cropTarget state hasn't been set yet. Checking cropTarget here would
    // reopen the exact race this ref exists to close (see the comment above
    // cropQueueFilesRef's declaration).
    if (cropQueueFilesRef.current.length > 0 || cropQueueTargetRef.current) {
      notifyError('Finish cropping the current batch of photos before adding more.');
      return;
    }
    const [first, ...rest] = files;
    cropQueueFilesRef.current = rest;
    cropQueueTargetRef.current = target;
    handleFileChosen(target, first);
  }, [handleFileChosen, notifyError]);

  // Advance the queue synchronously (a ref, not state) — the instant this
  // runs, cropQueueFilesRef reflects reality with no async gap a concurrent
  // handleFilesChosen call could slip through.
  const advanceCropQueue = useCallback(() => {
    if (cropQueueFilesRef.current.length > 0) {
      const [next, ...rest] = cropQueueFilesRef.current;
      cropQueueFilesRef.current = rest;
      handleFileChosen(cropQueueTargetRef.current, next);
    } else {
      cropQueueTargetRef.current = null;
    }
  }, [handleFileChosen]);

  // Reads cropTarget directly rather than inside a setCropTarget updater:
  // updaters may run twice (StrictMode), which would add the image twice.
  const applyCroppedImage = useCallback((dataUri) => {
    if (!cropTarget) return;
    const { target } = cropTarget;
    if (target.type === 'drawing') {
      setField('drawing_image', dataUri);
    } else {
      addPhotoImage(target.id, dataUri);
    }
    setCropTarget(null);
    advanceCropQueue();
  }, [cropTarget, setField, addPhotoImage, advanceCropQueue]);

  const skipCrop = useCallback(() => {
    setCropTarget(null);
    advanceCropQueue();
  }, [advanceCropQueue]);

  // Fully drains the queue on cancel — otherwise the remaining queued files
  // from this batch would be silently abandoned (never cropped, never added).
  const cancelCrop = useCallback(() => {
    const remaining = cropQueueFilesRef.current.length;
    cropQueueFilesRef.current = [];
    cropQueueTargetRef.current = null;
    setCropTarget(null);
    if (remaining > 0) {
      notifyError(`Cancelled — ${remaining} more photo${remaining === 1 ? '' : 's'} in this batch were not added.`);
    }
  }, [notifyError]);

  const addPhoto = useCallback(() => {
    setForm((prev) => (
      prev.photos.length >= MAX_PHOTOS
        ? prev
        : { ...prev, photos: [...prev.photos, { id: makePhotoId(), label: '', images: [] }] }
    ));
  }, []);

  const removePhoto = useCallback((id) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== id) }));
  }, []);

  const setPhotoLabel = useCallback((id, label) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.map((p) => (p.id === id ? { ...p, label } : p)) }));
  }, []);

  const handleOpen = async () => {
    if (opening) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setOpening(true);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/reports`, { inspection_date: todayIST() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fresh = defaultForm();
      sessionRef.current += 1;
      resetCropQueue();
      setReportId(response.data.report_id);
      setRevisionNo(response.data.revision_no ?? null);
      setReportStatus(response.data.status ?? null);
      setHasSaved(false);
      setHasConflict(false);
      setLotInfo(null);
      setForm(fresh);
      setSavedSig({ form: formSignature(fresh), photos: photoSignature(fresh) });
      setActiveTab('electrical');
      setIsOpen(true);
    } catch (err) {
      const { error } = await readErrorPayload(err);
      notifyError(error || 'Could not start a new PDI report.');
    } finally {
      setOpening(false);
    }
  };

  // expected_revision goes out on every save once known, so a concurrent
  // edit is caught whatever the status. Completed reports keep their status
  // (only finalize sets it); everything else is marked In Progress.
  const saveExtras = () => ({
    ...(revisionNo != null ? { expected_revision: revisionNo } : {}),
    ...(reportStatus === 'Completed' ? {} : { status: 'In Progress' }),
  });

  // Photos are only sent when they changed since the last successful save;
  // the body is stringified once here so its size can be checked up front.
  const buildSaveRequest = () => {
    const { photos, ...data } = form;
    const sig = { form: formSig, photos: photoSig };
    const body = {
      data,
      ...saveExtras(),
      // "Inspected By" on the dashboard should reflect who's actually doing
      // the inspection (the Prepared By field), not just whoever's logged-in
      // account happened to create the draft — only send it once it's typed,
      // so an empty field doesn't blank out a name already saved.
      inspected_by: str(form.prepared_by).trim() || undefined,
      inspection_date: form.date || undefined,
    };
    if (photoSig !== savedSig.photos) body.photos = photos;
    const json = JSON.stringify(body);
    return { json, sig, bytes: json.length };
  };

  const payloadTooLarge = (bytes) => {
    if (bytes <= MAX_SAVE_PAYLOAD_BYTES) return false;
    notifyError(`This report is too large to save (about ${Math.ceil(bytes / (1024 * 1024))} MB; the limit is ${MAX_SAVE_PAYLOAD_BYTES / (1024 * 1024)} MB). Remove some photos and try again.`);
    return true;
  };

  // ?photos=summary keeps the response small; local photos are never
  // replaced from it.
  const sendSave = (req, token, signal) =>
    axios.patch(`${API_URL}/api/pdi/reports/${reportId}?photos=summary`, req.json, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal,
    });

  const applySaveResponse = (response, sig) => {
    setRevisionNo((prev) => response.data?.revision_no ?? prev);
    if (response.data?.status) setReportStatus(response.data.status);
    setSavedSig(sig);
    setHasSaved(true);
  };

  const handleSaveError = async (err, fallback = 'Failed to save progress.') => {
    const { error, code } = await readErrorPayload(err);
    if (code === 'FINALIZED_REPORT_FORBIDDEN') {
      notifyError('You don’t have permission to edit a finalized report.');
      return;
    }
    if (code === 'REPORT_VERSION_CONFLICT') {
      setHasConflict(true);
      notifyError('This report changed since you loaded it. Use "Reload latest" to load the newest version before saving again.');
      return;
    }
    if (code === 'BATCH_MEMBER_LOCKED' || code === 'BATCH_MEMBER_USE_LOT') {
      notifyError(error || 'This report is part of a lot. Open it from the lot page.');
      return;
    }
    notifyError(error || fallback);
  };

  const handleSave = async () => {
    if (!reportId || busyRef.current || readOnly) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    const req = buildSaveRequest();
    if (payloadTooLarge(req.bytes)) return;
    const session = sessionRef.current;
    const controller = new AbortController();
    saveAbortRef.current = controller;
    busyRef.current = true;
    setSaving(true);
    try {
      const response = await sendSave(req, token, controller.signal);
      if (sessionRef.current !== session) return;
      applySaveResponse(response, req.sig);
      notifySuccess(isCompleted ? 'Changes saved.' : 'Progress saved.');
    } catch (err) {
      if (axios.isCancel(err) || sessionRef.current !== session) return;
      await handleSaveError(err);
    } finally {
      if (saveAbortRef.current === controller) saveAbortRef.current = null;
      busyRef.current = false;
      setSaving(false);
    }
  };

  const pdfFileName = () => {
    const safe = str(form.pdi_no).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `PDI_${safe || reportId}.pdf`;
  };

  // Not tied to a submit event: the modal's <form> never submits, so Enter
  // in a field can't finalize.
  const handleFinalize = async () => {
    if (busyRef.current || readOnly || isCompleted) return;
    if (!str(form.customer_name).trim()) { notifyError('Customer name is required.'); return; }
    if (!str(form.pdi_no).trim()) { notifyError('PDI No. is required.'); return; }
    if (!reportId) { notifyError('Report not initialized yet — please close and reopen the form.'); return; }

    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }

    const warnings = finalizeWarnings(form);
    if (warnings.length && !window.confirm(
      `Before finalizing, please check:\n\n${warnings.map((w) => `• ${w}`).join('\n')}\n\nFinalize anyway?`,
    )) return;

    const req = buildSaveRequest();
    if (payloadTooLarge(req.bytes)) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const session = sessionRef.current;
    busyRef.current = true;
    setLoading(true);

    try {
      // Finalize renders whatever is currently saved server-side, not the live
      // form state — save first so the PDF reflects exactly what's on screen,
      // even if the user never clicked Save themselves.
      const saveResponse = await sendSave(req, token, controller.signal);
      if (sessionRef.current !== session) return;
      applySaveResponse(saveResponse, req.sig);

      const response = await axios.post(`${API_URL}/api/pdi/reports/${reportId}/finalize`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
        signal: controller.signal,
      });
      if (sessionRef.current !== session) return;

      downloadPdf(response.data, pdfFileName());
      notifySuccess('PDI finalized and PDF downloaded successfully.');
      closeSession();
    } catch (err) {
      if (axios.isCancel(err) || sessionRef.current !== session) return;
      await handleSaveError(err, 'Failed to finalize PDI.');
    } finally {
      busyRef.current = false;
      setLoading(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportId || downloading) return;
    if (isDirty && !window.confirm('You have unsaved changes. The PDF shows the last saved version. Download it anyway?')) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setDownloading(true);
    try {
      const response = await axios.get(`${API_URL}/api/pdi/reports/${reportId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      downloadPdf(response.data, pdfFileName());
    } catch (err) {
      const { error } = await readErrorPayload(err);
      notifyError(error || 'Could not download the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handleReloadLatest = async () => {
    if (!reportId || busyRef.current) return;
    if (!window.confirm('Load the latest saved version of this report? Your unsaved changes here will be lost.')) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    try {
      const response = await axios.get(`${API_URL}/api/pdi/reports/${reportId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      applyLoadedReport(response.data || {});
      notifySuccess('Loaded the latest version.');
    } catch (err) {
      const { error } = await readErrorPayload(err);
      notifyError(error || 'Could not load the latest version.');
    }
  };

  // Esc, × and Cancel all come through here. Closing is blocked while
  // finalizing; unsaved edits need a confirm.
  const handleClose = async () => {
    if (loading) return;
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    abortRef.current?.abort();
    saveAbortRef.current?.abort();
    const draftId = reportId && !hasSaved ? reportId : null;
    closeSession();
    if (draftId) await deleteDraft(draftId);
  };

  const lotBackPath = lotInfo ? pdiBatchPath(TEMPLATE_ID, lotInfo.batch_id) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-bold text-navy-800">
        PDI Generator
      </h1>

      <div>
        {/* Info card */}
        <div
          onClick={handleOpen}
          className="bg-white rounded-xl shadow-sm p-5 sm:p-8 cursor-pointer hover:shadow-md transition-shadow border-2 border-dashed border-gold-400 flex items-center gap-4 sm:gap-6"
        >
          <div className="p-3 sm:p-4 bg-gold-400/25 rounded-xl shrink-0">
            <ClipboardCheck size={40} className="text-gold-600" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-navy-800">New Pre-Dispatch Inspection</h2>
            <p className="text-gray-500 mt-1">
              Fill in motor data and generate a 3-page PDI report PDF (Format No: CASPL/QA/F/14)
            </p>
            <span className="inline-block mt-3 px-4 py-1.5 bg-gold-500 text-navy-900 rounded-lg text-sm font-semibold">
              + Create PDI
            </span>
          </div>
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          Click the card above to open the PDI form and generate the PDF
        </p>
      </div>

      <Modal
        isOpen={isOpen}
        onRequestClose={handleClose}
        shouldCloseOnOverlayClick={false}
        shouldCloseOnEsc={!loading}
        overlayClassName="fixed inset-0 bg-navy-900/50 flex items-start justify-center z-50 overflow-y-auto py-4 sm:py-8"
        className="bg-white rounded-xl shadow-2xl w-full min-w-0 max-w-5xl mx-4 outline-none"
        contentLabel="PDI Generator Form"
      >
        <form onSubmit={(e) => e.preventDefault()}>
          {/* Modal header */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-navy-100">
            <div className="flex items-center gap-3">
              <FileText className="text-gold-500" size={24} />
              <div>
                <h2 className="font-display text-xl font-bold text-navy-800">Pre-Dispatch Inspection (PDI)</h2>
                <p className="text-xs text-gray-400">Format No: CASPL/QA/F/14 · Rev. No:00 · Eff. Dt:01/01/2022</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              aria-label="Close"
              className="shrink-0 px-2 text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-40"
            >
              &times;
            </button>
          </div>

          <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-6 max-h-[62vh] sm:max-h-[80vh] overflow-y-auto">

            {lotInfo && (
              <div className={`rounded-lg border p-3 text-sm ${lotFinalized ? 'border-green-200 bg-green-50 text-green-800' : 'border-gold-400/40 bg-gold-400/15 text-navy-800'}`}>
                {lotFinalized && <p className="font-semibold">This lot is finalized</p>}
                <p>
                  Lot {lotInfo.lot_index ?? '?'} of {lotInfo.lot_quantity ?? '?'}
                  {lotInfo.batch_pdi_no ? ` · PDI ${lotInfo.batch_pdi_no}` : ''}
                </p>
                <p className="text-xs mt-1 opacity-80">This report belongs to a lot, so it&rsquo;s read-only here. Lot details are set on the lot page.</p>
              </div>
            )}

            {hasConflict && !lotInfo && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <span>This report was changed elsewhere since you opened it. Reload the latest version before saving again.</span>
                <button
                  type="button"
                  onClick={handleReloadLatest}
                  disabled={busy}
                  className="px-3 py-1.5 border border-red-300 rounded-lg bg-white text-red-700 hover:bg-red-100 disabled:opacity-50 text-xs font-semibold"
                >
                  Reload latest
                </button>
              </div>
            )}

            {/* ── Header fields ── */}
            <fieldset disabled={readOnly} className="min-w-0">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="pdi-gen-customer-name" className="block text-sm font-medium text-gray-700 mb-1">Customer Name <span className="text-red-500">*</span></label>
                <input id="pdi-gen-customer-name" className={INPUT_CLS} value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} placeholder="e.g. ABC Industries" />
              </div>
              <div>
                <label htmlFor="pdi-gen-date" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input id="pdi-gen-date" type="date" className={INPUT_CLS} value={form.date} onChange={(e) => setField('date', e.target.value)} />
              </div>
              <div>
                <label htmlFor="pdi-gen-product-id" className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                <input id="pdi-gen-product-id" className={INPUT_CLS} value={form.product_id} onChange={(e) => setField('product_id', e.target.value)} placeholder="e.g. 125-M" />
              </div>
              <div>
                <label htmlFor="pdi-gen-drawing-no" className="block text-sm font-medium text-gray-700 mb-1">Drawing No.</label>
                <input id="pdi-gen-drawing-no" className={INPUT_CLS} value={form.drawing_no} onChange={(e) => setField('drawing_no', e.target.value)} placeholder="e.g. DWG-001" />
              </div>
              <div>
                <label htmlFor="pdi-gen-product-specs" className="block text-sm font-medium text-gray-700 mb-1">Product Specifications</label>
                <input id="pdi-gen-product-specs" className={INPUT_CLS} value={form.product_specifications} onChange={(e) => setField('product_specifications', e.target.value)} placeholder="e.g. 48V BLDC Motor" />
              </div>
              <div>
                <label htmlFor="pdi-gen-pdi-no" className="block text-sm font-medium text-gray-700 mb-1">PDI No. <span className="text-red-500">*</span></label>
                <input id="pdi-gen-pdi-no" className={INPUT_CLS} value={form.pdi_no} onChange={(e) => setField('pdi_no', e.target.value)} placeholder="e.g. PDI-2024-001" />
              </div>
            </div>
            </fieldset>

            {/* ── Tabs ── */}
            <div className="border-b border-gray-200">
              <nav className="flex gap-1">
                {[
                  { key: 'electrical', label: 'Electrical Check (Pg 1)' },
                  { key: 'mechanical', label: 'Mechanical Check (Pg 2)' },
                  { key: 'photos', label: 'Drawing & Photos (Pg 2-3)' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-navy-800 text-navy-800 bg-navy-50'
                        : 'border-transparent text-gray-500 hover:text-navy-800 hover:bg-navy-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <fieldset disabled={readOnly} className="min-w-0 space-y-6">
            {/* ── Electrical Tab ── */}
            {activeTab === 'electrical' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Motor Rows ({form.rows.length})</h3>
                  <button
                    type="button"
                    onClick={addRow}
                    disabled={form.rows.length >= MAX_ROWS}
                    className="flex items-center gap-1 px-3 py-2 sm:py-1.5 border border-navy-100 text-navy-800 rounded-lg hover:bg-navy-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent text-xs font-medium whitespace-nowrap"
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className={TH_CLS}>S. No</th>
                        <th className={TH_CLS}>Motor Sr. No</th>
                        <th className={TH_CLS}>Voltage</th>
                        <th className={TH_CLS}>Current Measured F/R</th>
                        <th className={TH_CLS}>RPM Measured F/R</th>
                        <th className={TH_CLS}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-navy-50">
                        <td className={TD_CLS} colSpan={3}>
                          <span className="font-semibold text-gray-700 text-xs">Specification</span>
                        </td>
                        <td className="py-1 px-1 border border-gray-100">
                          <ToleranceSpecInput
                            label="Current"
                            nominalValue={form.spec_current_standard} onNominalChange={(v) => setField('spec_current_standard', v)} nominalPlaceholder="e.g. 4"
                            mode={form.spec_current_tol_mode} onModeChange={(v) => setField('spec_current_tol_mode', v)}
                            tol={form.spec_current_tol} onTolChange={(v) => setField('spec_current_tol', v)}
                            tolMinus={form.spec_current_tol_minus} onTolMinusChange={(v) => setField('spec_current_tol_minus', v)}
                          />
                        </td>
                        <td className="py-1 px-1 border border-gray-100">
                          <ToleranceSpecInput
                            label="RPM"
                            nominalValue={form.spec_rpm_specified} onNominalChange={(v) => setField('spec_rpm_specified', v)} nominalPlaceholder="e.g. 3000"
                            mode={form.spec_rpm_tol_mode} onModeChange={(v) => setField('spec_rpm_tol_mode', v)}
                            tol={form.spec_rpm_tol} onTolChange={(v) => setField('spec_rpm_tol', v)}
                            tolMinus={form.spec_rpm_tol_minus} onTolMinusChange={(v) => setField('spec_rpm_tol_minus', v)}
                          />
                        </td>
                        <td className="py-1 px-1 border border-gray-100" />
                      </tr>
                      {form.rows.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className={TD_CLS}>{row.sno}</td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.motor_sr_no} onChange={(e) => setRowField(idx, 'motor_sr_no', e.target.value)} aria-label={`Motor ${row.sno} Sr. No.`} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.voltage} onChange={(e) => setRowField(idx, 'voltage', e.target.value)} placeholder="V" inputMode="decimal" aria-label={`Motor ${row.sno} voltage`} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            {(() => {
                              const { forward, reverse } = parseForwardReverse(row.current_measured);
                              const fFlag = checkTolerance(forward, form.spec_current_standard, form.spec_current_tol_mode, form.spec_current_tol, form.spec_current_tol_minus).outOfRange;
                              const rFlag = checkTolerance(reverse, form.spec_current_standard, form.spec_current_tol_mode, form.spec_current_tol, form.spec_current_tol_minus).outOfRange;
                              return (
                                <input
                                  className={`${INPUT_CLS} ${(fFlag || rFlag) ? 'border-red-500 bg-red-50' : ''}`}
                                  value={row.current_measured}
                                  aria-label={`Motor ${row.sno} current measured F/R`}
                                  onChange={(e) => setRowField(idx, 'current_measured', e.target.value)}
                                  placeholder="e.g. 2/4"
                                  title={fFlag && rFlag ? 'Both F/R outside tolerance' : fFlag ? 'Forward (F) outside tolerance' : rFlag ? 'Reverse (R) outside tolerance' : undefined}
                                />
                              );
                            })()}
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            {(() => {
                              const { forward, reverse } = parseForwardReverse(row.rpm_measured);
                              const fFlag = checkTolerance(forward, form.spec_rpm_specified, form.spec_rpm_tol_mode, form.spec_rpm_tol, form.spec_rpm_tol_minus).outOfRange;
                              const rFlag = checkTolerance(reverse, form.spec_rpm_specified, form.spec_rpm_tol_mode, form.spec_rpm_tol, form.spec_rpm_tol_minus).outOfRange;
                              return (
                                <input
                                  className={`${INPUT_CLS} ${(fFlag || rFlag) ? 'border-red-500 bg-red-50' : ''}`}
                                  value={row.rpm_measured}
                                  aria-label={`Motor ${row.sno} RPM measured F/R`}
                                  onChange={(e) => setRowField(idx, 'rpm_measured', e.target.value)}
                                  placeholder="e.g. 2950/2960"
                                  title={fFlag && rFlag ? 'Both F/R outside tolerance' : fFlag ? 'Forward (F) outside tolerance' : rFlag ? 'Reverse (R) outside tolerance' : undefined}
                                />
                              );
                            })()}
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.electrical_remarks} onChange={(e) => setRowField(idx, 'electrical_remarks', e.target.value)} aria-label={`Motor ${row.sno} electrical remarks`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Electrical General Checks */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">General Checks</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className={TH_CLS + ' text-left'}>Check Item</th>
                          <th className={TH_CLS}>Specified</th>
                          <th className={TH_CLS}>Measured</th>
                          <th className={TH_CLS}>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ELECTRICAL_CHECKS.map((c) => (
                          <tr key={c.key} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-sm text-gray-700">{c.label}</td>
                            <td className={TD_CLS}>Go/NG</td>
                            <td className="py-1 px-2 border border-gray-100 text-center">
                              <select
                                className={SELECT_CLS}
                                value={form.general_electrical[c.key].measured}
                                aria-label={`${c.label} measured`}
                                onChange={(e) => setCheck('general_electrical', c.key, 'measured', e.target.value)}
                              >
                                {MEASURED_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="py-1 px-2 border border-gray-100">
                              <input
                                className={INPUT_CLS}
                                value={form.general_electrical[c.key].remarks}
                                aria-label={`${c.label} remarks`}
                                onChange={(e) => setCheck('general_electrical', c.key, 'remarks', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <label htmlFor="pdi-gen-electrical-remarks" className="block text-sm font-medium text-gray-700 mb-1">Electrical Remarks</label>
                  <textarea
                    id="pdi-gen-electrical-remarks"
                    rows={2}
                    className={INPUT_CLS}
                    value={form.electrical_remarks}
                    onChange={(e) => setField('electrical_remarks', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ── Mechanical Tab ── */}
            {activeTab === 'mechanical' && (
              <div className="space-y-5">
                <div className="bg-gold-400/15 border border-gold-400/40 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-gold-600 mb-2">
                    Specification Row (printed in the mechanical table below — free text, varies by product)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="pdi-gen-spec-motor-length" className="block text-xs font-medium text-gray-700 mb-1">Motor Length</label>
                      <ToleranceSpecInput
                        id="pdi-gen-spec-motor-length" label="Motor Length"
                        nominalValue={form.spec_motor_length} onNominalChange={(v) => setField('spec_motor_length', v)} nominalPlaceholder="e.g. 254.4"
                        mode={form.spec_motor_length_tol_mode} onModeChange={(v) => setField('spec_motor_length_tol_mode', v)}
                        tol={form.spec_motor_length_tol} onTolChange={(v) => setField('spec_motor_length_tol', v)}
                        tolMinus={form.spec_motor_length_tol_minus} onTolMinusChange={(v) => setField('spec_motor_length_tol_minus', v)}
                      />
                    </div>
                    <div>
                      <label htmlFor="pdi-gen-spec-shaft-length" className="block text-xs font-medium text-gray-700 mb-1">Shaft Length</label>
                      <ToleranceSpecInput
                        id="pdi-gen-spec-shaft-length" label="Shaft Length"
                        nominalValue={form.spec_shaft_length} onNominalChange={(v) => setField('spec_shaft_length', v)} nominalPlaceholder="e.g. 24.0"
                        mode={form.spec_shaft_length_tol_mode} onModeChange={(v) => setField('spec_shaft_length_tol_mode', v)}
                        tol={form.spec_shaft_length_tol} onTolChange={(v) => setField('spec_shaft_length_tol', v)}
                        tolMinus={form.spec_shaft_length_tol_minus} onTolMinusChange={(v) => setField('spec_shaft_length_tol_minus', v)}
                      />
                    </div>
                    <div>
                      <label htmlFor="pdi-gen-spec-shaft-diameter" className="block text-xs font-medium text-gray-700 mb-1">Shaft Diameter</label>
                      <ToleranceSpecInput
                        id="pdi-gen-spec-shaft-diameter" label="Shaft Diameter"
                        nominalValue={form.spec_shaft_diameter} onNominalChange={(v) => setField('spec_shaft_diameter', v)} nominalPlaceholder="e.g. 12.0"
                        mode={form.spec_shaft_diameter_tol_mode} onModeChange={(v) => setField('spec_shaft_diameter_tol_mode', v)}
                        tol={form.spec_shaft_diameter_tol} onTolChange={(v) => setField('spec_shaft_diameter_tol', v)}
                        tolMinus={form.spec_shaft_diameter_tol_minus} onTolMinusChange={(v) => setField('spec_shaft_diameter_tol_minus', v)}
                      />
                    </div>
                    <div>
                      <label htmlFor="pdi-gen-spec-mounting-pcd" className="block text-xs font-medium text-gray-700 mb-1">PCD</label>
                      <ToleranceSpecInput
                        id="pdi-gen-spec-mounting-pcd" label="PCD"
                        nominalValue={form.spec_mounting_pcd} onNominalChange={(v) => setField('spec_mounting_pcd', v)} nominalPlaceholder="e.g. 152.74"
                        mode={form.spec_mounting_pcd_tol_mode} onModeChange={(v) => setField('spec_mounting_pcd_tol_mode', v)}
                        tol={form.spec_mounting_pcd_tol} onTolChange={(v) => setField('spec_mounting_pcd_tol', v)}
                        tolMinus={form.spec_mounting_pcd_tol_minus} onTolMinusChange={(v) => setField('spec_mounting_pcd_tol_minus', v)}
                      />
                    </div>
                    <div>
                      <label htmlFor="pdi-gen-spec-mtg" className="block text-xs font-medium text-gray-700 mb-1">MTG</label>
                      <input id="pdi-gen-spec-mtg" className={INPUT_CLS} value={form.spec_mtg} onChange={(e) => setField('spec_mtg', e.target.value)} placeholder="e.g. 4*M8" />
                    </div>
                    <div>
                      <label htmlFor="pdi-gen-spec-key-dim" className="block text-xs font-medium text-gray-700 mb-1">Key Dim.</label>
                      <input id="pdi-gen-spec-key-dim" className={INPUT_CLS} value={form.spec_key_dim} onChange={(e) => setField('spec_key_dim', e.target.value)} placeholder="e.g. Go/NG" />
                    </div>
                    <div>
                      <label htmlFor="pdi-gen-spec-locating-dia" className="block text-xs font-medium text-gray-700 mb-1">Locating Dia.</label>
                      <ToleranceSpecInput
                        id="pdi-gen-spec-locating-dia" label="Locating Dia"
                        nominalValue={form.spec_locating_dia} onNominalChange={(v) => setField('spec_locating_dia', v)} nominalPlaceholder="e.g. 50.0"
                        mode={form.spec_locating_dia_tol_mode} onModeChange={(v) => setField('spec_locating_dia_tol_mode', v)}
                        tol={form.spec_locating_dia_tol} onTolChange={(v) => setField('spec_locating_dia_tol', v)}
                        tolMinus={form.spec_locating_dia_tol_minus} onTolMinusChange={(v) => setField('spec_locating_dia_tol_minus', v)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Motor Rows ({form.rows.length})</h3>
                  <button
                    type="button"
                    onClick={addRow}
                    disabled={form.rows.length >= MAX_ROWS}
                    className="flex items-center gap-1 px-3 py-2 sm:py-1.5 border border-navy-100 text-navy-800 rounded-lg hover:bg-navy-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent text-xs font-medium whitespace-nowrap"
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className={TH_CLS}>S. No</th>
                        <th className={TH_CLS}>Motor Sr. No</th>
                        <th className={TH_CLS}>Motor Length</th>
                        <th className={TH_CLS}>Shaft Length</th>
                        <th className={TH_CLS}>Shaft Diameter</th>
                        <th className={TH_CLS}>Mounting PCD</th>
                        <th className={TH_CLS}>MTG</th>
                        <th className={TH_CLS}>Key Dim (Go/NG)</th>
                        <th className={TH_CLS}>Locating Dia</th>
                        <th className={TH_CLS}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.rows.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className={TD_CLS}>{row.sno}</td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.motor_sr_no} onChange={(e) => setRowField(idx, 'motor_sr_no', e.target.value)} aria-label={`Motor ${row.sno} Sr. No.`} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input
                              className={`${INPUT_CLS} ${checkTolerance(row.motor_length, form.spec_motor_length, form.spec_motor_length_tol_mode, form.spec_motor_length_tol, form.spec_motor_length_tol_minus).outOfRange ? 'border-red-500 bg-red-50' : ''}`}
                              value={row.motor_length} onChange={(e) => setRowField(idx, 'motor_length', e.target.value)} inputMode="decimal" aria-label={`Motor ${row.sno} motor length`} placeholder="mm"
                              title={checkTolerance(row.motor_length, form.spec_motor_length, form.spec_motor_length_tol_mode, form.spec_motor_length_tol, form.spec_motor_length_tol_minus).outOfRange ? 'Outside tolerance' : undefined}
                            />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input
                              className={`${INPUT_CLS} ${checkTolerance(row.shaft_length, form.spec_shaft_length, form.spec_shaft_length_tol_mode, form.spec_shaft_length_tol, form.spec_shaft_length_tol_minus).outOfRange ? 'border-red-500 bg-red-50' : ''}`}
                              value={row.shaft_length} onChange={(e) => setRowField(idx, 'shaft_length', e.target.value)} inputMode="decimal" aria-label={`Motor ${row.sno} shaft length`} placeholder="mm"
                              title={checkTolerance(row.shaft_length, form.spec_shaft_length, form.spec_shaft_length_tol_mode, form.spec_shaft_length_tol, form.spec_shaft_length_tol_minus).outOfRange ? 'Outside tolerance' : undefined}
                            />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input
                              className={`${INPUT_CLS} ${checkTolerance(row.shaft_diameter, form.spec_shaft_diameter, form.spec_shaft_diameter_tol_mode, form.spec_shaft_diameter_tol, form.spec_shaft_diameter_tol_minus).outOfRange ? 'border-red-500 bg-red-50' : ''}`}
                              value={row.shaft_diameter} onChange={(e) => setRowField(idx, 'shaft_diameter', e.target.value)} inputMode="decimal" aria-label={`Motor ${row.sno} shaft diameter`} placeholder="mm"
                              title={checkTolerance(row.shaft_diameter, form.spec_shaft_diameter, form.spec_shaft_diameter_tol_mode, form.spec_shaft_diameter_tol, form.spec_shaft_diameter_tol_minus).outOfRange ? 'Outside tolerance' : undefined}
                            />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input
                              className={`${INPUT_CLS} ${checkTolerance(row.mounting_pcd, form.spec_mounting_pcd, form.spec_mounting_pcd_tol_mode, form.spec_mounting_pcd_tol, form.spec_mounting_pcd_tol_minus).outOfRange ? 'border-red-500 bg-red-50' : ''}`}
                              value={row.mounting_pcd} onChange={(e) => setRowField(idx, 'mounting_pcd', e.target.value)} inputMode="decimal" aria-label={`Motor ${row.sno} mounting PCD`} placeholder="153"
                              title={checkTolerance(row.mounting_pcd, form.spec_mounting_pcd, form.spec_mounting_pcd_tol_mode, form.spec_mounting_pcd_tol, form.spec_mounting_pcd_tol_minus).outOfRange ? 'Outside tolerance' : undefined}
                            />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.mtg} onChange={(e) => setRowField(idx, 'mtg', e.target.value)} placeholder="4*M8" aria-label={`Motor ${row.sno} MTG`} />
                          </td>
                          <td className="py-1 px-2 border border-gray-100 text-center">
                            <select className={SELECT_CLS} value={row.key_dim_result} onChange={(e) => setRowField(idx, 'key_dim_result', e.target.value)} aria-label={`Motor ${row.sno} key dim result`}>
                              {['GO', 'NG'].map((o) => <option key={o}>{o}</option>)}
                            </select>
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input
                              className={`${INPUT_CLS} ${checkTolerance(row.locating_dia_result, form.spec_locating_dia, form.spec_locating_dia_tol_mode, form.spec_locating_dia_tol, form.spec_locating_dia_tol_minus).outOfRange ? 'border-red-500 bg-red-50' : ''}`}
                              value={row.locating_dia_result} onChange={(e) => setRowField(idx, 'locating_dia_result', e.target.value)} inputMode="decimal" aria-label={`Motor ${row.sno} locating dia`} placeholder="mm"
                              title={checkTolerance(row.locating_dia_result, form.spec_locating_dia, form.spec_locating_dia_tol_mode, form.spec_locating_dia_tol, form.spec_locating_dia_tol_minus).outOfRange ? 'Outside tolerance' : undefined}
                            />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.mechanical_remarks} onChange={(e) => setRowField(idx, 'mechanical_remarks', e.target.value)} aria-label={`Motor ${row.sno} mechanical remarks`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mechanical General Checks */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">General Checks</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                    <div>
                      <label htmlFor="pdi-gen-power-cable" className="block text-sm font-medium text-gray-700 mb-1">Power Cable Length</label>
                      <input
                        id="pdi-gen-power-cable"
                        className={INPUT_CLS}
                        value={form.power_cable_length}
                        onChange={(e) => setField('power_cable_length', e.target.value)}
                        placeholder="e.g. 1250±50mm"
                      />
                    </div>
                    <div>
                      <label htmlFor="pdi-gen-sensor-cable" className="block text-sm font-medium text-gray-700 mb-1">Sensor Cable Length</label>
                      <input
                        id="pdi-gen-sensor-cable"
                        className={INPUT_CLS}
                        value={form.sensor_cable_length}
                        onChange={(e) => setField('sensor_cable_length', e.target.value)}
                        placeholder="e.g. 1250±50mm"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className={TH_CLS + ' text-left'}>Check Item</th>
                          <th className={TH_CLS}>Specified</th>
                          <th className={TH_CLS}>Measured</th>
                          <th className={TH_CLS}>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MECHANICAL_CHECKS.map((c) => (
                          <tr key={c.key} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-sm text-gray-700">{mechanicalCheckLabel(c, form)}</td>
                            <td className={TD_CLS}>Go/NG</td>
                            <td className="py-1 px-2 border border-gray-100 text-center">
                              <select
                                className={SELECT_CLS}
                                value={form.general_mechanical[c.key].measured}
                                aria-label={`${c.label} measured`}
                                onChange={(e) => setCheck('general_mechanical', c.key, 'measured', e.target.value)}
                              >
                                {MEASURED_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="py-1 px-2 border border-gray-100">
                              <input
                                className={INPUT_CLS}
                                value={form.general_mechanical[c.key].remarks}
                                aria-label={`${c.label} remarks`}
                                onChange={(e) => setCheck('general_mechanical', c.key, 'remarks', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <label htmlFor="pdi-gen-mechanical-remarks" className="block text-sm font-medium text-gray-700 mb-1">Mechanical Remarks</label>
                  <textarea
                    id="pdi-gen-mechanical-remarks"
                    rows={2}
                    className={INPUT_CLS}
                    value={form.mechanical_remarks}
                    onChange={(e) => setField('mechanical_remarks', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ── Photos Tab ── */}
            {activeTab === 'photos' && (
              <div className="space-y-5">
                <ImageUploadCard
                  label="Technical Drawing (Pg 2)"
                  hint="Shown in the Mechanical Check sheet's drawing box. Leave blank to keep the text placeholder."
                  images={form.drawing_image ? [form.drawing_image] : []}
                  maxImages={1}
                  onFilesSelected={(fileList) => handleFilesChosen({ type: 'drawing' }, fileList)}
                  onRemove={() => setField('drawing_image', null)}
                  heightCls="h-28"
                  disabled={readOnly}
                />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700">Photos (Pg 3)</h3>
                      <p className="text-xs text-gray-400">On mobile, tap a slot to take a photo or choose one — you&rsquo;ll crop it next. Add as many as this inspection needs.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addPhoto}
                      disabled={form.photos.length >= MAX_PHOTOS}
                      className="flex items-center gap-1 px-3 py-2 sm:py-1.5 border border-navy-100 text-navy-800 rounded-lg hover:bg-navy-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent text-xs font-medium whitespace-nowrap"
                    >
                      <Plus size={14} /> Add Photo
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {form.photos.map((photo, idx) => (
                      <div key={photo.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            className={INPUT_CLS}
                            value={photo.label}
                            onChange={(e) => setPhotoLabel(photo.id, e.target.value)}
                            placeholder={`Photo ${idx + 1} label`}
                            aria-label={`Photo ${idx + 1} label`}
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(photo.id)}
                            className="shrink-0 p-1.5 text-gray-400 hover:text-red-500"
                            title="Remove this photo slot"
                            aria-label={`Remove photo slot ${idx + 1}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <ImageUploadCard
                          images={photo.images || []}
                          onFilesSelected={(fileList) => handleFilesChosen({ type: 'photo', id: photo.id }, fileList)}
                          onRemove={(imgIdx) => removePhotoImage(photo.id, imgIdx)}
                          heightCls="h-32"
                          disabled={readOnly}
                          maxImages={MAX_IMAGES_PER_SLOT}
                        />
                      </div>
                    ))}
                  </div>
                  {form.photos.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                      No photos added. Click &ldquo;Add Photo&rdquo; above.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Signatures ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <div>
                <label htmlFor="pdi-gen-prepared-by" className="block text-sm font-medium text-gray-700 mb-1">Prepared By</label>
                <input id="pdi-gen-prepared-by" className={INPUT_CLS} value={form.prepared_by} onChange={(e) => setField('prepared_by', e.target.value)} placeholder="Name / Designation" />
              </div>
              <div>
                <label htmlFor="pdi-gen-approved-by" className="block text-sm font-medium text-gray-700 mb-1">Approved By</label>
                <input id="pdi-gen-approved-by" className={INPUT_CLS} value={form.approved_by} onChange={(e) => setField('approved_by', e.target.value)} placeholder="Name / Designation" />
              </div>
            </div>
            </fieldset>
          </div>

          {/* Modal footer */}
          <div className="grid grid-cols-2 sm:flex sm:justify-between gap-3 px-4 sm:px-8 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            {readOnly ? (
              lotBackPath ? (
                <button
                  type="button"
                  onClick={() => navigate(lotBackPath)}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm font-semibold"
                >
                  &larr; Back to lot
                </button>
              ) : <span />
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || hasConflict}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 text-sm font-semibold"
              >
                {saving ? 'Saving...' : isCompleted ? 'Save changes' : 'Save'}
              </button>
            )}
            <div className="contents sm:flex sm:gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 text-sm"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {(isCompleted || lotFinalized) && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloading || busy}
                  className="col-span-2 sm:col-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 text-sm font-semibold"
                >
                  <Download size={16} />
                  {downloading ? 'Downloading...' : 'Download PDF'}
                </button>
              )}
              {!readOnly && !isCompleted && (
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
          key={cropTarget.seq}
          imageSrc={cropTarget.imageSrc}
          onCancel={cancelCrop}
          onApply={applyCroppedImage}
          onSkip={skipCrop}
        />
      )}
    </div>
  );
}
