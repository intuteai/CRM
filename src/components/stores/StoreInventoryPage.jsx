import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  ArrowDownUp,
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
  PlusCircle,
} from "lucide-react";
import { debounce } from "lodash";
import { io } from "socket.io-client";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return `${date.toLocaleDateString("en-IN")} ${date.toLocaleTimeString("en-IN")}`;
};

/* =====================================================================
   PRODUCT CODE BUILDER
   Data sourced directly from ERP_PART_CODE_LIST.pdf:

   Chart         Symbol  DefaultSubCode  DefaultSubLabel
   IPT           L       5               Bearing BR
   Rikshaw       R       1               Shaft SH
   2Wheeler      W       2               Front Flange FF
   Autonxt       A       0               Rear Flange RF
   Special       S       (none)          (none)

   Sub Codes (alphabetic abbreviations):
   0 → RF  Rear Flange
   1 → SH  Shaft
   2 → FF  Front Flange
   3 → AU  Auxiliary
   4 → (reserved / custom)
   5 → BR  Bearing BR

   Code structure: NNNN(4) + ChartPair(2, e.g. L5) + SubAbbr(2, e.g. BR) + Store(1) + Col(1) + Row(1) = 11
   ===================================================================== */

const PRODUCT_CHARTS = [
  { label: "IPT", symbol: "L", digit: "5", defaultSub: "BR", color: "purple" },
  {
    label: "Rikshaw",
    symbol: "R",
    digit: "1",
    defaultSub: "SH",
    color: "blue",
  },
  {
    label: "2Wheeler",
    symbol: "W",
    digit: "2",
    defaultSub: "FF",
    color: "indigo",
  },
  {
    label: "Autonxt",
    symbol: "A",
    digit: "0",
    defaultSub: "RF",
    color: "violet",
  },
  {
    label: "Special",
    symbol: "S",
    digit: "3",
    defaultSub: "",
    color: "fuchsia",
  },
  {
    label: "CO",
    symbol: "C",
    digit: "",
    pair: "CO", // ✅ NEW
    defaultSub: "",
    color: "gray",
  },
  {
    label: "General",
    symbol: "G",
    digit: "N",
    pair: "GN",
    defaultSub: "",
    color: "green",
  },
  {
    label: "Motor",
    symbol: "M",
    digit: "O",
    pair: "MO",
    defaultSub: "",
    color: "rose",
  },
];

const SUB_CODES = [
  { abbr: "BR", label: "Bearing BR" },
  { abbr: "SH", label: "Shaft" },
  { abbr: "FF", label: "Front Flange" },
  { abbr: "RF", label: "Rear Flange" },
  { abbr: "AU", label: "Auxiliary" },
];

const SEG = {
  part: "text-blue-700",
  chart: "text-purple-600",
  sub: "text-green-700",
  store: "text-red-600",
  col: "text-orange-500",
  row: "text-teal-600",
};

function pad4(val) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return "0001";
  return String(Math.min(n, 9999)).padStart(4, "0");
}

// Builds the full 11-char code
function buildCode({
  partNum,
  chartSymbol,
  chartDigit,
  subAbbr,
  storeNum,
  colNum,
  rowNum,
}) {
  const p = (partNum || "0001").padStart(4, "0").slice(0, 4); // 4 chars
  // const cp = (chartSymbol || "") + (chartDigit || ""); // 2 chars e.g. "L5"
  const cp =
    chartSymbol === "C" && !chartDigit
      ? "CO"
      : (chartSymbol || "") + (chartDigit || "");
  const s = (subAbbr || "").slice(0, 2).padEnd(2, "_"); // 2 chars e.g. "BR"
  const st = (storeNum || "").slice(0, 1); // 1 char
  const co = (colNum || "").slice(0, 1); // 1 char
  const ro = (rowNum || "").slice(0, 1); // 1 char
  return p + cp + s + st + co + ro;
}

// Parses an existing 11-char code back into builder segments
// Structure: NNNN(4) + ChartSymbol(1) + ChartDigit(1) + SubAbbr(2) + Store(1) + Col(1) + Row(1)
function parseCode(code) {
  if (!code || code.length !== 11) return null;
  const partNum = code.slice(0, 4); // e.g. "0042"
  let chartSymbol = code.slice(4, 5);
  let chartDigit = code.slice(5, 6);

  // ✅ Handle CO special case
  if (code.slice(4, 6) === "CO") {
    chartSymbol = "C";
    chartDigit = "";
  }
  const subAbbr = code.slice(6, 8); // e.g. "BR"
  const storeNum = code.slice(8, 9); // e.g. "1"
  const colNum = code.slice(9, 10); // e.g. "2"
  const rowNum = code.slice(10, 11); // e.g. "3"
  const chart =
    PRODUCT_CHARTS.find(
      (c) => c.symbol === chartSymbol && c.digit === chartDigit,
    ) || null;
  return {
    partNum,
    chartSymbol,
    chartDigit,
    subAbbr,
    storeNum,
    colNum,
    rowNum,
    chart,
  };
}

