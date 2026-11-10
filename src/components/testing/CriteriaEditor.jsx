// Structured editor for a criteria `definition` (admin-api.md): units + rule rows.
// The UI never fills in a numeric value: empty stays null, and values must be typed from the
// testing head's signed sheet.
import { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Code } from 'lucide-react';
import { FIELD, LABEL, BTN_CREATE, BTN_SECONDARY, TH, TD } from './testingFormat';

const RULE_TYPES = ['max', 'min', 'range', 'checkpoint', 'tracking', 'reach', 'bemf_constant'];
const SIGNALS = ['current_a', 'voltage_v', 'rpm_actual', 'bemf_v'];

const NUMERIC = ['limit', 'min', 'max', 'at_rpm', 'rpm_window', 'exclude_first_ms'];
const MANAGED = new Set(['id', 'type', 'signal', ...NUMERIC, 'method', 'filter', 'on_violation']);
const ALL_FIELDS = ['limit', 'min', 'max', 'at_rpm', 'rpm_window', 'method', 'filter', 'exclude_first_ms'];

// Which inputs each rule type shows. Types not listed show every field.
const FIELDS_BY_TYPE = {
  max: ['limit', 'filter', 'exclude_first_ms'],
  min: ['limit', 'filter', 'exclude_first_ms'],
  range: ['min', 'max', 'filter', 'exclude_first_ms'],
  checkpoint: ['at_rpm', 'rpm_window', 'method', 'min', 'max'],
};

const fieldsFor = (type) => FIELDS_BY_TYPE[type] || ALL_FIELDS;

const NUM_LABELS = {
  limit: 'Limit', min: 'Min', max: 'Max', at_rpm: 'At RPM', rpm_window: 'RPM window (±)', exclude_first_ms: 'Ignore first (ms)',
};

const str = (v) => (v === null || v === undefined ? '' : String(v));

let rowSeq = 0;
const rowKey = () => `r${Date.now().toString(36)}${(rowSeq += 1)}`;

/** API rule -> editable row (numbers as strings, unknown keys kept in `extra`). */
function toRow(rule) {
  const extra = {};
  Object.entries(rule || {}).forEach(([k, v]) => { if (!MANAGED.has(k)) extra[k] = v; });
  return {
    _key: rowKey(),
    id: str(rule?.id),
    type: rule?.type || 'max',
    signal: rule?.signal || 'current_a',
    limit: str(rule?.limit),
    min: str(rule?.min),
    max: str(rule?.max),
    at_rpm: str(rule?.at_rpm),
    rpm_window: str(rule?.rpm_window),
    exclude_first_ms: str(rule?.exclude_first_ms),
    method: str(rule?.method),
    filter_kind: str(rule?.filter?.kind),
    filter_window_ms: str(rule?.filter?.window_ms),
    on_violation: str(rule?.on_violation),
    extra,
  };
}

const parseNum = (s) => (String(s).trim() === '' ? null : Number(s));

/** Editable row -> API rule. Only the fields of the rule's type are sent; empty numbers are null. */
function toRule(row) {
  const rule = { ...row.extra, id: row.id.trim(), type: row.type, signal: row.signal };
  fieldsFor(row.type).forEach((f) => {
    if (f === 'filter') {
      rule.filter = { kind: row.filter_kind.trim() || 'none', window_ms: parseNum(row.filter_window_ms) };
    } else if (f === 'method') {
      if (row.method.trim()) rule.method = row.method.trim();
    } else {
      rule[f] = parseNum(row[f]);
    }
  });
  if (row.on_violation) rule.on_violation = row.on_violation;
  return rule;
}

function rowProblems(row, rows) {
  const p = [];
  if (!row.id.trim()) p.push('id is required');
  else if (rows.filter((r) => r.id.trim() === row.id.trim()).length > 1) p.push('id must be unique');
  fieldsFor(row.type).forEach((f) => {
    if (f === 'filter') {
      if (row.filter_window_ms.trim() && !Number.isFinite(Number(row.filter_window_ms))) p.push('filter window must be a number');
    } else if (NUMERIC.includes(f) && row[f].trim() && !Number.isFinite(Number(row[f]))) {
      p.push(`${NUM_LABELS[f]} must be a number`);
    }
  });
  return p;
}

function emptyNumbers(row) {
  return fieldsFor(row.type).filter((f) => NUMERIC.includes(f) && f !== 'exclude_first_ms' && f !== 'rpm_window' && !row[f].trim());
}

function NumInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 mb-0.5">{label}</span>
      <input type="text" inputMode="decimal" className={FIELD} value={value} onChange={(e) => onChange(e.target.value)} placeholder="from sheet" />
    </label>
  );
}

