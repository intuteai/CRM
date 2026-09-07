import { useState, useRef, useCallback, useEffect } from 'react';
import Modal from 'react-modal';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText, ClipboardCheck, Image as ImageIcon, X, Camera } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

Modal.setAppElement('#root');

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

// Same image pipeline as PDIGeneratorForm.jsx (General's form) — duplicated
// rather than shared, matching this project's deliberate choice to keep each
// PDI template's form as its own standalone component (see the PDI template
// engine design spec's Phase 1 scope decision).
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

// ── AutoNXT's fixed row/section definitions — keys MUST match
// CRM_BACKEND/models/operations/pdi/templates/autonxt.js exactly, since
// they're the object keys the PDF renderer looks values up by. ──
const PERFORMANCE_ROWS = [
  { key: 'rpm_500',  rpm: 500,  sourceVoltage: '560V', bemfSpec: '79.0±3%',  currentSpec: '6.0±2.0A' },
  { key: 'rpm_1000', rpm: 1000, sourceVoltage: '560V', bemfSpec: '155.0±3%', currentSpec: '6.0±2.0A' },
  { key: 'rpm_1500', rpm: 1500, sourceVoltage: '560V', bemfSpec: '227.0±3%', currentSpec: '3.0±1.0A' },
  { key: 'rpm_1800', rpm: 1800, sourceVoltage: '560V', bemfSpec: '270.0±3%', currentSpec: '3.0±1.0A' },
  { key: 'rpm_2000', rpm: 2000, sourceVoltage: '560V', bemfSpec: '-', currentSpec: '-' },
  { key: 'rpm_2200', rpm: 2200, sourceVoltage: '560V', bemfSpec: '-', currentSpec: '-' },
  { key: 'rpm_2500', rpm: 2500, sourceVoltage: '560V', bemfSpec: '-', currentSpec: '-' },
  { key: 'rpm_3000', rpm: 3000, sourceVoltage: '560V', bemfSpec: '-', currentSpec: '-' },
];

const GENERAL_CHECK_ROWS = [
  { key: 'shield_plate',     label: 'Shield Plate check',                spec: 'Go/NG',                   method: 'VI' },
  { key: 'shield_grounding', label: 'Shield Grounding',                  spec: 'Go/NG',                   method: 'VI' },
  { key: 'power_conn_insul', label: 'Power connector Insulation Check',  spec: 'Go/NG',                   method: 'MM, Test Report' },
  { key: 'phase_resistance', label: 'Phase Resistance check',            spec: 'Go/NG',                   method: 'Ohmmeter' },
  { key: 'motor_insulation', label: 'Motor Insulation Check',            spec: 'Go/NG',                   method: 'MM, Test Report' },
  { key: 'temp_sensor',      label: 'Temp. Sensor check',                spec: 'Go/NG',                   method: 'MM, Test Report' },
  { key: 'high_voltage',     label: 'High Voltage Breakdown Test',       spec: 'Tested Upto 1200V Go/NG', method: 'Megger' },
];

