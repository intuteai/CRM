// Structured editor for a criteria `definition` (admin-api.md): units + rule rows.
// The UI never fills in a numeric value: empty stays null, and values must be typed from the
// testing head's signed sheet.
// Status-flag rules (flag_share, flag_any, flag_exclusion, step_coverage): criteria-flag-rules.md in CRM_BACKEND.
import { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle, Code } from 'lucide-react';
import { FIELD, LABEL, BTN_CREATE, BTN_SECONDARY, TH, TD } from './testingFormat';
import {
  VALUE_TYPES, FLAG_TYPES, SIGNALS, FLAG_BITS, isFlagType, hasVerdict, bitLabel,
  pctToFraction, fractionToPct, describeFlagRule,
} from './criteriaRules';

const NUMERIC = ['limit', 'min', 'max', 'at_rpm', 'rpm_window', 'exclude_first_ms'];
const MANAGED = new Set(['id', 'type', 'signal', ...NUMERIC, 'method', 'filter', 'on_violation']);
const ALL_FIELDS = ['limit', 'min', 'max', 'at_rpm', 'rpm_window', 'method', 'filter', 'exclude_first_ms'];

// Which inputs each value rule type shows. Value types not listed show every field.
const FIELDS_BY_TYPE = {
  max: ['limit', 'filter', 'exclude_first_ms'],
  min: ['limit', 'filter', 'exclude_first_ms'],
  range: ['min', 'max', 'filter', 'exclude_first_ms'],
  checkpoint: ['at_rpm', 'rpm_window', 'method', 'min', 'max'],
};

const fieldsFor = (type) => FIELDS_BY_TYPE[type] || ALL_FIELDS;

// API keys each flag type owns (besides id, type, bit, on_violation). Anything else in a flag rule passes through `extra`.
const FLAG_FIELDS = {
  flag_share: ['max_fraction', 'max_continuous_ms'],
  flag_any: [],
  flag_exclusion: ['window_ms', 'applies_to'],
  step_coverage: ['settle_ms', 'min_readings', 'signals'],
};
// `signal` is managed (and dropped) for flag types: they never carry one. on_violation is dropped for flag_exclusion.
const managedFor = (type) => (isFlagType(type)
  ? new Set(['id', 'type', 'signal', 'bit', 'on_violation', ...FLAG_FIELDS[type]])
  : MANAGED);

const NUM_LABELS = {
  limit: 'Limit', min: 'Min', max: 'Max', at_rpm: 'At RPM', rpm_window: 'RPM window (±)', exclude_first_ms: 'Ignore first (ms)',
};

const str = (v) => (v === null || v === undefined ? '' : String(v));

let rowSeq = 0;
const rowKey = () => `r${Date.now().toString(36)}${(rowSeq += 1)}`;

/** API rule -> editable row (numbers as strings, unknown keys kept in `extra`). */
function toRow(rule) {
  const extra = {};
  const managed = managedFor(rule?.type);
  Object.entries(rule || {}).forEach(([k, v]) => { if (!managed.has(k)) extra[k] = v; });
  const frac = rule?.max_fraction;
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
    // status-flag rules
    bit: str(rule?.bit),
    // shown and typed as a percent; the API stores the 0–1 fraction (0.02 <-> "2")
    max_fraction_pct: typeof frac === 'number' && Number.isFinite(frac) ? fractionToPct(frac) : str(frac),
    max_continuous_ms: str(rule?.max_continuous_ms),
    window_ms: str(rule?.window_ms),
    settle_ms: str(rule?.settle_ms),
    min_readings: str(rule?.min_readings),
    // null = every value rule; an array = only those value-rule ids
    applies_to: Array.isArray(rule?.applies_to) ? rule.applies_to.map(String) : null,
    signals: Array.isArray(rule?.signals) ? rule.signals.map(String) : [],
    extra,
  };
}

const parseNum = (s) => (String(s).trim() === '' ? null : Number(s));