function ProductCodeBuilder({
  value = "",
  onChange,
  disabled = false,
  suggestedPartNumber = null,
  excludeId = null,
  onAutoFlagChange,
  onAvailabilityChange,
}) {
  // Prefill from existing code if provided, otherwise use defaults
  const parsed = parseCode(value);

  const [partNum, setPartNum] = useState(
    parsed?.partNum ?? (suggestedPartNumber ? pad4(suggestedPartNumber) : "0001"),
  );
  const [partInput, setPartInput] = useState(
    parsed
      ? String(parseInt(parsed.partNum, 10))
      : suggestedPartNumber
        ? String(parseInt(suggestedPartNumber, 10))
        : "1",
  );
  const [partTouched, setPartTouched] = useState(false);
  const [checkStatus, setCheckStatus] = useState(null);
  const [chart, setChart] = useState(parsed?.chart ?? null);
  const [subAbbr, setSubAbbr] = useState(parsed?.subAbbr ?? "");
  const [storeNum, setStoreNum] = useState(parsed?.storeNum ?? "");
  const [colNum, setColNum] = useState(parsed?.colNum ?? "");
  const [rowNum, setRowNum] = useState(parsed?.rowNum ?? "");
  // If the code can't be parsed into known segments, drop into manual mode so the user can still see and edit it
  const [manualMode, setManualMode] = useState(!parsed && value.length === 11);
  const [manualVal, setManualVal] = useState(value);

  const derivedCode = buildCode({
    partNum,
    chartSymbol: chart?.symbol,
    chartDigit: chart?.digit,
    subAbbr,
    storeNum,
    colNum,
    rowNum,
  });

  // Count filled segments to show progress
  const isComplete =
    derivedCode.length === 11 &&
    !derivedCode.includes("_") &&
    !!chart &&
    !!subAbbr &&
    !!storeNum &&
    !!colNum &&
    !!rowNum;

  // Fire onChange whenever any builder field changes
  useEffect(() => {
    if (manualMode) return;
    onChange?.(derivedCode.replace(/_/g, ""));
  }, [partNum, chart, subAbbr, storeNum, colNum, rowNum, manualMode]);

  const handleChartClick = (c) => {
    if (disabled) return;
    setChart(c);

    // ✅ Only auto-fill if defaultSub exists
    if (c.defaultSub) {
      setSubAbbr(c.defaultSub);
    } else {
      setSubAbbr(""); // or keep previous if you want
    }
  };

  const handlePartInput = (e) => {
    setPartTouched(true);
    const raw = e.target.value;
    setPartInput(raw);
    if (raw !== "") setPartNum(pad4(raw));
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
        const token = localStorage.getItem("token");
        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        const url = new URL(`${backendUrl}/api/inventory/check-part-number`);
        url.searchParams.set("part_number", partNum);
        if (excludeId) url.searchParams.set("exclude_id", excludeId);
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
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
        if (err.name !== "AbortError") {
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

  // Colour-coded segments for the preview bar
  const seg_part = derivedCode.slice(0, 4);
  const seg_chart = chart ? chart.pair || chart.symbol + chart.digit : "";
  const seg_sub = subAbbr || "";
  const seg_store = storeNum || "";
  const seg_col = colNum || "";
  const seg_row = rowNum || "";

  if (manualMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualVal}
            maxLength={11}
            onChange={(e) => {
              setManualVal(e.target.value);
              onChange?.(e.target.value);
            }}
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
      {/* ── Live Preview ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Code Preview
          </p>
          {isComplete ? (
            <span className="text-xs bg-green-100 text-green-700 border border-green-300 px-2 py-1 rounded-full font-semibold">
              ✓ 11 / 11
            </span>
          ) : (
            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-1 rounded-full">
              {
                [
                  seg_part,
                  seg_chart,
                  seg_sub,
                  seg_store,
                  seg_col,
                  seg_row,
                ].join("").length
              }{" "}
              / 11
            </span>
          )}
        </div>

        {/* Code display */}
        <div className="flex items-center gap-1 bg-white border-2 border-amber-300 rounded-xl px-4 py-3 shadow-inner justify-center font-mono text-2xl tracking-[0.2em] select-all overflow-x-auto">
          <span className={`${SEG.part}  font-black`}>{seg_part}</span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.chart} font-black`}>
            {seg_chart || <span className="text-gray-200 text-lg">??</span>}
          </span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.sub}   font-black`}>
            {seg_sub || <span className="text-gray-200 text-lg">??</span>}
          </span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.store} font-black`}>
            {seg_store || <span className="text-gray-200 text-lg">?</span>}
          </span>
          <span className={`${SEG.col}   font-black`}>
            {seg_col || <span className="text-gray-200 text-lg">?</span>}
          </span>
          <span className={`${SEG.row}   font-black`}>
            {seg_row || <span className="text-gray-200 text-lg">?</span>}
          </span>
        </div>

        {/* Segment legend */}
        <div className="flex gap-3 flex-wrap text-[10px] font-bold pt-0.5">
          {[
            [SEG.part, "① NNNN  Part #"],
            [SEG.chart, "② CC  Chart Pair (e.g. L5)"],
            [SEG.sub, "③ SS  Sub (e.g. BR)"],
            [SEG.store, "④ T  Store"],
            [SEG.col, "⑤ C  Col"],
            [SEG.row, "⑥ R  Row"],
          ].map(([cls, lbl]) => (
            <span key={lbl} className={`${cls} flex items-center gap-0.5`}>
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ background: "currentColor", opacity: 0.7 }}
              />
              {lbl}
            </span>
          ))}
        </div>
      </div>

      <hr className="border-amber-100" />

      {/* ── ① Part Number ── */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1.5">
          <span className={`${SEG.part} font-black text-sm`}>①</span>
          Part Number
          <span className="font-normal text-gray-400">(0001 – 9999)</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={9999}
            value={partInput}
            onChange={handlePartInput}
            onBlur={handlePartBlur}
            placeholder="1"
            className="w-28 p-2 border border-gray-300 rounded-lg font-mono text-base focus:ring-2 focus:ring-blue-300 bg-white"
            disabled={disabled}
          />
          <span className="text-gray-400 text-sm">
            →{" "}
            <code className={`${SEG.part} font-bold text-base`}>{partNum}</code>
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

      {/* ── ② Product Chart ── */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <span className={`${SEG.chart} font-black text-sm`}>②</span>
          Product Chart
          <span className="font-normal text-gray-400 ml-1">
            — 2-char pair, auto-fills Sub Code
          </span>
        </label>
        <div className="grid grid-cols-5 gap-2">
          {PRODUCT_CHARTS.map((c) => (
            <button
              key={c.symbol}
              type="button"
              onClick={() => handleChartClick(c)}
              title={`Auto-fills sub: ${c.defaultSub}`}
              className={`py-3 px-1 rounded-xl border-2 text-center transition-all duration-150 select-none
                ${
                  chart?.symbol === c.symbol
                    ? "border-purple-500 bg-purple-100 shadow-md scale-105"
                    : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {/* Big chart pair e.g. "L5" */}
              <div
                className={`text-xl font-black ${SEG.chart} leading-none tracking-tight`}
              >
                {c.symbol}
                <span className="text-gray-400">{c.digit}</span>
              </div>
              <div className="text-[10px] font-semibold text-gray-600 mt-1">
                {c.label}
              </div>
              <div className="text-[9px] text-purple-400 mt-0.5">
                → {c.defaultSub}
              </div>
            </button>
          ))}
        </div>
        {chart && (
          <div className="mt-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="font-semibold">{chart.label}</span>
            <span className="text-gray-400">·</span>
            <span>
              Pair:{" "}
              <code className={`${SEG.chart} font-black`}>
                {chart.pair || chart.symbol + chart.digit}
              </code>
            </span>
            <span className="text-gray-400">·</span>
            <span>
              Sub auto-set to:{" "}
              <code className={`${SEG.sub} font-black`}>
                {chart.defaultSub}
              </code>
            </span>
          </div>
        )}
      </div>

      {/* ── ③ Sub Code ── */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <span className={`${SEG.sub} font-black text-sm`}>③</span>
          Sub Code
          <span className="font-normal text-gray-400 ml-1">
            — 2-char abbreviation
          </span>
        </label>
        {/* Preset quick-pick buttons */}
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {SUB_CODES.map((sc) => (
            <button
              key={sc.abbr}
              type="button"
              onClick={() => !disabled && setSubAbbr(sc.abbr)}
              className={`py-2.5 px-1 rounded-lg border-2 text-center transition-all duration-150 select-none
                ${
                  subAbbr === sc.abbr
                    ? "border-green-500 bg-green-100 shadow-sm scale-[1.04]"
                    : "border-gray-200 bg-white hover:border-green-300 hover:bg-green-50"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className={`text-lg font-black ${SEG.sub} leading-none`}>
                {sc.abbr}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5 leading-tight">
                {sc.label}
              </div>
            </button>
          ))}
        </div>
        {/* Manual sub-code entry */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 whitespace-nowrap">
            Custom:
          </span>
          <input
            type="text"
            maxLength={2}
            value={subAbbr}
            onChange={(e) =>
              !disabled &&
              setSubAbbr(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 2),
              )
            }
            placeholder="XX"
            className={`w-16 p-1.5 border-2 rounded-lg font-mono text-base text-center focus:ring-2 focus:ring-green-300 bg-white uppercase transition-colors
              ${
                subAbbr && !SUB_CODES.find((s) => s.abbr === subAbbr)
                  ? "border-green-400 bg-green-50 text-green-700"
                  : "border-gray-200"
              }`}
            disabled={disabled}
          />
          {subAbbr && !SUB_CODES.find((s) => s.abbr === subAbbr) && (
            <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 rounded px-2 py-0.5">
              Custom: <code>{subAbbr}</code>
            </span>
          )}
          {!subAbbr && (
            <span className="text-xs text-gray-300">
              type any 2-char code here
            </span>
          )}
        </div>
      </div>

      <hr className="border-amber-100" />

      {/* ── ④⑤⑥ Store / Column / Row ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Store */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">
            <span className={`${SEG.store} font-black text-sm`}>④</span> Store #{" "}
            <span className="font-normal text-gray-400">(1 digit)</span>
          </label>
          <input
            type="text"
            maxLength={1}
            value={storeNum}
            onChange={(e) =>
              !disabled &&
              setStoreNum(e.target.value.replace(/\D/g, "").slice(0, 1))
            }
            placeholder="1"
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-2xl text-center focus:ring-2 focus:ring-red-300 bg-white"
            disabled={disabled}
          />
        </div>

        {/* Column */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">
            <span className={`${SEG.col} font-black text-sm`}>⑤</span> Column{" "}
            <span className="font-normal text-gray-400">(1 digit)</span>
          </label>
          <input
            type="text"
            maxLength={1}
            value={colNum}
            onChange={(e) =>
              !disabled &&
              setColNum(e.target.value.replace(/\D/g, "").slice(0, 1))
            }
            placeholder="1"
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-2xl text-center focus:ring-2 focus:ring-orange-300 bg-white"
            disabled={disabled}
          />
        </div>

        {/* Row — free text input + quick-pick 1–9 (unrestricted) */}
        <div>
          <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">
            <span className={`${SEG.row} font-black text-sm`}>⑥</span> Row{" "}
            <span className="font-normal text-gray-400">(1 digit)</span>
          </label>
          <input
            type="text"
            maxLength={1}
            value={rowNum}
            onChange={(e) =>
              !disabled &&
              setRowNum(e.target.value.replace(/\D/g, "").slice(0, 1))
            }
            placeholder="1"
            className="w-full p-3 border border-gray-300 rounded-lg font-mono text-2xl text-center focus:ring-2 focus:ring-teal-300 bg-white mb-1.5"
            disabled={disabled}
          />
          {/* Quick-pick 1–9 */}
          <div className="grid grid-cols-5 gap-1">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => !disabled && setRowNum(r)}
                className={`py-1 rounded border text-xs font-bold transition-all duration-100
                  ${
                    rowNum === r
                      ? "border-teal-500 bg-teal-100 text-teal-800"
                      : "border-gray-200 bg-white text-gray-500 hover:border-teal-300 hover:bg-teal-50"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Manual override link */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setManualMode(true);
            setManualVal(isComplete ? derivedCode.replace(/_/g, "") : "");
          }}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Enter code manually instead →
        </button>
      </div>
    </div>
  );
}

const useFetchInventory = () => {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    let isMounted = true;
    try {
      setIsLoading(true);
      const token = localStorage.getItem("token");
      if (!token)
        throw new Error("Authentication token missing. Please log in again.");
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
      const url = `${backendUrl}/api/inventory?limit=5000&offset=0&force_refresh=true`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `Inventory fetch failed: ${response.statusText}`,
        );
      }
      const { data, total } = await response.json();
      if (isMounted) {
        const normalizedData = data.map((item) => ({
          ...item,
          stock_quantity: item.stock_quantity || 0,
          description: item.description || "",
          product_code: item.product_code || "",
          product_name: item.product_name || "",
          product_id: item.product_id,
          created_at: item.created_at,
          price: item.price !== null ? Number(item.price) : 0,
        }));
        setInventoryItems(normalizedData);
        setTotalItems(total || 0);
        setError(null);
      }
    } catch (err) {
      if (isMounted) setError(err.message);
    } finally {
      if (isMounted) setIsLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    inventoryItems,
    totalItems,
    isLoading,
    error,
    refetchData: fetchData,
  };
};