const PHYSICAL_PARAM_ROWS = [
  { key: 'motor_total_length', label: 'Motor Total Length (Incl.Hyd.Mtg)',        spec: '467.5±1.0',                               method: 'DVC' },
  { key: 'shaft_op_length',    label: 'Shaft O/P Length from Mounting Surface',   spec: '10.0±0.5',                                method: 'DVC' },
  { key: 'shaft_flange_mtg',   label: 'Shaft Flange Mtg.',                       spec: 'PCD Ø63.0, 06Nos M10, Depth 25.0, Go/NG', method: 'DVC' },
  { key: 'locating_dia',       label: 'Locating Dia.',                           spec: 'Ø180.0 (-0.01 TO -0.05)',                 method: 'DVC' },
  { key: 'mounting_details',   label: 'Mounting Details.',                       spec: 'PCD Ø215.0, 08Nos M12 Depth25.0',         method: 'Gauge, DVC' },
  { key: 'hyd_mtg_shaft_dia',  label: 'Hyd. Mtg Shaft Dia.',                     spec: 'Ø28.0, L32.0',                            method: 'DVC' },
  { key: 'hyd_mtg_keyway',     label: 'Hyd. Mtg Keyway',                         spec: '(LxWxD)25x8x4',                           method: 'DVC' },
  { key: 'hyd_mtg_bracket',    label: 'Hyd. Mtg Bracket Mtg. holes',             spec: 'PCDØ160.0mm, 08Nos M6, Depth15.0',        method: 'DVC, Gauge' },
  { key: 'm6_insert',          label: 'M6 Insert Check',                         spec: 'Go/NG',                                   method: 'VI' },
  { key: 'power_conn_lock',    label: 'Motor Power connector Lock check',        spec: 'Go/NG',                                   method: 'VI' },
  { key: 'power_cable_length', label: 'Motor Power cable Length',                spec: '1400 mm',                                 method: 'MT' },
  { key: 'temp_sensor_cable',  label: 'Temp. Sensor Cable Length',               spec: '1400 mm',                                 method: 'MT' },
  { key: 'lc_connector',       label: 'LC Connector Check',                      spec: 'Go/NG',                                   method: 'VI' },
  { key: 'lc_leakage',         label: 'LC Leakage Test',                         spec: 'Go/NG',                                   method: 'VI' },
  { key: 'power_gland_pull',   label: 'Power Cable Gland Pull Check',            spec: 'Go/NG',                                   method: 'VI' },
  { key: 'bolting_check',      label: 'Bolting check',                           spec: 'Go/NG',                                   method: 'VI' },
  { key: 'rear_mtg_bracket',   label: 'Rear Mtg Bracket',                        spec: 'Go/NG',                                   method: 'VI' },
  { key: 'resolver_connector', label: 'Resolver connector check',                spec: 'Go/NG',                                   method: 'VI' },
  { key: 'front_oil_seal',     label: 'Front Oil Seal Check',                    spec: 'Go/NG',                                   method: 'VI' },
  { key: 'rear_oil_seal',      label: 'Rear Oil Seal Check',                     spec: 'Go/NG',                                   method: 'VI' },
  { key: 'resolver_gland',     label: 'Resolver Gland Pull Check',               spec: 'Go/NG',                                   method: 'VI' },
  { key: 'noise',              label: 'Noise',                                   spec: 'No Abnormal Noise',                       method: 'DM, VI' },
  { key: 'm12_insert',         label: 'M12 Insert Check',                        spec: 'Go/NG',                                   method: 'VI' },
  { key: 'name_plate',         label: 'Name Plate',                              spec: 'Go/NG',                                   method: 'VI' },
  { key: 'physical_damage',    label: 'Physical Damage',                         spec: 'No Breaks, Cracks etc.,',                 method: 'VI' },
];

const PHOTO_SLOTS = [
  { key: 'overall_motor', label: 'Overall Motor Photo' },
  { key: 'name_plate', label: 'Motor Name Plate' },
  { key: 'sr_no_marked', label: 'Motor Sr. No Punched / Marked on Body' },
  { key: 'power_cable_shielding', label: 'Power Cable shielding' },
  { key: 'resolver_cable', label: 'Resolver cable Shielding and Connector' },
  { key: 'front_rear_view', label: 'Motor Front view/ Rear View' },
];

const MEASURED_OPTIONS = ['GO', 'NG', 'NA'];

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

const initChecklist = (rows) => Object.fromEntries(rows.map((r) => [r.key, { measured: 'GO' }]));

const defaultForm = () => ({
  customer_name: '', date: todayIST(), product_id: '', drawing_no: '',
  product_specifications: '', pdi_no: '', motor_sr_no: '', controller_type: '',
  performance_test: Object.fromEntries(
    PERFORMANCE_ROWS.map((r) => [r.key, { bemf_measured: '', current_measured: '' }])
  ),
  general_check: initChecklist(GENERAL_CHECK_ROWS),
  physical_parameters: initChecklist(PHYSICAL_PARAM_ROWS),
  page1_remarks: 'ALL OK, PASSED.',
  page2_remarks: 'ALL OK, PASSED.',
  prepared_by_electrical: '', prepared_by_mechanical: '', approved_by: '',
  photos: Object.fromEntries(PHOTO_SLOTS.map((s) => [s.key, null])),
});

const INPUT_CLS =
  'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const SELECT_CLS =
  'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-gray-700 bg-amber-100 border border-gray-200 whitespace-nowrap';
const TD_CLS = 'py-1 px-1 border border-gray-100 text-sm text-gray-500 text-center';