/** Editable flag row -> API rule. Never a signal; on_violation only for types that give a verdict. */
function toFlagRule(row) {
  const rule = { ...row.extra, id: row.id.trim(), type: row.type, bit: row.bit === '' ? null : Number(row.bit) };
  if (row.type === 'flag_share') {
    rule.max_fraction = row.max_fraction_pct.trim() === '' ? null : pctToFraction(row.max_fraction_pct);
    rule.max_continuous_ms = parseNum(row.max_continuous_ms);
  } else if (row.type === 'flag_exclusion') {
    rule.window_ms = parseNum(row.window_ms);
    rule.applies_to = row.applies_to === null ? null : [...row.applies_to];
  } else if (row.type === 'step_coverage') {
    rule.settle_ms = parseNum(row.settle_ms);
    rule.min_readings = parseNum(row.min_readings);
    rule.signals = [...row.signals];
  }
  if (hasVerdict(row.type) && row.on_violation) rule.on_violation = row.on_violation;
  return rule;
}

/** Editable row -> API rule. Only the fields of the rule's type are sent; empty numbers are null. */
function toRule(row) {
  if (isFlagType(row.type)) return toFlagRule(row);
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

/** Ids of the value rules in the editor, in order (what a flag_exclusion may apply to). */
const valueRuleIds = (rows) => [...new Set(rows.filter((r) => VALUE_TYPES.includes(r.type) && r.id.trim()).map((r) => r.id.trim()))];

function rowProblems(row, rows) {
  const p = [];
  if (!row.id.trim()) p.push('id is required');
  else if (!/^[A-Z0-9_]{1,40}$/.test(row.id.trim())) p.push('id: A–Z, 0–9 and _ only, up to 40 characters');
  else if (rows.filter((r) => r.id.trim() === row.id.trim()).length > 1) p.push('id must be unique');
  if (isFlagType(row.type)) return [...p, ...flagProblems(row, rows)];
  fieldsFor(row.type).forEach((f) => {
    if (f === 'filter') {
      if (row.filter_window_ms.trim() && !Number.isFinite(Number(row.filter_window_ms))) p.push('filter window must be a number');
    } else if (NUMERIC.includes(f) && row[f].trim() && !Number.isFinite(Number(row[f]))) {
      p.push(`${NUM_LABELS[f]} must be a number`);
    }
  });
  return p;
}

/** Mirrors the backend checks for flag rules (CRM_BACKEND controllers/testing/admin.controller.js criteriaFields). */
function flagProblems(row, rows) {
  const p = [];
  // '' -> null (not set), otherwise a number (NaN when not one)
  const num = (s) => (s.trim() === '' ? null : Number(s));
  const msField = (s, label, required) => {
    const v = num(s);
    if (v === null) { if (required) p.push(`${label} is required`); return; }
    if (!Number.isFinite(v)) p.push(`${label} must be a number`);
    else if (v < 0) p.push(`${label} must be ≥ 0`);
  };
  if (!/^[4-7]$/.test(row.bit)) p.push('flag bit is required (b4–b7)');
  if (hasVerdict(row.type) && !['FAIL', 'INVALID'].includes(row.on_violation)) p.push('on violation is required (FAIL or INVALID)');
  if (row.type === 'flag_share') {
    const pct = row.max_fraction_pct.trim();
    if (pct === '' && row.max_continuous_ms.trim() === '') p.push('set max share and/or longest stretch');
    if (pct !== '') {
      const frac = pctToFraction(pct);
      if (!Number.isFinite(frac)) p.push('max share must be a number (percent)');
      else if (frac < 0 || frac > 1) p.push('max share must be between 0 and 100 %');
    }
    msField(row.max_continuous_ms, 'longest stretch', false);
  } else if (row.type === 'flag_exclusion') {
    msField(row.window_ms, 'ignore-after window', true);
    if (Array.isArray(row.applies_to)) {
      const ids = valueRuleIds(rows);
      row.applies_to.filter((x) => !ids.includes(x)).forEach((x) => p.push(`${x} is not a value rule in this version`));
    }
  } else if (row.type === 'step_coverage') {
    msField(row.settle_ms, 'settle time', true);
    const n = num(row.min_readings);
    if (n === null) p.push('min readings is required');
    else if (!Number.isInteger(n) || n < 1 || n > 100000) p.push('min readings must be a whole number from 1 to 100000');
    if (row.signals.length === 0) p.push('choose at least one signal');
    else if (new Set(row.signals).size !== row.signals.length || !row.signals.every((s) => SIGNALS.includes(s))) {
      p.push(`signals must be distinct, from ${SIGNALS.join(', ')}`);
    }
  }
  return p;
}

function emptyNumbers(row) {
  if (isFlagType(row.type)) return []; // required flag numbers are reported as problems instead
  return fieldsFor(row.type).filter((f) => NUMERIC.includes(f) && f !== 'exclude_first_ms' && f !== 'rpm_window' && !row[f].trim());
}

function NumInput({ label, value, onChange, hint, inputMode = 'decimal' }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 mb-0.5">{label}</span>
      <input type="text" inputMode={inputMode} className={FIELD} value={value} onChange={(e) => onChange(e.target.value)} placeholder="from sheet" />
      {hint && <span className="block text-[11px] text-gray-400 mt-0.5">{hint}</span>}
    </label>
  );
}

