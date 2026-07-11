import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowDownUp,
  Filter,
  PlusCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  MoreVertical,
  Package,
  XCircle,
  Eye,
  Download,
  Upload,
  Trash2,
  CheckCircle,
  Lock,
} from 'lucide-react';
import { debounce } from 'lodash';
import { io } from 'socket.io-client';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

/* =====================================================================
   PRODUCT CODE BUILDER
   Structure: NNNN(4) + ChartPair(2, e.g. L5) + SubAbbr(2, e.g. BR) + Store(1) + Col(1) + Row(1) = 11
   ===================================================================== */

const PRODUCT_CHARTS = [
  { label: 'IPT',      symbol: 'L', digit: '5', defaultSub: 'BR', color: 'purple' },
  { label: 'Rikshaw',  symbol: 'R', digit: '1', defaultSub: 'SH', color: 'blue'   },
  { label: '2Wheeler', symbol: 'W', digit: '2', defaultSub: 'FF', color: 'indigo' },
  { label: 'Autonxt',  symbol: 'A', digit: '0', defaultSub: 'RF', color: 'violet' },
  { label: 'Special',  symbol: 'S', digit: '3', defaultSub: '', color: 'fuchsia'},
  { label: 'General',  symbol: 'G', digit: 'N', pair: 'GN', defaultSub: '', color: 'green'  },
  { label: 'Motor',    symbol: 'M', digit: 'O', pair: 'MO', defaultSub: '', color: 'rose'   },
];

const SUB_CODES = [
  { abbr: 'BR', label: 'Bearing BR'   },
  { abbr: 'SH', label: 'Shaft'        },
  { abbr: 'FF', label: 'Front Flange' },
  { abbr: 'RF', label: 'Rear Flange'  },
  { abbr: 'AU', label: 'Auxiliary'    },
];

const SEG = {
  part:  'text-blue-700',
  chart: 'text-purple-600',
  sub:   'text-green-700',
  store: 'text-red-600',
  col:   'text-orange-500',
  row:   'text-teal-600',
};

function pad4(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return '0001';
  return String(Math.min(n, 9999)).padStart(4, '0');
}

function buildCode({ partNum, chartSymbol, chartDigit, subAbbr, storeNum, colNum, rowNum }) {
  const p  = (partNum     || '0001').padStart(4, '0').slice(0, 4);
  const cp = (chartSymbol || '') + (chartDigit || '');
  const s  = (subAbbr     || '').slice(0, 2).padEnd(2, '_');
  const st = (storeNum    || '').slice(0, 1);
  const co = (colNum      || '').slice(0, 1);
  const ro = (rowNum      || '').slice(0, 1);
  return p + cp + s + st + co + ro;
}

// Parses an existing 11-char code back into builder segments
function parseCode(code) {
  if (!code || code.length !== 11) return null;
  const partNum     = code.slice(0, 4);
  const chartSymbol = code.slice(4, 5);
  const chartDigit  = code.slice(5, 6);
  const subAbbr     = code.slice(6, 8);
  const storeNum    = code.slice(8, 9);
  const colNum      = code.slice(9, 10);
  const rowNum      = code.slice(10, 11);
  const chart       = PRODUCT_CHARTS.find(c => c.symbol === chartSymbol && c.digit === chartDigit) || null;
  return { partNum, chartSymbol, chartDigit, subAbbr, storeNum, colNum, rowNum, chart };
}

