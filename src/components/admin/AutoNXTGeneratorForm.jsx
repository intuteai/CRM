import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Modal from 'react-modal';
import Cropper from 'react-easy-crop';
import axios from 'axios';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Download, FileText, ClipboardCheck, Image as ImageIcon, X, Camera } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { pdiFormPath, pdiBatchPath } from '../../utils/pdiRoutes';

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
// The server's JSON body limit is 40 MB; block well before it so the user
// gets a clear message instead of an opaque 413.
const MAX_SAVE_PAYLOAD_BYTES = 35 * 1024 * 1024;
const TEMPLATE_ID = 'autonxt';

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

// Mirrors CRM_BACKEND/models/operations/pdi/templates/autonxt.js's
// SPEC_DEFAULTS exactly (same duplicated-rather-than-shared convention this
// file already documents at its top for the row/column definitions above --
// no shared build pipeline between frontend and backend). Any change here
// must be mirrored there, and vice versa.
const SPEC_DEFAULTS = {
  rpm_500_bemf:       { display: '79.0±3%',  nominal: '79.0',  tolMode: '%', tol: '3' },
  rpm_500_current:    { display: '6.0±2.0A', nominal: '6.0',   tolMode: '±', tol: '2.0' },
  rpm_1000_bemf:      { display: '155.0±3%', nominal: '155.0', tolMode: '%', tol: '3' },
  rpm_1000_current:   { display: '6.0±2.0A', nominal: '6.0',   tolMode: '±', tol: '2.0' },
  rpm_1500_bemf:      { display: '227.0±3%', nominal: '227.0', tolMode: '%', tol: '3' },
  rpm_1500_current:   { display: '3.0±1.0A', nominal: '3.0',   tolMode: '±', tol: '1.0' },
  rpm_1800_bemf:      { display: '270.0±3%', nominal: '270.0', tolMode: '%', tol: '3' },
  rpm_1800_current:   { display: '3.0±1.0A', nominal: '3.0',   tolMode: '±', tol: '1.0' },
  rpm_2000_bemf:      { display: '-', nominal: '', tolMode: '±', tol: '' },
  rpm_2000_current:   { display: '-', nominal: '', tolMode: '±', tol: '' },
  rpm_2200_bemf:      { display: '-', nominal: '', tolMode: '±', tol: '' },
  rpm_2200_current:   { display: '-', nominal: '', tolMode: '±', tol: '' },
  rpm_2500_bemf:      { display: '-', nominal: '', tolMode: '±', tol: '' },
  rpm_2500_current:   { display: '-', nominal: '', tolMode: '±', tol: '' },
  rpm_3000_bemf:      { display: '-', nominal: '', tolMode: '±', tol: '' },
  rpm_3000_current:   { display: '-', nominal: '', tolMode: '±', tol: '' },
  motor_total_length: { display: '467.5±1.0', nominal: '467.5', tolMode: '±', tol: '1.0' },
  shaft_op_length:    { display: '10.0±0.5',  nominal: '10.0',  tolMode: '±', tol: '0.5' },
  locating_dia:       { display: 'Ø180.0 (-0.01 TO -0.05)', nominal: '180.0', tolMode: 'bilateral', tol: '-0.01', tolMinus: '-0.05' },
};

const SPEC_FIELD_IDS = Object.keys(SPEC_DEFAULTS);

// Per-field printed-unit metadata for formatAutoNxtSpecDisplay below --
// mirrors today's hardcoded SPEC_DEFAULTS[*].display strings exactly (an
// "A" suffix on every *_current field, a "Ø" prefix on locating_dia's
// bilateral diameter spec, nothing on everything else). See
// docs/superpowers/specs/2026-09-30-autonxt-spec-display-lock-design.md
// (CRM_BACKEND repo) for why this exists. Same duplicated-rather-than-shared
// convention as SPEC_DEFAULTS above -- also mirrored in CRM_BACKEND's
// one-off fix script and in the pdi-erp-app mobile handoff.
const SPEC_UNIT_PREFIX = {
  rpm_500_current:  { unit: 'A' },
  rpm_1000_current: { unit: 'A' },
  rpm_1500_current: { unit: 'A' },
  rpm_1800_current: { unit: 'A' },
  rpm_2000_current: { unit: 'A' },
  rpm_2200_current: { unit: 'A' },
  rpm_2500_current: { unit: 'A' },
  rpm_3000_current: { unit: 'A' },
  locating_dia:     { prefix: 'Ø' },
};

// Computes the printed Specification text from nominal/tolerance instead of
// letting it be typed independently of them -- see the design spec above
// for why (a technician could previously change Nominal/Tolerance without
// updating this text, so the PDF printed a specification that no longer
// matched what Measured was actually checked against). Must reproduce every
// one of SPEC_DEFAULTS' current hardcoded `display` strings exactly for
// that field's own (nominal, tolMode, tol, tolMinus) -- verified in Step 2.
function formatAutoNxtSpecDisplay(nominal, tolMode, tol, tolMinus, { unit = '', prefix = '' } = {}) {
  const nominalStr = String(nominal ?? '').trim();
  if (!nominalStr) return '-';
  const tolStr = String(tol ?? '').trim();
  const tolMinusStr = String(tolMinus ?? '').trim();
  // No usable tolerance: print the nominal alone, not "79.0±" or "(0.1 TO )".
  if (tolMode === 'bilateral') {
    if (!tolStr || !tolMinusStr) return `${prefix}${nominalStr}${unit}`;
    return `${prefix}${nominalStr} (${tolStr} TO ${tolMinusStr})`;
  }
  if (!tolStr) return `${prefix}${nominalStr}${unit}`;
  return `${prefix}${nominalStr}±${tolStr}${tolMode === '%' ? '%' : ''}${unit}`;
}

// Recomputes every spec_<id>_display field from that field's own current
// nominal/tolerance-mode/tolerance-amount right before sending -- this is
// the actual save-time source of truth. AutoNxtSpecCell's on-screen preview
// (below) calls the same formatAutoNxtSpecDisplay, so what's shown and what
// gets sent are always identical; nothing needs to be kept in sync via
// effects or per-keystroke handlers.
function withComputedSpecDisplays(data) {
  const out = { ...data };
  SPEC_FIELD_IDS.forEach((id) => {
    out[`spec_${id}_display`] = formatAutoNxtSpecDisplay(
      data[`spec_${id}`],
      data[`spec_${id}_tol_mode`],
      data[`spec_${id}_tol`],
      data[`spec_${id}_tol_minus`],
      SPEC_UNIT_PREFIX[id],
    );
  });
  return out;
}