/** Checkbox list; keeps the order items were picked in (so a loaded list saves unchanged). Unknown picked items show in red. */
function CheckList({ label, options, value, onChange, mono = true }) {
  const unknown = value.filter((x) => !options.includes(x));
  const toggle = (x) => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x]);
  const cls = `inline-flex items-center gap-1.5 ${mono ? 'font-mono text-xs' : ''}`;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy-800" role="group" aria-label={label}>
      {options.map((x) => (
        <label key={x} className={cls}>
          <input type="checkbox" checked={value.includes(x)} onChange={() => toggle(x)} />
          {x}
        </label>
      ))}
      {unknown.map((x) => (
        <label key={`unknown-${x}`} className={`${cls} text-red-600`} title="Not available here — untick to remove">
          <input type="checkbox" checked onChange={() => toggle(x)} />
          {x}
        </label>
      ))}
    </div>
  );
}

const FULL = 'col-span-2 sm:col-span-3 lg:col-span-4';
const SUB = 'block text-[11px] font-medium text-gray-500 mb-0.5';

function AppliesTo({ value, valueIds, onChange }) {
  const all = value === null;
  return (
    <div className={FULL}>
      <span className={SUB}>Applies to</span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-800">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={all} onChange={(e) => onChange(e.target.checked ? null : [])} />
          All value rules
        </label>
        {!all && <CheckList label="Value rules" options={valueIds} value={value} onChange={onChange} />}
        {!all && valueIds.length === 0 && <span className="text-xs text-gray-400">No value rules with an id yet.</span>}
      </div>
      {!all && value.length === 0 && (
        <div className="text-[11px] text-amber-700 mt-0.5">No value rule ticked — this rule will exclude nothing.</div>
      )}
    </div>
  );
}

/** Inputs of a status-flag rule (bit and on_violation are in the row header). */
function FlagFields({ row, set, valueIds }) {
  if (row.type === 'flag_share') {
    const pct = row.max_fraction_pct.trim();
    const frac = pct === '' ? null : pctToFraction(pct);
    return (
      <>
        <NumInput
          label="Max share (%)"
          value={row.max_fraction_pct}
          onChange={set('max_fraction_pct')}
          hint={Number.isFinite(frac) ? `stored as ${frac}` : 'empty = not checked'}
        />
        <NumInput label="Longest stretch (ms)" value={row.max_continuous_ms} onChange={set('max_continuous_ms')} hint="empty = not checked" />
        <div className={`${FULL} text-xs text-gray-500`}>
          Violation if the share of readings with this flag is above the max share, or its longest unbroken stretch is longer than the limit.
        </div>
      </>
    );
  }
  if (row.type === 'flag_any') {
    return <div className={`${FULL} text-xs text-gray-500`}>Violation if any reading has this flag.</div>;
  }
  if (row.type === 'flag_exclusion') {
    return (
      <>
        <NumInput label="Ignore after flag (ms) *" value={row.window_ms} onChange={set('window_ms')} />
        <div className={`${FULL} text-xs text-gray-500`}>
          Value rules ignore readings within this many ms after any reading with the flag. Never a violation by itself.
        </div>
        <AppliesTo value={row.applies_to} valueIds={valueIds} onChange={set('applies_to')} />
      </>
    );
  }
  if (row.type === 'step_coverage') {
    return (
      <>
        <NumInput label="Settle time (ms) *" value={row.settle_ms} onChange={set('settle_ms')} />
        <NumInput label="Min readings per step *" value={row.min_readings} onChange={set('min_readings')} inputMode="numeric" />
        <div className={FULL}>
          <span className={SUB}>Signals that must be valid *</span>
          <CheckList label="Signals" options={SIGNALS} value={row.signals} onChange={set('signals')} />
        </div>
        <div className={`${FULL} text-xs text-gray-500`}>
          A step starts at each reading with the flag. Violation if any step has fewer fresh, valid readings (CAN not stale, every
          ticked signal valid) after its settle time.
        </div>
      </>
    );
  }
  return null;
}