function ImageUploadCard({ label, hint, value, onSelect, onClear, heightCls = 'h-32' }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      <div className={`relative rounded-lg border-2 border-dashed bg-gray-50 ${heightCls} flex items-center justify-center overflow-hidden ${value ? 'border-gray-200' : 'border-gray-300'}`}>
        {value ? (
          <>
            <img src={value} alt={label || 'Uploaded'} className="max-h-full max-w-full object-contain" />
            <button
              type="button"
              onClick={onClear}
              className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full shadow hover:bg-white text-gray-600 hover:text-red-500"
              title="Remove image"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-5 text-gray-400">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 hover:text-amber-500 transition-colors"
            >
              <Camera size={22} />
              <span className="text-xs font-medium">Take Photo</span>
            </button>
            <div className="w-px h-9 bg-gray-200" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 hover:text-amber-500 transition-colors"
            >
              <ImageIcon size={22} />
              <span className="text-xs font-medium">Choose File</span>
            </button>
          </div>
        )}
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0], e.target)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0], e.target)}
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
      overlayClassName="fixed inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center z-[60] p-4"
      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto outline-none"
      contentLabel="Crop Image"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-800">Adjust photo</h3>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
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
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !croppedAreaPixels}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-semibold"
          >
            {busy ? 'Processing...' : 'Apply'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AutoNXTGeneratorForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('performance');
  const [form, setForm] = useState(defaultForm);
  const [reportId, setReportId] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
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
        setForm({
          ...base,
          ...(report.data || {}),
          photos: report.photos && typeof report.photos === 'object' && !Array.isArray(report.photos)
            ? { ...base.photos, ...report.photos }
            : base.photos,
        });
        setReportId(report.report_id);
        setHasSaved(true);
        setActiveTab('performance');
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

  const [cropTarget, setCropTarget] = useState(null); // { slotKey, imageSrc }

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

  const applyCroppedImage = useCallback((dataUri) => {
    setCropTarget((current) => {
      if (!current) return current;
      setForm((prev) => ({ ...prev, photos: { ...prev.photos, [current.slotKey]: dataUri } }));
      return null;
    });
  }, []);

  const cancelCrop = useCallback(() => setCropTarget(null), []);
  const clearPhotoImage = useCallback((slotKey) => {
    setForm((prev) => ({ ...prev, photos: { ...prev.photos, [slotKey]: null } }));
  }, []);

  const handleOpen = async () => {
    if (opening) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setOpening(true);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/reports`, { template_id: 'autonxt' }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReportId(response.data.report_id);
      setHasSaved(false);
      setForm(defaultForm());
      setActiveTab('performance');
      setIsOpen(true);
    } catch (err) {
      notifyError(err.response?.data?.error || 'Could not start a new PDI report.');
    } finally {
      setOpening(false);
    }
  };

  // Dashboard "Inspected By" reflects who actually prepared the inspection —
  // AutoNXT has two preparer roles (electrical/mechanical), so combine
  // whichever are filled in, matching General's prepared_by-sync pattern
  // adapted for a 2-preparer format. Falls back to undefined (not blank
  // string) when neither is filled, so it doesn't overwrite an existing
  // saved value server-side (see patchReport's `!== undefined` check).
  const inspectedByValue = () => {
    const names = [form.prepared_by_electrical, form.prepared_by_mechanical]
      .map((s) => (s || '').trim())
      .filter(Boolean);
    return names.length ? names.join(' / ') : undefined;
  };

  const handleSave = async () => {
    if (!reportId) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setSaving(true);
    try {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">
        AutoNXT PDI Generator
      </h1>

      <div className="max-w-3xl mx-auto">
        <div
          onClick={handleOpen}
          className="bg-white rounded-2xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow border-2 border-dashed border-amber-300 flex items-center gap-6"
        >
          <div className="p-4 bg-amber-100 rounded-xl">
            <ClipboardCheck size={40} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">New AutoNXT Pre-Dispatch Inspection</h2>
            <p className="text-gray-500 mt-1">
              Fill in motor test data and generate a 3-page PDI report PDF (Format No: CASPL/QA/F/23)
            </p>
            <span className="inline-block mt-3 px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium">
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
        overlayClassName="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-start justify-center z-50 overflow-y-auto py-8"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 outline-none"
        contentLabel="AutoNXT PDI Generator Form"
      >
        <form onSubmit={handleFinalize}>
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <FileText className="text-amber-500" size={24} />
              <div>
                <h2 className="text-xl font-bold text-gray-800">Pre-Dispatch Inspection (PDI) — AutoNXT</h2>
                <p className="text-xs text-gray-400">Format No: CASPL/QA/F/23 · Rev. No:00 · Eff. Dt:30/03/2024 · Rev Dt:11/10/2024</p>
              </div>
            </div>
            <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

          <div className="px-8 py-6 space-y-6 max-h-[80vh] overflow-y-auto">

            {/* ── Header fields ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name <span className="text-red-500">*</span></label>
                <input className={INPUT_CLS} value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} placeholder="e.g. Autonxt" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" className={INPUT_CLS} value={form.date} onChange={(e) => setField('date', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                <input className={INPUT_CLS} value={form.product_id} onChange={(e) => setField('product_id', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Drawing No.</label>
                <input className={INPUT_CLS} value={form.drawing_no} onChange={(e) => setField('drawing_no', e.target.value)} placeholder="e.g. CASPL-220/007-00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Specifications</label>
                <input className={INPUT_CLS} value={form.product_specifications} onChange={(e) => setField('product_specifications', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDI No. <span className="text-red-500">*</span></label>
                <input className={INPUT_CLS} value={form.pdi_no} onChange={(e) => setField('pdi_no', e.target.value)} placeholder="e.g. CASPL-QA-PDI-001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motor Sr.No</label>
                <input className={INPUT_CLS} value={form.motor_sr_no} onChange={(e) => setField('motor_sr_no', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Controller Type</label>
                <input className={INPUT_CLS} value={form.controller_type} onChange={(e) => setField('controller_type', e.target.value)} />
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="border-b border-gray-200">
              <nav className="flex gap-1">
                {[
                  { key: 'performance', label: 'Performance & General Check (Pg 1)' },
                  { key: 'physical', label: 'Physical Parameters (Pg 2)' },
                  { key: 'photos', label: 'Photos (Pg 3)' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-amber-500 text-amber-600 bg-amber-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* ── Performance & General Check Tab ── */}
            {activeTab === 'performance' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">A. Performance Test @ No Load</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          <th className={TH_CLS}>RPM</th>
                          <th className={TH_CLS}>Source V (DC)</th>
                          <th className={TH_CLS}>BEMF Spec</th>
                          <th className={TH_CLS}>BEMF Measured</th>
                          <th className={TH_CLS}>Current Spec</th>
                          <th className={TH_CLS}>Current Measured</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PERFORMANCE_ROWS.map((row, idx) => (
                          <tr key={row.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className={TD_CLS}>{row.rpm}</td>
                            <td className={TD_CLS}>{row.sourceVoltage}</td>
                            <td className={TD_CLS}>{row.bemfSpec}</td>
                            <td className="py-1 px-1 border border-gray-100">
                              <input
                                className={INPUT_CLS}
                                value={form.performance_test[row.key].bemf_measured}
                                onChange={(e) => setChecklistField('performance_test', row.key, 'bemf_measured', e.target.value)}
                              />
                            </td>
                            <td className={TD_CLS}>{row.currentSpec}</td>
                            <td className="py-1 px-1 border border-gray-100">
                              <input
                                className={INPUT_CLS}
                                value={form.performance_test[row.key].current_measured}
                                onChange={(e) => setChecklistField('performance_test', row.key, 'current_measured', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">B. General Check</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
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
                        {GENERAL_CHECK_ROWS.map((row) => (
                          <tr key={row.key} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-sm text-gray-700">{row.label}</td>
                            <td className={TD_CLS}>{row.spec}</td>
                            <td className={TD_CLS}>{row.method}</td>
                            <td className="py-1 px-2 border border-gray-100 text-center">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Page 1 Remarks</label>
                  <textarea
                    rows={2}
                    className={INPUT_CLS}
                    value={form.page1_remarks}
                    onChange={(e) => setField('page1_remarks', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ── Physical Parameters Tab ── */}
            {activeTab === 'physical' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">C. Physical Parameters</h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
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
                        {PHYSICAL_PARAM_ROWS.map((row) => (
                          <tr key={row.key} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-sm text-gray-700">{row.label}</td>
                            <td className={TD_CLS}>{row.spec}</td>
                            <td className={TD_CLS}>{row.method}</td>
                            <td className="py-1 px-2 border border-gray-100 text-center">
                              <select
                                className={SELECT_CLS}
                                value={form.physical_parameters[row.key].measured}
                                onChange={(e) => setChecklistField('physical_parameters', row.key, 'measured', e.target.value)}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Page 2 Remarks</label>
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
                <p className="text-xs text-gray-400">Tap a slot to take a photo or choose one — you&rsquo;ll crop it next.</p>
                <div className="grid grid-cols-2 gap-4">
                  {PHOTO_SLOTS.map((slot) => (
                    <ImageUploadCard
                      key={slot.key}
                      label={slot.label}
                      value={form.photos[slot.key]}
                      onSelect={(file, el) => handleFileChosen(slot.key, file, el)}
                      onClear={() => clearPhotoImage(slot.key)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Signatures (3-way: Electrical + Mechanical preparers, one approver) ── */}
            <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prepared By - Electrical</label>
                <input className={INPUT_CLS} value={form.prepared_by_electrical} onChange={(e) => setField('prepared_by_electrical', e.target.value)} placeholder="Name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prepared By - Mechanical</label>
                <input className={INPUT_CLS} value={form.prepared_by_mechanical} onChange={(e) => setField('prepared_by_mechanical', e.target.value)} placeholder="Name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Approved By</label>
                <input className={INPUT_CLS} value={form.approved_by} onChange={(e) => setField('approved_by', e.target.value)} placeholder="Name" />
              </div>
            </div>
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
      </Modal>

      {cropTarget && (
        <CropModal imageSrc={cropTarget.imageSrc} onCancel={cancelCrop} onApply={applyCroppedImage} />
      )}
    </div>
  );
}
