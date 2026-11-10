// Motor types (variants) with their ramp-profile and acceptance-criteria versions.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { testingRequest, errorText } from './testingApi';
import { useNotify } from '../../hooks/useNotify';
import { Loading, ErrorNote, EmptyState, Modal, Pill, Fact } from './TestingUi';
import VersionsPanel from './VersionsPanel';
import { FIELD, LABEL, BTN_CREATE, BTN_PRIMARY, BTN_SECONDARY, CARD, TH, TD, formatDate } from './testingFormat';

const OPTIONAL_FIELDS = [
  { key: 'max_rpm_limit', label: 'Max RPM limit', unit: 'rpm', numeric: true, integer: true },
  { key: 'rated_voltage_v', label: 'Rated voltage', unit: 'V', numeric: true },
  { key: 'rated_power_w', label: 'Rated power', unit: 'W', numeric: true },
  { key: 'rated_current_a', label: 'Rated current', unit: 'A', numeric: true },
  { key: 'controller_model', label: 'Controller model' },
  { key: 'serial_pattern', label: 'Serial pattern (regex)', placeholder: 'e.g. ^CA-\\d{4}-\\d{6}$' },
];

function VariantForm({ variant, onClose, onSaved }) {
  const editing = !!variant;
  const { notifySuccess } = useNotify();
  const [products, setProducts] = useState(null);
  const [productsError, setProductsError] = useState(null);
  const [productQuery, setProductQuery] = useState('');
  const [form, setForm] = useState(() => ({
    product_id: variant?.product_id != null ? String(variant.product_id) : '',
    code: variant?.code || '',
    ...Object.fromEntries(OPTIONAL_FIELDS.map(({ key }) => [key, variant?.[key] != null ? String(variant[key]) : ''])),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editing) return;
    testingRequest('/admin/products')
      .then((d) => setProducts(d?.items || []))
      .catch((err) => setProductsError(err));
  }, [editing]);

  const shownProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return (products || []).filter((p) => !q || [p.product_name, p.product_code, p.part_number].some((x) => String(x || '').toLowerCase().includes(q)));
  }, [products, productQuery]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const badNumbers = OPTIONAL_FIELDS.filter(({ key, numeric, integer }) => {
    const v = form[key].trim();
    if (!numeric || !v) return false;
    return integer ? !/^\d+$/.test(v) : !Number.isFinite(Number(v));
  });

  const body = () => {
    const out = { code: form.code.trim() };
    OPTIONAL_FIELDS.forEach(({ key, numeric }) => {
      const v = form[key].trim();
      if (editing) out[key] = v === '' ? null : numeric ? Number(v) : v;
      else if (v !== '') out[key] = numeric ? Number(v) : v;
    });
    if (!editing) out.product_id = Number(form.product_id);
    return out;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || (!editing && !form.product_id) || badNumbers.length) return;
    setBusy(true);
    setError(null);
    try {
      const saved = editing
        ? await testingRequest(`/admin/variants/${variant.variant_id}`, { method: 'PATCH', body: body() })
        : await testingRequest('/admin/variants', { method: 'POST', body: body() });
      notifySuccess(editing ? 'Motor type saved.' : 'Motor type created.');
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${variant.code}` : 'New motor type'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button type="submit" form="variant-form" className={editing ? BTN_PRIMARY : BTN_CREATE} disabled={busy || badNumbers.length > 0 || !form.code.trim() || (!editing && !form.product_id)}>
            {editing ? 'Save' : (<><Plus size={15} /> Create</>)}
          </button>
        </>
      }
    >
      <form id="variant-form" onSubmit={submit} className="space-y-3">
        <div>
          <label className={LABEL} htmlFor="v-product">ERP product *</label>
          {editing ? (
            <div className="text-sm text-navy-800">{variant.product_name} <span className="text-gray-400">({variant.product_code})</span></div>
          ) : productsError ? (
            <ErrorNote error={productsError} />
          ) : (
            <>
              <input className={`${FIELD} mb-1.5`} placeholder="Filter products…" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} disabled={!products} />
              <select id="v-product" className={FIELD} value={form.product_id} onChange={set('product_id')} required disabled={!products} size={Math.min(6, Math.max(2, shownProducts.length + 1))}>
                <option value="">{products ? 'Select a product' : 'Loading products…'}</option>
                {shownProducts.map((p) => (
                  <option key={p.product_id} value={p.product_id} disabled={!!p.variant_id}>
                    {p.product_name} · {p.product_code}{p.part_number ? ` · ${p.part_number}` : ''}{p.variant_id ? ' (already linked)' : ''}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div>
          <label className={LABEL} htmlFor="v-code">Variant code *</label>
          <input id="v-code" className={`${FIELD} font-mono`} value={form.code} onChange={set('code')} maxLength={64} required placeholder="e.g. B-125-M-5D-ES11-E04" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {OPTIONAL_FIELDS.map(({ key, label, unit, numeric, placeholder }) => (
            <div key={key} className={key === 'serial_pattern' ? 'sm:col-span-2' : undefined}>
              <label className={LABEL} htmlFor={`v-${key}`}>{label}{unit ? ` (${unit})` : ''}</label>
              <input id={`v-${key}`} className={`${FIELD} ${key === 'serial_pattern' ? 'font-mono' : ''}`} inputMode={numeric ? 'decimal' : undefined} value={form[key]} onChange={set(key)} placeholder={placeholder} />
            </div>
          ))}
        </div>
        {badNumbers.length > 0 && <div className="text-xs text-red-600">Not a valid number: {badNumbers.map((b) => b.label).join(', ')}.</div>}
        {error && <ErrorNote error={error} />}
      </form>
    </Modal>
  );
}

function VariantDetail({ variant, can, onBack, onEdit, onToggleActive, onChanged }) {
  const [tab, setTab] = useState('criteria');
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-navy-800 font-medium hover:text-navy-600">
        <ArrowLeft size={15} /> All motor types
      </button>
      <section className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h1 className="font-display text-xl font-bold text-navy-800 font-mono break-all">{variant.code}</h1>
          <Pill className={variant.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>{variant.active ? 'Active' : 'Inactive'}</Pill>
          {can.manageConfig && (
            <div className="flex flex-wrap gap-2 ml-auto">
              <button type="button" className={BTN_PRIMARY} onClick={onEdit}><Pencil size={14} /> Edit</button>
              <button type="button" className={BTN_SECONDARY} onClick={onToggleActive}>{variant.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          )}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
          <Fact label="Product">{variant.product_name} <span className="text-gray-400">({variant.product_code})</span></Fact>
          <Fact label="Max RPM limit">{variant.max_rpm_limit ?? '—'}</Fact>
          <Fact label="Rated V / A / W">{[variant.rated_voltage_v, variant.rated_current_a, variant.rated_power_w].map((x) => x ?? '—').join(' / ')}</Fact>
          <Fact label="Controller">{variant.controller_model || '—'}</Fact>
          <Fact label="Serial pattern" mono>{variant.serial_pattern || '—'}</Fact>
          <Fact label="Published profile">{variant.published_profile_version != null ? `v${variant.published_profile_version}` : 'none'}</Fact>
          <Fact label="Published criteria">{variant.published_criteria_version != null ? `v${variant.published_criteria_version}` : 'none'}</Fact>
          <Fact label="Created">{formatDate(variant.created_at)}</Fact>
        </dl>
      </section>

      <section className={`${CARD} p-4 sm:p-5 space-y-4`}>
        <div className="flex gap-1 border-b border-navy-100">
          {[['criteria', 'Acceptance criteria'], ['profiles', 'Ramp profiles']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${tab === key ? 'border-gold-500 text-navy-800 font-semibold' : 'border-transparent text-gray-500 hover:text-navy-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <VersionsPanel key={tab} kind={tab} variant={variant} can={can} onChanged={onChanged} />
      </section>
    </div>
  );
}

export default function VariantsPage({ can }) {
  const { notifySuccess, notifyError } = useNotify();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [formFor, setFormFor] = useState(undefined); // undefined closed · null new · variant edit

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await testingRequest('/admin/variants', { query: { include_inactive: 1 } });
      setItems(data?.items || []);
    } catch (err) {
      setError(err);
      setItems((prev) => prev || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshOne = useCallback(async (id) => {
    try {
      const v = await testingRequest(`/admin/variants/${id}`);
      setItems((list) => (list || []).map((x) => (x.variant_id === id ? v : x)));
    } catch {
      load();
    }
  }, [load]);

  const toggleActive = async (v) => {
    try {
      const saved = await testingRequest(`/admin/variants/${v.variant_id}`, { method: 'PATCH', body: { active: !v.active } });
      setItems((list) => list.map((x) => (x.variant_id === v.variant_id ? { ...x, ...saved } : x)));
      notifySuccess(saved?.active ?? !v.active ? 'Motor type activated.' : 'Motor type deactivated.');
    } catch (err) {
      notifyError(errorText(err));
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((v) => !q || [v.code, v.product_name, v.product_code].some((x) => String(x || '').toLowerCase().includes(q)));
  }, [items, query]);

  const selected = items?.find((v) => v.variant_id === selectedId);

  const onSaved = (saved) => {
    setFormFor(undefined);
    if (saved?.variant_id) {
      setItems((list) => {
        const exists = (list || []).some((x) => x.variant_id === saved.variant_id);
        return exists ? list.map((x) => (x.variant_id === saved.variant_id ? saved : x)) : [saved, ...(list || [])];
      });
    } else {
      load();
    }
  };

  const form = formFor !== undefined && <VariantForm variant={formFor} onClose={() => setFormFor(undefined)} onSaved={onSaved} />;

  if (selected) {
    return (
      <>
        <VariantDetail
          variant={selected}
          can={can}
          onBack={() => setSelectedId(null)}
          onEdit={() => setFormFor(selected)}
          onToggleActive={() => toggleActive(selected)}
          onChanged={() => refreshOne(selected.variant_id)}
        />
        {form}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full p-3 pl-10 border border-navy-100 rounded-lg bg-white shadow-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
            placeholder="Search motor types…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="button" className={`${BTN_PRIMARY} py-3`} onClick={load} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        {can.manageConfig && (
          <button type="button" className={`${BTN_CREATE} py-3`} onClick={() => setFormFor(null)}>
            <Plus size={15} /> New motor type
          </button>
        )}
      </div>

      <ErrorNote error={error} onRetry={load} />

      <div className={`${CARD} overflow-hidden`}>
        {items === null ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState>{items.length ? 'No motor types match your search.' : 'No motor types yet.'}</EmptyState>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-navy-50 text-navy-800">
                    <th className={TH}>Variant code</th>
                    <th className={TH}>Product</th>
                    <th className={TH}>Max RPM limit</th>
                    <th className={TH}>Profile</th>
                    <th className={TH}>Criteria</th>
                    <th className={TH}>Status</th>
                    {can.manageConfig && <th className={TH} aria-label="Actions" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {shown.map((v) => (
                    <tr key={v.variant_id} onClick={() => setSelectedId(v.variant_id)} className="hover:bg-navy-50/60 transition-colors cursor-pointer">
                      <td className={`${TD} font-mono text-xs font-semibold text-navy-800`}>{v.code}</td>
                      <td className={`${TD} text-gray-600`}>{v.product_name}<span className="text-gray-400 text-xs"> · {v.product_code}</span></td>
                      <td className={`${TD} text-gray-600`}>{v.max_rpm_limit ?? '—'}</td>
                      <td className={`${TD} text-gray-600`}>{v.published_profile_version != null ? `v${v.published_profile_version}` : <span className="text-amber-700">none</span>}</td>
                      <td className={`${TD} text-gray-600`}>{v.published_criteria_version != null ? `v${v.published_criteria_version}` : <span className="text-amber-700">none</span>}</td>
                      <td className={TD}><Pill className={v.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>{v.active ? 'Active' : 'Inactive'}</Pill></td>
                      {can.manageConfig && (
                        <td className={TD}>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setFormFor(v); }} className="flex items-center gap-1 text-sm text-navy-800 font-medium hover:text-navy-600">
                            <Pencil size={14} /> Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-navy-100">
              {shown.map((v) => (
                <li key={v.variant_id}>
                  <button type="button" onClick={() => setSelectedId(v.variant_id)} className="w-full text-left px-4 py-3 space-y-1 hover:bg-navy-50/60">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-navy-800 break-all">{v.code}</span>
                      <Pill className={v.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}>{v.active ? 'Active' : 'Inactive'}</Pill>
                    </div>
                    <div className="text-xs text-gray-500">{v.product_name}</div>
                    <div className="text-xs text-gray-500">
                      Profile {v.published_profile_version != null ? `v${v.published_profile_version}` : 'none'} · Criteria {v.published_criteria_version != null ? `v${v.published_criteria_version}` : 'none'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {form}
    </div>
  );
}