function StoreInventoryPage({ userRole }) {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "created_at",
    direction: "desc",
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState("");
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState("");
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedProductDescription, setSelectedProductDescription] =
    useState("");
  const tableRef = useRef(null);
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);

  const { inventoryItems, totalItems, isLoading, error, refetchData } =
    useFetchInventory();

  const debouncedSearch = useCallback(
    debounce((value) => setSearchTerm(value.toLowerCase()), 300),
    [],
  );

  useEffect(() => {
    debouncedSearch(searchInput);
    return () => debouncedSearch.cancel();
  }, [searchInput, debouncedSearch]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm]);

  useEffect(() => {
    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ["websocket"],
    });
    socket.on("inventoryUpdate", ({ product_id, stock_quantity }) => {
      setInventoryItems((prev) => {
        if (!Array.isArray(prev)) return prev || [];
        const itemIndex = prev.findIndex(
          (item) => item.product_id === product_id,
        );
        if (itemIndex === -1) {
          refetchData();
          return prev;
        }
        const updatedItems = [...prev];
        updatedItems[itemIndex] = {
          ...updatedItems[itemIndex],
          stock_quantity: Number(stock_quantity),
        };
        notifyInfo(
          `Stock for ${updatedItems[itemIndex].product_name} updated to ${stock_quantity}`,
          { autoClose: 2000 },
        );
        return updatedItems;
      });
      if (tableRef.current) tableRef.current.focus();
    });
    return () => socket.disconnect();
  }, [refetchData]);

  const generateQRCode = useCallback(
    async (product_code, product_name, description, elementId) => {
      try {
        const data = JSON.stringify({
          product_code,
          product_name,
          description: description || "No description available",
        });
        await QRCode.toCanvas(document.getElementById(elementId), data, {
          width: 200,
          margin: 2,
          errorCorrectionLevel: "H",
        });
      } catch (err) {
        console.error("QR code generation failed:", err);
        notifyError("Failed to generate QR code", { autoClose: 3000 });
      }
    },
    [],
  );

  useEffect(() => {
    if (showBarcodeModal && selectedBarcode) {
      generateQRCode(
        selectedBarcode,
        selectedProductName,
        selectedProductDescription,
        "qrcode-canvas",
      );
    }
  }, [
    showBarcodeModal,
    selectedBarcode,
    selectedProductName,
    selectedProductDescription,
    generateQRCode,
  ]);

  const sortedInventory = useMemo(() => {
    if (!Array.isArray(inventoryItems)) return [];
    const sortableItems = [...inventoryItems];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key] ?? "";
        let bValue = b[sortConfig.key] ?? "";
        if (
          sortConfig.key === "stock_quantity" ||
          sortConfig.key === "product_id" ||
          sortConfig.key === "price"
        ) {
          aValue = Number(aValue);
          bValue = Number(bValue);
        } else if (sortConfig.key === "created_at") {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [inventoryItems, sortConfig]);

  const filteredInventory = useMemo(() => {
    return sortedInventory.filter((item) => {
      return (
        item.product_id.toString().includes(searchTerm) ||
        item.product_name.toLowerCase().includes(searchTerm) ||
        item.product_code.toLowerCase().includes(searchTerm)
      );
    });
  }, [sortedInventory, searchTerm]);

  const paginatedInventory = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredInventory.slice(start, start + itemsPerPage);
  }, [filteredInventory, page, itemsPerPage]);

  const validateImportRow = useCallback((row, index) => {
    const errors = [];
    if (!row["Product Name"]?.trim())
      errors.push(`Row ${index + 1}: Product Name is required`);
    if (
      !row["Product Code"]?.trim() ||
      String(row["Product Code"]).trim().length !== 11
    ) {
      errors.push(
        `Row ${index + 1}: Product Code must be exactly 11 characters`,
      );
    }
    const stock_quantity = parseInt(row["Stock Quantity"]);
    if (
      isNaN(stock_quantity) ||
      stock_quantity < 0 ||
      !Number.isInteger(Number(row["Stock Quantity"]))
    ) {
      errors.push(
        `Row ${index + 1}: Stock Quantity must be a non-negative integer`,
      );
    }
    return errors;
  }, []);

  const importFromExcel = useCallback(
    async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          if (!jsonData.length) {
            notifyError("Excel file is empty", { autoClose: 3000 });
            return;
          }
          const errors = [];
          const validRows = [];
          jsonData.forEach((row, index) => {
            const rowErrors = validateImportRow(row, index);
            if (rowErrors.length) errors.push(...rowErrors);
            else {
              validRows.push({
                product_name: String(row["Product Name"] || "").trim(),
                product_code: String(row["Product Code"] || "").trim(),
                stock_quantity: parseInt(row["Stock Quantity"] || 0),
                description:
                  String(row["Description"] || "").trim() || undefined,
                product_id: row["Product ID"]
                  ? parseInt(row["Product ID"])
                  : undefined,
              });
            }
          });
          if (errors.length) {
            errors.forEach((error) => notifyError(error, { autoClose: 5000 }));
          }
          if (!validRows.length) {
            notifyError("No valid rows to import.", { autoClose: 5000 });
            return;
          }
          const token = localStorage.getItem("token");
          let createdCount = 0,
            updatedCount = 0,
            failedCount = 0;
          for (const row of validRows) {
            try {
              const { product_id, ...body } = row;
              const url = product_id
                ? `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/inventory/${product_id}`
                : `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/inventory`;
              const method = product_id ? "PUT" : "POST";
              let payload = { ...body, price: 0.01 };
              if (product_id) {
                const response = await fetch(
                  `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/inventory?limit=1&offset=0&product_id=${product_id}`,
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    credentials: "include",
                  },
                );
                if (response.ok) {
                  const { data } = await response.json();
                  if (data.length > 0) {
                    payload.price = data[0].price || 0;
                  }
                }
              }
              const response = await fetch(url, {
                method,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
                credentials: "include",
              });
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                  errorData.error ||
                    `Failed to ${product_id ? "update" : "create"} product`,
                );
              }
              if (product_id) updatedCount++;
              else createdCount++;
            } catch (err) {
              failedCount++;
              notifyError(`Row ${validRows.indexOf(row) + 1}: ${err.message}`, {
                autoClose: 3000,
              });
            }
          }
          if (createdCount || updatedCount) {
            await refetchData();
            setPage(0);
            notifySuccess(
              `Imported: ${createdCount} created, ${updatedCount} updated${failedCount ? `, ${failedCount} failed` : ""}`,
              { autoClose: 5000 },
            );
          } else {
            notifyError(
              `Import failed: ${failedCount} rows could not be processed`,
              { autoClose: 5000 },
            );
          }
        };
        reader.readAsArrayBuffer(file);
        event.target.value = "";
      } catch (err) {
        notifyError(`Import failed: ${err.message}`, { autoClose: 3000 });
      }
    },
    [validateImportRow, refetchData],
  );

  const exportToExcel = useCallback(() => {
    const data = filteredInventory.map((item) => ({
      "Product ID": item.product_id || "N/A",
      "Product Code": item.product_code || "N/A",
      "Product Name": item.product_name || "N/A",
      Description: item.description || "N/A",
      "Stock Quantity": Number(item.stock_quantity) || 0,
      "Created At (IST)": item.created_at ? formatDate(item.created_at) : "N/A",
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Finished Goods");
    const colWidths = data.reduce((acc, row) => {
      Object.keys(row).forEach((key, idx) => {
        const value = String(row[key]).replace(/<[^>]*>/g, "");
        acc[idx] = Math.max(acc[idx] || 10, value.length + 2);
      });
      return acc;
    }, []);
    worksheet["!cols"] = colWidths.map((width) => ({ wch: width }));
    XLSX.writeFile(workbook, "Finished_Goods_Inventory.xlsx");
    notifySuccess("Finished Goods exported to Excel!", { autoClose: 2000 });
  }, [filteredInventory]);

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") {
      setSearchInput("");
      setSearchTerm("");
      searchInputRef.current?.focus();
    }
  }, []);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const showDescription = useCallback((description) => {
    setSelectedDescription(description || "No description available");
    setShowDescriptionModal(true);
  }, []);

  const showBarcode = useCallback((product_code, product_name, description) => {
    setSelectedBarcode(product_code);
    setSelectedProductName(product_name);
    setSelectedProductDescription(description || "No description available");
    setShowBarcodeModal(true);
  }, []);

  const ActionsDropdown = ({ item, onEdit }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target))
          setIsOpen(false);
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label={`Actions for product ${item.product_name}`}
        >
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-20 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            <button
              onClick={() => {
                onEdit(item);
                setIsOpen(false);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
          </div>
        )}
      </div>
    );
  };

  if (userRole !== "store")
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center"
        role="alert"
      >
        <div className="text-gray-800 text-2xl">Access Denied</div>
      </div>
    );

  if (isLoading && !inventoryItems.length)
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">
          Loading finished goods...
        </div>
      </div>
    );

  if (
    error &&
    !showCreateForm &&
    !showEditForm &&
    !showDescriptionModal &&
    !showBarcodeModal
  ) return <ConnectionError onRetry={refetchData} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">
        Store Finished Goods Stock
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-input" className="sr-only">
              Search finished goods
            </label>
            <input
              id="search-input"
              type="text"
              placeholder="Search by ID, Name, or Code..."
              value={searchInput}
              onChange={handleSearchChange}
              onKeyDown={handleKeyDown}
              ref={searchInputRef}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
            />
            <Search
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearchTerm("");
                }}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <XCircle size={20} />
              </button>
            )}
          </div>
          <button
            onClick={() => refetchData()}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-md"
            disabled={isLoading}
            aria-label="Refresh finished goods"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading}
            aria-label="Create new finished good"
          >
            <PlusCircle className="mr-2" size={20} /> Add Item
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading}
            aria-label="Import from Excel"
          >
            <Upload className="mr-2" size={20} /> Import from Excel
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={importFromExcel}
            accept=".xlsx,.xls"
            className="hidden"
            aria-hidden="true"
          />
          <button
            onClick={exportToExcel}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading || !filteredInventory.length}
            aria-label="Export to Excel"
          >
            <Download className="mr-2" size={20} /> Export to Excel
          </button>
        </div>

        {isLoading && inventoryItems.length > 0 && (
          <div
            className="text-gray-600 text-lg mb-4 text-center"
            aria-live="polite"
          >
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table
            className="w-full text-left min-w-[1200px]"
            role="grid"
            ref={tableRef}
            tabIndex={0}
          >
            <thead className="bg-amber-100">
              <tr role="row">
                {[
                  { key: "product_id", label: "Product ID" },
                  { key: "product_code", label: "Product Code" },
                  { key: "product_name", label: "Product Name" },
                  { key: "description", label: "Description" },
                  { key: "stock_quantity", label: "Stock Quantity" },
                  { key: "created_at", label: "Created At (IST)" },
                  { key: "qrcode", label: "QR Code" },
                  { key: "actions", label: "Actions" },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() =>
                      key !== "actions" && key !== "qrcode" && handleSort(key)
                    }
                    onKeyDown={(e) =>
                      key !== "actions" &&
                      key !== "qrcode" &&
                      (e.key === "Enter" || e.key === " ") &&
                      (e.preventDefault(), handleSort(key))
                    }
                    className={`py-5 px-3 text-base font-medium ${key !== "actions" && key !== "qrcode" ? "cursor-pointer hover:bg-amber-200" : ""} ${key === "actions" ? "sticky right-0 bg-amber-100" : ""}`}
                    style={key === "actions" ? { minWidth: "100px" } : {}}
                    tabIndex={
                      key !== "actions" && key !== "qrcode" ? 0 : undefined
                    }
                    aria-sort={
                      sortConfig.key === key ? sortConfig.direction : "none"
                    }
                  >
                    <div className="flex items-center">
                      {label}
                      {key !== "actions" && key !== "qrcode" && (
                        <ArrowDownUp className="ml-2" size={16} />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedInventory.map((item) => (
                <tr
                  key={item.product_id}
                  className="border-t hover:bg-amber-50"
                  role="row"
                >
                  <td className="py-4 px-3 text-base text-gray-700">
                    {item.product_id}
                  </td>
                  <td className="py-4 px-3 text-base text-gray-700">
                    {item.product_code}
                  </td>
                  <td className="py-4 px-3 text-base text-gray-700">
                    {item.product_name}
                  </td>
                  <td className="py-4 px-3 text-base">
                    {item.description ? (
                      <button
                        onClick={() => showDescription(item.description)}
                        className="text-amber-600 hover:text-amber-800 flex items-center"
                        aria-label={`View description for ${item.product_name}`}
                      >
                        <Eye size={16} className="mr-1" /> View
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-4 px-3 text-base">
                    <span
                      className={`px-3 py-1 rounded-full text-white text-sm ${item.stock_quantity > 0 ? "bg-green-600" : "bg-red-600"}`}
                    >
                      {item.stock_quantity}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-base text-gray-700">
                    <div className="flex flex-col">
                      <span>
                        {new Date(item.created_at).toLocaleDateString("en-IN")}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(item.created_at).toLocaleTimeString("en-IN")}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-base">
                    <button
                      onClick={() =>
                        showBarcode(
                          item.product_code,
                          item.product_name,
                          item.description,
                        )
                      }
                      className="text-amber-600 hover:text-amber-800 flex items-center"
                      aria-label={`View QR code for ${item.product_name}`}
                    >
                      <Eye size={16} className="mr-1" /> QR Code
                    </button>
                  </td>
                  <td className="py-4 px-3 text-base sticky right-0 bg-white">
                    <ActionsDropdown
                      item={item}
                      onEdit={(item) => {
                        setSelectedItem(item);
                        setShowEditForm(true);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600 text-base">
                Showing {paginatedInventory.length} of{" "}
                {filteredInventory.length} filtered items (Total: {totalItems})
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage((p) => (p > 0 ? p - 1 : 0))}
                  disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={
                    (page + 1) * itemsPerPage >= filteredInventory.length
                  }
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {filteredInventory.length === 0 && (
            <div
              className="text-center py-16 flex flex-col items-center justify-center text-gray-500"
              role="alert"
            >
              <Package size={48} className="mb-4 text-gray-400" />
              <p className="text-lg">No finished goods found.</p>
              {searchTerm ? (
                <p className="mt-2">Try adjusting your search.</p>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                >
                  <PlusCircle className="mr-2" /> Add Your First Item
                </button>
              )}
            </div>
          )}
        </div>

        {showCreateForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 overflow-y-auto">
            <div
              className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative max-h-[90vh] overflow-y-auto"
              role="dialog"
              aria-labelledby="create-form-title"
            >
              <button
                onClick={() => setShowCreateForm(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close create form"
              >
                <XCircle size={24} />
              </button>
              <h2
                id="create-form-title"
                className="text-2xl font-bold text-gray-800 mb-6"
              >
                Add New Finished Good
              </h2>
              <CreateItemForm
                suggestedPartNumber={String(
                  (inventoryItems.length ? Math.max(...inventoryItems.map((i) => i.product_id)) : 0) + 1,
                ).padStart(4, "0")}
                onSubmit={async (data) => {
                  const token = localStorage.getItem("token");
                  const response = await fetch(
                    `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/inventory`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ ...data, price: 0.01 }),
                      credentials: "include",
                    },
                  );
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Failed to create item");
                  }
                  setPage(0);
                  setSearchInput("");
                  setSearchTerm("");
                  setShowCreateForm(false);
                  refetchData();
                  notifySuccess("Item created successfully");
                }}
                onClose={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        )}

        {showEditForm && selectedItem && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 overflow-y-auto">
            <div
              className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative max-h-[90vh] overflow-y-auto"
              role="dialog"
              aria-labelledby="edit-form-title"
            >
              <button
                onClick={() => setShowEditForm(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close edit form"
              >
                <XCircle size={24} />
              </button>
              <h2
                id="edit-form-title"
                className="text-2xl font-bold text-gray-800 mb-6"
              >
                Edit Finished Good #{selectedItem.product_id}
              </h2>
              <EditItemForm
                item={selectedItem}
                onSubmit={async (itemId, data) => {
                  if (
                    !window.confirm(
                      "Are you sure you want to update this item?",
                    )
                  )
                    throw new Error("Update cancelled.");
                  const token = localStorage.getItem("token");
                  const response = await fetch(
                    `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/inventory/${itemId}`,
                    {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({
                        ...data,
                        price: selectedItem.price || 0,
                      }),
                      credentials: "include",
                    },
                  );
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Failed to update item");
                  }
                  setPage(0);
                  setShowEditForm(false);
                  setSelectedItem(null);
                  refetchData();
                  notifySuccess("Item updated successfully");
                }}
                onClose={() => setShowEditForm(false)}
              />
            </div>
          </div>
        )}

        {showDescriptionModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div
              className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative"
              role="dialog"
              aria-labelledby="description-modal-title"
            >
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close description modal"
              >
                <XCircle size={24} />
              </button>
              <h2
                id="description-modal-title"
                className="text-2xl font-bold text-gray-800 mb-6"
              >
                Description
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {selectedDescription}
              </p>
            </div>
          </div>
        )}

        {showBarcodeModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div
              className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative"
              role="dialog"
              aria-labelledby="qrcode-modal-title"
            >
              <button
                onClick={() => setShowBarcodeModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close QR code modal"
              >
                <XCircle size={24} />
              </button>
              <h2
                id="qrcode-modal-title"
                className="text-2xl font-bold text-gray-800 mb-4"
              >
                QR Code for {selectedProductName}
              </h2>
              <div className="mb-4">
                <p className="text-gray-700">
                  <strong>Product Code:</strong> {selectedBarcode}
                </p>
                <p className="text-gray-700 whitespace-pre-wrap">
                  <strong>Description:</strong> {selectedProductDescription}
                </p>
              </div>
              <canvas
                id="qrcode-canvas"
                className="w-full max-w-[200px] mx-auto mb-4"
              />
              <button
                onClick={() => {
                  const canvas = document.getElementById("qrcode-canvas");
                  const link = document.createElement("a");
                  link.href = canvas.toDataURL("image/png");
                  link.download = `qrcode_${selectedBarcode}.png`;
                  link.click();
                  notifySuccess("QR code downloaded successfully", {
                    autoClose: 2000,
                  });
                }}
                className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
              >
                <Download className="mr-2" /> Download QR Code
              </button>
            </div>
          </div>
        )}

</div>
    </div>
  );
}

const CreateItemForm = ({ onSubmit, onClose, suggestedPartNumber }) => {
  const [formData, setFormData] = useState({
    product_name: "",
    stock_quantity: 0,
    description: "",
    product_code: "",
  });
  const [partNumberAuto, setPartNumberAuto] = useState(true);
  const [partNumberAvailable, setPartNumberAvailable] = useState(true);
  const [errors, setErrors] = useState({
    product_name: "",
    stock_quantity: "",
    description: "",
    product_code: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { notifyError } = useNotify();

  const validateField = (name, value) => {
    if (name === "product_name" && !value.trim())
      return "Product name is required";
    if (name === "stock_quantity" && value < 0) {
      return "Quantity cannot be negative";
    }
    if (name === "product_code" && value.length !== 11)
      return "Product code must be exactly 11 characters";
    return "";
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue =
      name === "stock_quantity" ? parseInt(value) || 0 : value;
    setFormData((prev) => ({ ...prev, [name]: processedValue }));
    setErrors((prev) => ({
      ...prev,
      [name]: validateField(name, processedValue),
    }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      product_name: validateField("product_name", formData.product_name),
      stock_quantity: validateField("stock_quantity", formData.stock_quantity),
      product_code: validateField("product_code", formData.product_code),
      description: "",
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some((err) => err)) return;
    if (!partNumberAvailable) {
      notifyError("Part Number is already in use — choose a different one.");
      return;
    }
    try {
      setIsSubmitting(true);
      await onSubmit({ ...formData, part_number_auto: partNumberAuto });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div>
        <label
          htmlFor="create-product-name"
          className="text-gray-700 font-medium"
        >
          Product Name
        </label>
        <input
          id="create-product-name"
          type="text"
          name="product_name"
          value={formData.product_name}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_name}
          disabled={isSubmitting}
        />
        {errors.product_name && (
          <p className="text-red-600 text-sm mt-1">{errors.product_name}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="create-product-code"
          className="text-gray-700 font-medium"
        >
          Product Code (11 chars)
        </label>
        <ProductCodeBuilder
          value={formData.product_code}
          onChange={(code) =>
            setFormData((prev) => ({ ...prev, product_code: code }))
          }
          suggestedPartNumber={suggestedPartNumber}
          onAutoFlagChange={setPartNumberAuto}
          onAvailabilityChange={setPartNumberAvailable}
        />
        {errors.product_code && (
          <p className="text-red-600 text-sm mt-1">{errors.product_code}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="create-description"
          className="text-gray-700 font-medium"
        >
          Description
        </label>
        <textarea
          id="create-description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label
          htmlFor="create-stock-quantity"
          className="text-gray-700 font-medium"
        >
          Stock Quantity
        </label>
        <input
          id="create-stock-quantity"
          type="number"
          name="stock_quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.stock_quantity}
          disabled={isSubmitting}
        />
        {errors.stock_quantity && (
          <p className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>
        )}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
};

const EditItemForm = ({ item, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    product_name: item.product_name,
    stock_quantity: item.stock_quantity,
    description: item.description || "",
    product_code: item.product_code,
  });
  const [errors, setErrors] = useState({
    product_name: "",
    stock_quantity: "",
    description: "",
    product_code: "",
  });
  const [partNumberAvailable, setPartNumberAvailable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  const validateField = (name, value) => {
    if (name === "product_name" && !value.trim())
      return "Product name is required";
    if (name === "stock_quantity" && value < 0) {
      return "Quantity cannot be negative";
    }
    if (name === "product_code" && value.length !== 11)
      return "Product code must be exactly 11 characters";
    return "";
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue =
      name === "stock_quantity" ? parseInt(value) || 0 : value;
    setFormData((prev) => ({ ...prev, [name]: processedValue }));
    setErrors((prev) => ({
      ...prev,
      [name]: validateField(name, processedValue),
    }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      product_name: validateField("product_name", formData.product_name),
      stock_quantity: validateField("stock_quantity", formData.stock_quantity),
      product_code: validateField("product_code", formData.product_code),
      description: "",
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some((err) => err)) return;
    if (!partNumberAvailable) {
      notifyError("Part Number is already in use — choose a different one.");
      return;
    }
    try {
      setIsSubmitting(true);
      await onSubmit(item.product_id, formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div>
        <label
          htmlFor="edit-product-name"
          className="text-gray-700 font-medium"
        >
          Product Name
        </label>
        <input
          id="edit-product-name"
          type="text"
          name="product_name"
          value={formData.product_name}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_name}
          disabled={isSubmitting}
        />
        {errors.product_name && (
          <p className="text-red-600 text-sm mt-1">{errors.product_name}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="edit-product-code"
          className="text-gray-700 font-medium"
        >
          Product Code (10 chars)
        </label>
        <ProductCodeBuilder
          value={formData.product_code}
          onChange={(code) =>
            setFormData((prev) => ({ ...prev, product_code: code }))
          }
          excludeId={item.product_id}
          onAvailabilityChange={setPartNumberAvailable}
        />
        {errors.product_code && (
          <p className="text-red-600 text-sm mt-1">{errors.product_code}</p>
        )}
      </div>
      <div>
        <label htmlFor="edit-description" className="text-gray-700 font-medium">
          Description
        </label>
        <textarea
          id="edit-description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label
          htmlFor="edit-stock-quantity"
          className="text-gray-700 font-medium"
        >
          Stock Quantity
        </label>
        <input
          id="edit-stock-quantity"
          type="number"
          name="stock_quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.stock_quantity}
          disabled={isSubmitting}
        />
        {errors.stock_quantity && (
          <p className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>
        )}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
};

export default StoreInventoryPage;
