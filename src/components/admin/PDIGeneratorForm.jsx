import React, { useState, useRef, useCallback, useEffect } from 'react';
import Modal from 'react-modal';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { Download, FileText, ClipboardCheck, Image as ImageIcon, X, Trash2, Plus } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

Modal.setAppElement('#root');

const API_URL = import.meta.env.VITE_BACKEND_URL || '';

// Every image goes through crop + client-side compression before upload (see
// cropAndCompress below), so the *sent* payload stays small regardless of
// source size — this raw cap is just a backstop against absurd files before
// we even try to decode them. server.js's JSON body limit (25mb) is sized
// for MAX_PHOTOS compressed photos plus the drawing image.
const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PHOTOS = 12;
const CROP_ASPECT = 4 / 3; // matches the printed photo box shape (see pdi_generator.js drawPhotoCell)
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.85;

let photoIdCounter = 0;
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
  // Electrical
  voltage: '',
  current_standard: '',
  current_measured: '',
  rpm_specified: '',
  rpm_measured: '',
  electrical_remarks: '',
  // Mechanical
  motor_length: '',
  shaft_length: '',
  mounting_pcd: '',
  key_dim_result: 'GO',
  locating_dia_result: 'GO',
  mechanical_remarks: '',
});

const todayIST = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

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
  pdi_no: '',
  prepared_by: '',
  approved_by: '',
  electrical_remarks: 'ALL MOTORS OK, PASSED.',
  mechanical_remarks: 'ALL MOTORS OK, PASSED.',
  power_cable_length: '1250±50mm',
  sensor_cable_length: '1250±50mm',
  // Mechanical table's "Specification" row — manual entry, varies by product
  spec_motor_length: '',
  spec_shaft_length: '',
  spec_mounting_pcd: '153',
  spec_mtg: '1.M6 / 2.Ø8.0',
  spec_key_dim: 'Go/NG',
  spec_locating_dia: '50.0 mm',
  drawing_image: null,
  photos: [
    { id: makePhotoId(), label: 'Overall Motor', image: null },
    { id: makePhotoId(), label: 'Name Plate', image: null },
  ],
  rows: Array.from({ length: 20 }, (_, i) => makeRow(i + 1)),
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

const INPUT_CLS =
  'w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const SELECT_CLS =
  'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-gray-700 bg-amber-100 border border-gray-200 whitespace-nowrap';
const TD_CLS = 'py-1 px-1 border border-gray-100 text-sm text-gray-500 text-center';

function ImageUploadCard({ label, hint, value, onSelect, onClear, heightCls = 'h-40' }) {
  const inputRef = useRef(null);
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
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 text-gray-400 hover:text-amber-500 transition-colors"
          >
            <ImageIcon size={28} />
            <span className="text-xs font-medium">Click to upload</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0], e.target)}
      />
    </div>
  );
}

// Drag-to-crop + pinch-zoom overlay shown after a file is picked, before it's
// attached to the form. Crops to CROP_ASPECT then hands the result to onApply
// as a compressed JPEG data URI (see cropAndCompress).
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