// Builds the 5 flat form fields (spec_<id>_display, spec_<id>,
// spec_<id>_tol_mode, spec_<id>_tol, spec_<id>_tol_minus) for every
// tolerance-eligible field, defaulted from SPEC_DEFAULTS -- spread into
// defaultForm() below.
function defaultSpecFields() {
  const out = {};
  SPEC_FIELD_IDS.forEach((id) => {
    const def = SPEC_DEFAULTS[id];
    out[`spec_${id}_display`] = def.display;
    out[`spec_${id}`] = def.nominal;
    out[`spec_${id}_tol_mode`] = def.tolMode;
    out[`spec_${id}_tol`] = def.tol;
    out[`spec_${id}_tol_minus`] = def.tolMinus ?? '';
  });
  return out;
}

// Fourth copy of this exact formula in the codebase (CRM_BACKEND/models/
// operations/pdi/tolerance.js, CRM/src/components/admin/PDIGeneratorForm.jsx,
// pdi-erp-app/src/services/tolerance.ts, and now here) — kept as a
// duplicate rather than shared for the same reason as SPEC_DEFAULTS above.
// The FORMULA must stay identical across all of them.
// Float slack: 0.7 + 0.1 is 0.7999999999999999, so without it a reading
// exactly on a limit (0.8) is flagged.
const TOLERANCE_EPS = 1e-9;

function checkTolerance(measuredStr, nominalStr, toleranceMode, toleranceAmountStr, toleranceAmount2Str) {
  const measured = parseFloat(measuredStr);
  const nominal = parseFloat(nominalStr);
  if (!Number.isFinite(measured) || !Number.isFinite(nominal)) {
    return { outOfRange: false };
  }
  if (toleranceMode === 'bilateral') {
    const plus = parseFloat(toleranceAmountStr);
    const minus = parseFloat(toleranceAmount2Str);
    if (!Number.isFinite(plus) || !Number.isFinite(minus)) {
      return { outOfRange: false };
    }
    const low = nominal + Math.min(plus, minus);
    const high = nominal + Math.max(plus, minus);
    return { outOfRange: measured < low - TOLERANCE_EPS || measured > high + TOLERANCE_EPS };
  }
  const toleranceAmount = parseFloat(toleranceAmountStr);
  if (!Number.isFinite(toleranceAmount)) {
    return { outOfRange: false };
  }
  const amount = Math.abs(toleranceAmount);
  const delta = toleranceMode === '%' ? Math.abs(nominal) * (amount / 100) : amount;
  const outOfRange = measured < nominal - delta - TOLERANCE_EPS || measured > nominal + delta + TOLERANCE_EPS;
  return { outOfRange };
}