function ProductCodeBuilder({
  value = '',
  onChange,
  disabled = false,
  suggestedPartNumber = null,
  excludeId = null,
  onAutoFlagChange,
  onAvailabilityChange,
}) {
  const parsed = parseCode(value);

  const [partNum,    setPartNum   ] = useState(parsed?.partNum ?? (suggestedPartNumber ? pad4(suggestedPartNumber) : '0001'));
  const [partInput,  setPartInput ] = useState(
    parsed
      ? String(parseInt(parsed.partNum, 10))
      : suggestedPartNumber
        ? String(parseInt(suggestedPartNumber, 10))
        : '1',
  );
  const [partTouched, setPartTouched] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);
  const [chart,      setChart     ] = useState(parsed?.chart    ?? null);
  const [subAbbr,    setSubAbbr   ] = useState(parsed?.subAbbr  ?? '');
  const [storeNum,   setStoreNum  ] = useState(parsed?.storeNum ?? '');
  const [colNum,     setColNum    ] = useState(parsed?.colNum   ?? '');
  const [rowNum,     setRowNum    ] = useState(parsed?.rowNum   ?? '');
  // If value is 11 chars but chart not recognised → open manual mode so user can still see it
  const [manualMode, setManualMode] = useState(!parsed && value.length === 11);
  const [manualVal,  setManualVal ] = useState(value);

  const derivedCode = buildCode({
    partNum,
    chartSymbol: chart?.symbol,
    chartDigit:  chart?.digit,
    subAbbr,
    storeNum,
    colNum,
    rowNum,
  });

  const isComplete = derivedCode.length === 11 && !derivedCode.includes('_') && !!chart && !!subAbbr && !!storeNum && !!colNum && !!rowNum;

  useEffect(() => {
    if (manualMode) return;
    onChange?.(derivedCode.replace(/_/g, ''));
  }, [partNum, chart, subAbbr, storeNum, colNum, rowNum, manualMode]);

  const handleChartClick = (c) => {
    if (disabled) return;
    setChart(c);
    setSubAbbr(c.defaultSub);
  };

  const handlePartInput = (e) => {
    setPartTouched(true);
    const raw = e.target.value;
    setPartInput(raw);
    if (raw !== '') setPartNum(pad4(raw));
  };
  const handlePartBlur = () => {
    const padded = pad4(partInput);
    setPartInput(String(parseInt(padded, 10)));
    setPartNum(padded);
  };

  useEffect(() => {
    onAutoFlagChange?.(!partTouched);
  }, [partTouched]);

  useEffect(() => {
    if (manualMode || !partNum || partNum.length !== 4) {
      setCheckStatus(null);
      onAvailabilityChange?.(true);
      return;
    }
    onAvailabilityChange?.(false);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCheckStatus({ checking: true });
      try {
        const token = localStorage.getItem('token');
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const url = new URL(`${backendUrl}/api/inventory/check-part-number`);
        url.searchParams.set('part_number', partNum);
        if (excludeId) url.searchParams.set('exclude_id', excludeId);
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) {
          setCheckStatus(null);
          onAvailabilityChange?.(true);
          return;
        }
        const data = await res.json();
        setCheckStatus({ checking: false, ...data });
        onAvailabilityChange?.(data.available !== false);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setCheckStatus(null);
          onAvailabilityChange?.(true);
        }
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [partNum, excludeId, manualMode]);

  const seg_part  = derivedCode.slice(0, 4);
  const seg_chart = chart ? (chart.symbol + chart.digit) : '';
  const seg_sub   = subAbbr || '';
  const seg_store = storeNum || '';
  const seg_col   = colNum   || '';
  const seg_row   = rowNum   || '';

  if (manualMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualVal}
            maxLength={11}
            onChange={e => { setManualVal(e.target.value); onChange?.(e.target.value); }}
            placeholder="Enter 11-char code manually"
            className="flex-1 p-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-amber-300"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-xs px-3 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 whitespace-nowrap"
          >
            ← Use Builder
          </button>
        </div>
        <p className="text-xs text-gray-400">Must be exactly 11 characters.</p>
      </div>
    );
  }

  return (
    <div className="border-2 border-amber-200 rounded-xl bg-gradient-to-br from-amber-50 to-white p-4 space-y-4 shadow-sm">

      {/* Live Preview */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Code Preview</p>
          {isComplete
            ? <span className="text-xs bg-green-100 text-green-700 border border-green-300 px-2 py-1 rounded-full font-semibold">✓ 11 / 11</span>
            : <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-1 rounded-full">
                {[seg_part, seg_chart, seg_sub, seg_store, seg_col, seg_row].join('').length} / 11
              </span>
          }
        </div>

        <div className="flex items-center gap-1 bg-white border-2 border-amber-300 rounded-xl px-4 py-3 shadow-inner justify-center font-mono text-2xl tracking-[0.2em] select-all overflow-x-auto">
          <span className={`${SEG.part}  font-black`}>{seg_part}</span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.chart} font-black`}>{seg_chart || <span className="text-gray-200 text-lg">??</span>}</span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.sub}   font-black`}>{seg_sub   || <span className="text-gray-200 text-lg">??</span>}</span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.store} font-black`}>{seg_store || <span className="text-gray-200 text-lg">?</span>}</span>
          <span className={`${SEG.col}   font-black`}>{seg_col   || <span className="text-gray-200 text-lg">?</span>}</span>
          <span className={`${SEG.row}   font-black`}>{seg_row   || <span className="text-gray-200 text-lg">?</span>}</span>
        </div>

        <div className="flex gap-3 flex-wrap text-[10px] font-bold pt-0.5">
          {[
            [SEG.part,  '① NNNN  Part #'],
            [SEG.chart, '② CC  Chart Pair (e.g. L5)'],
            [SEG.sub,   '③ SS  Sub (e.g. BR)'],
            [SEG.store, '④ T  Store'],
            [SEG.col,   '⑤ C  Col'],
            [SEG.row,   '⑥ R  Row'],
          ].map(([cls, lbl]) => (
            <span key={lbl} className={`${cls} flex items-center gap-0.5`}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'currentColor', opacity: 0.7 }} />
              {lbl}
            </span>
          ))}
        </div>
      </div>

      <hr className="border-amber-100" />

      {/* ① Part Number */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
          <span className={`${SEG.part} font-black text-sm`}>①</span>
          Part Number
          <span className="font-normal text-gray-400">(0001 – 9999)</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number" min={1} max={9999}
            value={partInput}
            onChange={handlePartInput}
            onBlur={handlePartBlur}
            placeholder="1"
            className="w-28 p-2 border border-gray-300 rounded-lg font-mono text-base focus:ring-2 focus:ring-blue-300 bg-white"
            disabled={disabled}
          />
          <span className="text-gray-400 text-sm">
            → <code className={`${SEG.part} font-bold text-base`}>{partNum}</code>
          </span>
        </div>
        {checkStatus?.checking && (
          <p className="text-xs text-gray-400 mt-1">Checking availability…</p>
        )}
        {checkStatus && !checkStatus.checking && checkStatus.available === true && (
          <p className="text-xs text-green-600 mt-1">✓ Available</p>
        )}
        {checkStatus && !checkStatus.checking && checkStatus.available === false && (
          <p className="text-xs text-red-600 mt-1">
            ✗ Already used by {checkStatus.conflictProductName} (#{checkStatus.conflictProductId})
          </p>
        )}
      </div>

      {/* ② Product Chart */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <span className={`${SEG.chart} font-black text-sm`}>②</span>
          Product Chart
          <span className="font-normal text-gray-400 ml-1">— auto-fills Sub Code</span>
        </label>
        <div className="grid grid-cols-5 gap-2">
          {PRODUCT_CHARTS.map(c => (
            <button
              key={c.symbol}
              type="button"
              onClick={() => handleChartClick(c)}
              title={`Auto-fills sub: ${c.defaultSub}`}
              className={`py-3 px-1 rounded-xl border-2 text-center transition-all duration-150 select-none
                ${chart?.symbol === c.symbol
                  ? 'border-purple-500 bg-purple-100 shadow-md scale-105'
                  : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className={`text-xl font-black ${SEG.chart} leading-none tracking-tight`}>
                {c.symbol}<span className="text-gray-400">{c.digit}</span>
              </div>
              <div className="text-[10px] font-semibold text-gray-600 mt-1">{c.label}</div>
              <div className="text-[9px] text-purple-400 mt-0.5">→ {c.defaultSub}</div>
            </button>
          ))}
        </div>
        {chart && (
          <div className="mt-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="font-semibold">{chart.label}</span>
            <span className="text-gray-400">·</span>
            <span>Pair: <code className={`${SEG.chart} font-black`}>{chart.symbol}{chart.digit}</code></span>
            <span className="text-gray-400">·</span>
            <span>Sub auto-set to: <code className={`${SEG.sub} font-black`}>{chart.defaultSub}</code></span>
          </div>
        )}
      </div>

      {/* ③ Sub Code */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <span className={`${SEG.sub} font-black text-sm`}>③</span>
          Sub Code
          <span className="font-normal text-gray-400 ml-1">— 2-char abbreviation</span>
        </label>
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {SUB_CODES.map(sc => (
            <button
              key={sc.abbr}
              type="button"
              onClick={() => !disabled && setSubAbbr(sc.abbr)}
              className={`py-2.5 px-1 rounded-lg border-2 text-center transition-all duration-150 select-none
                ${subAbbr === sc.abbr
                  ? 'border-green-500 bg-green-100 shadow-sm scale-[1.04]'
                  : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className={`text-lg font-black ${SEG.sub} leading-none`}>{sc.abbr}</div>
              <div className="text-[9px] text-gray-400 mt-0.5 leading-tight">{sc.label}</div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">Custom:</span>
          <input
            type="text"
            maxLength={2}
            value={subAbbr}
            onChange={e => !disabled && setSubAbbr(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2))}
            placeholder="XX"
            className={`w-16 p-1.5 border-2 rounded-lg font-mono text-base text-center focus:ring-2 focus:ring-green-300 bg-white uppercase transition-colors
              ${subAbbr && !SUB_CODES.find(s => s.abbr === subAbbr)
                ? 'border-green-400 bg-green-50 text-green-700'
                : 'border-gray-200'
              }`}
            disabled={disabled}
          />
          {subAbbr && !SUB_CODES.find(s => s.abbr === subAbbr) && (
            <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 rounded px-2 py-0.5">
              Custom: <code>{subAbbr}</code>
            </span>
          )}
        </div>
      </div>

      <hr className="border-amber-100" />

      {/* ④⑤⑥ Store / Column / Row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">
            <span className={`${SEG.store} font-black text-sm`}>④</span> Store # <span className="font-normal text-gray-400">(1 digit)</span>
          </label>
          <input
            type="text" maxLength={1} value={storeNum}
            onChange={e => !disabled && setStoreNum(e.target.value.replace(/\D/g, '').slice(0, 1))}
            placeholder="1"
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-2xl text-center focus:ring-2 focus:ring-red-300 bg-white"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">
            <span className={`${SEG.col} font-black text-sm`}>⑤</span> Column <span className="font-normal text-gray-400">(1 digit)</span>
          </label>
          <input
            type="text" maxLength={1} value={colNum}
            onChange={e => !disabled && setColNum(e.target.value.replace(/\D/g, '').slice(0, 1))}
            placeholder="1"
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-2xl text-center focus:ring-2 focus:ring-orange-300 bg-white"
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">
            <span className={`${SEG.row} font-black text-sm`}>⑥</span> Row <span className="font-normal text-gray-400">(1 digit)</span>
          </label>
          <input
            type="text" maxLength={1} value={rowNum}
            onChange={e => !disabled && setRowNum(e.target.value.replace(/\D/g, '').slice(0, 1))}
            placeholder="1"
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-2xl text-center focus:ring-2 focus:ring-teal-300 bg-white mb-1.5"
            disabled={disabled}
          />
          <div className="grid grid-cols-5 gap-1">
            {['1','2','3','4','5','6','7','8','9'].map(r => (
              <button
                key={r} type="button"
                onClick={() => !disabled && setRowNum(r)}
                className={`py-1 rounded border text-xs font-bold transition-all duration-100
                  ${rowNum === r ? 'border-teal-500 bg-teal-100 text-teal-800' : 'border-gray-200 bg-white text-gray-500 hover:border-teal-300 hover:bg-teal-50'}
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >{r}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { setManualMode(true); setManualVal(isComplete ? derivedCode.replace(/_/g,'') : ''); }}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Enter code manually instead →
        </button>
      </div>
    </div>
  );
}

/* ========= useFetchInventory Hook ========= */
const useFetchInventory = ({ limit, offset }) => {
  const [inventory, setInventory] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    let isMounted = true;
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication token missing. Please log in again.");

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const url = `${backendUrl}/api/inventory/available?limit=${limit}&offset=${offset}&force_refresh=true`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Inventory fetch failed: ${response.statusText}`);
      }

      const { data, total } = await response.json();

      if (isMounted) {
        const normalizedData = data.map(item => ({
          ...item,
          price: item.price !== null ? Number(item.price) : 0,
          stock_quantity: item.stock_quantity ?? 0,
          reserved_quantity: item.reserved_quantity ?? 0,
          available_quantity: item.available_quantity ?? 0,
          returnable_qty: item.returnable_qty ?? 0,
          description: item.description || '',
          product_code: item.product_code,
        }));

        setInventory(normalizedData);
        setTotalItems(total || 0);
        setError(null);
      }
    } catch (err) {
      if (isMounted) setError(err.message);
    } finally {
      if (isMounted) setIsLoading(false);
    }
    return () => { isMounted = false; };
  }, [limit, offset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { inventory, totalItems, isLoading, error, refetchData: fetchData };
};

/* ========= Accept Return API helper ========= */
const acceptReturnApi = async (productId, qty) => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Authentication token missing.');
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
  const res = await fetch(`${backendUrl}/api/inventory/${productId}/accept-return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    credentials: 'include',
    body: JSON.stringify({ qty })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Accept return failed (${res.status})`);
  }
  return await res.json();
};

/* ========= ProductionInventoryPage Component ========= */
function SalesInventoryPage({ userRole }) {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStock, setFilterStock] = useState('All');
  const [showEditForm, setShowEditForm] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState('');
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProductDescription, setSelectedProductDescription] = useState('');
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [qtyProduct, setQtyProduct] = useState(null);

  const tableRef = useRef(null);
  const fileInputRef = useRef(null);

  const { inventory: allInventory, totalItems, isLoading, error, refetchData } =
    useFetchInventory({ limit: 5000, offset: 0 });

  const openQuantityModal = useCallback((item) => {
    setQtyProduct(item);
    setShowQtyModal(true);
  }, []);

  const validateImportRow = useCallback((row, index) => {
    const errors = [];
    if (!row['Product Name'] || !String(row['Product Name']).trim()) {
      errors.push(`Row ${index + 1}: Product Name is required`);
    }
    if (!row['Product Code'] || String(row['Product Code']).trim().length !== 11) {
      errors.push(`Row ${index + 1}: Product Code must be exactly 11 characters`);
    }
    const stock = row['Stock Quantity'];
    if (stock === undefined || isNaN(parseInt(stock)) || !Number.isInteger(Number(stock))) {
      errors.push(`Row ${index + 1}: Stock Quantity must be an integer`);
    }
    const price = parseFloat(String(row['Price (₹)'] || '0').replace(/[^0-9.]/g, ''));
    if (isNaN(price) || price < 0) {
      errors.push(`Row ${index + 1}: Price must be a non-negative number`);
    }
    const rq = row['Returnable Qty'] !== undefined ? parseInt(row['Returnable Qty']) : 0;
    if (row['Returnable Qty'] !== undefined && (!Number.isInteger(rq) || rq < 0)) {
      errors.push(`Row ${index + 1}: Returnable Qty must be a non-negative integer`);
    }
    return errors;
  }, []);

  const importFromExcel = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (!jsonData.length) { notifyError('Excel file is empty', { autoClose: 3000 }); return; }

        const errors = [], validRows = [];
        jsonData.forEach((row, index) => {
          const rowErrors = validateImportRow(row, index);
          if (rowErrors.length > 0) errors.push(...rowErrors);
          else validRows.push({
            product_name: String(row['Product Name'] || '').trim(),
            product_code: String(row['Product Code'] || '').trim(),
            stock_quantity: parseInt(row['Stock Quantity'] || 0),
            price: parseFloat(String(row['Price (₹)'] || '0').replace(/[^0-9.]/g, '')),
            description: String(row['Description'] || '').trim() || undefined,
            returnable_qty: row['Returnable Qty'] !== undefined ? parseInt(row['Returnable Qty']) : 0,
            product_id: row['Product ID'] ? parseInt(row['Product ID']) : undefined,
          });
        });

        if (errors.length > 0) errors.forEach(err => notifyError(err, { autoClose: 5000 }));
        if (!validRows.length) { notifyError('No valid rows found.', { autoClose: 5000 }); return; }

        const token = localStorage.getItem('token');
        if (!token) { notifyError('Authentication token missing.', { autoClose: 5000 }); return; }

        let created = 0, updated = 0, failed = 0;
        for (const row of validRows) {
          try {
            const { product_id, ...body } = row;
            const url = product_id
              ? `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/inventory/${product_id}`
              : `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/inventory`;
            const res = await fetch(url, {
              method: product_id ? 'PUT' : 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(body),
              credentials: 'include',
            });
            if (!res.ok) { const ed = await res.json().catch(() => ({})); throw new Error(ed.error || 'Operation failed'); }
            product_id ? updated++ : created++;
          } catch (err) {
            failed++;
            notifyError(`Row processing failed: ${err.message}`, { autoClose: 4000 });
          }
        }
        if (created > 0 || updated > 0) {
          await refetchData(); setPage(0);
          notifySuccess(`Import successful: ${created} new, ${updated} updated${failed ? ` (${failed} failed)` : ''}`, { autoClose: 5000 });
        }
      };
      reader.readAsArrayBuffer(file);
      event.target.value = '';
    } catch (err) {
      notifyError(`Import process failed: ${err.message}`, { autoClose: 4000 });
    }
  }, [validateImportRow, refetchData]);

  const generateQRCode = useCallback(async (productCode, productName, description, elementId) => {
    try {
      const data = JSON.stringify({ product_code: productCode, product_name: productName, description: description || 'No description available' });
      await QRCode.toCanvas(document.getElementById(elementId), data, { width: 200, margin: 2, errorCorrectionLevel: 'H' });
    } catch (err) {
      console.error('QR code generation failed:', err);
      notifyError('Failed to generate QR code', { autoClose: 3000 });
    }
  }, []);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const socket = io(backendUrl, { withCredentials: true, transports: ['websocket'] });
    socket.on('stockUpdate', () => { refetchData(); notifyInfo('Inventory updated in real-time', { autoClose: 1200 }); if (tableRef.current) tableRef.current.focus(); });
    return () => socket.disconnect();
  }, [refetchData]);

  useEffect(() => {
    if (showBarcodeModal && selectedBarcode) {
      generateQRCode(selectedBarcode, selectedProductName, selectedProductDescription, 'qrcode-canvas');
    }
  }, [showBarcodeModal, selectedBarcode, selectedProductName, selectedProductDescription, generateQRCode]);

  const debouncedSearch = useCallback(debounce((value) => setSearchTerm(value), 300), []);
  useEffect(() => { setPage(0); }, [searchTerm, filterStock]);

  const handleSearchChange = (e) => {
    const value = e.target.value.toLowerCase();
    setSearchInput(value);
    debouncedSearch(value);
  };

  const sortedInventory = useMemo(() => {
    const sortableInventory = [...allInventory];
    if (sortConfig.key) {
      sortableInventory.sort((a, b) => {
        let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
        if (['price', 'stock_quantity', 'returnable_qty', 'available_quantity'].includes(sortConfig.key)) {
          aValue = Number(aValue); bValue = Number(bValue);
        } else if (sortConfig.key === 'created_at') {
          aValue = new Date(aValue || 0); bValue = new Date(bValue || 0);
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableInventory;
  }, [allInventory, sortConfig]);

  const filteredInventory = useMemo(() => {
    return sortedInventory.filter((item) => {
      const matchesSearch =
        item.product_id.toString().includes(searchTerm) ||
        item.product_name.toLowerCase().includes(searchTerm) ||
        (item.product_code || '').toLowerCase().includes(searchTerm);
      const matchesStock =
        filterStock === 'All' ||
        (filterStock === 'In Stock' && item.available_quantity > 0) ||
        (filterStock === 'Out of Stock' && item.available_quantity === 0);
      return matchesSearch && matchesStock;
    });
  }, [sortedInventory, searchTerm, filterStock]);

  const paginatedInventory = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredInventory.slice(start, start + itemsPerPage);
  }, [filteredInventory, page, itemsPerPage]);

  const exportToExcel = useCallback(() => {
    const data = filteredInventory.map((item) => ({
      'Product ID': item.product_id,
      'Product Code': item.product_code || 'N/A',
      'Product Name': item.product_name.replace(/<[^>]*>/g, '') || 'N/A',
      Description: item.description || 'N/A',
      'Stock Quantity': Number(item.stock_quantity),
      'Reserved Qty': Number(item.reserved_quantity ?? 0),
      'Available Qty': Number(item.available_quantity ?? 0),
      'Returnable Qty': Number(item.returnable_qty ?? 0),
      'Price (₹)': formatCurrency(Number(item.price)),
      'Created At (IST)': item.created_at
        ? `${new Date(item.created_at).toLocaleDateString('en-IN')} ${new Date(item.created_at).toLocaleTimeString('en-IN')}`
        : 'N/A',
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Finished Goods');
    const colWidths = data.reduce((acc, row) => {
      Object.keys(row).forEach((key, idx) => { acc[idx] = Math.max(acc[idx] || 10, String(row[key]).replace(/<[^>]*>/g, '').length + 2); });
      return acc;
    }, []);
    worksheet['!cols'] = colWidths.map((width) => ({ wch: width }));
    XLSX.writeFile(workbook, 'Finished_Goods_Inventory.xlsx');
    notifySuccess('Finished Goods exported to Excel!', { autoClose: 2000 });
  }, [filteredInventory]);

  const handleDeleteItem = useCallback(async (itemId) => {
    if (!window.confirm("Are you sure you want to delete this item? This action cannot be undone.")) return;
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error('Authentication token missing.');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/inventory/${itemId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }, credentials: 'include',
      });
      if (!response.ok) { const ed = await response.json().catch(() => ({})); throw new Error(ed.error || 'Failed to delete item'); }
      refetchData(); notifySuccess('Item deleted successfully');
    } catch (err) { notifyError(err.message); }
  }, [refetchData]);

    const handleCreateItem = useCallback(async ({ product_name, stock_quantity, price, description, product_code, returnable_qty = 0, part_number_auto }) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error('Authentication token missing.');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_name, stock_quantity, price, description, product_code, returnable_qty, part_number_auto }),
        credentials: 'include',
      });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'Failed to create item'); }
      setPage(0); setSearchInput(''); setFilterStock('All');
      setTimeout(() => refetchData(), 100);
      setShowCreateForm(false);
      notifySuccess('Item created successfully');
    } catch (err) { notifyError(err.message); throw err; }
  }, [refetchData]);

  const handleUpdateItem = useCallback(async (itemId, formData) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error('Authentication token missing.');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/inventory/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
        credentials: 'include',
      });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || `Failed to update item (Status: ${response.status})`); }
      setTimeout(() => refetchData(), 100);
      setShowEditForm(false); setSelectedItem(null);
      notifySuccess('Item updated successfully');
    } catch (err) { notifyError(err.message); throw err; }
  }, [refetchData]);

  const confirmEdit = useCallback((itemId, formData) => {
    if (window.confirm('Are you sure you want to update this item?')) return handleUpdateItem(itemId, formData);
    return Promise.reject(new Error('Update cancelled.'));
  }, [handleUpdateItem]);

  const initiateEdit = useCallback((item) => { setSelectedItem(item); setShowEditForm(true); }, []);
  const showDescription = useCallback((description) => { setSelectedDescription(description); setShowDescriptionModal(true); }, []);
  const showBarcode = useCallback((productCode, productName, description) => {
    setSelectedBarcode(productCode);
    setSelectedProductName(productName);
    setSelectedProductDescription(description || 'No description available');
    setShowBarcodeModal(true);
  }, []);

  const ActionsDropdown = ({ item, onEdit }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [showAcceptModal, setShowAcceptModal] = useState(false);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div ref={dropdownRef} className="relative">
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label={`Actions for item ${item.product_name}`} aria-haspopup="true" aria-expanded={isOpen}>
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-10 mt-2 w-56 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            <button onClick={() => { onEdit(item); setIsOpen(false); }} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100">
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
            <button onClick={() => { setShowAcceptModal(true); setIsOpen(false); }} className="flex items-center w-full px-4 py-2 text-sm text-green-700 hover:bg-green-50 focus:outline-none focus:bg-green-50" disabled={item.returnable_qty <= 0}>
              <CheckCircle size={16} className="mr-2" /> Accept Return
            </button>
            <button onClick={() => { handleDeleteItem(item.product_id); setIsOpen(false); }} className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-100 focus:outline-none focus:bg-red-100">
              <Trash2 size={16} className="mr-2" /> Delete
            </button>
          </div>
        )}
        {showAcceptModal && (
          <AcceptReturnModal product={item} onClose={() => setShowAcceptModal(false)} onAccepted={async () => { setShowAcceptModal(false); await refetchData(); }} />
        )}
      </div>
    );
  };

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  }, []);

  if (isLoading && !allInventory.length)
    return <div className="min-h-screen flex items-center justify-center" aria-live="polite"><div className="text-gray-600 text-xl animate-pulse">Loading inventory...</div></div>;

  if (error && !showEditForm && !showCreateForm) return <ConnectionError onRetry={refetchData} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Products/Finished Goods Stocks</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-input" className="sr-only">Search inventory</label>
            <input id="search-input" type="text" placeholder="Search by ID, Name, or Code..." value={searchInput} onChange={handleSearchChange} className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md" />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" aria-hidden="true" />
          </div>
          <div>
            <label htmlFor="stock-filter" className="sr-only">Filter inventory by stock</label>
            <select id="stock-filter" value={filterStock} onChange={(e) => setFilterStock(e.target.value)} className="p-4 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md">
              <option value="All">All Stock</option>
              <option value="In Stock">In Stock (&gt;0)</option>
              <option value="Out of Stock">Out of Stock (=0)</option>
            </select>
          </div>
          <button onClick={() => refetchData()} className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-md" disabled={isLoading}>Refresh</button>
          <button onClick={() => setShowCreateForm(true)} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md" disabled={isLoading}>
            <PlusCircle className="mr-2" /> Add Item
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 flex items-center shadow-md" disabled={isLoading}>
            <Upload className="mr-2" /> Import from Excel
          </button>
          <input type="file" ref={fileInputRef} onChange={importFromExcel} accept=".xlsx,.xls" className="hidden" />
          <button onClick={exportToExcel} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md" disabled={isLoading || filteredInventory.length === 0}>
            <Download className="mr-2" /> Export to Excel
          </button>
        </div>

        {isLoading && allInventory.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">Refreshing data...</div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left" role="grid" aria-label="Inventory table" ref={tableRef} tabIndex={0}>
            <thead className="bg-amber-100">
              <tr role="row">
                {[
                  { key: 'product_id', label: 'Product ID' },
                  { key: 'product_code', label: 'Product Code' },
                  { key: 'product_name', label: 'Product Name' },
                  { key: 'description', label: 'Description' },
                  { key: 'stock_quantity', label: 'Stock (Physical)' },
                  { key: 'returnable_qty', label: 'Returnable Qty' },
                  { key: 'price', label: 'Price' },
                  { key: 'created_at', label: 'Created At (IST)' },
                  { key: 'qrcode', label: 'QR Code' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th key={key}
                    onClick={() => key !== 'actions' && key !== 'qrcode' && handleSort(key)}
                    onKeyDown={(e) => key !== 'actions' && key !== 'qrcode' && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleSort(key))}
                    className={`py-5 px-3 ${key !== 'actions' && key !== 'qrcode' ? 'cursor-pointer hover:bg-amber-200 focus:outline-none focus:bg-amber-200' : ''}`}
                    tabIndex={key !== 'actions' && key !== 'qrcode' ? 0 : undefined}
                    aria-sort={sortConfig.key === key ? sortConfig.direction : 'none'}
                    role="columnheader"
                  >
                    <div className="flex items-center">
                      {label}
                      {key !== 'actions' && key !== 'qrcode' && <ArrowDownUp className="ml-2" size={16} aria-hidden="true" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedInventory.map((item) => (
                <tr key={item.product_id} className="border-t hover:bg-amber-50" role="row">
                  <td className="py-4 px-3">{item.product_id}</td>
                  <td className="py-4 px-3 font-mono text-sm">{item.product_code || '-'}</td>
                  <td className="py-4 px-3">{item.product_name.replace(/<[^>]*>/g, '')}</td>
                  <td className="py-4 px-3">
                    {item.description ? (
                      <button onClick={() => showDescription(item.description)} className="text-amber-600 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center">
                        <Eye size={16} className="mr-1" /> View
                      </button>
                    ) : '-'}
                  </td>
                  <td className="py-4 px-3">
                    <button onClick={() => openQuantityModal(item)}
                      className={`px-3 py-1 rounded-full text-white text-sm hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-amber-300 ${item.stock_quantity > 0 ? 'bg-green-600 hover:bg-green-700' : item.stock_quantity === 0 ? 'bg-gray-500' : 'bg-red-600'}`}>
                      {item.stock_quantity}
                    </button>
                    <div className="text-xs text-gray-500 mt-1">Avail: {item.available_quantity ?? item.stock_quantity}</div>
                  </td>
                  <td className="py-4 px-3">
                    <span className={`px-3 py-1 rounded-full text-white text-sm ${item.returnable_qty > 0 ? 'bg-indigo-600' : 'bg-gray-400'}`}>{item.returnable_qty}</span>
                  </td>
                  <td className="py-4 px-3">{formatCurrency(item.price)}</td>
                  <td className="py-4 px-3">
                    <div className="flex flex-col">
                      <span>{new Date(item.created_at).toLocaleDateString('en-IN')}</span>
                      <span className="text-sm text-gray-500">{new Date(item.created_at).toLocaleTimeString('en-IN')}</span>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <button onClick={() => showBarcode(item.product_code, item.product_name, item.description)} className="text-amber-600 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center">
                      <Eye size={16} className="mr-1" /> QR Code
                    </button>
                  </td>
                  <td className="py-4 px-3">
                    <ActionsDropdown item={item} onEdit={initiateEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">Showing {paginatedInventory.length} of {filteredInventory.length} filtered items (Total: {totalItems})</div>
              <div className="flex space-x-2">
                <button onClick={() => setPage((p) => (p > 0 ? p - 1 : 0))} disabled={page === 0} className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label="Previous page"><ChevronLeft size={20} /></button>
                <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * itemsPerPage >= filteredInventory.length} className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label="Next page"><ChevronRight size={20} /></button>
              </div>
            </div>
          )}

          {filteredInventory.length === 0 && (
            <div className="text-center py-16 flex flex-col items-center justify-center text-gray-500" role="alert">
              <Package size={48} className="mb-4 text-gray-400" />
              <p className="text-lg">No inventory items found.</p>
              {searchTerm || filterStock !== 'All' ? <p className="mt-2">Try adjusting your search or filters.</p> : (
                <button onClick={() => setShowCreateForm(true)} className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center">
                  <PlusCircle className="mr-2" /> Add Your First Item
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Item Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[560px] max-h-[90vh] overflow-y-auto relative" role="dialog" aria-labelledby="create-form-title">
            <button onClick={() => setShowCreateForm(false)} className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label="Close create form"><XCircle size={24} /></button>
            <h2 id="create-form-title" className="text-2xl font-bold mb-6">Add New Item</h2>
            <CreateItemForm
              onSubmit={handleCreateItem}
              onClose={() => setShowCreateForm(false)}
              suggestedPartNumber={String(
                (allInventory.length ? Math.max(...allInventory.map((i) => i.product_id)) : 0) + 1,
              ).padStart(4, "0")}
            />
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditForm && selectedItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[560px] max-h-[90vh] overflow-y-auto relative" role="dialog" aria-labelledby="edit-form-title">
            <button onClick={() => setShowEditForm(false)} className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label="Close edit form"><XCircle size={24} /></button>
            <h2 id="edit-form-title" className="text-2xl font-bold mb-6">Edit Item #{selectedItem.product_id}</h2>
            <EditItemForm item={selectedItem} onSubmit={confirmEdit} onClose={() => setShowEditForm(false)} />
          </div>
        </div>
      )}

      {/* Description Modal */}
      {showDescriptionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="description-modal-title">
            <button onClick={() => setShowDescriptionModal(false)} className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"><XCircle size={24} /></button>
            <h2 id="description-modal-title" className="text-2xl font-bold mb-6">Description</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{selectedDescription || 'No description available'}</p>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showBarcodeModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 overflow-auto">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-[90%] max-w-[500px] max-h-[90vh] relative flex flex-col" role="dialog" aria-labelledby="qrcode-modal-title">
            <button onClick={() => setShowBarcodeModal(false)} className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"><XCircle size={24} /></button>
            <h2 id="qrcode-modal-title" className="text-2xl font-bold mb-4">QR Code for {selectedProductName}</h2>
            <div className="flex flex-col max-h-[70vh] overflow-y-auto pr-2">
              <div className="mb-4">
                <p className="text-gray-700"><strong>Product Code:</strong> {selectedBarcode}</p>
                <p className="text-gray-700 whitespace-pre-wrap"><strong>Description:</strong> {selectedProductDescription}</p>
              </div>
              <canvas id="qrcode-canvas" className="w-full max-w-[200px] mx-auto mb-4" aria-label={`QR code for ${selectedProductName}`} />
            </div>
            <div className="mt-4">
              <button onClick={() => {
                const canvas = document.getElementById('qrcode-canvas');
                if (!canvas) return;
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/png');
                link.download = `qrcode_${selectedBarcode}.png`;
                link.click();
                notifySuccess('QR code downloaded successfully', { autoClose: 2000 });
              }} className="w-full p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center justify-center">
                <Download className="mr-2" /> Download QR Code
              </button>
            </div>
          </div>
        </div>
      )}

      {showQtyModal && qtyProduct && (
        <QuantityBreakdownModal product={qtyProduct} onClose={() => setShowQtyModal(false)} />
      )}


</div>
  );
}

/* ========= QuantityBreakdownModal ========= */
const QuantityBreakdownModal = ({ product, onClose }) => {
  const [holds, setHolds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHolds = async () => {
      try {
        const token = localStorage.getItem('token');
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const res = await fetch(`${backendUrl}/api/inventory/${product.product_id}/holds`, {
          headers: { 'Authorization': `Bearer ${token}` }, credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch holds');
        const json = await res.json();
        setHolds(json.data || []);
      } catch (err) {
        notifyError('Failed to load reserved stock', { autoClose: 3000 });
      } finally {
        setLoading(false);
      }
    };
    fetchHolds();
  }, [product.product_id]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white w-[90%] max-w-[900px] rounded-xl shadow-xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300"><XCircle size={24} /></button>
        <h2 className="text-2xl font-bold mb-4 pr-8">Quantity Breakdown — {product.product_name}</h2>
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Stat label="Physical" value={product.stock_quantity} />
          <Stat label="Reserved" value={product.reserved_quantity || 0} highlight />
          <Stat label="Available" value={product.available_quantity || 0} />
          <Stat label="Returnable" value={product.returnable_qty || 0} />
        </div>
        <div className="text-sm text-gray-600 mb-4"><strong>Formula:</strong> Available = Physical - Reserved</div>
        <h3 className="text-lg font-semibold mb-3 text-amber-700 flex items-center">
          <span className="w-2 h-2 bg-amber-600 rounded-full mr-2"></span>Reserved / Blocked Stock
        </h3>
        {loading ? <p className="text-gray-500 py-4">Loading holds…</p> : holds.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-4 text-gray-600 text-center"><Package size={32} className="mx-auto mb-2 text-gray-400" /><p>No active reservations</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border rounded-lg">
              <thead className="bg-amber-100">
                <tr><th className="p-3 text-left">Reason</th><th className="p-3 text-left">Qty</th><th className="p-3 text-left">For</th><th className="p-3 text-left">Reference</th><th className="p-3 text-left">Created</th></tr>
              </thead>
              <tbody>
                {holds.map(h => (
                  <tr key={h.hold_id} className="border-t hover:bg-amber-50">
                    <td className="p-3">{h.reason}</td>
                    <td className="p-3"><span className="px-2 py-1 bg-amber-200 rounded-full text-sm font-medium">{h.quantity}</span></td>
                    <td className="p-3">{h.reference_type ? <span className={`px-2 py-1 rounded-full text-xs font-semibold ${h.reference_type === 'ORDER' ? 'bg-blue-100 text-blue-800' : h.reference_type === 'QA' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>{h.reference_type}</span> : '-'}</td>
                    <td className="p-3 text-sm">{h.reference_value ? (h.reference_type === 'ORDER' ? <a href={`/orders?orderId=${h.reference_value}`} className="text-blue-600 hover:underline font-medium">#{h.reference_value}</a> : <span className="font-medium">{h.reference_value}</span>) : '-'}</td>
                    <td className="p-3 text-sm">{new Date(h.created_at).toLocaleDateString('en-IN')}<div className="text-gray-500 text-xs">{new Date(h.created_at).toLocaleTimeString('en-IN')}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-300">Close</button>
        </div>
      </div>
    </div>
  );
};

const Stat = ({ label, value, highlight }) => (
  <div className={`p-4 rounded-lg text-center ${highlight ? 'bg-amber-200 border-2 border-amber-400' : 'bg-gray-100'}`}>
    <div className="text-sm text-gray-600 mb-1">{label}</div>
    <div className="text-2xl font-bold">{value ?? 0}</div>
  </div>
);


/* ========= AcceptReturnModal ========= */
const AcceptReturnModal = ({ product, onClose, onAccepted }) => {
  const [qty, setQty] = useState(product.returnable_qty ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    const parsed = parseInt(qty, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) { notifyError('Please enter a positive integer quantity to accept.', { autoClose: 3000 }); return; }
    if (parsed > (product.returnable_qty ?? 0)) { notifyError(`Cannot accept more than ${product.returnable_qty}`, { autoClose: 3000 }); return; }
    try {
      setIsSubmitting(true);
      await acceptReturnApi(product.product_id, parsed);
      notifySuccess('Return accepted and stock updated', { autoClose: 2000 });
      if (onAccepted) await onAccepted();
    } catch (err) {
      notifyError(err.message || 'Accept return failed', { autoClose: 4000 });
    } finally {
      setIsSubmitting(false); onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-[420px] relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"><XCircle size={22} /></button>
        <h3 className="text-xl font-semibold mb-3">Accept Return — {product.product_name}</h3>
        <p className="text-sm text-gray-600 mb-4">Available to accept: <strong>{product.returnable_qty}</strong></p>
        <label className="text-sm font-medium">Quantity to accept</label>
        <input type="number" min={1} max={product.returnable_qty} value={qty} onChange={(e) => setQty(e.target.value)} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300 mb-3" />
        <div className="flex space-x-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300" disabled={isSubmitting}>Cancel</button>
          <button onClick={handleAccept} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center" disabled={isSubmitting}>
            {isSubmitting ? 'Accepting...' : <><CheckCircle className="mr-2" /> Accept</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ========= Shared validateField ========= */
const validateField = (name, value) => {
  if (name === 'product_name' && !String(value).trim()) return 'Product name is required';
  if (name === 'product_code' && String(value).trim().length !== 11) return 'Product code must be exactly 11 characters';
  if (name === 'returnable_qty' && (value === '' || !Number.isInteger(Number(value)) || Number(value) < 0)) return 'Returnable Qty must be a non-negative integer';
  return '';
};

/* ========= CreateItemForm ========= */
const CreateItemForm = ({ onSubmit, onClose, suggestedPartNumber }) => {
  const [formData, setFormData] = useState({
    product_name: '', stock_quantity: '', returnable_qty: '0', price: '', description: '', product_code: '',
  });
  const [errors, setErrors] = useState({
    product_name: '', stock_quantity: '', returnable_qty: '', price: '', description: '', product_code: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partNumberAuto, setPartNumberAuto] = useState(true);
  const [partNumberAvailable, setPartNumberAvailable] = useState(true);
  const { notifyError } = useNotify();
  const [partSearch, setPartSearch] = useState('');
  const [allParts, setAllParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [isPartLoading, setIsPartLoading] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [partsLoaded, setPartsLoaded] = useState(false);
  const partDropdownRef = useRef(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (['stock_quantity', 'returnable_qty', 'price'].includes(name)) {
      setFormData(prev => ({ ...prev, [name]: value }));
      setErrors(prev => ({ ...prev, [name]: '' }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const loadParts = useCallback(async () => {
    if (partsLoaded || isPartLoading) return;
    try {
      setIsPartLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing.');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/parts?limit=500&offset=0`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Failed (${res.status})`); }
      const json = await res.json();
      setAllParts(json.data || []);
      setPartsLoaded(true);
    } catch (err) {
      notifyError(err.message || 'Failed to load parts', { autoClose: 3000 });
    } finally {
      setIsPartLoading(false);
    }
  }, [partsLoaded, isPartLoading]);

  useEffect(() => {
    const term = partSearch.toLowerCase().trim();
    setFilteredParts(!term ? allParts.slice(0, 20) : allParts.filter(p =>
      (p.partCode || '').toLowerCase().includes(term) ||
      (p.name || '').toLowerCase().includes(term) ||
      (p.drawingNo || '').toLowerCase().includes(term)
    ).slice(0, 20));
  }, [partSearch, allParts]);

  useEffect(() => {
    if (!showPartDropdown) return;
    const handler = (e) => { if (partDropdownRef.current && !partDropdownRef.current.contains(e.target)) setShowPartDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPartDropdown]);

  const handlePartSelect = (part) => {
    setFormData(prev => ({ ...prev, product_name: part.name || '', description: part.description || '' }));
    setErrors(prev => ({ ...prev, product_name: '', description: '' }));
    setPartSearch(`${part.partCode} — ${part.name}`);
    setShowPartDropdown(false);
  };

  const handleSave = async () => {
    const parsedQuantity = formData.stock_quantity === '' ? 0 : parseInt(formData.stock_quantity, 10);
    const parsedPrice    = formData.price === '' ? 0 : parseFloat(formData.price);
    const parsedReturnable = parseInt(formData.returnable_qty || '0', 10);

    const fieldErrors = {
      product_name:   validateField('product_name', formData.product_name),
      product_code:   validateField('product_code', formData.product_code),
      returnable_qty: validateField('returnable_qty', formData.returnable_qty),
      stock_quantity: '', price: '', description: '',
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(e => e)) return;
    if (!partNumberAvailable) {
      notifyError('Part Number is already in use — choose a different one.', { autoClose: 3000 });
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({ ...formData, stock_quantity: isNaN(parsedQuantity) ? 0 : parsedQuantity, price: isNaN(parsedPrice) ? 0 : parsedPrice, returnable_qty: isNaN(parsedReturnable) ? 0 : parsedReturnable, part_number_auto: partNumberAuto });
    } finally { setIsSubmitting(false); }
  };

  return (
    <form className="space-y-4" onSubmit={e => e.preventDefault()}>
      {/* Part search */}
      <div>
        <label className="text-gray-700 font-medium">Search Part (optional)</label>
        <div className="relative" ref={partDropdownRef}>
          <input type="text" value={partSearch}
            onChange={e => { setPartSearch(e.target.value); setShowPartDropdown(true); if (!partsLoaded && !isPartLoading) loadParts(); }}
            onFocus={() => { setShowPartDropdown(true); if (!partsLoaded && !isPartLoading) loadParts(); }}
            placeholder="Type part code or name..."
            className="w-full p-2 pl-8 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          {showPartDropdown && (
            <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border rounded-lg shadow-lg">
              {isPartLoading && <div className="px-3 py-2 text-sm text-gray-500">Loading parts...</div>}
              {!isPartLoading && filteredParts.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No parts found.</div>}
              {!isPartLoading && filteredParts.map(part => (
                <button key={part.id} type="button" onClick={() => handlePartSelect(part)} className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50">
                  <div className="font-medium">{part.partCode} — {part.name}</div>
                  <div className="text-xs text-gray-500">{part.partTypeName}{part.drawingNo ? ` • Drawing: ${part.drawingNo}` : ''}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">Selecting a part will fill Product Name and Description.</p>
      </div>

      <div>
        <label htmlFor="create-product-name" className="text-gray-700 font-medium">Product Name</label>
        <input id="create-product-name" type="text" name="product_name" value={formData.product_name} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.product_name && <p className="text-red-600 text-sm mt-1">{errors.product_name}</p>}
      </div>

      {/* Product Code Builder */}
      <div>
        <label className="text-gray-700 font-medium block mb-2">Product Code</label>
        <ProductCodeBuilder
          value={formData.product_code}
          onChange={(v) => {
            setFormData(prev => ({ ...prev, product_code: v }));
            setErrors(prev => ({ ...prev, product_code: String(v).trim().length === 11 ? '' : 'Product code must be exactly 11 characters' }));
          }}
          disabled={isSubmitting}
          suggestedPartNumber={suggestedPartNumber}
          onAutoFlagChange={setPartNumberAuto}
          onAvailabilityChange={setPartNumberAvailable}
        />
        {errors.product_code && <p className="text-red-600 text-sm mt-1">{errors.product_code}</p>}
      </div>

      <div>
        <label htmlFor="create-description" className="text-gray-700 font-medium">Description</label>
        <textarea id="create-description" name="description" value={formData.description} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
      </div>
      <div>
        <label htmlFor="create-stock-quantity" className="text-gray-700 font-medium">Stock Quantity</label>
        <input id="create-stock-quantity" type="number" name="stock_quantity" value={formData.stock_quantity} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.stock_quantity && <p className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>}
      </div>
      <div>
        <label htmlFor="create-returnable-qty" className="text-gray-700 font-medium">Returnable Qty</label>
        <input id="create-returnable-qty" type="number" name="returnable_qty" value={formData.returnable_qty} onChange={handleChange} min={0} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.returnable_qty && <p className="text-red-600 text-sm mt-1">{errors.returnable_qty}</p>}
      </div>
      <div>
        <label htmlFor="create-price" className="text-gray-700 font-medium">Price (₹)</label>
        <input id="create-price" type="number" name="price" value={formData.price} onChange={handleChange} step="0.01" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.price && <p className="text-red-600 text-sm mt-1">{errors.price}</p>}
      </div>

      <div className="flex justify-end space-x-4">
        <button type="button" onClick={onClose} className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400" disabled={isSubmitting}>Cancel</button>
        <button type="button" onClick={handleSave} className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  );
};

/* ========= EditItemForm ========= */
const EditItemForm = ({ item, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    product_name:   item.product_name,
    stock_quantity: String(item.stock_quantity),
    returnable_qty: String(item.returnable_qty ?? 0),
    price:          String(item.price),
    description:    item.description || '',
    product_code:   item.product_code,
  });
  const [errors, setErrors] = useState({
    product_name: '', stock_quantity: '', returnable_qty: '', price: '', description: '', product_code: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partNumberAvailable, setPartNumberAvailable] = useState(true);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (['stock_quantity', 'price', 'returnable_qty'].includes(name)) {
      setFormData(prev => ({ ...prev, [name]: value }));
      setErrors(prev => ({ ...prev, [name]: '' }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleSave = async () => {
    const parsedQuantity   = formData.stock_quantity === '' ? 0 : parseInt(formData.stock_quantity, 10);
    const parsedPrice      = formData.price === '' ? 0 : parseFloat(formData.price);
    const parsedReturnable = parseInt(formData.returnable_qty || '0', 10);

    const fieldErrors = {
      product_name:   validateField('product_name', formData.product_name),
      product_code:   validateField('product_code', formData.product_code),
      returnable_qty: validateField('returnable_qty', formData.returnable_qty),
      stock_quantity: '', price: '', description: '',
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(e => e)) return;
    if (!partNumberAvailable) {
      notifyError('Part Number is already in use — choose a different one.', { autoClose: 3000 });
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(item.product_id, { ...formData, stock_quantity: isNaN(parsedQuantity) ? 0 : parsedQuantity, price: isNaN(parsedPrice) ? 0 : parsedPrice, returnable_qty: isNaN(parsedReturnable) ? 0 : parsedReturnable });
    } finally { setIsSubmitting(false); }
  };

  return (
    <form className="space-y-4" onSubmit={e => e.preventDefault()}>
      <div>
        <label htmlFor="edit-product-name" className="text-gray-700 font-medium">Product Name</label>
        <input id="edit-product-name" type="text" name="product_name" value={formData.product_name} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.product_name && <p className="text-red-600 text-sm mt-1">{errors.product_name}</p>}
      </div>

      {/* Product Code Builder — prefilled from item.product_code */}
      <div>
        <label className="text-gray-700 font-medium block mb-2">Product Code</label>
        <ProductCodeBuilder
          value={formData.product_code}
          onChange={(v) => {
            setFormData(prev => ({ ...prev, product_code: v }));
            setErrors(prev => ({ ...prev, product_code: String(v).trim().length === 11 ? '' : 'Product code must be exactly 11 characters' }));
          }}
          disabled={isSubmitting}
          excludeId={item.product_id}
          onAvailabilityChange={setPartNumberAvailable}
        />
        {errors.product_code && <p className="text-red-600 text-sm mt-1">{errors.product_code}</p>}
      </div>

      <div>
        <label htmlFor="edit-description" className="text-gray-700 font-medium">Description</label>
        <textarea id="edit-description" name="description" value={formData.description} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
      </div>
      <div>
        <label htmlFor="edit-stock-quantity" className="text-gray-700 font-medium">Stock Quantity</label>
        <input id="edit-stock-quantity" type="number" name="stock_quantity" value={formData.stock_quantity} onChange={handleChange} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.stock_quantity && <p className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>}
      </div>
      <div>
        <label htmlFor="edit-returnable-qty" className="text-gray-700 font-medium">Returnable Qty</label>
        <input id="edit-returnable-qty" type="number" name="returnable_qty" value={formData.returnable_qty} onChange={handleChange} min={0} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.returnable_qty && <p className="text-red-600 text-sm mt-1">{errors.returnable_qty}</p>}
      </div>
      <div>
        <label htmlFor="edit-price" className="text-gray-700 font-medium">Price (₹)</label>
        <input id="edit-price" type="number" name="price" value={formData.price} onChange={handleChange} step="0.01" className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300" disabled={isSubmitting} />
        {errors.price && <p className="text-red-600 text-sm mt-1">{errors.price}</p>}
      </div>

      <div className="flex justify-end space-x-4">
        <button type="button" onClick={onClose} className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400" disabled={isSubmitting}>Cancel</button>
        <button type="button" onClick={handleSave} className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
};

export default SalesInventoryPage;