function RuleRow({ row, index, count, problems, onChange, onRemove, onMove }) {
  const set = (k) => (v) => onChange({ ...row, [k]: v });
  const fields = fieldsFor(row.type);
  return (
    <div className={`border rounded-lg p-3 space-y-3 ${problems.length ? 'border-red-300' : 'border-navy-100'}`}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block w-full sm:w-40">
          <span className="block text-[11px] font-medium text-gray-500 mb-0.5">Rule id *</span>
          <input className={`${FIELD} font-mono`} value={row.id} onChange={(e) => set('id')(e.target.value.toUpperCase())} placeholder="e.g. I_MAX" />
        </label>
        <label className="block flex-1 min-w-[8rem]">
          <span className="block text-[11px] font-medium text-gray-500 mb-0.5">Type</span>
          <select className={FIELD} value={row.type} onChange={(e) => set('type')(e.target.value)}>
            {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-[8rem]">
          <span className="block text-[11px] font-medium text-gray-500 mb-0.5">Signal</span>
          <select className={FIELD} value={row.signal} onChange={(e) => set('signal')(e.target.value)}>
            {SIGNALS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block flex-1 min-w-[8rem]">
          <span className="block text-[11px] font-medium text-gray-500 mb-0.5">On violation</span>
          <select className={FIELD} value={row.on_violation} onChange={(e) => set('on_violation')(e.target.value)}>
            <option value="">FAIL (default)</option>
            <option value="FAIL">FAIL</option>
            <option value="INVALID">INVALID</option>
          </select>
        </label>
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="p-1.5 text-gray-400 hover:text-navy-800 disabled:opacity-30" aria-label="Move up"><ChevronUp size={16} /></button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="p-1.5 text-gray-400 hover:text-navy-800 disabled:opacity-30" aria-label="Move down"><ChevronDown size={16} /></button>
          <button type="button" onClick={onRemove} className="p-1.5 text-red-500 hover:text-red-700" aria-label="Remove rule"><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {fields.filter((f) => NUMERIC.includes(f)).map((f) => (
          <NumInput key={f} label={NUM_LABELS[f]} value={row[f]} onChange={set(f)} />
        ))}
        {fields.includes('method') && (
          <label className="block">
            <span className="block text-[11px] font-medium text-gray-500 mb-0.5">Method</span>
            <input className={FIELD} value={row.method} onChange={(e) => set('method')(e.target.value)} list="mt-methods" placeholder="e.g. window_mean" />
          </label>
        )}
        {fields.includes('filter') && (
          <>
            <label className="block">
              <span className="block text-[11px] font-medium text-gray-500 mb-0.5">Filter</span>
              <input className={FIELD} value={row.filter_kind} onChange={(e) => set('filter_kind')(e.target.value)} list="mt-filters" placeholder="none" />
            </label>
            <NumInput label="Filter window (ms)" value={row.filter_window_ms} onChange={set('filter_window_ms')} />
          </>
        )}
      </div>
      {problems.length > 0 && <div className="text-xs text-red-600">{problems.join(' · ')}</div>}
    </div>
  );
}

/**
 * Modal body + footer for creating / editing a criteria draft.
 * onSave({ definition, source_document }) must return a promise.
 */
export function CriteriaEditor({ initial, onSave, onCancel, saving }) {
  const def = initial?.definition || {};
  const [units, setUnits] = useState(() => ({ current: 'A', voltage: 'V', speed: 'rpm', ...(def.units || {}) }));
  const [sourceDocument, setSourceDocument] = useState(initial?.source_document || '');
  const [rows, setRows] = useState(() => (def.rules || []).map(toRow));
  const [showJson, setShowJson] = useState(false);

  const problems = useMemo(() => rows.map((r) => rowProblems(r, rows)), [rows]);
  const hasProblems = problems.some((p) => p.length);
  const blanks = useMemo(() => rows.filter((r) => emptyNumbers(r).length).map((r) => r.id || '(no id)'), [rows]);

  const definition = useMemo(() => ({ schema: def.schema ?? 1, units, rules: rows.map(toRule) }), [def.schema, units, rows]);

  const update = (i, row) => setRows((rs) => rs.map((r, idx) => (idx === i ? row : r)));
  const move = (i, d) => setRows((rs) => {
    const next = [...rs];
    const [r] = next.splice(i, 1);
    next.splice(i + d, 0, r);
    return next;
  });

  const submit = (e) => {
    e.preventDefault();
    if (hasProblems || rows.length === 0) return;
    onSave({ definition, source_document: sourceDocument.trim() || null });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <datalist id="mt-methods"><option value="window_mean" /></datalist>
      <datalist id="mt-filters"><option value="none" /></datalist>

      <div className="flex items-start gap-2 rounded-lg border border-gold-400 bg-gold-300/20 px-3 py-2 text-sm text-navy-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-gold-600" />
        <span>
          Every number must be copied from the <b>signed criteria sheet</b>. Nothing is pre-filled; leave a value empty only if the
          sheet does not define it yet — a version with empty limits cannot judge a motor.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={LABEL} htmlFor="crit-src">Source document</label>
          <input id="crit-src" className={FIELD} value={sourceDocument} onChange={(e) => setSourceDocument(e.target.value)} maxLength={300} placeholder="Signed sheet reference, e.g. QA-MT-001 rev B, signed 2026-11-02" />
        </div>
        <div className="sm:col-span-2 grid grid-cols-3 gap-2">
          {[['current', 'Current unit'], ['voltage', 'Voltage unit'], ['speed', 'Speed unit']].map(([k, label]) => (
            <label key={k} className="block">
              <span className="block text-[11px] font-medium text-gray-500 mb-0.5">{label}</span>
              <input className={FIELD} value={units[k] ?? ''} onChange={(e) => setUnits((u) => ({ ...u, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-navy-800">Rules ({rows.length})</div>
          <button type="button" onClick={() => setShowJson((s) => !s)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-navy-800">
            <Code size={13} /> {showJson ? 'Hide JSON' : 'Show JSON'}
          </button>
        </div>
        {rows.map((row, i) => (
          <RuleRow
            key={row._key}
            row={row}
            index={i}
            count={rows.length}
            problems={problems[i]}
            onChange={(r) => update(i, r)}
            onRemove={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
            onMove={(d) => move(i, d)}
          />
        ))}
        {rows.length === 0 && <div className="text-sm text-gray-400 border border-dashed border-navy-100 rounded-lg p-4 text-center">No rules yet. Add one per line of the signed sheet.</div>}
        <button type="button" onClick={() => setRows((rs) => [...rs, toRow({ type: 'max', signal: 'current_a' })])} className={BTN_CREATE}>
          <Plus size={15} /> Add rule
        </button>
        {blanks.length > 0 && (
          <div className="text-xs text-amber-700">Empty limit values in: {blanks.join(', ')}.</div>
        )}
        {showJson && (
          <pre className="text-[11px] bg-navy-50 rounded-lg p-3 overflow-x-auto max-h-64">{JSON.stringify(definition, null, 2)}</pre>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-navy-100">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        <button type="submit" className={BTN_CREATE} disabled={saving || hasProblems || rows.length === 0}>
          {saving ? 'Saving…' : 'Save draft'}
        </button>
      </div>
    </form>
  );
}

function ruleValues(rule) {
  const parts = [];
  ['limit', 'min', 'max', 'at_rpm', 'rpm_window', 'exclude_first_ms'].forEach((k) => {
    if (rule[k] !== undefined) parts.push(`${k} ${rule[k] === null ? '—' : rule[k]}`);
  });
  if (rule.method) parts.push(`method ${rule.method}`);
  if (rule.filter?.kind && rule.filter.kind !== 'none') parts.push(`filter ${rule.filter.kind}${rule.filter.window_ms != null ? ` ${rule.filter.window_ms} ms` : ''}`);
  return parts.join(' · ') || '—';
}

/** Read-only rules table of a criteria definition. */
export function CriteriaRulesView({ definition }) {
  const rules = definition?.rules || [];
  return (
    <div className="space-y-2">
      {definition?.units && (
        <div className="text-xs text-gray-500">Units: {Object.entries(definition.units).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[520px]">
          <thead>
            <tr className="bg-navy-50 text-navy-800">
              <th className={TH}>Rule</th>
              <th className={TH}>Type</th>
              <th className={TH}>Signal</th>
              <th className={TH}>Values</th>
              <th className={TH}>On violation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {rules.map((r, i) => (
              <tr key={`${r.id}-${i}`}>
                <td className={`${TD} font-mono text-xs text-navy-800`}>{r.id}</td>
                <td className={`${TD} text-gray-600`}>{r.type}</td>
                <td className={`${TD} font-mono text-xs text-gray-600`}>{r.signal}</td>
                <td className={`${TD} text-gray-600`}>{ruleValues(r)}</td>
                <td className={`${TD} text-gray-600`}>{r.on_violation || 'FAIL'}</td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={5} className={`${TD} text-center text-gray-400`}>No rules.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