// True when the given field id's current Measured value is outside its
// current nominal ± tolerance. `measured` is read by the caller (it lives in
// form.performance_test[row.key] or form.physical_parameters[row.key], two
// different shapes) and passed in rather than looked up here.
function isFieldOutOfTolerance(form, id, measured) {
  return checkTolerance(
    measured,
    form[`spec_${id}`],
    form[`spec_${id}_tol_mode`],
    form[`spec_${id}_tol`],
    form[`spec_${id}_tol_minus`],
  ).outOfRange;
}

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
  ...defaultSpecFields(),
  performance_test: Object.fromEntries(
    PERFORMANCE_ROWS.map((r) => [r.key, { bemf_measured: '', current_measured: '' }])
  ),
  general_check: initChecklist(GENERAL_CHECK_ROWS),
  physical_parameters: initChecklist(PHYSICAL_PARAM_ROWS),
  page1_remarks: 'ALL OK, PASSED.',
  page2_remarks: 'ALL OK, PASSED.',
  prepared_by_electrical: '', prepared_by_mechanical: '', approved_by: '',
  photos: Object.fromEntries(PHOTO_SLOTS.map((s) => [s.key, []])),
});

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Keeps YYYY-MM-DD, converts DD-MM-YYYY / DD/MM/YYYY (mobile app formats),
// and blanks anything else so the date input never receives an invalid value.
function normalizeDate(value) {
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

// Per-row merge so a report saved by an older form or the mobile app with a
// missing/null row (or subfield) can't crash the tables. A missing subfield
// takes the default; a present-but-null one becomes ''.
function mergeChecklist(rows, baseSection, loadedSection) {
  const src = isPlainObject(loadedSection) ? loadedSection : {};
  const merged = { ...src };
  rows.forEach((r) => {
    const loadedRow = isPlainObject(src[r.key]) ? src[r.key] : {};
    const row = { ...loadedRow };
    Object.entries(baseSection[r.key]).forEach(([sub, def]) => {
      row[sub] = loadedRow[sub] === undefined ? def : String(loadedRow[sub] ?? '');
    });
    merged[r.key] = row;
  });
  return merged;
}

function formFromReport(report) {
  const base = defaultForm();
  const data = isPlainObject(report.data) ? report.data : {};
  const form = { ...base, ...data };
  Object.entries(base).forEach(([k, def]) => {
    if (typeof def === 'string') form[k] = data[k] === undefined ? def : String(data[k] ?? '');
  });
  form.date = data.date === undefined ? base.date : normalizeDate(data.date);
  form.performance_test = mergeChecklist(PERFORMANCE_ROWS, base.performance_test, data.performance_test);
  form.general_check = mergeChecklist(GENERAL_CHECK_ROWS, base.general_check, data.general_check);
  form.physical_parameters = mergeChecklist(PHYSICAL_PARAM_ROWS, base.physical_parameters, data.physical_parameters);
  const loadedPhotos = isPlainObject(report.photos) ? report.photos : {};
  form.photos = Object.fromEntries(
    PHOTO_SLOTS.map((s) => {
      const raw = loadedPhotos[s.key];
      const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      return [s.key, list.filter((p) => typeof p === 'string' && p)];
    })
  );
  return form;
}

// Unsaved-change detection. Photos are excluded (multi-MB base64 strings)
// and tracked by a separate counter instead.
const formSignature = (form) => JSON.stringify(form, (k, v) => (k === 'photos' ? undefined : v));

const batchInfoFrom = (d) => (d?.batch_id == null ? null : {
  batch_id: d.batch_id,
  lot_index: d.lot_index ?? null,
  lot_quantity: d.lot_quantity ?? null,
  batch_status: d.batch_status ?? null,
  batch_pdi_no: d.batch_pdi_no ?? null,
});

const LOCKED_BATCH_STATUSES = ['Completed', 'Finalizing'];

const isAllOkRemark = (s) => String(s ?? '').trim().toUpperCase() === 'ALL OK, PASSED.';
const isNg = (v) => String(v ?? '').trim().toUpperCase() === 'NG';

// Error bodies arrive as a Blob on responseType:'blob' requests (finalize,
// PDF download), so parse those before reading `{ error, code }`.
async function errorPayloadFrom(err) {
  const payload = err?.response?.data;
  if (payload instanceof Blob) {
    try {
      const text = await payload.text();
      try {
        const parsed = JSON.parse(text);
        return isPlainObject(parsed) ? parsed : { error: text };
      } catch {
        return { error: text };
      }
    } catch {
      return {};
    }
  }
  return isPlainObject(payload) ? payload : {};
}

async function errorMessageFrom(err, fallback) {
  const { error } = await errorPayloadFrom(err);
  return (typeof error === 'string' && error.trim()) ? error : fallback;
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

function deleteDraft(reportId, { keepalive = false } = {}) {
  const url = `${API_URL}/api/pdi/reports/${reportId}`;
  if (keepalive) {
    // axios can't outlive the page; fetch keepalive can, for pagehide.
    return fetch(url, { method: 'DELETE', headers: authHeaders(), keepalive: true }).catch(() => {});
  }
  return axios.delete(url, { headers: authHeaders() });
}

// M2: soft pre-finalize review. Returns human-readable warnings; the caller
// shows them in one confirm and never blocks on them.
function finalizeWarnings(form) {
  const warnings = [];
  if (!String(form.motor_sr_no ?? '').trim()) warnings.push('Motor Sr.No is blank.');

  const perfOut = [];
  PERFORMANCE_ROWS.forEach((r) => {
    const row = form.performance_test?.[r.key] || {};
    if (isFieldOutOfTolerance(form, `${r.key}_bemf`, row.bemf_measured)) perfOut.push(`${r.rpm} RPM BEMF`);
    if (isFieldOutOfTolerance(form, `${r.key}_current`, row.current_measured)) perfOut.push(`${r.rpm} RPM current`);
  });
  if (perfOut.length) warnings.push(`Performance test out of tolerance: ${perfOut.join(', ')}.`);

  const gcNg = GENERAL_CHECK_ROWS.filter((r) => isNg(form.general_check?.[r.key]?.measured)).map((r) => r.label);
  if (gcNg.length) warnings.push(`General Check NG: ${gcNg.join(', ')}.`);

  const physNg = PHYSICAL_PARAM_ROWS.filter((r) => isNg(form.physical_parameters?.[r.key]?.measured)).map((r) => r.label);
  if (physNg.length) warnings.push(`Physical Parameters NG: ${physNg.join(', ')}.`);

  const physOut = PHYSICAL_PARAM_ROWS
    .filter((r) => SPEC_DEFAULTS[r.key] && isFieldOutOfTolerance(form, r.key, form.physical_parameters?.[r.key]?.measured))
    .map((r) => r.label);
  if (physOut.length) warnings.push(`Physical Parameters out of tolerance: ${physOut.join(', ')}.`);

  const photoCount = PHOTO_SLOTS.reduce((n, s) => n + (form.photos?.[s.key]?.length || 0), 0);
  if (photoCount === 0) warnings.push('No photos have been added.');

  if (isAllOkRemark(form.page1_remarks) && (perfOut.length || gcNg.length)) {
    warnings.push('Page 1 remark still says "ALL OK, PASSED." but page 1 has NG or out-of-tolerance values.');
  }
  if (isAllOkRemark(form.page2_remarks) && (physNg.length || physOut.length)) {
    warnings.push('Page 2 remark still says "ALL OK, PASSED." but page 2 has NG or out-of-tolerance values.');
  }
  return warnings;
}

function triggerPdfDownload(data, pdiNo) {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PDI_${String(pdiNo ?? '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'report'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

const INPUT_CLS =
  'w-full border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const SELECT_CLS =
  'border border-navy-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400';
const TH_CLS = 'py-2 px-2 text-xs font-semibold text-navy-800 bg-navy-50 border border-navy-100 whitespace-nowrap';
const TD_CLS = 'py-1 px-1 border border-navy-100 text-sm text-gray-500 text-center';

// Multi-image version, ported from General's own local copy in
// PDIGeneratorForm.jsx (same "duplicated rather than shared" convention).
// `images` is an array of data-URI strings; `onFilesSelected` receives the
// selected files (already clamped to however many slots remain);
// `onRemove(index)` removes one image.
function ImageUploadCard({ label, hint, images = [], onFilesSelected, onRemove, heightCls = 'h-32', maxImages = 10, readOnly = false }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const atLimit = readOnly || images.length >= maxImages;

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
                {!readOnly && <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-white/90 rounded-full shadow hover:bg-white text-gray-600 hover:text-red-500"
                  title="Remove image"
                  aria-label={`Remove ${label || 'photo'} ${i + 1}`}
                >
                  <X size={12} />
                </button>}
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
        ) : readOnly ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-400">No photos</div>
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

// One reusable cell for every tolerance-eligible field: a read-only,
// computed Specification preview (spec_<id>_display -- what prints in the
// PDF, now always derived from the nominal/tolerance group below rather
// than independently typed) plus a compact nominal + tolerance-mode +
// tolerance-amount group (spec_<id>/_tol_mode/_tol/_tol_minus, used both to
// flag the Measured cell and to compute the Specification preview).
// Mirrors General's own ToleranceSpecInput (CRM/src/components/admin/
// PDIGeneratorForm.jsx) with one addition -- the Specification preview --
// since AutoNXT's rows have no separate "spec row above many measured rows"
// the way General's do, this print text has to live somewhere per-row. See
// docs/superpowers/specs/2026-09-30-autonxt-spec-display-lock-design.md
// (CRM_BACKEND repo) for why this field is no longer independently typed.
function AutoNxtSpecCell({ form, setField, id, label = id }) {
  const mode = form[`spec_${id}_tol_mode`];
  const computedDisplay = formatAutoNxtSpecDisplay(
    form[`spec_${id}`],
    mode,
    form[`spec_${id}_tol`],
    form[`spec_${id}_tol_minus`],
    SPEC_UNIT_PREFIX[id],
  );
  return (
    <div className="space-y-1 min-w-[150px]">
      <input
        className={INPUT_CLS}
        value={computedDisplay}
        disabled
        readOnly
        title="Computed automatically from Nominal, Tolerance mode and Tolerance amount below -- not editable."
        aria-label={`${label} specification (computed automatically)`}
      />
      <div className="flex gap-1 flex-wrap">
        <input
          className={INPUT_CLS}
          value={form[`spec_${id}`]}
          onChange={(e) => setField(`spec_${id}`, e.target.value)}
          placeholder="nominal"
          aria-label={`${label} nominal`}
          style={{ maxWidth: 64 }}
        />
        <select
          className={SELECT_CLS}
          value={mode}
          onChange={(e) => setField(`spec_${id}_tol_mode`, e.target.value)}
          aria-label={`${label} tolerance mode`}
        >
          <option value="±">±</option>
          <option value="%">±%</option>
          <option value="bilateral">Bilateral</option>
        </select>
        <input
          className={INPUT_CLS}
          value={form[`spec_${id}_tol`]}
          onChange={(e) => setField(`spec_${id}_tol`, e.target.value)}
          placeholder={mode === 'bilateral' ? '+' : 'tol.'}
          aria-label={`${label} ${mode === 'bilateral' ? 'plus tolerance' : 'tolerance amount'}`}
          style={{ maxWidth: mode === 'bilateral' ? 50 : 60 }}
        />
        {mode === 'bilateral' && (
          <input
            className={INPUT_CLS}
            value={form[`spec_${id}_tol_minus`]}
            onChange={(e) => setField(`spec_${id}_tol_minus`, e.target.value)}
            placeholder="-"
            aria-label={`${label} minus tolerance`}
            style={{ maxWidth: 50 }}
          />
        )}
      </div>
    </div>
  );
}

function CropModal({ imageSrc, onCancel, onApply, onSkip }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const { notifyError } = useNotify();

  // Browsers can't decode some camera formats (e.g. HEIC); the cropper would
  // otherwise show a blank area with Apply never enabling.
  useEffect(() => {
    let cancelled = false;
    loadImage(imageSrc).catch(() => { if (!cancelled) setDecodeFailed(true); });
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
      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto outline-none max-h-[95vh] overflow-y-auto"
      contentLabel="Crop Image"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-display text-base font-semibold text-navy-800">Adjust photo</h3>
        <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-navy-800 text-xl leading-none transition-colors">&times;</button>
      </div>
      {decodeFailed ? (
        <p role="alert" className="px-5 py-8 text-sm text-red-600 text-center">
          This photo can&rsquo;t be opened in the browser (it may be HEIC or damaged). Skip it, or convert it to JPEG and add it again.
        </p>
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
          <div className="px-5 pt-4">
            <label htmlFor="autonxt-crop-zoom" className="block text-xs font-medium text-gray-500 mb-1">Zoom</label>
            <input
              id="autonxt-crop-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </>
      )}
      <div className="px-5 py-4 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
          Cancel
        </button>
        {decodeFailed ? (
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors text-sm font-semibold"
          >
            Skip this photo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !croppedAreaPixels}
            className="px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50 text-sm font-semibold"
          >
            {busy ? 'Processing...' : 'Apply'}
          </button>
        )}
      </div>
    </Modal>
  );
}

// Lot-wide fields: on a lot member these are owned by the lot row and are
// edited only on the lot page.
const LOT_FIELDS = new Set(['pdi_no', 'customer_name', 'product_id', 'product_specifications', 'drawing_no', 'controller_type']);

const MAX_IMAGES_PER_SLOT = 10;

export default function AutoNXTGeneratorForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState('performance');
  const [form, setForm] = useState(defaultForm);
  const [reportId, setReportId] = useState(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [revisionNo, setRevisionNo] = useState(null);
  const [reportStatus, setReportStatus] = useState(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [batchInfo, setBatchInfo] = useState(null);
  const [lotLocked, setLotLocked] = useState(false);
  const [savedSignature, setSavedSignature] = useState('');
  const [photosVersion, setPhotosVersion] = useState(0);
  const [savedPhotosVersion, setSavedPhotosVersion] = useState(0);
  const [cropTarget, setCropTarget] = useState(null); // { id, slotKey, imageSrc }
  const { notifySuccess, notifyError } = useNotify();
  const navigate = useNavigate();
  const abortRef = useRef(null);
  // Bumped whenever the open report changes (open/load/close/finalize) so a
  // save response that lands afterwards doesn't toast or touch the new state.
  const sessionRef = useRef(0);
  const reportIdRef = useRef(null);
  const hasSavedRef = useRef(false);

  useEffect(() => {
    reportIdRef.current = reportId;
    hasSavedRef.current = hasSaved;
  }, [reportId, hasSaved]);

  // F11: a never-saved new draft is deleted when the form goes away by any
  // route (in-app navigation unmounts it; a tab close/reload fires pagehide).
  useEffect(() => {
    const onPageHide = (e) => {
      // persisted = page kept in the back/forward cache and may be restored.
      if (e.persisted) return;
      const id = reportIdRef.current;
      if (id && !hasSavedRef.current) deleteDraft(id, { keepalive: true });
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      abortRef.current?.abort();
      const id = reportIdRef.current;
      if (id && !hasSavedRef.current) {
        deleteDraft(id).catch((err) => console.error('Failed to clean up unsaved PDI draft:', err));
      }
    };
  }, []);

  const currentSignature = useMemo(() => formSignature(form), [form]);
  const isDirty = isOpen && (currentSignature !== savedSignature || photosVersion !== savedPhotosVersion);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const isLotMember = !!batchInfo;
  const readOnly = lotLocked || (isLotMember && LOCKED_BATCH_STATUSES.includes(batchInfo.batch_status));
  const isCompletedSingle = !isLotMember && reportStatus === 'Completed';
  const busy = saving || loading;

  // Queued files from a multi-file selection still waiting to be cropped, plus
  // the slot they belong to -- refs, not useState, for the same re-entrancy
  // reason General's own copy of this uses refs (see PDIGeneratorForm.jsx):
  // a ref write is synchronous, so there's no window between the last queued
  // file's dequeue and the async FileReader resolving where a concurrent
  // selection could slip through. cropGenRef invalidates an in-flight read
  // after a reset.
  const cropQueueFilesRef = useRef([]);
  const cropQueueSlotRef = useRef(null);
  const cropGenRef = useRef(0);
  const cropIdRef = useRef(0);

  const resetCropQueue = useCallback(() => {
    cropQueueFilesRef.current = [];
    cropQueueSlotRef.current = null;
    cropGenRef.current += 1;
    setCropTarget(null);
  }, []);

  // Pops queued files until one can be shown in the cropper. Skipped files
  // (not an image, too large, unreadable) never strand the rest of the queue.
  const startNextQueuedFile = useCallback(async () => {
    const gen = cropGenRef.current;
    while (cropQueueFilesRef.current.length > 0) {
      const [file, ...rest] = cropQueueFilesRef.current;
      cropQueueFilesRef.current = rest;
      const slotKey = cropQueueSlotRef.current;
      if (!file) continue;
      if (!String(file.type || '').startsWith('image/')) {
        notifyError(`"${file.name}" isn't an image file — skipped.`);
        continue;
      }
      if (file.size > MAX_RAW_IMAGE_BYTES) {
        notifyError(`"${file.name}" is too large (max ${(MAX_RAW_IMAGE_BYTES / (1024 * 1024)).toFixed(0)}MB) — skipped.`);
        continue;
      }
      let dataUri;
      try {
        dataUri = await fileToDataUri(file);
      } catch {
        if (gen !== cropGenRef.current) return;
        notifyError(`Failed to read "${file.name}" — skipped.`);
        continue;
      }
      if (gen !== cropGenRef.current) return;
      cropIdRef.current += 1;
      setCropTarget({ id: cropIdRef.current, slotKey, imageSrc: dataUri });
      return;
    }
    if (gen === cropGenRef.current) cropQueueSlotRef.current = null;
  }, [notifyError]);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const setChecklistField = useCallback((section, key, subfield, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: { ...prev[section]?.[key], [subfield]: value } },
    }));
  }, []);

  const addSlotImage = useCallback((slotKey, dataUri) => {
    setForm((prev) => ({
      ...prev,
      photos: { ...prev.photos, [slotKey]: [...(prev.photos[slotKey] || []), dataUri].slice(0, MAX_IMAGES_PER_SLOT) },
    }));
    setPhotosVersion((v) => v + 1);
  }, []);

  const removeSlotImage = useCallback((slotKey, imgIdx) => {
    setForm((prev) => ({
      ...prev,
      photos: { ...prev.photos, [slotKey]: (prev.photos[slotKey] || []).filter((_, i) => i !== imgIdx) },
    }));
    setPhotosVersion((v) => v + 1);
  }, []);

  const handleFilesChosen = useCallback((slotKey, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (cropQueueFilesRef.current.length > 0 || cropQueueSlotRef.current) {
      notifyError('Finish cropping the current batch of photos before adding more.');
      return;
    }
    cropQueueFilesRef.current = files;
    cropQueueSlotRef.current = slotKey;
    startNextQueuedFile();
  }, [startNextQueuedFile, notifyError]);

  const applyCroppedImage = useCallback((dataUri) => {
    if (cropTarget) addSlotImage(cropTarget.slotKey, dataUri);
    setCropTarget(null);
    startNextQueuedFile();
  }, [cropTarget, addSlotImage, startNextQueuedFile]);

  const skipCrop = useCallback(() => {
    setCropTarget(null);
    startNextQueuedFile();
  }, [startNextQueuedFile]);

  const cancelCrop = useCallback(() => {
    const remaining = cropQueueFilesRef.current.length;
    resetCropQueue();
    if (remaining > 0) {
      notifyError(`Cancelled — ${remaining} more photo${remaining === 1 ? '' : 's'} in this batch were not added.`);
    }
  }, [resetCropQueue, notifyError]);

  const applyLoadedReport = useCallback((report) => {
    const loaded = formFromReport(report);
    sessionRef.current += 1;
    resetCropQueue();
    setForm(loaded);
    setSavedSignature(formSignature(loaded));
    setPhotosVersion(0);
    setSavedPhotosVersion(0);
    setReportId(report.report_id);
    setRevisionNo(report.revision_no ?? null);
    setReportStatus(report.status ?? null);
    setBatchInfo(batchInfoFrom(report));
    setLotLocked(false);
    setHasSaved(true);
    setHasConflict(false);
  }, [resetCropQueue]);

  const fetchReport = async (id) => {
    const response = await axios.get(`${API_URL}/api/pdi/reports/${id}`, { headers: authHeaders() });
    return response.data;
  };

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const resumeId = searchParams.get('report');
    if (!resumeId) return;

    (async () => {
      const token = localStorage.getItem('token');
      if (!token) { notifyError('Please log in first.'); setSearchParams({}, { replace: true }); return; }
      let redirected = false;
      try {
        const report = await fetchReport(resumeId);
        if (report.template_id && report.template_id !== TEMPLATE_ID) {
          notifyError('That report uses a different PDI template — opening it in the right form.');
          redirected = true;
          navigate(pdiFormPath(report.template_id, report.report_id ?? resumeId), { replace: true });
          return;
        }
        applyLoadedReport(report);
        setActiveTab('performance');
        setIsOpen(true);
      } catch (err) {
        notifyError(await errorMessageFrom(err, 'Could not load that PDI report.'));
      } finally {
        if (!redirected) setSearchParams({}, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpen = async () => {
    if (opening) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    setOpening(true);
    try {
      const response = await axios.post(`${API_URL}/api/pdi/reports`, { template_id: TEMPLATE_ID, inspection_date: todayIST() }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const fresh = defaultForm();
      sessionRef.current += 1;
      resetCropQueue();
      setReportId(response.data.report_id);
      setRevisionNo(response.data.revision_no ?? null);
      setReportStatus(response.data.status ?? null);
      setBatchInfo(null);
      setLotLocked(false);
      setHasSaved(false);
      setHasConflict(false);
      setForm(fresh);
      setSavedSignature(formSignature(fresh));
      setPhotosVersion(0);
      setSavedPhotosVersion(0);
      setActiveTab('performance');
      setIsOpen(true);
    } catch (err) {
      notifyError(await errorMessageFrom(err, 'Could not start a new PDI report.'));
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
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    return names.length ? names.join(' / ') : undefined;
  };

  // `expected_revision` goes on every save once known, so a concurrent edit
  // elsewhere is caught as a 409 instead of silently overwritten. `status`
  // is omitted for Completed reports -- only finalize may set Completed.
  const saveExtras = () => ({
    ...(reportStatus === 'Completed' ? {} : { status: 'In Progress' }),
    ...(revisionNo != null ? { expected_revision: revisionNo } : {}),
  });

  // PATCHes the current form. Photos are sent only when they changed since
  // the last successful save, and the response carries a photo summary
  // (?photos=summary) that must never overwrite the local photos.
  const persistForm = async (signal) => {
    const { photos, ...data } = form;
    const sentSignature = currentSignature;
    const sentPhotosVersion = photosVersion;
    const body = {
      data: withComputedSpecDisplays(data),
      inspected_by: inspectedByValue(),
      inspection_date: form.date || undefined,
      ...saveExtras(),
    };
    if (photosVersion !== savedPhotosVersion) body.photos = photos;
    const approxBytes = JSON.stringify(body).length;
    if (approxBytes > MAX_SAVE_PAYLOAD_BYTES) {
      const err = new Error(
        `This report is too large to save (about ${Math.ceil(approxBytes / (1024 * 1024))} MB; the limit is 35 MB). Remove some photos and try again.`
      );
      err.localCode = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    const response = await axios.patch(`${API_URL}/api/pdi/reports/${reportId}`, body, {
      params: { photos: 'summary' },
      headers: authHeaders(),
      signal,
    });
    return { data: response.data, sentSignature, sentPhotosVersion };
  };

  const applySaveResponse = ({ data, sentSignature, sentPhotosVersion }) => {
    setRevisionNo((prev) => data?.revision_no ?? prev);
    if (data?.status) setReportStatus(data.status);
    if (data && 'batch_id' in data) setBatchInfo(batchInfoFrom(data));
    setHasSaved(true);
    setSavedSignature(sentSignature);
    setSavedPhotosVersion(sentPhotosVersion);
  };

  // 403/409 get specific messages distinct from the generic save-failure
  // toast -- a finalized-report edit rejected for permission reasons
  // should never look like "try again", and a stale revision should
  // explicitly prompt a reload rather than inviting a retry that will
  // fail identically.
  const handleSaveError = async (err, fallback) => {
    if (err?.localCode === 'PAYLOAD_TOO_LARGE') {
      notifyError(err.message);
      return;
    }
    const payload = await errorPayloadFrom(err);
    if (payload.code === 'FINALIZED_REPORT_FORBIDDEN') {
      notifyError('You don’t have permission to edit a finalized report.');
      return;
    }
    if (payload.code === 'REPORT_VERSION_CONFLICT') {
      notifyError('This report was changed elsewhere since you loaded it. Use "Reload latest" to load the newest version.');
      setHasConflict(true);
      return;
    }
    if (payload.code === 'BATCH_MEMBER_LOCKED') setLotLocked(true);
    notifyError((typeof payload.error === 'string' && payload.error.trim()) ? payload.error : fallback);
  };

  const handleSave = async () => {
    if (!reportId || saving || loading || readOnly) return;
    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }
    const session = sessionRef.current;
    setSaving(true);
    try {
      const result = await persistForm();
      if (session !== sessionRef.current) return;
      applySaveResponse(result);
      notifySuccess(isCompletedSingle ? 'Changes saved.' : 'Progress saved.');
    } catch (err) {
      if (session !== sessionRef.current) return;
      await handleSaveError(err, 'Failed to save progress.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (loading || saving || readOnly || isLotMember || isCompletedSingle) return;
    if (!String(form.customer_name ?? '').trim()) { notifyError('Customer name is required.'); return; }
    if (!String(form.pdi_no ?? '').trim()) { notifyError('PDI No. is required.'); return; }
    if (!reportId) { notifyError('Report not initialized yet — please close and reopen the form.'); return; }

    const token = localStorage.getItem('token');
    if (!token) { notifyError('Please log in first.'); return; }

    const warnings = finalizeWarnings(form);
    if (warnings.length > 0) {
      const message = `Please check before finalizing:\n\n${warnings.map((w) => `• ${w}`).join('\n')}\n\nFinalize anyway?`;
      if (!window.confirm(message)) return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const result = await persistForm(controller.signal);
      applySaveResponse(result);

      const response = await axios.post(`${API_URL}/api/pdi/reports/${reportId}/finalize`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
        signal: controller.signal,
      });

      triggerPdfDownload(response.data, form.pdi_no);
      notifySuccess('PDI finalized and PDF downloaded successfully.');
      sessionRef.current += 1;
      resetCropQueue();
      setIsOpen(false);
      setReportId(null);
      setHasSaved(false);
      setBatchInfo(null);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      await handleSaveError(err, 'Failed to finalize PDI.');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportId || downloading) return;
    if (isDirty && !window.confirm('The PDF shows the last saved version, not your unsaved changes. Download anyway?')) return;
    setDownloading(true);
    try {
      const response = await axios.get(`${API_URL}/api/pdi/reports/${reportId}/pdf`, {
        headers: authHeaders(),
        responseType: 'blob',
      });
      triggerPdfDownload(response.data, batchInfo?.batch_pdi_no || form.pdi_no);
    } catch (err) {
      notifyError(await errorMessageFrom(err, 'Failed to download the PDF.'));
    } finally {
      setDownloading(false);
    }
  };

  const handleReloadLatest = async () => {
    if (!reportId || busy) return;
    if (!window.confirm('Reload the latest saved version of this report? Your unsaved changes here will be lost.')) return;
    try {
      const report = await fetchReport(reportId);
      applyLoadedReport(report);
      notifySuccess('Loaded the latest version.');
    } catch (err) {
      notifyError(await errorMessageFrom(err, 'Could not reload the report.'));
    }
  };

  const handleClose = async () => {
    if (abortRef.current) abortRef.current.abort();
    const id = reportId;
    const saved = hasSaved;
    sessionRef.current += 1;
    resetCropQueue();
    setIsOpen(false);
    setReportId(null);
    setHasSaved(false);
    setBatchInfo(null);
    setLotLocked(false);
    setHasConflict(false);
    if (id && !saved) {
      try {
        await deleteDraft(id);
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

  const goBackToLot = () => {
    if (!batchInfo || busy) return;
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    sessionRef.current += 1;
    navigate(pdiBatchPath(TEMPLATE_ID, batchInfo.batch_id));
  };

  const headerField = (field, label, { required = false, placeholder, type } = {}) => {
    const lotField = isLotMember && LOT_FIELDS.has(field);
    const id = `autonxt-${field}`;
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-navy-800 mb-1">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
        <input
          id={id}
          type={type}
          className={`${INPUT_CLS} ${lotField ? 'bg-gray-50 text-gray-500' : ''}`}
          value={form[field]}
          onChange={(e) => setField(field, e.target.value)}
          readOnly={lotField}
          title={lotField ? 'Set on the lot page' : undefined}
          placeholder={placeholder}
        />
        {lotField && <p className="text-[11px] text-gray-400 mt-0.5">Set on the lot page</p>}
      </div>
    );
  };

  const FIELDSET_CLS = 'min-w-0 border-0 p-0 m-0';

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
            <h2 className="text-xl sm:text-2xl font-bold text-navy-800">New AutoNXT Pre-Dispatch Inspection</h2>
            <p className="text-gray-500 mt-1">
              Fill in motor test data and generate a 3-page PDI report PDF (Format No: CASPL/QA/F/23)
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
          <a href={pdiBatchPath(TEMPLATE_ID)} className="text-gold-600 hover:underline font-medium">
            Creating several motors in one lot? Use batch creation instead →
          </a>
        </p>
      </div>

      <Modal
        isOpen={isOpen}
        onRequestClose={requestClose}
        shouldCloseOnOverlayClick={false}
        shouldCloseOnEsc={!loading}
        overlayClassName="fixed inset-0 bg-navy-900/50 flex items-start justify-center z-50 overflow-y-auto py-4 sm:py-8"
        className="bg-white rounded-2xl shadow-2xl w-full min-w-0 max-w-5xl mx-4 outline-none"
        contentLabel="AutoNXT PDI Generator Form"
      >
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <FileText className="text-gold-600" size={24} />
              <div>
                <h2 className="font-display text-xl font-bold text-navy-800">Pre-Dispatch Inspection (PDI) — AutoNXT</h2>
                <p className="text-xs text-gray-400">Format No: CASPL/QA/F/23 · Rev. No:00 · Eff. Dt:30/03/2024 · Rev Dt:11/10/2024</p>
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

          <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-6 max-h-[62vh] sm:max-h-[80vh] overflow-y-auto">

            {isLotMember && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-400/60 bg-gold-400/10 px-4 py-2.5 text-sm text-navy-800">
                <span className="font-medium">
                  Lot {batchInfo.lot_index ?? '?'} of {batchInfo.lot_quantity ?? '?'} · PDI {batchInfo.batch_pdi_no || '—'}
                </span>
                <button type="button" onClick={goBackToLot} disabled={busy} className="font-medium text-gold-600 hover:underline disabled:opacity-50">
                  ← Back to lot
                </button>
              </div>
            )}

            {readOnly && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-100 bg-navy-50 px-4 py-2.5 text-sm text-navy-800">
                <span className="font-medium">This lot is finalized. This report can no longer be edited.</span>
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

            {hasConflict && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                <span>This report was changed elsewhere since you loaded it. Saving is paused until you reload.</span>
                <button
                  type="button"
                  onClick={handleReloadLatest}
                  disabled={busy}
                  className="px-3 py-1.5 bg-white border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 text-xs font-semibold"
                >
                  Reload latest
                </button>
              </div>
            )}

            {/* ── Header fields ── */}
            <fieldset disabled={readOnly} className={FIELDSET_CLS}>
              <div className="grid grid-cols-2 gap-4">
                {headerField('customer_name', 'Customer Name', { required: true, placeholder: 'e.g. Autonxt' })}
                {headerField('date', 'Date', { type: 'date' })}
                {headerField('product_id', 'Product ID')}
                {headerField('drawing_no', 'Drawing No.', { placeholder: 'e.g. CASPL-220/007-00' })}
                {headerField('product_specifications', 'Product Specifications')}
                {headerField('pdi_no', 'PDI No.', { required: true, placeholder: 'e.g. CASPL-QA-PDI-001' })}
                {headerField('motor_sr_no', 'Motor Sr.No')}
                {headerField('controller_type', 'Controller Type')}
              </div>
            </fieldset>

            {/* ── Tabs ── */}
            <div className="border-b border-navy-100">
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
                        ? 'border-navy-800 text-navy-800 bg-navy-50'
                        : 'border-transparent text-gray-500 hover:text-navy-700 hover:bg-navy-50/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* ── Performance & General Check Tab ── */}
            {activeTab === 'performance' && (
              <fieldset disabled={readOnly} className={`${FIELDSET_CLS} space-y-5`}>
                <div>
                  <h3 className="text-sm font-semibold text-navy-800 mb-2">A. Performance Test @ No Load</h3>
                  <div className="overflow-x-auto rounded-lg border border-navy-100">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          <th className={TH_CLS}>RPM</th>
                          <th className={TH_CLS}>Source V (DC)</th>
                          <th className={TH_CLS}>BEMF Specification</th>
                          <th className={TH_CLS}>BEMF Measured</th>
                          <th className={TH_CLS}>Current Specification</th>
                          <th className={TH_CLS}>Current Measured</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PERFORMANCE_ROWS.map((row, idx) => {
                          const perfRow = form.performance_test?.[row.key] || {};
                          const bemfFlag = isFieldOutOfTolerance(form, `${row.key}_bemf`, perfRow.bemf_measured);
                          const currentFlag = isFieldOutOfTolerance(form, `${row.key}_current`, perfRow.current_measured);
                          return (
                            <tr key={row.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className={TD_CLS}>{row.rpm}</td>
                              <td className={TD_CLS}>{row.sourceVoltage}</td>
                              <td className="py-1 px-1 border border-navy-100">
                                <AutoNxtSpecCell form={form} setField={setField} id={`${row.key}_bemf`} label={`${row.rpm} RPM BEMF`} />
                              </td>
                              <td className="py-1 px-1 border border-navy-100">
                                <input
                                  className={`${INPUT_CLS} ${bemfFlag ? 'border-red-500 bg-red-50' : ''}`}
                                  value={perfRow.bemf_measured ?? ''}
                                  onChange={(e) => setChecklistField('performance_test', row.key, 'bemf_measured', e.target.value)}
                                  inputMode="decimal"
                                  aria-label={`${row.rpm} RPM BEMF measured`}
                                  aria-invalid={bemfFlag || undefined}
                                />
                              </td>
                              <td className="py-1 px-1 border border-navy-100">
                                <AutoNxtSpecCell form={form} setField={setField} id={`${row.key}_current`} label={`${row.rpm} RPM current`} />
                              </td>
                              <td className="py-1 px-1 border border-navy-100">
                                <input
                                  className={`${INPUT_CLS} ${currentFlag ? 'border-red-500 bg-red-50' : ''}`}
                                  value={perfRow.current_measured ?? ''}
                                  onChange={(e) => setChecklistField('performance_test', row.key, 'current_measured', e.target.value)}
                                  inputMode="decimal"
                                  aria-label={`${row.rpm} RPM current measured`}
                                  aria-invalid={currentFlag || undefined}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

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
                        {GENERAL_CHECK_ROWS.map((row) => {
                          const value = form.general_check?.[row.key]?.measured ?? '';
                          // M1: values typed on mobile (anything but GO/NG/NA)
                          // get their own option instead of displaying as GO.
                          const known = MEASURED_OPTIONS.includes(value);
                          return (
                            <tr key={row.key} className="border-t border-navy-100 hover:bg-navy-50/60 transition-colors">
                              <td className="py-2 px-3 text-sm text-gray-700">{row.label}</td>
                              <td className={TD_CLS}>{row.spec}</td>
                              <td className={TD_CLS}>{row.method}</td>
                              <td className="py-1 px-2 border border-navy-100 text-center">
                                <select
                                  className={SELECT_CLS}
                                  value={value}
                                  onChange={(e) => setChecklistField('general_check', row.key, 'measured', e.target.value)}
                                  aria-label={`${row.label} measurement`}
                                >
                                  {!known && <option value={value}>{value === '' ? '—' : `Other: ${value}`}</option>}
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

                <div>
                  <label htmlFor="autonxt-page1_remarks" className="block text-sm font-medium text-navy-800 mb-1">Page 1 Remarks</label>
                  <textarea
                    id="autonxt-page1_remarks"
                    rows={2}
                    className={INPUT_CLS}
                    value={form.page1_remarks}
                    onChange={(e) => setField('page1_remarks', e.target.value)}
                  />
                </div>
              </fieldset>
            )}

            {/* ── Physical Parameters Tab ── */}
            {activeTab === 'physical' && (
              <fieldset disabled={readOnly} className={`${FIELDSET_CLS} space-y-5`}>
                <div>
                  <h3 className="text-sm font-semibold text-navy-800 mb-2">C. Physical Parameters</h3>
                  {/* Shared by every Measurement cell below (this table only) -- GO/NG/NA
                      stay one-click options, but the input itself accepts any typed value. */}
                  <datalist id="physical-param-measured-options">
                    {MEASURED_OPTIONS.map((o) => <option key={o} value={o} />)}
                  </datalist>
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
                        {PHYSICAL_PARAM_ROWS.map((row) => {
                          const isToleranceRow = !!SPEC_DEFAULTS[row.key];
                          const measured = form.physical_parameters?.[row.key]?.measured ?? '';
                          const flagged = isToleranceRow && isFieldOutOfTolerance(form, row.key, measured);
                          return (
                            <tr key={row.key} className="border-t border-navy-100 hover:bg-navy-50/60 transition-colors">
                              <td className="py-2 px-3 text-sm text-gray-700">{row.label}</td>
                              <td className={isToleranceRow ? 'py-1 px-1 border border-navy-100' : TD_CLS}>
                                {isToleranceRow
                                  ? <AutoNxtSpecCell form={form} setField={setField} id={row.key} label={row.label} />
                                  : row.spec}
                              </td>
                              <td className={TD_CLS}>{row.method}</td>
                              <td className="py-1 px-2 border border-navy-100 text-center">
                                <input
                                  list="physical-param-measured-options"
                                  className={`${INPUT_CLS} ${flagged ? 'border-red-500 bg-red-50' : ''}`}
                                  value={measured}
                                  onChange={(e) => setChecklistField('physical_parameters', row.key, 'measured', e.target.value)}
                                  inputMode={isToleranceRow ? 'decimal' : undefined}
                                  aria-label={`${row.label} measurement`}
                                  aria-invalid={flagged || undefined}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <label htmlFor="autonxt-page2_remarks" className="block text-sm font-medium text-navy-800 mb-1">Page 2 Remarks</label>
                  <textarea
                    id="autonxt-page2_remarks"
                    rows={2}
                    className={INPUT_CLS}
                    value={form.page2_remarks}
                    onChange={(e) => setField('page2_remarks', e.target.value)}
                  />
                </div>
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
                      images={form.photos?.[slot.key] || []}
                      onFilesSelected={(fileList) => handleFilesChosen(slot.key, fileList)}
                      onRemove={(idx) => removeSlotImage(slot.key, idx)}
                      maxImages={MAX_IMAGES_PER_SLOT}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </fieldset>
            )}

            {/* ── Signatures (3-way: Electrical + Mechanical preparers, one approver) ── */}
            <fieldset disabled={readOnly} className={FIELDSET_CLS}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <label htmlFor="autonxt-prepared_by_electrical" className="block text-sm font-medium text-navy-800 mb-1">Prepared By - Electrical</label>
                  <input id="autonxt-prepared_by_electrical" className={INPUT_CLS} value={form.prepared_by_electrical} onChange={(e) => setField('prepared_by_electrical', e.target.value)} placeholder="Name" />
                </div>
                <div>
                  <label htmlFor="autonxt-prepared_by_mechanical" className="block text-sm font-medium text-navy-800 mb-1">Prepared By - Mechanical</label>
                  <input id="autonxt-prepared_by_mechanical" className={INPUT_CLS} value={form.prepared_by_mechanical} onChange={(e) => setField('prepared_by_mechanical', e.target.value)} placeholder="Name" />
                </div>
                <div>
                  <label htmlFor="autonxt-approved_by" className="block text-sm font-medium text-navy-800 mb-1">Approved By</label>
                  <input id="autonxt-approved_by" className={INPUT_CLS} value={form.approved_by} onChange={(e) => setField('approved_by', e.target.value)} placeholder="Name" />
                </div>
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
                disabled={busy || hasConflict || !reportId}
                className="px-5 py-2.5 bg-navy-800 text-white rounded-lg hover:bg-navy-700 transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                {saving ? 'Saving...' : (isCompletedSingle ? 'Save changes' : 'Save')}
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
              {isLotMember ? (
                <button
                  type="button"
                  onClick={goBackToLot}
                  disabled={busy}
                  className="col-span-2 sm:col-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 text-sm font-semibold"
                >
                  ← Back to lot
                </button>
              ) : isCompletedSingle ? (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloading || busy}
                  className="col-span-2 sm:col-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 text-sm font-semibold"
                >
                  <Download size={16} />
                  {downloading ? 'Downloading...' : 'Download PDF'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalize}
                  disabled={busy || hasConflict || readOnly}
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
          onCancel={cancelCrop}
          onApply={applyCroppedImage}
          onSkip={skipCrop}
        />
      )}
    </div>
  );
}