function RuleRow({ row, index, count, problems, valueIds, onChange, onRemove, onMove }) {
  const set = (k) => (v) => onChange({ ...row, [k]: v });
  const fields = fieldsFor(row.type);
  const flag = isFlagType(row.type);
  const bitOptions = Object.keys(FLAG_BITS);
  if (row.bit && !bitOptions.includes(row.bit)) bitOptions.push(row.bit);
  return (
    <div className={`border rounded-lg p-3 space-y-3 ${problems.length ? 'border-red-300' : 'border-navy-100'}`}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block w-full sm:w-40">
          <span className={SUB}>Rule id *</span>
          <input className={`${FIELD} font-mono`} value={row.id} onChange={(e) => set('id')(e.target.value.toUpperCase())} placeholder="e.g. I_MAX" />
        </label>
        <label className="block flex-1 min-w-[8rem]">
          <span className={SUB}>Type</span>
          <select className={FIELD} value={row.type} onChange={(e) => set('type')(e.target.value)}>
            <optgroup label="Value rules">
              {VALUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
            <optgroup label="Status-flag rules">
              {FLAG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          </select>
        </label>
        {flag ? (
          <label className="block flex-1 min-w-[8rem]">
            <span className={SUB}>Flag bit *</span>
            <select className={FIELD} value={row.bit} onChange={(e) => set('bit')(e.target.value)}>
              <option value="">Choose…</option>
              {bitOptions.map((b) => <option key={b} value={b}>{bitLabel(b)}</option>)}
            </select>
          </label>
        ) : (
          <label className="block flex-1 min-w-[8rem]">
            <span className={SUB}>Signal</span>
            <select className={FIELD} value={row.signal} onChange={(e) => set('signal')(e.target.value)}>
              {SIGNALS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        {hasVerdict(row.type) && (
          <label className="block flex-1 min-w-[8rem]">
            <span className={SUB}>On violation{flag ? ' *' : ''}</span>
            <select className={FIELD} value={row.on_violation} onChange={(e) => set('on_violation')(e.target.value)}>
              <option value="">{flag ? 'Choose…' : 'FAIL (default)'}</option>
              <option value="FAIL">FAIL</option>
              <option value="INVALID">INVALID</option>
            </select>
          </label>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="p-1.5 text-gray-400 hover:text-navy-800 disabled:opacity-30" aria-label="Move up"><ChevronUp size={16} /></button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="p-1.5 text-gray-400 hover:text-navy-800 disabled:opacity-30" aria-label="Move down"><ChevronDown size={16} /></button>
          <button type="button" onClick={onRemove} className="p-1.5 text-red-500 hover:text-red-700" aria-label="Remove rule"><Trash2 size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {flag ? <FlagFields row={row} set={set} valueIds={valueIds} /> : (
          <>
            {fields.filter((f) => NUMERIC.includes(f)).map((f) => (
              <NumInput key={f} label={NUM_LABELS[f]} value={row[f]} onChange={set(f)} />
            ))}
            {fields.includes('method') && (
              <label className="block">
                <span className={SUB}>Method</span>
                <input className={FIELD} value={row.method} onChange={(e) => set('method')(e.target.value)} list="mt-methods" placeholder="e.g. window_mean" />
              </label>
            )}
            {fields.includes('filter') && (
              <>
                <label className="block">
                  <span className={SUB}>Filter</span>
                  <input className={FIELD} value={row.filter_kind} onChange={(e) => set('filter_kind')(e.target.value)} list="mt-filters" placeholder="none" />
                </label>
                <NumInput label="Filter window (ms)" value={row.filter_window_ms} onChange={set('filter_window_ms')} />
              </>
            )}
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
  const valueIds = useMemo(() => valueRuleIds(rows), [rows]);

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
              <span className={SUB}>{label}</span>
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
            valueIds={valueIds}
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
  if (isFlagType(rule.type)) return describeFlagRule(rule);
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
                <td className={`${TD} font-mono text-xs text-gray-600`}>{isFlagType(r.type) ? '—' : r.signal}</td>
                <td className={`${TD} text-gray-600`}>{ruleValues(r)}</td>
                <td className={`${TD} text-gray-600`}>{hasVerdict(r.type) ? (r.on_violation || 'FAIL') : '— (no verdict)'}</td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={5} className={`${TD} text-center text-gray-400`}>No rules.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
