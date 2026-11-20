// Shared Parts Roster logic: field list, "missing info" rule, section order, the live parts hook
// and the Excel export (same columns, headers and order as the original INNOPACK PARTS ROSTER sheet).
import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { partsApi } from './innopackApi';

export const ROSTER_PATH = '/innopack/parts-roster';
export const PARTS_CHANGED_EVENT = 'innopack_parts:changed';
export const NO_SECTION = '(No section)';

// Server limits (characters). qty is a number 0..1000000 or null.
export const LIMITS = {
  section: 60,
  sourcing: 30,
  part_type: 30,
  part_name: 120,
  description: 300,
  units: 15,
  material_grade: 40,
  design_status: 20,
  rm_dimensions: 60,
  bop_supplier: 80,
  part_maturity: 30,
};
export const QTY_MAX = 1000000;

const clean = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
const upper = (v) => clean(v).toUpperCase();

export const isReleased = (p) => upper(p.design_status) === 'RELEASED';
export const isUndecided = (p) => !isReleased(p); // TBD, blank or anything else not released
export const isInHouse = (p) => upper(p.sourcing) === 'INNOPACK';
export const isBoughtOut = (p) => upper(p.sourcing) === 'BOP';
export const sectionOf = (p) => clean(p.section) || NO_SECTION;

/** What a part is missing (part name, qty, design status). Empty array = complete. */
export function missingInfo(p) {
  const out = [];
  if (!clean(p.part_name)) out.push('part name');
  if (p.qty === null || p.qty === undefined || p.qty === '') out.push('qty');
  if (!clean(p.design_status)) out.push('design status');
  return out;
}

const bySr = (a, b) => (Number(a.sr_no) || 0) - (Number(b.sr_no) || 0);

/** Sections in machine order (the order they first appear by Sr), so MAIN ROTARY comes before FEEDER. */
export function sectionOrder(parts) {
  const seen = new Set();
  [...parts].sort(bySr).forEach((p) => seen.add(sectionOf(p)));
  return [...seen];
}

/** Loads GET /parts and refetches quietly when another user (or this one) changes a part. */
export function useInnopackParts(socket) {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const id = ++requestId.current;
    if (!quiet) setLoading(true);
    try {
      const items = await partsApi.list();
      if (id !== requestId.current) return;
      setParts(items);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      // A quiet refresh keeps the rows already on screen; only a full load shows the error.
      if (!quiet) setError(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    let timer = null;
    // Coalesce bursts (e.g. several quick edits) into one refetch.
    const onChanged = () => {
      clearTimeout(timer);
      timer = setTimeout(() => load({ quiet: true }), 300);
    };
    socket.on(PARTS_CHANGED_EVENT, onChanged);
    return () => {
      clearTimeout(timer);
      socket.off(PARTS_CHANGED_EVENT, onChanged);
    };
  }, [socket, load]);

  return { parts, setParts, loading, error, reload: load };
}

// ── Excel export ─────────────────────────────────────────────────────
// Column A has an empty header and holds the Sr number, exactly like the original sheet.
const EXPORT_COLUMNS = [
  { header: '', key: 'sr_no', width: 6 },
  { header: 'SECTION', key: 'section', width: 16 },
  { header: 'Part SOURCING', key: 'sourcing', width: 14 },
  { header: 'TYPE', key: 'part_type', width: 12 },
  { header: 'Part Name', key: 'part_name', width: 32 },
  { header: 'Part Description', key: 'description', width: 40 },
  { header: 'Units', key: 'units', width: 8 },
  { header: 'Qty.', key: 'qty', width: 8 },
  { header: 'RM - Material Grade', key: 'material_grade', width: 18 },
  { header: 'DESIGN', key: 'design_status', width: 11 },
  { header: 'RM - Dimensions', key: 'rm_dimensions', width: 20 },
  { header: 'Drg no', key: 'drg_no', width: 10 },
  { header: 'BOP supplier', key: 'bop_supplier', width: 20 },
  { header: 'PART MATURITY', key: 'part_maturity', width: 15 },
];

function ddmmyyyy(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}${mm}${date.getFullYear()}`;
}

/** Writes "INNOPACK PARTS ROSTER <ddmmyyyy>.xlsx" with the given parts in Sr order. */
export function exportRosterXlsx(parts, date = new Date()) {
  const rows = [...parts].sort(bySr).map((p) =>
    EXPORT_COLUMNS.map(({ key }) => {
      const v = p[key];
      if (key === 'qty' || key === 'sr_no') return v === null || v === undefined || v === '' ? '' : Number(v);
      return v ?? '';
    })
  );
  const sheet = XLSX.utils.aoa_to_sheet([EXPORT_COLUMNS.map((c) => c.header), ...rows]);
  sheet['!cols'] = EXPORT_COLUMNS.map((c) => ({ wch: c.width }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'PARTS ROSTER');
  XLSX.writeFile(book, `INNOPACK PARTS ROSTER ${ddmmyyyy(date)}.xlsx`);
}