export default function PDIGeneratorForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('electrical');
  const [form, setForm] = useState(defaultForm);
  const { notifySuccess, notifyError } = useNotify();
  const abortRef = useRef(null);

  // Cancel any in-flight request if the component unmounts
  useEffect(() => () => { abortRef.current?.abort(); }, []);

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

  const setCheck = useCallback((type, key, subfield, value) => {
    setForm((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: { ...prev[type][key], [subfield]: value } },
    }));
  }, []);

  // { type: 'drawing' } or { type: 'photo', id } identifying where a crop
  // result should land, plus the source image being cropped.
  const [cropTarget, setCropTarget] = useState(null);

  const handleFileChosen = useCallback(async (target, file, inputEl) => {
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
      setCropTarget({ target, imageSrc: dataUri });
    } catch {
      notifyError('Failed to read image file.');
    } finally {
      if (inputEl) inputEl.value = '';
    }
  }, [notifyError]);

  const applyCroppedImage = useCallback((dataUri) => {
    setCropTarget((current) => {
      if (!current) return current;
      const { target } = current;
      if (target.type === 'drawing') {
        setField('drawing_image', dataUri);
      } else {
        setForm((prev) => ({
          ...prev,
          photos: prev.photos.map((p) => (p.id === target.id ? { ...p, image: dataUri } : p)),
        }));
      }
      return null;
    });
  }, [setField]);

  const cancelCrop = useCallback(() => setCropTarget(null), []);

  const addPhoto = useCallback(() => {
    setForm((prev) => (
      prev.photos.length >= MAX_PHOTOS
        ? prev
        : { ...prev, photos: [...prev.photos, { id: makePhotoId(), label: '', image: null }] }
    ));
  }, []);

  const removePhoto = useCallback((id) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== id) }));
  }, []);

  const setPhotoLabel = useCallback((id, label) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.map((p) => (p.id === id ? { ...p, label } : p)) }));
  }, []);

  const clearPhotoImage = useCallback((id) => {
    setForm((prev) => ({ ...prev, photos: prev.photos.map((p) => (p.id === id ? { ...p, image: null } : p)) }));
  }, []);

  const handleOpen = () => {
    setForm(defaultForm());
    setActiveTab('electrical');
    setIsOpen(true);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!form.customer_name.trim()) { notifyError('Customer name is required.'); return; }
    if (!form.pdi_no.trim()) { notifyError('PDI No. is required.'); return; }

    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/pdi/generate`, form, {
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
      notifySuccess('PDI PDF downloaded successfully.');
      setIsOpen(false);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      // When responseType is 'blob', error bodies arrive as Blobs — parse them back
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          notifyError(parsed.error || text || 'Failed to generate PDI PDF.');
        } catch {
          notifyError('Failed to generate PDI PDF.');
        }
      } else {
        notifyError(err.response?.data?.error || 'Failed to generate PDI PDF.');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleClose = () => {
    if (abortRef.current) abortRef.current.abort();
    setIsOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">
        PDI Generator
      </h1>

      <div className="max-w-3xl mx-auto">
        {/* Info card */}
        <div
          onClick={handleOpen}
          className="bg-white rounded-2xl shadow-lg p-8 cursor-pointer hover:shadow-xl transition-shadow border-2 border-dashed border-amber-300 flex items-center gap-6"
        >
          <div className="p-4 bg-amber-100 rounded-xl">
            <ClipboardCheck size={40} className="text-amber-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">New Pre-Dispatch Inspection</h2>
            <p className="text-gray-500 mt-1">
              Fill in motor data and generate a 3-page PDI report PDF (Format No: CASPL/QA/F/14)
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
        contentLabel="PDI Generator Form"
      >
        <form onSubmit={handleGenerate}>
          {/* Modal header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <FileText className="text-amber-500" size={24} />
              <div>
                <h2 className="text-xl font-bold text-gray-800">Pre-Dispatch Inspection (PDI)</h2>
                <p className="text-xs text-gray-400">Format No: CASPL/QA/F/14 · Rev. No:00 · Eff. Dt:01/01/2022</p>
              </div>
            </div>
            <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
          </div>

          <div className="px-8 py-6 space-y-6 max-h-[80vh] overflow-y-auto">

            {/* ── Header fields ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name <span className="text-red-500">*</span></label>
                <input className={INPUT_CLS} value={form.customer_name} onChange={(e) => setField('customer_name', e.target.value)} placeholder="e.g. ABC Industries" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" className={INPUT_CLS} value={form.date} onChange={(e) => setField('date', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                <input className={INPUT_CLS} value={form.product_id} onChange={(e) => setField('product_id', e.target.value)} placeholder="e.g. 125-M" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Drawing No.</label>
                <input className={INPUT_CLS} value={form.drawing_no} onChange={(e) => setField('drawing_no', e.target.value)} placeholder="e.g. DWG-001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Specifications</label>
                <input className={INPUT_CLS} value={form.product_specifications} onChange={(e) => setField('product_specifications', e.target.value)} placeholder="e.g. 48V BLDC Motor" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PDI No. <span className="text-red-500">*</span></label>
                <input className={INPUT_CLS} value={form.pdi_no} onChange={(e) => setField('pdi_no', e.target.value)} placeholder="e.g. PDI-2024-001" />
              </div>
            </div>

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
                        ? 'border-amber-500 text-amber-600 bg-amber-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* ── Electrical Tab ── */}
            {activeTab === 'electrical' && (
              <div className="space-y-5">
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className={TH_CLS}>S. No</th>
                        <th className={TH_CLS}>Motor Sr. No</th>
                        <th className={TH_CLS}>Voltage</th>
                        <th className={TH_CLS}>Current Std (F)</th>
                        <th className={TH_CLS}>Current Measured (F)</th>
                        <th className={TH_CLS}>RPM Specified (F)</th>
                        <th className={TH_CLS}>RPM Measured (F)</th>
                        <th className={TH_CLS}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.rows.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className={TD_CLS}>{row.sno}</td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.motor_sr_no} onChange={(e) => setRowField(idx, 'motor_sr_no', e.target.value)} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.voltage} onChange={(e) => setRowField(idx, 'voltage', e.target.value)} placeholder="V" />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.current_standard} onChange={(e) => setRowField(idx, 'current_standard', e.target.value)} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.current_measured} onChange={(e) => setRowField(idx, 'current_measured', e.target.value)} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.rpm_specified} onChange={(e) => setRowField(idx, 'rpm_specified', e.target.value)} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.rpm_measured} onChange={(e) => setRowField(idx, 'rpm_measured', e.target.value)} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.electrical_remarks} onChange={(e) => setRowField(idx, 'electrical_remarks', e.target.value)} />
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
                                onChange={(e) => setCheck('general_electrical', c.key, 'measured', e.target.value)}
                              >
                                {MEASURED_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="py-1 px-2 border border-gray-100">
                              <input
                                className={INPUT_CLS}
                                value={form.general_electrical[c.key].remarks}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Electrical Remarks</label>
                  <textarea
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
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <h3 className="text-xs font-semibold text-amber-800 mb-2">
                    Specification Row (printed in the mechanical table below — free text, varies by product)
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Motor Length</label>
                      <input className={INPUT_CLS} value={form.spec_motor_length} onChange={(e) => setField('spec_motor_length', e.target.value)} placeholder="e.g. 254.4±0.5mm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Shaft O/P Dia./Length</label>
                      <input className={INPUT_CLS} value={form.spec_shaft_length} onChange={(e) => setField('spec_shaft_length', e.target.value)} placeholder="e.g. 24.0 mm/53.3 mm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">PCD</label>
                      <input className={INPUT_CLS} value={form.spec_mounting_pcd} onChange={(e) => setField('spec_mounting_pcd', e.target.value)} placeholder="e.g. 152.74" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">MTG</label>
                      <input className={INPUT_CLS} value={form.spec_mtg} onChange={(e) => setField('spec_mtg', e.target.value)} placeholder="e.g. 4*M8" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Key Dim.</label>
                      <input className={INPUT_CLS} value={form.spec_key_dim} onChange={(e) => setField('spec_key_dim', e.target.value)} placeholder="e.g. Go/NG" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Locating Dia.</label>
                      <input className={INPUT_CLS} value={form.spec_locating_dia} onChange={(e) => setField('spec_locating_dia', e.target.value)} placeholder="e.g. 50.0 mm" />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className={TH_CLS}>S. No</th>
                        <th className={TH_CLS}>Motor Sr. No</th>
                        <th className={TH_CLS}>Motor Length</th>
                        <th className={TH_CLS}>Shaft O/P D/Length</th>
                        <th className={TH_CLS}>Mounting PCD</th>
                        <th className={TH_CLS}>Key Dim (Go/NG)</th>
                        <th className={TH_CLS}>Locating Dia (Go/NG)</th>
                        <th className={TH_CLS}>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.rows.map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className={TD_CLS}>{row.sno}</td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.motor_sr_no} onChange={(e) => setRowField(idx, 'motor_sr_no', e.target.value)} />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.motor_length} onChange={(e) => setRowField(idx, 'motor_length', e.target.value)} placeholder="mm" />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.shaft_length} onChange={(e) => setRowField(idx, 'shaft_length', e.target.value)} placeholder="mm" />
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.mounting_pcd} onChange={(e) => setRowField(idx, 'mounting_pcd', e.target.value)} placeholder="153" />
                          </td>
                          <td className="py-1 px-2 border border-gray-100 text-center">
                            <select className={SELECT_CLS} value={row.key_dim_result} onChange={(e) => setRowField(idx, 'key_dim_result', e.target.value)}>
                              {['GO', 'NG'].map((o) => <option key={o}>{o}</option>)}
                            </select>
                          </td>
                          <td className="py-1 px-2 border border-gray-100 text-center">
                            <select className={SELECT_CLS} value={row.locating_dia_result} onChange={(e) => setRowField(idx, 'locating_dia_result', e.target.value)}>
                              {['GO', 'NG'].map((o) => <option key={o}>{o}</option>)}
                            </select>
                          </td>
                          <td className="py-1 px-1 border border-gray-100">
                            <input className={INPUT_CLS} value={row.mechanical_remarks} onChange={(e) => setRowField(idx, 'mechanical_remarks', e.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mechanical General Checks */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">General Checks</h3>

                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Power Cable Length</label>
                      <input
                        className={INPUT_CLS}
                        value={form.power_cable_length}
                        onChange={(e) => setField('power_cable_length', e.target.value)}
                        placeholder="e.g. 1250±50mm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sensor Cable Length</label>
                      <input
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
                                onChange={(e) => setCheck('general_mechanical', c.key, 'measured', e.target.value)}
                              >
                                {MEASURED_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="py-1 px-2 border border-gray-100">
                              <input
                                className={INPUT_CLS}
                                value={form.general_mechanical[c.key].remarks}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mechanical Remarks</label>
                  <textarea
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
                  value={form.drawing_image}
                  onSelect={(file, el) => handleFileChosen({ type: 'drawing' }, file, el)}
                  onClear={() => setField('drawing_image', null)}
                  heightCls="h-28"
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
                      className="flex items-center gap-1 px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-transparent text-xs font-medium whitespace-nowrap"
                    >
                      <Plus size={14} /> Add Photo
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {form.photos.map((photo, idx) => (
                      <div key={photo.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            className={INPUT_CLS}
                            value={photo.label}
                            onChange={(e) => setPhotoLabel(photo.id, e.target.value)}
                            placeholder={`Photo ${idx + 1} label`}
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(photo.id)}
                            className="shrink-0 p-1.5 text-gray-400 hover:text-red-500"
                            title="Remove this photo slot"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <ImageUploadCard
                          value={photo.image}
                          onSelect={(file, el) => handleFileChosen({ type: 'photo', id: photo.id }, file, el)}
                          onClear={() => clearPhotoImage(photo.id)}
                          heightCls="h-32"
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
            <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prepared By</label>
                <input className={INPUT_CLS} value={form.prepared_by} onChange={(e) => setField('prepared_by', e.target.value)} placeholder="Name / Designation" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Approved By</label>
                <input className={INPUT_CLS} value={form.approved_by} onChange={(e) => setField('approved_by', e.target.value)} placeholder="Name / Designation" />
              </div>
            </div>
          </div>

          {/* Modal footer */}
          <div className="flex justify-end gap-3 px-8 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <button type="button" onClick={handleClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-semibold"
            >
              <Download size={16} />
              {loading ? 'Generating PDF...' : 'Generate PDF'}
            </button>
          </div>
        </form>
      </Modal>

      {cropTarget && (
        <CropModal imageSrc={cropTarget.imageSrc} onCancel={cancelCrop} onApply={applyCroppedImage} />
      )}
    </div>
  );
}
