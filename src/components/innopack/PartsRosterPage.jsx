import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Download, Trash2, ChevronUp, ChevronDown, X, AlertCircle } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { Modal, Loading, ErrorNote, EmptyState, Pill } from '../testing/TestingUi';
import { FIELD, LABEL, BTN_CREATE, BTN_PRIMARY, BTN_SECONDARY, BTN_DANGER, CARD } from '../testing/testingFormat';
import { partsApi, errorText, fieldErrors } from './innopackApi';
import {
  LIMITS, QTY_MAX, NO_SECTION, useInnopackParts, missingInfo, sectionOf, sectionOrder,
  isReleased, isUndecided, exportRosterXlsx,
} from './innopackParts';

const BLANK = '__blank__';
const upper = (v) => (typeof v === 'string' ? v.trim().toUpperCase() : '');
const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ── Design status pill ───────────────────────────────────────────────
// The only colour in the table: green released, amber TBD, quiet grey otherwise.
function DesignPill({ status }) {
  const s = upper(status);
  if (!s) return <span className="text-xs text-gray-400">Not set</span>;
  if (s === 'RELEASED') return <Pill className="bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200">Released</Pill>;
  if (s === 'TBD') return <Pill className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">TBD</Pill>;
  return <Pill className="bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-200">{status}</Pill>;
}

// In-house / bought-out as a neutral label; anything else is shown as typed.
function SourcingLabel({ sourcing }) {
  const s = upper(sourcing);
  if (!s) return <span className="text-gray-300">—</span>;
  const label = s === 'INNOPACK' ? 'In-house' : s === 'BOP' ? 'Bought-out' : sourcing;
  return <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 whitespace-nowrap">{label}</span>;
}

// ── Table columns ────────────────────────────────────────────────────
// `sort` = value used when sorting by that column (omitted = not sortable).
// `extra` columns only show with "Show all columns"; everything is always in the part form.
const COLUMNS = [
  { key: 'sr_no', label: 'Sr', sort: (p) => Number(p.sr_no) || 0, className: 'text-right w-12', extra: true },
  { key: 'drg_no', label: 'Drg no', sort: (p) => text(p.drg_no), className: 'w-28' },
  { key: 'part_name', label: 'Part name', sort: (p) => text(p.part_name).toLowerCase() },
  { key: 'description', label: 'Description' },
  { key: 'section', label: 'Section', sort: (p) => sectionOf(p), ungroupedOnly: true },
  { key: 'sourcing', label: 'Sourcing', sort: (p) => upper(p.sourcing) },
  { key: 'part_type', label: 'Type', extra: true },
  { key: 'qty', label: 'Qty', sort: (p) => (p.qty == null ? null : Number(p.qty)), className: 'text-right' },
  { key: 'material_grade', label: 'Material', sort: (p) => upper(p.material_grade) },
  { key: 'rm_dimensions', label: 'RM dimensions', extra: true },
  { key: 'bop_supplier', label: 'BOP supplier', sort: (p) => upper(p.bop_supplier), extra: true },
  { key: 'part_maturity', label: 'Maturity', extra: true },
  { key: 'design_status', label: 'Design', sort: (p) => upper(p.design_status) },
];

