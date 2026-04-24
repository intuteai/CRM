import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, PlusCircle, Edit2, Trash2, MoreVertical, XCircle,
  ChevronLeft, ChevronRight, ArrowDownUp, Wrench, RefreshCw, ChevronDown,
  FileText
} from 'lucide-react';
import { debounce } from 'lodash';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// ─── helpers ────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('token');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Authentication token missing. Please log in again.');
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// ─── NotesModal ──────────────────────────────────────────────────────────────

function NotesModal({ recipe, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 p-4"
      role="dialog" aria-modal="true" aria-labelledby="notes-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md relative">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-amber-500" />
            <h2 id="notes-modal-title" className="text-lg font-bold text-gray-800">Recipe Notes</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-300 rounded" aria-label="Close notes">
            <XCircle size={22} />
          </button>
        </div>
        <div className="px-6 pt-4 pb-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">Recipe</div>
          <div className="text-sm font-medium text-gray-700">
            {recipe.customer_name} &rarr; {recipe.product_name}
            <span className="ml-2 font-mono text-gray-400 text-xs">({recipe.product_code})</span>
          </div>
        </div>
        <div className="px-6 pt-3 pb-6">
          <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-2">Notes</div>
          {recipe.notes ? (
            <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap bg-amber-50 border border-amber-100 rounded-lg p-4">
              {recipe.notes}
            </p>
          ) : (
            <p className="text-gray-400 italic text-sm bg-gray-50 border border-gray-100 rounded-lg p-4">
              No notes added for this recipe.
            </p>
          )}
        </div>
        <div className="px-6 pb-5 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SearchableDropdown ──────────────────────────────────────────────────────

function SearchableDropdown({
  options, value, onChange,
  placeholder = 'Select…', searchPlaceholder = 'Search…',
  disabled = false, hasError = false, className = '',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (open && searchRef.current) searchRef.current.focus(); }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  const selectedLabel = options.find(o => String(o.value) === String(value))?.label;
  const handleSelect = (val) => { onChange(val); setOpen(false); setSearch(''); };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between p-2 border rounded-lg bg-white text-left focus:outline-none focus:ring-2 focus:ring-amber-300 transition
          ${hasError ? 'border-red-400' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100 cursor-not-allowed opacity-70' : 'hover:border-amber-400 cursor-pointer'}`}>
        <span className={selectedLabel ? 'text-gray-800' : 'text-gray-400'}>{selectedLabel || placeholder}</span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-300" />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-4 py-2 text-sm text-gray-400 italic">No results found</li>
            ) : (
              filtered.map(o => (
                <li key={o.value} role="option" aria-selected={String(o.value) === String(value)}
                  onClick={() => handleSelect(o.value)}
                  className={`px-4 py-2 text-sm cursor-pointer hover:bg-amber-50 transition-colors
                    ${String(o.value) === String(value) ? 'bg-amber-100 font-medium text-amber-800' : 'text-gray-700'}`}>
                  {o.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── hooks ──────────────────────────────────────────────────────────────────

function useDropdownData() {
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/motor-recipes/dropdown-data')
      .then(({ customers, inventory }) => { setCustomers(customers); setInventory(inventory); })
      .catch(err => notifyError(`Failed to load dropdown data: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  return { customers, inventory, dropdownLoading: loading };
}

function useRecipes() {
  const [recipes, setRecipes] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/motor-recipes?limit=500&offset=0');
      setRecipes(data.data || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecipes(); }, [fetchRecipes]);
  return { recipes, total, loading, error, refetch: fetchRecipes };
}

// ─── RecipeForm ──────────────────────────────────────────────────────────────

function RecipeForm({ initial, customers, inventory, onSubmit, onClose, isSubmitting }) {
  const [form, setForm] = useState({
    customer_id: initial?.customer_id ?? '',
    product_id:  initial?.product_id  ?? '',
    num_turns:   initial?.num_turns   ?? '',
    num_coils:   initial?.num_coils   ?? '',
    notes:       initial?.notes       ?? '',
  });
  const [errors, setErrors] = useState({});
  const isEdit = !!initial;

  const validate = () => {
    const e = {};
    if (!form.customer_id) e.customer_id = 'Customer is required';
    if (!form.product_id)  e.product_id  = 'Motor / product is required';
    const turns = parseInt(form.num_turns);
    const coils = parseInt(form.num_coils);
    if (!form.num_turns || !Number.isInteger(turns) || turns <= 0) e.num_turns = 'Must be a positive integer';
    if (!form.num_coils || !Number.isInteger(coils) || coils <= 0) e.num_coils = 'Must be a positive integer';
    return e;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleDropdownChange = (field) => (value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSubmit({
      customer_id: parseInt(form.customer_id),
      product_id:  parseInt(form.product_id),
      num_turns:   parseInt(form.num_turns),
      num_coils:   parseInt(form.num_coils),
      notes:       form.notes.trim() || null,
    });
  };

  const inputCls = (field) =>
    `w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300 ${errors[field] ? 'border-red-400' : 'border-gray-300'}`;

  const customerOptions = customers.map(c => ({ value: c.customer_id, label: c.customer_name }));
  const inventoryOptions = inventory.map(p => ({ value: p.product_id, label: `${p.product_code} — ${p.product_name}` }));

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Customer <span className="text-red-500">*</span></label>
        <SearchableDropdown options={customerOptions} value={form.customer_id}
          onChange={handleDropdownChange('customer_id')} placeholder="— Select customer —"
          searchPlaceholder="Search customers…" disabled={isEdit || isSubmitting} hasError={!!errors.customer_id} />
        {isEdit && <p className="text-xs text-gray-400 mt-1">Customer cannot be changed after creation.</p>}
        {errors.customer_id && <p className="text-red-600 text-sm mt-1">{errors.customer_id}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Motor (Finished Goods) <span className="text-red-500">*</span></label>
        <SearchableDropdown options={inventoryOptions} value={form.product_id}
          onChange={handleDropdownChange('product_id')} placeholder="— Select motor —"
          searchPlaceholder="Search by code or name…" disabled={isEdit || isSubmitting} hasError={!!errors.product_id} />
        {isEdit && <p className="text-xs text-gray-400 mt-1">Motor cannot be changed after creation.</p>}
        {errors.product_id && <p className="text-red-600 text-sm mt-1">{errors.product_id}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">No. of Turns <span className="text-red-500">*</span></label>
          <input type="number" name="num_turns" value={form.num_turns} onChange={handleChange}
            min={1} placeholder="e.g. 120" disabled={isSubmitting} className={inputCls('num_turns')} />
          {errors.num_turns && <p className="text-red-600 text-sm mt-1">{errors.num_turns}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">No. of Coils <span className="text-red-500">*</span></label>
          <input type="number" name="num_coils" value={form.num_coils} onChange={handleChange}
            min={1} placeholder="e.g. 6" disabled={isSubmitting} className={inputCls('num_coils')} />
          {errors.num_coils && <p className="text-red-600 text-sm mt-1">{errors.num_coils}</p>}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} disabled={isSubmitting}
          placeholder="Any additional winding instructions…"
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-300 resize-none" />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} disabled={isSubmitting}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
        <button type="button" onClick={handleSubmit} disabled={isSubmitting}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2">
          {isSubmitting ? 'Saving…' : isEdit ? 'Update Recipe' : 'Create Recipe'}
        </button>
      </div>
    </div>
  );
}

// ─── ActionsDropdown ─────────────────────────────────────────────────────────

function ActionsDropdown({ recipe, onEdit, onDelete, canDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="p-2 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Row actions">
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
          <button onClick={() => { onEdit(recipe); setOpen(false); }}
            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
            <Edit2 size={15} className="mr-2" /> Edit
          </button>
          {canDelete && (
            <button onClick={() => { onDelete(recipe); setOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50">
              <Trash2 size={15} className="mr-2" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Role permission constants ────────────────────────────────────────────────

const ALLOWED_ROLES   = ['admin', 'design', 'production'];
const CAN_WRITE_ROLES = ['admin', 'design', 'production']; // can create & edit
const CAN_DELETE_ROLES = ['admin'];                        // can delete

// ─── MotorRecipesPage ─────────────────────────────────────────────────────────

function MotorRecipesPage({ userRole }) {
  const { recipes, total, loading, error, refetch } = useRecipes();
  const { customers, inventory, dropdownLoading } = useDropdownData();

  const [searchInput, setSearchInput]       = useState('');
  const [searchTerm, setSearchTerm]         = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [sortConfig, setSortConfig]         = useState({ key: 'updated_at', direction: 'desc' });
  const [page, setPage]                     = useState(0);
  const ITEMS_PER_PAGE = 10;

  const [showCreate, setShowCreate]   = useState(false);
  const [editRecipe, setEditRecipe]   = useState(null);
  const [notesRecipe, setNotesRecipe] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Derived permission flags
  const canWrite  = CAN_WRITE_ROLES.includes(userRole);
  const canDelete = CAN_DELETE_ROLES.includes(userRole);

  const debouncedSearch = useCallback(debounce((v) => { setSearchTerm(v); setPage(0); }, 300), []);
  const { notifySuccess, notifyError } = useNotify();
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
    debouncedSearch(e.target.value.toLowerCase());
  };

  useEffect(() => { setPage(0); }, [filterCustomer]);

  const filtered = useMemo(() => {
    let list = [...recipes];
    if (filterCustomer) list = list.filter(r => String(r.customer_id) === filterCustomer);
    if (searchTerm) {
      list = list.filter(r =>
        (r.customer_name  || '').toLowerCase().includes(searchTerm) ||
        (r.product_name   || '').toLowerCase().includes(searchTerm) ||
        (r.product_code   || '').toLowerCase().includes(searchTerm) ||
        String(r.num_turns).includes(searchTerm) ||
        String(r.num_coils).includes(searchTerm)
      );
    }
    if (sortConfig.key) {
      list.sort((a, b) => {
        let av = a[sortConfig.key], bv = b[sortConfig.key];
        if (['num_turns', 'num_coils', 'recipe_id'].includes(sortConfig.key)) { av = Number(av); bv = Number(bv); }
        else if (['updated_at', 'created_at'].includes(sortConfig.key)) { av = new Date(av || 0); bv = new Date(bv || 0); }
        if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
        if (av > bv) return sortConfig.direction === 'asc' ?  1 : -1;
        return 0;
      });
    }
    return list;
  }, [recipes, searchTerm, filterCustomer, sortConfig]);

  const paginated = useMemo(() => {
    const start = page * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, page]);

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

  const customerFilterOptions = useMemo(() => [
    { value: '', label: 'All Customers' },
    ...customers.map(c => ({ value: String(c.customer_id), label: c.customer_name })),
  ], [customers]);

  const handleCreate = useCallback(async (payload) => {
    setIsSubmitting(true);
    try {
      await apiFetch('/api/motor-recipes', { method: 'POST', body: JSON.stringify(payload) });
      notifySuccess('Recipe created successfully');
      setShowCreate(false);
      setPage(0);
      refetch();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  const handleUpdate = useCallback(async (payload) => {
    setIsSubmitting(true);
    try {
      await apiFetch('/api/motor-recipes', { method: 'POST', body: JSON.stringify(payload) });
      notifySuccess('Recipe updated successfully');
      setEditRecipe(null);
      refetch();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  const handleDelete = useCallback(async (recipe) => {
    if (!window.confirm(
      `Delete recipe for "${recipe.customer_name}" → "${recipe.product_name}"?\nThis cannot be undone.`
    )) return;
    try {
      await apiFetch(`/api/motor-recipes/${recipe.customer_id}/${recipe.product_id}`, { method: 'DELETE' });
      notifySuccess('Recipe deleted');
      refetch();
    } catch (err) {
      notifyError(err.message);
    }
  }, [refetch]);

  // ── guards ────────────────────────────────────────────────────────────────
  if (!ALLOWED_ROLES.includes(userRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-800 text-2xl" role="alert">
        Access Denied
      </div>
    );
  }

  if (loading && !recipes.length) {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-live="polite">
        <div className="text-gray-600 text-xl animate-pulse">Loading motor recipes…</div>
      </div>
    );
  }

  if (error && !recipes.length) return <ConnectionError onRetry={refetch} />;

  const columns = [
    { key: 'recipe_id',     label: 'ID'           },
    { key: 'customer_name', label: 'Customer'      },
    { key: 'product_code',  label: 'Product Code'  },
    { key: 'product_name',  label: 'Motor'         },
    { key: 'num_turns',     label: 'Turns'         },
    { key: 'num_coils',     label: 'Coils'         },
    { key: 'notes',         label: 'Notes',   noSort: true },
    { key: 'updated_at',    label: 'Last Updated'  },
    { key: 'actions',       label: 'Actions', noSort: true },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Motor Recipes</h1>

      <div className="max-w-7xl mx-auto">
        {/* toolbar */}
        <div className="flex flex-wrap gap-4 mb-8 items-center">
          <div className="relative flex-grow min-w-[220px]">
            <input type="text" value={searchInput} onChange={handleSearchChange}
              placeholder="Search customer, motor, code…"
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md" />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          </div>
          <div className="min-w-[220px]">
            <SearchableDropdown options={customerFilterOptions} value={filterCustomer}
              onChange={(val) => setFilterCustomer(val)}
              placeholder="All Customers" searchPlaceholder="Search customers…" className="shadow-md" />
          </div>
          <button onClick={refetch} disabled={loading}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-md"
            title="Refresh">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          {canWrite && (
            <button onClick={() => setShowCreate(true)} disabled={dropdownLoading}
              className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center gap-2 shadow-md">
              <PlusCircle size={18} /> Add Recipe
            </button>
          )}
        </div>

        {loading && recipes.length > 0 && (
          <div className="text-gray-500 text-sm mb-4 text-center animate-pulse" aria-live="polite">Refreshing…</div>
        )}

        {/* table */}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left" role="grid" aria-label="Motor recipes table">
            <thead className="bg-amber-100">
              <tr>
                {columns.map(col => (
                  <th key={col.key}
                    onClick={() => !col.noSort && handleSort(col.key)}
                    onKeyDown={e => !col.noSort && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleSort(col.key))}
                    tabIndex={col.noSort ? undefined : 0}
                    aria-sort={!col.noSort && sortConfig.key === col.key ? sortConfig.direction : undefined}
                    className={`py-4 px-4 font-semibold text-gray-700 text-sm whitespace-nowrap
                      ${!col.noSort ? 'cursor-pointer hover:bg-amber-200 focus:outline-none focus:bg-amber-200' : ''}`}>
                    <div className="flex items-center gap-1">
                      {col.label}
                      {!col.noSort && <ArrowDownUp size={14} className="text-gray-400" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map(recipe => (
                <tr key={recipe.recipe_id} className="border-t hover:bg-amber-50 transition-colors">
                  <td className="py-4 px-4 text-gray-500 text-sm">{recipe.recipe_id}</td>
                  <td className="py-4 px-4 font-medium text-gray-800">{recipe.customer_name}</td>
                  <td className="py-4 px-4 font-mono text-sm text-gray-600">{recipe.product_code}</td>
                  <td className="py-4 px-4 text-gray-800">{recipe.product_name}</td>
                  <td className="py-4 px-4">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">{recipe.num_turns}</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-sm font-semibold">{recipe.num_coils}</span>
                  </td>
                  <td className="py-4 px-4">
                    <button onClick={() => setNotesRecipe(recipe)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300
                        ${recipe.notes ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                      aria-label={recipe.notes ? 'View notes' : 'No notes'}>
                      <FileText size={13} />
                      {recipe.notes ? 'View' : 'None'}
                    </button>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-500">
                    <div>{new Date(recipe.updated_at).toLocaleDateString('en-IN')}</div>
                    <div className="text-xs">{new Date(recipe.updated_at).toLocaleTimeString('en-IN')}</div>
                  </td>
                  <td className="py-4 px-4">
                    <ActionsDropdown recipe={recipe} onEdit={r => setEditRecipe(r)}
                      onDelete={handleDelete} canDelete={canDelete} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* pagination */}
          {filtered.length > 0 && (
            <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-t">
              <span className="text-sm text-gray-600">
                Showing {paginated.length} of {filtered.length} recipes
                {filtered.length !== total ? ` (${total} total)` : ''}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-40 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"><ChevronLeft size={18} /></button>
                <button onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * ITEMS_PER_PAGE >= filtered.length}
                  className="p-2 bg-white border rounded-lg disabled:opacity-40 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"><ChevronRight size={18} /></button>
              </div>
            </div>
          )}

          {/* empty state */}
          {filtered.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400" role="alert">
              <Wrench size={48} className="mb-4" />
              <p className="text-lg font-medium">No motor recipes found</p>
              {(searchTerm || filterCustomer) ? (
                <p className="text-sm mt-1">Try clearing your search or filter.</p>
              ) : canWrite ? (
                <button onClick={() => setShowCreate(true)}
                  className="mt-4 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-2">
                  <PlusCircle size={16} /> Add First Recipe
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && canWrite && (
        <Modal title="Add Motor Recipe" onClose={() => !isSubmitting && setShowCreate(false)}>
          <RecipeForm customers={customers} inventory={inventory}
            onSubmit={handleCreate} onClose={() => setShowCreate(false)} isSubmitting={isSubmitting} />
        </Modal>
      )}

      {/* Edit Modal */}
      {editRecipe && (
        <Modal title={`Edit Recipe — ${editRecipe.customer_name} / ${editRecipe.product_name}`}
          onClose={() => !isSubmitting && setEditRecipe(null)}>
          <RecipeForm initial={editRecipe} customers={customers} inventory={inventory}
            onSubmit={handleUpdate} onClose={() => setEditRecipe(null)} isSubmitting={isSubmitting} />
        </Modal>
      )}

      {/* Notes Modal */}
      {notesRecipe && <NotesModal recipe={notesRecipe} onClose={() => setNotesRecipe(null)} />}

</div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto relative">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-300 rounded" aria-label="Close">
            <XCircle size={24} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export default MotorRecipesPage;