function compareValues(a, b) {
  const emptyA = a === null || a === '';
  const emptyB = b === null || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1; // blanks last
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const TH = 'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-left text-gray-500 bg-gray-50 border-b border-gray-200';
const TD = 'px-4 py-3 text-sm align-middle border-b border-gray-100';

// ── Add / edit form ─────────────────────────────────────────────────
const TEXT_FIELDS = ['section', 'sourcing', 'part_type', 'part_name', 'description', 'units', 'material_grade', 'design_status', 'rm_dimensions', 'bop_supplier', 'part_maturity'];

function formFromPart(part) {
  const f = {};
  TEXT_FIELDS.forEach((k) => { f[k] = text(part?.[k]); });
  f.qty = part?.qty == null ? '' : String(part.qty);
  if (!part) f.units = 'NOS';
  return f;
}

function validate(form) {
  const errs = {};
  if (!form.part_name.trim()) errs.part_name = 'Part name is required.';
  TEXT_FIELDS.forEach((k) => {
    if (form[k].trim().length > LIMITS[k]) errs[k] = `At most ${LIMITS[k]} characters.`;
  });
  if (form.qty.trim() !== '') {
    const n = Number(form.qty);
    if (!Number.isFinite(n) || n < 0 || n > QTY_MAX) errs.qty = `Enter a number from 0 to ${QTY_MAX.toLocaleString('en-IN')}.`;
  }
  return errs;
}

function toPayload(form) {
  const body = {};
  TEXT_FIELDS.forEach((k) => {
    const v = form[k].trim();
    body[k] = v === '' ? null : v;
  });
  body.qty = form.qty.trim() === '' ? null : Number(form.qty);
  return body;
}

function Field({ label, name, error, hint, required, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={`ip-${name}`} className={LABEL}>
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`ip-${name}-err`} className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

function SuggestInput({ name, value, onChange, error, suggestions, placeholder }) {
  const listId = `ip-${name}-list`;
  return (
    <>
      <input
        id={`ip-${name}`}
        type="text"
        list={suggestions?.length ? listId : undefined}
        value={value}
        maxLength={LIMITS[name]}
        placeholder={placeholder}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `ip-${name}-err` : undefined}
        className={`${FIELD} ${error ? 'border-red-400' : ''}`}
        autoComplete="off"
      />
      {suggestions?.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </>
  );
}

function PartFormModal({ part, options, onClose, onSaved, onDelete }) {
  const isEdit = !!part;
  const [form, setForm] = useState(() => formFromPart(part));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const opt = (k) => (Array.isArray(options?.[k]) ? options[k] : []);

  const setField = useCallback((name, value) => {
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  }, []);

  const designChoices = [...new Set(['TBD', 'RELEASED', ...opt('design_status'), form.design_status].filter(Boolean))];

  const submit = async (addAnother) => {
    const local = validate(form);
    if (Object.keys(local).length) {
      setErrors(local);
      setFormError('Please fix the highlighted fields.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = toPayload(form);
      const saved = isEdit ? await partsApi.update(part.id, body) : await partsApi.create(body);
      onSaved(saved, { isEdit, addAnother });
      if (addAnother) {
        // Keep the section / sourcing / units for the next part in the same group.
        setForm({ ...formFromPart(null), section: form.section, sourcing: form.sourcing, units: form.units });
        setErrors({});
      }
    } catch (err) {
      const fe = fieldErrors(err);
      setErrors(fe);
      const shown = Object.keys(fe).some((k) => k === 'qty' || TEXT_FIELDS.includes(k));
      setFormError(shown ? 'Please fix the highlighted fields.' : errorText(err, 'Could not save the part.'));
    } finally {
      setSaving(false);
    }
  };

  const close = () => { if (!saving) onClose(); };
  const drgLabel = isEdit
    ? part.drg_no || '—'
    : options?.next_drg_no ? `${options.next_drg_no} (assigned on save)` : 'Assigned on save';

  return (
    <Modal
      title={isEdit ? `Edit part ${part.drg_no || ''}`.trim() : 'Add part'}
      onClose={close}
      wide
      footer={(
        <>
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(part)}
              disabled={saving}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete part
            </button>
          )}
          <button type="button" className={BTN_SECONDARY} onClick={close} disabled={saving}>Cancel</button>
          {!isEdit && (
            <button type="button" className={BTN_PRIMARY} onClick={() => submit(true)} disabled={saving}>
              Save &amp; add another
            </button>
          )}
          <button type="button" className={BTN_CREATE} onClick={() => submit(false)} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add part'}
          </button>
        </>
      )}
    >
      <form
        onSubmit={(e) => { e.preventDefault(); submit(false); }}
        noValidate
        className="space-y-4"
      >
        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span className="break-words">{formError}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="min-w-0">
            <span className={LABEL}>Drg no</span>
            <p className="px-3 py-2 rounded-lg bg-navy-50 text-sm font-mono text-navy-800 truncate" title="Drawing numbers are assigned by the server and never change">{drgLabel}</p>
          </div>
          {isEdit && (
            <div className="min-w-0">
              <span className={LABEL}>Sr</span>
              <p className="px-3 py-2 rounded-lg bg-navy-50 text-sm text-navy-800 tabular-nums">{part.sr_no ?? '—'}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Part name" name="part_name" error={errors.part_name} required>
            <SuggestInput name="part_name" value={form.part_name} onChange={setField} error={errors.part_name} />
          </Field>
          <Field label="Section" name="section" error={errors.section} hint="e.g. MAIN ROTARY, FEEDER">
            <SuggestInput name="section" value={form.section} onChange={setField} error={errors.section} suggestions={opt('section')} />
          </Field>
          <Field label="Part sourcing" name="sourcing" error={errors.sourcing} hint="INNOPACK = in-house, BOP = bought-out">
            <SuggestInput name="sourcing" value={form.sourcing} onChange={setField} error={errors.sourcing} suggestions={opt('sourcing')} />
          </Field>
          <Field label="Type" name="part_type" error={errors.part_type}>
            <SuggestInput name="part_type" value={form.part_type} onChange={setField} error={errors.part_type} suggestions={opt('part_type')} placeholder="e.g. FASTNER, BEARING" />
          </Field>
        </div>

        <Field label="Part description" name="description" error={errors.description}>
          <textarea
            id="ip-description"
            rows={2}
            value={form.description}
            maxLength={LIMITS.description}
            onChange={(e) => setField('description', e.target.value)}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? 'ip-description-err' : undefined}
            className={`${FIELD} ${errors.description ? 'border-red-400' : ''}`}
          />
        </Field>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Qty" name="qty" error={errors.qty}>
            <input
              id="ip-qty"
              type="number"
              inputMode="decimal"
              min={0}
              max={QTY_MAX}
              step="any"
              value={form.qty}
              onChange={(e) => setField('qty', e.target.value)}
              aria-invalid={!!errors.qty}
              aria-describedby={errors.qty ? 'ip-qty-err' : undefined}
              className={`${FIELD} ${errors.qty ? 'border-red-400' : ''}`}
            />
          </Field>
          <Field label="Units" name="units" error={errors.units}>
            <SuggestInput name="units" value={form.units} onChange={setField} error={errors.units} suggestions={opt('units')} />
          </Field>
          <Field label="Design" name="design_status" error={errors.design_status}>
            <select
              id="ip-design_status"
              value={form.design_status}
              onChange={(e) => setField('design_status', e.target.value)}
              aria-invalid={!!errors.design_status}
              className={`${FIELD} ${errors.design_status ? 'border-red-400' : ''}`}
            >
              <option value="">Not set</option>
              {designChoices.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Part maturity" name="part_maturity" error={errors.part_maturity}>
            <SuggestInput name="part_maturity" value={form.part_maturity} onChange={setField} error={errors.part_maturity} suggestions={opt('part_maturity')} placeholder="e.g. DESIGN" />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="RM - Material grade" name="material_grade" error={errors.material_grade}>
            <SuggestInput name="material_grade" value={form.material_grade} onChange={setField} error={errors.material_grade} suggestions={opt('material_grade')} placeholder="e.g. MS, EN24, SS" />
          </Field>
          <Field label="RM - Dimensions" name="rm_dimensions" error={errors.rm_dimensions}>
            <SuggestInput name="rm_dimensions" value={form.rm_dimensions} onChange={setField} error={errors.rm_dimensions} placeholder="e.g. Dia 170x25" />
          </Field>
          <Field label="BOP supplier" name="bop_supplier" error={errors.bop_supplier}>
            <SuggestInput name="bop_supplier" value={form.bop_supplier} onChange={setField} error={errors.bop_supplier} suggestions={opt('bop_supplier')} />
          </Field>
        </div>
        {/* Lets Enter submit from any input. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

function DeleteModal({ part, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await partsApi.remove(part.id);
      onDeleted(part);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Delete part?"
      onClose={() => { if (!busy) onClose(); }}
      footer={(
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={BTN_DANGER} onClick={confirm} disabled={busy}>
            <Trash2 size={14} /> {busy ? 'Deleting…' : 'Delete part'}
          </button>
        </>
      )}
    >
      <div className="space-y-3 text-sm text-gray-600">
        <p>
          <span className="font-mono text-navy-800">{part.drg_no || '—'}</span>
          {' · '}
          <span className="font-semibold text-navy-800">{part.part_name || 'Unnamed part'}</span>
          {part.section ? <span className="text-gray-400"> ({part.section})</span> : null}
        </p>
        <p>The part is removed from the roster. Its drawing number is not given to any other part.</p>
        {error && <ErrorNote error={error} />}
      </div>
    </Modal>
  );
}

// ── Page ─────────────────────────────────────────────────────────────
function PartsRosterPage({ socket }) {
  const { notifySuccess } = useNotify();
  const { parts, setParts, loading, error, reload } = useInnopackParts(socket);
  const [options, setOptions] = useState(null);
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState({ key: 'sr_no', dir: 'asc' });
  const [grouped, setGrouped] = useState(true);
  const [allColumns, setAllColumns] = useState(false);
  const [editing, setEditing] = useState(null); // null | { part } (part null = add)
  const [deleting, setDeleting] = useState(null);

  // The search box keeps its own state (typing stays smooth) and is mirrored to ?q= after a pause.
  const [q, setQ] = useState(() => params.get('q') || '');
  const section = params.get('section') || '';
  const sourcing = params.get('sourcing') || '';
  const design = params.get('design') || '';
  const missingOnly = params.get('filter') === 'missing';
  const anyFilter = !!(q || section || sourcing || design || missingOnly);

  const setParam = useCallback((key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);
  const clearFilters = () => {
    setQ('');
    setParams({}, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') || '') === q.trim()) return undefined; // already in sync: never loop
    const t = setTimeout(() => setParam('q', q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, params, setParam]);

  const loadOptions = useCallback(async () => {
    try {
      setOptions(await partsApi.options());
    } catch {
      // Suggestions are a convenience; the form still works without them.
    }
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // Filter choices come from the parts themselves so they always match the table.
  const choices = useMemo(() => {
    const distinct = (fn) => [...new Set(parts.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      sections: sectionOrder(parts),
      sourcing: distinct((p) => upper(p.sourcing)),
      design: distinct((p) => upper(p.design_status)),
      hasBlankSourcing: parts.some((p) => !upper(p.sourcing)),
    };
  }, [parts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return parts.filter((p) => {
      if (section && sectionOf(p) !== section) return false;
      if (sourcing) {
        if (sourcing === BLANK ? upper(p.sourcing) : upper(p.sourcing) !== sourcing.toUpperCase()) return false;
      }
      if (design) {
        if (design === 'undecided') { if (!isUndecided(p)) return false; }
        else if (design === BLANK) { if (upper(p.design_status)) return false; }
        else if (upper(p.design_status) !== design.toUpperCase()) return false;
      }
      if (missingOnly && missingInfo(p).length === 0) return false;
      if (needle) {
        const hay = [p.part_name, p.description, p.drg_no, p.material_grade].map(text).join('\n').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [parts, q, section, sourcing, design, missingOnly]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      const primary = compareValues(va, vb);
      // Blanks stay last in both directions; ties fall back to Sr.
      const blank = va === null || va === '' || vb === null || vb === '';
      return (blank ? primary : primary * sign) || (Number(a.sr_no) || 0) - (Number(b.sr_no) || 0);
    });
  }, [filtered, sort]);

  // Grouped view: sections in machine order, each sorted by the chosen column.
  const groups = useMemo(() => {
    if (!grouped) return null;
    const order = sectionOrder(parts);
    const map = new Map(order.map((s) => [s, []]));
    sorted.forEach((p) => {
      const s = sectionOf(p);
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(p);
    });
    return [...map.entries()].filter(([, rows]) => rows.length > 0);
  }, [grouped, sorted, parts]);

  const counts = useMemo(() => ({
    released: filtered.filter(isReleased).length,
    undecided: filtered.filter(isUndecided).length,
    missing: filtered.filter((p) => missingInfo(p).length > 0).length,
  }), [filtered]);

  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const openAdd = () => {
    loadOptions(); // fresh next_drg_no
    setEditing({ part: null });
  };

  const handleSaved = (saved, { isEdit, addAnother }) => {
    if (saved && saved.id != null) {
      // A socket-driven refetch may already hold this part, so replace rather than append twice.
      setParts((prev) => (prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved]));
    }
    notifySuccess(isEdit ? `Part ${saved?.drg_no || ''} updated`.trim() : `Part ${saved?.drg_no || ''} added`.trim());
    loadOptions();
    if (!addAnother) setEditing(null);
  };

  const handleDeleted = (part) => {
    setParts((prev) => prev.filter((p) => p.id !== part.id));
    notifySuccess(`Part ${part.drg_no || ''} deleted`.trim());
    setDeleting(null);
    setEditing(null);
  };

  const columns = COLUMNS.filter((c) => (allColumns || !c.extra) && !(grouped && c.ungroupedOnly));

  const handleExport = () => {
    exportRosterXlsx(parts);
  };

  const dash = <span className="text-gray-300">—</span>;
  const cell = (p, key) => {
    switch (key) {
      case 'sr_no': return <td key={key} className={`${TD} text-right tabular-nums text-gray-400`}>{p.sr_no ?? '—'}</td>;
      case 'drg_no': return <td key={key} className={`${TD} font-mono text-[13px] text-gray-600 whitespace-nowrap`}>{p.drg_no || '—'}</td>;
      case 'part_name': return (
        <td key={key} className={`${TD} min-w-[12rem] font-medium text-navy-800`}>
          {p.part_name || <span className="font-normal italic text-gray-400">Unnamed part</span>}
        </td>
      );
      case 'description': return (
        <td key={key} className={`${TD} text-gray-600`}>
          {p.description ? <div className="max-w-[22rem] truncate" title={p.description}>{p.description}</div> : dash}
        </td>
      );
      case 'section': return <td key={key} className={`${TD} whitespace-nowrap text-gray-600`}>{p.section || dash}</td>;
      case 'sourcing': return <td key={key} className={TD}><SourcingLabel sourcing={p.sourcing} /></td>;
      case 'qty': return (
        <td key={key} className={`${TD} text-right tabular-nums whitespace-nowrap text-navy-800`}>
          {p.qty == null ? dash : <>{p.qty}{p.units ? <span className="text-gray-400 text-xs ml-1">{p.units}</span> : null}</>}
        </td>
      );
      case 'design_status': return <td key={key} className={`${TD} whitespace-nowrap`}><DesignPill status={p.design_status} /></td>;
      default: return <td key={key} className={`${TD} whitespace-nowrap text-gray-600`}>{p[key] || dash}</td>;
    }
  };

  // The whole row opens the part (click, or Enter/Space when focused).
  const renderRow = (p) => {
    const missing = missingInfo(p);
    const open = () => setEditing({ part: p });
    return (
      <tr
        key={p.id}
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        aria-label={`${p.drg_no || ''} ${p.part_name || 'Unnamed part'}${missing.length ? `, missing ${missing.join(', ')}` : ''}. Open`}
        className="group cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:bg-gold-300/10"
      >
        {columns.map((c) => cell(p, c.key))}
      </tr>
    );
  };

  const colCount = columns.length;

  return (
    <div className="max-w-[100rem] mx-auto space-y-4">
      {/* Header */}
      <div className="anim-in flex flex-wrap items-end justify-between gap-3" style={{ '--i': 0 }}>
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold text-navy-800">Parts Roster</h2>
          <p className="text-sm text-gray-500 mt-0.5">Packaging machine parts, drawing numbers and design status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={handleExport}
            disabled={loading || !!error || parts.length === 0}
            title="Download the whole roster in the original sheet layout"
          >
            <Download size={15} /> Export to Excel
          </button>
          <button type="button" className={BTN_CREATE} onClick={openAdd} disabled={loading || !!error}>
            <Plus size={16} /> Add part
          </button>
        </div>
      </div>

      {/* Filters + table in one card: toolbar on top, table below */}
      <div className={`anim-in ${CARD} overflow-hidden`} style={{ '--i': 1 }}>
      <div className="p-3 sm:p-4 space-y-3 border-b border-gray-200">
        <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] gap-2 sm:gap-3">
          <div className="relative col-span-2 lg:col-span-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, description, drg no, material…"
              aria-label="Search parts"
              className={`${FIELD} pl-9`}
            />
          </div>
          <select value={section} onChange={(e) => setParam('section', e.target.value)} aria-label="Section" className={FIELD}>
            <option value="">All sections</option>
            {choices.sections.map((s) => <option key={s} value={s}>{s}</option>)}
            {section && !choices.sections.includes(section) && <option value={section}>{section}</option>}
          </select>
          <select value={sourcing} onChange={(e) => setParam('sourcing', e.target.value)} aria-label="Sourcing" className={FIELD}>
            <option value="">All sourcing</option>
            {choices.sourcing.map((s) => <option key={s} value={s}>{s === 'INNOPACK' ? 'INNOPACK (in-house)' : s === 'BOP' ? 'BOP (bought-out)' : s}</option>)}
            {choices.hasBlankSourcing && <option value={BLANK}>Not set</option>}
            {sourcing && sourcing !== BLANK && !choices.sourcing.includes(sourcing.toUpperCase()) && <option value={sourcing}>{sourcing}</option>}
          </select>
          <select value={design} onChange={(e) => setParam('design', e.target.value)} aria-label="Design status" className={`${FIELD} col-span-2 sm:col-span-1`}>
            <option value="">All design status</option>
            <option value="undecided">Not released (TBD / not set)</option>
            {choices.design.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={BLANK}>Not set</option>
            {design && ![BLANK, 'undecided'].includes(design) && !choices.design.includes(design.toUpperCase()) && <option value={design}>{design}</option>}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            { on: missingOnly, label: 'Incomplete only', toggle: () => setParam('filter', missingOnly ? '' : 'missing') },
            { on: grouped, label: 'Group by section', toggle: () => setGrouped((g) => !g) },
            { on: allColumns, label: 'Show all columns', toggle: () => setAllColumns((a) => !a) },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              aria-pressed={t.on}
              onClick={t.toggle}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                t.on ? 'border-navy-800 bg-navy-800 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-navy-800'
              }`}
            >
              {t.label}
            </button>
          ))}
          {anyFilter && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 px-1 text-xs font-medium text-gray-500 hover:text-navy-800">
              <X size={13} /> Clear filters
            </button>
          )}
          {!loading && !error && (
            <p className="sm:ml-auto text-xs text-gray-500 tabular-nums" aria-live="polite">
              {filtered.length === parts.length ? `${parts.length} parts` : `${filtered.length} of ${parts.length} parts`}
              <span className="mx-2 text-gray-300">·</span>{counts.released} released
              <span className="mx-2 text-gray-300">·</span>{counts.missing} incomplete
            </p>
          )}
        </div>
      </div>

      {/* Table */}
        {loading ? (
          <Loading label="Loading parts…" />
        ) : error ? (
          <div className="p-4"><ErrorNote error={error} onRetry={() => reload()} /></div>
        ) : parts.length === 0 ? (
          <EmptyState>
            No parts yet.{' '}
            <button type="button" onClick={openAdd} className="font-semibold text-navy-700 underline">Add the first part</button>.
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState>
            No parts match these filters.{' '}
            <button type="button" onClick={clearFilters} className="font-semibold text-navy-700 underline">Clear filters</button>
          </EmptyState>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-16rem)] min-h-[16rem]">
            <table className={`w-full border-separate border-spacing-0 ${allColumns ? 'min-w-[1300px]' : 'min-w-[900px]'}`}>
              <caption className="sr-only">Parts. Select a row to open the part.</caption>
              <thead className="sticky top-0 z-10">
                <tr>
                  {columns.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        className={`${TH} ${c.className || ''}`}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {c.sort ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={`inline-flex items-center gap-0.5 uppercase tracking-wide hover:text-navy-800 ${active ? 'text-navy-800' : ''}`}
                          >
                            {c.label}
                            {active && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                          </button>
                        ) : c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {groups
                  ? groups.map(([name, rows]) => (
                    <SectionGroup key={name} name={name} count={rows.length} released={rows.filter(isReleased).length} colSpan={colCount}>
                      {rows.map(renderRow)}
                    </SectionGroup>
                  ))
                  : sorted.map(renderRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <PartFormModal
          key={editing.part?.id ?? 'new'}
          part={editing.part}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDelete={(p) => setDeleting(p)}
        />
      )}
      {deleting && (
        <DeleteModal part={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} />
      )}
    </div>
  );
}

function SectionGroup({ name, count, released, colSpan, children }) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          colSpan={colSpan}
          className="px-4 pt-5 pb-2 text-left bg-white border-b border-gray-200"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className={`text-xs font-semibold uppercase tracking-wider ${name === NO_SECTION ? 'text-gray-400' : 'text-navy-800'}`}>{name}</span>
            <span className="text-xs font-normal text-gray-400 tabular-nums">
              {count} {count === 1 ? 'part' : 'parts'} · {released} released
            </span>
          </span>
        </th>
      </tr>
      {children}
    </>
  );
}

export default PartsRosterPage;
