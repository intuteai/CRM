import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  ArrowDownUp,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  Plus,
  Edit2,
  XCircle,
  MoreVertical,
  Download,
  Upload,
  Eye,
  CheckCircle,
} from "lucide-react";
import * as XLSX from "xlsx";

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

// Error Boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12 text-red-600 text-xl font-medium max-w-4xl mx-auto bg-red-50 rounded-2xl shadow-lg">
          Something went wrong: {this.state.error?.message || "Unknown error"}
        </div>
      );
    }
    return this.props.children;
  }
}
/* =====================================================================
   PRODUCT CODE BUILDER
   Data sourced directly from ERP_PART_CODE_LIST.pdf:

   Chart         Symbol  DefaultSubCode  DefaultSubLabel
   IPT           L       5               Bearing BR
   Rikshaw       R       1               Shaft SH
   2Wheeler      W       2               Front Flange FF
   Autonxt       A       0               Rear Flange RF
   Special       S       (none)          Aluminium AL

   Sub Codes (alphabetic abbreviations):
   0 → RF  Rear Flange
   1 → SH  Shaft
   2 → FF  Front Flange
   3 → AL  Aluminium
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
    defaultSub: "AL",
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
];

const SUB_CODES = [
  { abbr: "BR", label: "Bearing BR" },
  { abbr: "SH", label: "Shaft" },
  { abbr: "FF", label: "Front Flange" },
  { abbr: "RF", label: "Rear Flange" },
  { abbr: "AL", label: "Aluminium" },
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

function ProductCodeBuilder({ value = "", onChange, disabled = false }) {
  // Prefill from existing code if provided, otherwise use defaults
  const parsed = parseCode(value);

  const [partNum, setPartNum] = useState(parsed?.partNum ?? "0001");
  const [partInput, setPartInput] = useState(
    parsed ? String(parseInt(parsed.partNum, 10)) : "1",
  );
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
    const raw = e.target.value;
    setPartInput(raw);
    if (raw !== "") setPartNum(pad4(raw));
  };
  const handlePartBlur = () => {
    const padded = pad4(partInput);
    setPartInput(String(parseInt(padded, 10)));
    setPartNum(padded);
  };

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
// Debounce Hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Format Date Helper
const formatDate = (date) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Weserv Image Proxy Helper
const getWeservUrl = (imageUrl) => {
  if (!imageUrl) return null;
  if (imageUrl.includes("images.weserv.nl")) return imageUrl;
  let directUrl = imageUrl;
  const driveMatch = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch)
    directUrl = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=1400&h=1000&fit=outside&output=webp&q=90`;
};

/* -------------------------
   Accept Return API helper
   ------------------------- */
const acceptReturnApi = async (productId, quantity) => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Authentication token missing.");
  const res = await fetch(`${BASE_URL}/api/stock/${productId}/accept-return`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({ quantity }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      data.error || data.message || `Accept return failed (${res.status})`,
    );
  return data;
};

/* ==========================
   Main StockPage component
   ========================== */
function StockPage({ socket }) {
  const [stockItems, setStockItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "createdAt",
    direction: "desc",
  });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    productName: "",
    description: "",
    productCode: "",
    price: "",
    stockQuantity: "",
    qtyRequired: "",
    returnableQty: "",
    // location: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptProduct, setAcceptProduct] = useState(null);

  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const debouncedSearch = useDebounce(searchInput, 300);

  // ---- Part selector state (for modal) ----
  const [partSearch, setPartSearch] = useState("");
  const [allParts, setAllParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [isPartLoading, setIsPartLoading] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [partsLoaded, setPartsLoaded] = useState(false);
  const partDropdownRef = useRef(null);
  // ----------------------------------------

  // Fetch Stock
  const fetchStock = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const controller = new AbortController();

    try {
      const token = localStorage.getItem("token");
      if (!token)
        throw new Error("Authentication token missing. Please log in.");

      const response = await fetch(
        `${BASE_URL}/api/stock?limit=5000&offset=0`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch stock data");
      }

      const { data, total } = await response.json();
      if (!Array.isArray(data)) throw new Error("Invalid data format");

      const normalizedData = data.map((item) => ({
        ...item,
        price: item.price !== null ? Number(item.price) : 0,
        stockQuantity:
          item.stockQuantity !== null ? Number(item.stockQuantity) : 0,
        qtyRequired:
          item.qtyRequired !== undefined && item.qtyRequired !== null
            ? Number(item.qtyRequired)
            : item.qty_required !== undefined && item.qty_required !== null
              ? Number(item.qty_required)
              : 0,
        returnableQty:
          item.returnable_qty !== undefined
            ? Number(item.returnable_qty)
            : item.returnableQty !== undefined
              ? Number(item.returnableQty)
              : 0,
        description: item.description || "",
        productCode: item.productCode || item.product_code || "",
        productName: item.productName || item.product_name || "",
        productId: item.productId || item.product_id,
        createdAt: item.createdAt || item.created_at || null,
        // location: item.location || "",
        imageUrl: item.imageUrl || item.image_url || null,
      }));

      setStockItems(normalizedData);
      setTotalItems(total || normalizedData.length || 0);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
        toast.error(err.message || "Network error", { autoClose: 3000 });
        setStockItems([]);
      }
    } finally {
      setIsLoading(false);
    }

    return () => controller.abort();
  }, []);

  // Socket Updates (safe: do not overwrite qtyRequired unless provided)
  useEffect(() => {
    if (!socket) return;

    socket.on("connect", () =>
      toast.success("Connected to real-time updates!", { autoClose: 2000 }),
    );
    socket.on("connect_error", () =>
      toast.error("Failed to connect to real-time updates.", {
        autoClose: 3000,
      }),
    );
    socket.on("disconnect", () =>
      toast.warn("Real-time connection lost", { autoClose: 3000 }),
    );
    socket.on("reconnect", () => {
      toast.success("Reconnected!", { autoClose: 2000 });
      fetchStock();
    });

    socket.on("stockUpdate", (payload) => {
      const {
        product_id,
        stock_quantity,
        location,
        image_url,
        returnable_qty,
        qty_required,
        qtyRequired,
        status,
      } = payload || {};

      setStockItems((prev) => {
        if (!Array.isArray(prev)) return prev || [];
        if (status === "deleted" || status === "Deleted") {
          toast.info(`Product #${product_id} deleted`, { autoClose: 2000 });
          return prev.filter((item) => item.productId !== product_id);
        }
        return prev.map((item) =>
          item.productId === product_id
            ? {
                ...item,
                stockQuantity:
                  stock_quantity !== undefined
                    ? Number(stock_quantity)
                    : item.stockQuantity,
                location: location || item.location,
                imageUrl: image_url || item.imageUrl,
                returnableQty:
                  returnable_qty !== undefined
                    ? Number(returnable_qty)
                    : payload.returnableQty !== undefined
                      ? Number(payload.returnableQty)
                      : item.returnableQty,
                qtyRequired:
                  qty_required !== undefined
                    ? Number(qty_required)
                    : qtyRequired !== undefined
                      ? Number(qtyRequired)
                      : item.qtyRequired,
              }
            : item,
        );
      });

      if (tableRef.current) tableRef.current.focus();
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("reconnect");
      socket.off("stockUpdate");
    };
  }, [socket, fetchStock]);

  // Initial Load
  useEffect(() => {
    let mounted = true;
    fetchStock().then((cleanup) => {
      if (!mounted && cleanup) cleanup();
    });
    return () => {
      mounted = false;
    };
  }, [fetchStock]);

  // Search & Pagination
  useEffect(() => setSearchTerm(debouncedSearch), [debouncedSearch]);
  useEffect(() => setPage(0), [searchTerm]);

  // Modal Focus Trap
  useEffect(() => {
    if (showModal && modalRef.current) {
      const targetInput =
        modalRef.current.querySelector('input[name="productName"]') ||
        modalRef.current.querySelector("input");
      targetInput?.focus();
      const handleTab = (e) => {
        if (e.key !== "Tab") return;
        const focusable = modalRef.current.querySelectorAll(
          "button, input, textarea",
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", handleTab);
      return () => document.removeEventListener("keydown", handleTab);
    }
  }, [showModal]);

  // ---- Parts API + filtering for modal ----
  const loadParts = useCallback(async () => {
    if (partsLoaded || isPartLoading) return;
    try {
      setIsPartLoading(true);
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing.");

      const res = await fetch(`${BASE_URL}/api/parts?limit=500&offset=0`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch parts (${res.status})`);
      }
      const json = await res.json();
      const list = json.data || [];
      setAllParts(list);
      setPartsLoaded(true);
    } catch (err) {
      console.error("Failed to load parts:", err);
      toast.error(err.message || "Failed to load parts", { autoClose: 3000 });
    } finally {
      setIsPartLoading(false);
    }
  }, [partsLoaded, isPartLoading]);

  useEffect(() => {
    const term = partSearch.toLowerCase().trim();
    if (!term) setFilteredParts(allParts.slice(0, 20));
    else
      setFilteredParts(
        allParts
          .filter(
            (p) =>
              (p.partCode || "").toLowerCase().includes(term) ||
              (p.name || "").toLowerCase().includes(term) ||
              (p.drawingNo || "").toLowerCase().includes(term),
          )
          .slice(0, 20),
      );
  }, [partSearch, allParts]);

  useEffect(() => {
    if (!showPartDropdown) return;
    const handleClickOutside = (event) => {
      if (
        partDropdownRef.current &&
        !partDropdownRef.current.contains(event.target)
      )
        setShowPartDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPartDropdown]);

  const handlePartSearchChange = (e) => {
    const value = e.target.value;
    setPartSearch(value);
    if (!partsLoaded && !isPartLoading) loadParts();
  };
  const handlePartSelect = (part) => {
    setFormData((prev) => ({
      ...prev,
      productName: part.name || "",
      productCode: part.partCode || "",
      description: part.description || "",
    }));
    setFormErrors((prev) => ({
      ...prev,
      productName: "",
      productCode: "",
      description: "",
    }));
    setPartSearch(`${part.partCode} — ${part.name}`);
    setShowPartDropdown(false);
  };
  // -----------------------------------------

  // Sorting & Filtering
  const sortedStock = useMemo(() => {
    const items = [...stockItems];
    if (sortConfig.key) {
      items.sort((a, b) => {
        let aVal = a[sortConfig.key] ?? "";
        let bVal = b[sortConfig.key] ?? "";
        if (
          ["price", "stockQuantity", "qtyRequired", "returnableQty"].includes(
            sortConfig.key,
          )
        ) {
          aVal = Number(aVal);
          bVal = Number(bVal);
        } else if (sortConfig.key === "createdAt") {
          aVal = new Date(aVal || 0);
          bVal = new Date(bVal || 0);
        }
        return (
          (aVal < bVal ? -1 : 1) * (sortConfig.direction === "asc" ? 1 : -1)
        );
      });
    }
    return items;
  }, [stockItems, sortConfig]);

  const filteredStock = useMemo(() => {
    return sortedStock.filter((item) => {
      const terms = [
        item.productId,
        item.productName,
        item.productCode,
        item.location,
      ].map((s) => String(s || "").toLowerCase());
      return terms.some((t) => t.includes(searchTerm.toLowerCase()));
    });
  }, [sortedStock, searchTerm]);

  const paginatedStock = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredStock.slice(start, start + itemsPerPage);
  }, [filteredStock, page, itemsPerPage]);

  // Import Validation (support Returnable Qty)
  const validateImportRow = useCallback((row, index) => {
    const errors = [];
    if (!row["Product Name"]?.trim())
      errors.push(`Row ${index + 1}: Product Name required`);
    if (!row["Product Code"]?.trim())
      errors.push(`Row ${index + 1}: Product Code required`);
    const price = parseFloat(String(row["Price (₹)"] || "").replace(/₹/g, ""));
    if (isNaN(price) || price < 0)
      errors.push(`Row ${index + 1}: Invalid price`);
    const stock = parseFloat(row["Stock Quantity"] || 0);
    if (isNaN(stock) || stock < 0)
      errors.push(`Row ${index + 1}: Invalid stock`);
    const rq =
      row["Returnable Qty"] !== undefined
        ? parseFloat(row["Returnable Qty"])
        : 0;
    if (row["Returnable Qty"] !== undefined && (isNaN(rq) || rq < 0))
      errors.push(`Row ${index + 1}: Invalid Returnable Qty`);
    return errors;
  }, []);

  // Import Excel
  const importFromExcel = useCallback(
    async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet);
          if (!json.length) throw new Error("Empty file");

          const errors = [],
            valid = [];
          json.forEach((row, i) => {
            const err = validateImportRow(row, i);
            if (err.length) errors.push(...err);
            else {
              valid.push({
                productName: String(row["Product Name"] || "").trim(),
                productCode: String(row["Product Code"] || "").trim(),
                price: parseFloat(
                  String(row["Price (₹)"] || "0").replace(/₹/g, ""),
                ),
                stockQuantity: parseFloat(row["Stock Quantity"] || 0),
                qtyRequired: parseInt(row["Qty Required"] || 0),
                returnableQty:
                  row["Returnable Qty"] !== undefined
                    ? parseFloat(row["Returnable Qty"])
                    : 0,
                description:
                  String(row["Description"] || "").trim() || undefined,
                location: String(row["Location"] || "").trim() || undefined,
                productId: row["Product ID"]
                  ? parseInt(row["Product ID"])
                  : undefined,
              });
            }
          });

          if (errors.length)
            errors.forEach((e) => toast.error(e, { autoClose: 5000 }));
          if (!valid.length) return;

          const token = localStorage.getItem("token");
          let created = 0,
            updated = 0,
            failed = 0;

          for (const row of valid) {
            try {
              const { productId, returnableQty, ...body } = row;
              if (returnableQty !== undefined)
                body.returnableQty = returnableQty;
              const url = productId
                ? `${BASE_URL}/api/stock/${productId}`
                : `${BASE_URL}/api/stock`;
              const method = productId ? "PUT" : "POST";
              const res = await fetch(url, {
                method,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
                credentials: "include",
              });
              if (!res.ok)
                throw new Error((await res.json()).error || "Failed");
              productId ? updated++ : created++;
            } catch {
              failed++;
            }
          }

          await fetchStock();
          setPage(0);
          toast.success(
            `Success: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ""}`,
            { autoClose: 5000 },
          );
        } catch (err) {
          toast.error(`Import failed: ${err.message}`, { autoClose: 3000 });
        }
      };
      reader.readAsArrayBuffer(file);
      event.target.value = "";
    },
    [fetchStock, validateImportRow],
  );

  // Export Excel (includes Returnable Qty)
  const exportToExcel = useCallback(() => {
    const data = filteredStock.map((item) => ({
      "Product ID": item.productId,
      "Product Name": item.productName,
      "Product Code": item.productCode,
      Location: item.location || "N/A",
      "Stock Quantity": Number(item.stockQuantity),
      "Returnable Qty": Number(item.returnableQty || 0),
      "Qty Required": Number(item.qtyRequired),
      "Price (₹)": `₹${Number(item.price).toFixed(2)}`,
      Description: item.description || "N/A",
      "Created At": item.createdAt ? formatDate(item.createdAt) : "N/A",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Raw Materials");
    XLSX.writeFile(wb, "Raw_Material_Inventory.xlsx");
    toast.success("Exported to Excel!", { autoClose: 2000 });
  }, [filteredStock]);

  // Sorting
  const sortData = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  // Modal Handlers
  const handleCreate = useCallback(() => {
    setModalMode("create");
    setSelectedItem(null);
    setFormData({
      productName: "",
      description: "",
      productCode: "",
      price: "",
      stockQuantity: "",
      qtyRequired: "",
      returnableQty: "",
      // location: "",
    });
    setFormErrors({});
    setPartSearch("");
    setShowPartDropdown(false);
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((item) => {
    setModalMode("edit");
    setSelectedItem(item);
    setFormData({
      productName: item.productName || "",
      description: item.description || "",
      productCode: item.productCode || "",
      price: item.price ?? "",
      stockQuantity: item.stockQuantity ?? "",
      qtyRequired: item.qtyRequired ?? "",
      returnableQty: item.returnableQty ?? "",
      // location: item.location || "",
    });
    setFormErrors({});
    setPartSearch("");
    setShowPartDropdown(false);
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(
    async (productId) => {
      if (!confirm(`Delete product #${productId}?`)) return;
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${BASE_URL}/api/stock/${productId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok)
          throw new Error((await res.json()).error || "Delete failed");
        await fetchStock();
        toast.success(`Product #${productId} deleted`);
      } catch (err) {
        toast.error(err.message);
      }
    },
    [fetchStock],
  );

  const showDescription = useCallback((desc) => {
    setSelectedDescription(desc);
    setShowDescriptionModal(true);
  }, []);

  // Form Validation (includes returnableQty)
  const validateForm = useCallback(() => {
    const errors = {};
    if (!formData.productName.trim()) errors.productName = "Required";
    if (!formData.productCode || formData.productCode.length !== 11) {
      errors.productCode = "Must be exactly 11 characters";
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) errors.price = "Must be ≥ 0";
    const stock = parseFloat(formData.stockQuantity);
    // require stock for create and edit (keeps previous behavior)
    if (
      (modalMode === "create" || modalMode === "edit") &&
      (isNaN(stock) || stock < 0)
    )
      errors.stockQuantity = "Must be ≥ 0";
    if (formData.returnableQty !== "" && formData.returnableQty !== undefined) {
      const r = parseInt(formData.returnableQty, 10);
      if (!Number.isInteger(r) || r < 0)
        errors.returnableQty = "Must be integer ≥ 0";
    }
    return errors;
  }, [formData, modalMode]);

  // Submit (create/update) - includes returnableQty and fixes edit stock bug
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const errors = validateForm();
      if (Object.keys(errors).length) {
        setFormErrors(errors);
        Object.values(errors).forEach((e) => toast.error(e));
        return;
      }

      try {
        const token = localStorage.getItem("token");
        const isCreate = modalMode === "create";
        const url = isCreate
          ? `${BASE_URL}/api/stock`
          : `${BASE_URL}/api/stock/${selectedItem.productId}`;

        // Build body — include stockQuantity for both create and edit when provided
        const body = {
          productName: formData.productName,
          description: formData.description || undefined,
          productCode: formData.productCode,
          price: parseFloat(formData.price),
          qtyRequired: parseInt(formData.qtyRequired) || 0,
          // location: formData.location || undefined,
        };

        // include stockQuantity always when editing or creating (if present)
        if (
          formData.stockQuantity !== "" &&
          formData.stockQuantity !== undefined
        ) {
          body.stockQuantity = parseFloat(formData.stockQuantity);
        } else if (isCreate) {
          // ensure numeric 0 if empty on create
          body.stockQuantity = 0;
        }

        if (
          formData.returnableQty !== "" &&
          formData.returnableQty !== undefined
        ) {
          body.returnableQty = parseInt(formData.returnableQty, 10);
        }

        const res = await fetch(url, {
          method: isCreate ? "POST" : "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          credentials: "include",
        });

        if (!res.ok) {
          const resp = await res.json().catch(() => ({}));
          throw new Error(resp.error || resp.message || "Save failed");
        }

        await fetchStock();
        setShowModal(false);
        setPage(0);
        toast.success(isCreate ? "Product created!" : "Product updated!");
      } catch (err) {
        toast.error(err.message || "Save failed");
      }
    },
    [formData, modalMode, selectedItem, fetchStock, validateForm],
  );

  // Upload Photo
  const uploadPhoto = useCallback(async (productId, file) => {
    if (!file) return;
    setUploadingId(productId);
    const toastId = toast.loading(`Uploading ${file.name}...`);
    const formDataUpload = new FormData();
    formDataUpload.append("photo", file);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BASE_URL}/api/stock/${productId}/photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formDataUpload,
        credentials: "include",
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(result.message || result.error || "Upload failed");
      const rawImageUrl =
        result.imageUrl || result.image_url || result.link || null;
      const weservImageUrl = getWeservUrl(rawImageUrl);
      setStockItems((prev) =>
        prev.map((item) =>
          item.productId === productId
            ? { ...item, imageUrl: weservImageUrl }
            : item,
        ),
      );
      toast.update(toastId, {
        render: "Image uploaded successfully!",
        type: "success",
        isLoading: false,
        autoClose: 3000,
      });
    } catch (err) {
      toast.update(toastId, {
        render: `Upload failed: ${err.message}`,
        type: "error",
        isLoading: false,
        autoClose: 5000,
      });
    } finally {
      setUploadingId(null);
    }
  }, []);

  // Actions Dropdown (includes Accept Return)
  const ActionsDropdown = ({ item }) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
      const handleOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target))
          setOpen(false);
      };
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    const openAccept = () => {
      setAcceptProduct(item);
      setShowAcceptModal(true);
      setOpen(false);
    };

    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="p-2 hover:bg-gray-100 rounded-full transition"
        >
          <MoreVertical size={20} />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5 z-10">
            <button
              onClick={() => {
                handleEdit(item);
                setOpen(false);
              }}
              className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 items-center"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>

            <label className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 items-center cursor-pointer">
              <Upload size={16} className="mr-2" /> Upload Photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPhoto(item.productId, file);
                  setOpen(false);
                }}
              />
            </label>

            <button
              onClick={() => {
                handleDelete(item.productId);
                setOpen(false);
              }}
              className="flex w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 items-center"
            >
              <XCircle size={16} className="mr-2" /> Delete
            </button>

            <button
              onClick={() => openAccept()}
              disabled={(item.returnableQty || 0) <= 0}
              className={`flex w-full px-4 py-2 text-sm items-center ${(item.returnableQty || 0) <= 0 ? "text-gray-400 cursor-not-allowed" : "text-green-700 hover:bg-green-50"}`}
            >
              <CheckCircle size={16} className="mr-2" /> Accept Return
            </button>
          </div>
        )}
      </div>
    );
  };

  // After accept: safe local update (does NOT overwrite qtyRequired unless server explicitly returns it)
  const handleAfterAccept = useCallback(
    (productId, acceptedQty, serverResp = {}) => {
      setStockItems((prev) =>
        prev.map((it) => {
          if (it.productId !== productId) return it;
          const newStock =
            serverResp.stock_quantity !== undefined
              ? Number(serverResp.stock_quantity)
              : Number((it.stockQuantity || 0) + acceptedQty);
          const newReturnable =
            serverResp.returnable_qty !== undefined
              ? Number(serverResp.returnable_qty)
              : Math.max(0, (it.returnableQty || 0) - acceptedQty);
          const newQtyRequired =
            serverResp.qty_required !== undefined
              ? Number(serverResp.qty_required)
              : serverResp.qtyRequired !== undefined
                ? Number(serverResp.qtyRequired)
                : it.qtyRequired;
          return {
            ...it,
            stockQuantity: newStock,
            returnableQty: newReturnable,
            qtyRequired: newQtyRequired,
          };
        }),
      );
      setShowAcceptModal(false);
      setAcceptProduct(null);
      toast.success("Accept processed (UI updated)", { autoClose: 2000 });
    },
    [],
  );

  // Render
  if (isLoading && !stockItems.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">
          Loading Stock...
        </div>
      </div>
    );
  }

  if (error && !showModal && !showDescriptionModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg text-center">
          <p className="mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              fetchStock();
            }}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
          Raw Material Inventory
        </h1>
        <div className="max-w-7xl mx-auto">
          {/* Toolbar */}
          <div className="flex mb-8 gap-4 flex-wrap">
            <div className="relative flex-grow">
              <input
                id="search-stock"
                ref={searchInputRef}
                type="text"
                placeholder="Search by ID, Name, Code, or Location..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Escape" && (setSearchInput(""), setSearchTerm(""))
                }
                className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setSearchTerm("");
                  }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setModalMode("create");
                handleCreate();
              }}
              className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center shadow-md"
            >
              <Plus size={20} className="mr-2" /> Create Product
            </button>
            <button
              onClick={fetchStock}
              disabled={isLoading}
              className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 flex items-center shadow-md"
            >
              <RefreshCw size={20} className="mr-2" />{" "}
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md"
            >
              <Upload size={20} className="mr-2" /> Import Excel
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={importFromExcel}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <button
              onClick={exportToExcel}
              disabled={!filteredStock.length}
              className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md"
            >
              <Download size={20} className="mr-2" /> Export Excel
            </button>
          </div>

          {/* Table */}
          {filteredStock.length === 0 && !isLoading ? (
            <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
              <Search className="mx-auto mb-4 text-gray-400" size={48} />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                No Items Found
              </h2>
              <p className="text-gray-600 mb-6">
                {searchTerm
                  ? "Try adjusting your search."
                  : "Start by creating a product!"}
              </p>
              {!searchTerm && (
                <button
                  onClick={() => {
                    setModalMode("create");
                    handleCreate();
                  }}
                  className="p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto"
                >
                  <Plus className="mr-2" /> Create First Product
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
              <table
                className="w-full text-left border-collapse"
                ref={tableRef}
                tabIndex={0}
              >
                <thead>
                  <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50">
                    {[
                      { key: "productId", label: "ID" },
                      { key: "productName", label: "Name" },
                      // { key: "location", label: "Location" },
                      { key: "stockQuantity", label: "Stock" },
                      { key: "returnableQty", label: "Returnable Qty" },
                      { key: "qtyRequired", label: "Req" },
                      { key: "price", label: "Price (₹)" },
                      { key: "productCode", label: "Code" },
                      { key: "description", label: "Desc" },
                      { key: "createdAt", label: "Created" },
                      { key: "actions", label: "Actions" },
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        className={`py-5 px-3 text-gray-800 font-semibold text-base ${key !== "actions" ? "cursor-pointer hover:bg-amber-300" : ""}`}
                        onClick={() => key !== "actions" && sortData(key)}
                        onKeyDown={(e) =>
                          (e.key === "Enter" || e.key === " ") &&
                          key !== "actions" &&
                          sortData(key)
                        }
                        tabIndex={key !== "actions" ? 0 : -1}
                        aria-sort={
                          sortConfig.key === key
                            ? sortConfig.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <div className="flex items-center justify-between">
                          {label}
                          {key !== "actions" && (
                            <ArrowDownUp
                              size={16}
                              className={`ml-2 text-gray-600 ${sortConfig.key === key ? "text-gray-900" : "opacity-50"}`}
                            />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedStock.map((item) => {
                    const stockClass =
                      item.stockQuantity >= item.qtyRequired
                        ? "text-green-600"
                        : "text-red-600";
                    const weservImageUrl = getWeservUrl(item.imageUrl);
                    return (
                      <tr
                        key={item.productId}
                        className="border-t hover:bg-amber-50"
                      >
                        <td className="py-4 px-3 text-gray-600">
                          {item.productId}
                        </td>
                        <td className="py-4 px-3 text-gray-600 font-medium">
                          <div className="flex items-center gap-3">
                            {weservImageUrl ? (
                              <img
                                src={weservImageUrl}
                                alt={item.productName}
                                className="w-10 h-10 rounded-md object-cover border cursor-pointer hover:opacity-80 transition"
                                onClick={() => {
                                  setSelectedImage({
                                    url: weservImageUrl,
                                    name: item.productName,
                                  });
                                  setShowImageModal(true);
                                }}
                                onError={(e) => {
                                  e.target.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-md bg-gray-100 border flex items-center justify-center text-sm text-gray-400">
                                No
                              </div>
                            )}
                            <div>
                              <div className="font-medium">
                                {item.productName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {item.productCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        {/* <td className="py-4 px-3 text-gray-600">
                          {item.location || (
                            <span className="text-gray-400 italic">
                              Not set
                            </span>
                          )}
                        </td> */}
                        <td className={`py-4 px-3 font-medium ${stockClass}`}>
                          {item.stockQuantity}
                          {item.stockQuantity < item.qtyRequired && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                              Low
                            </span>
                          )}
                        </td>

                        {/* Returnable Qty (clickable -> opens edit modal) */}
                        <td className="py-4 px-3">
                          <button
                            onClick={() => handleEdit(item)}
                            title="Click to edit returnable qty"
                            className={`px-3 py-1 rounded-full text-white text-sm ${item.returnableQty > 0 ? "bg-indigo-600 hover:brightness-110" : "bg-gray-400 hover:brightness-110"}`}
                          >
                            {item.returnableQty ?? 0}
                          </button>
                        </td>

                        <td className="py-4 px-3 text-gray-600">
                          {item.qtyRequired}
                        </td>
                        <td className="py-4 px-3 text-gray-600">
                          ₹{Number(item.price).toFixed(2)}
                        </td>
                        <td className="py-4 px-3 text-gray-600 font-mono">
                          {item.productCode}
                        </td>
                        <td className="py-4 px-3">
                          {item.description ? (
                            <button
                              onClick={() => showDescription(item.description)}
                              className="text-amber-600 hover:text-amber-800 flex items-center"
                            >
                              <Eye size={16} className="mr-1" /> View
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="py-4 px-3 text-gray-600 text-sm">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-2">
                            <ActionsDropdown item={item} />
                            {uploadingId === item.productId && (
                              <div className="text-sm text-amber-600 animate-pulse">
                                Uploading...
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-between items-center p-4 bg-gray-50">
                <div className="text-gray-600">
                  Showing {paginatedStock.length} of {filteredStock.length}{" "}
                  (Total: {totalItems})
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mr-1.5"></div>{" "}
                      In Stock
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 mr-1.5"></div>{" "}
                      Low
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={
                        (page + 1) * itemsPerPage >= filteredStock.length
                      }
                      className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div
            className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
            role="dialog"
          >
            <div
              className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto relative"
              ref={modalRef}
            >
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              >
                <XCircle size={24} />
              </button>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                {modalMode === "create"
                  ? "Create Product"
                  : `Edit #${selectedItem?.productId}`}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Part search */}
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Search Part (optional)
                  </label>
                  <div className="relative" ref={partDropdownRef}>
                    <input
                      name="partSearch"
                      type="text"
                      value={partSearch}
                      onChange={handlePartSearchChange}
                      onFocus={() => {
                        setShowPartDropdown(true);
                        if (!partsLoaded && !isPartLoading) loadParts();
                      }}
                      placeholder="Type part code or name..."
                      className="w-full p-3 pl-9 border rounded-lg focus:ring-2 focus:ring-amber-300"
                    />
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    {showPartDropdown && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border rounded-lg shadow-lg">
                        {isPartLoading && (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            Loading parts...
                          </div>
                        )}
                        {!isPartLoading && filteredParts.length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            No parts found.
                          </div>
                        )}
                        {!isPartLoading &&
                          filteredParts.map((part) => (
                            <button
                              key={part.id}
                              type="button"
                              onClick={() => handlePartSelect(part)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50"
                            >
                              <div className="font-medium">
                                {part.partCode} — {part.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {part.partTypeName}
                                {part.drawingNo
                                  ? ` • Drawing: ${part.drawingNo}`
                                  : ""}
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Selecting a part will fill Product Name, Product Code and
                    Description.
                  </p>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Product Name *
                  </label>
                  <input
                    name="productName"
                    type="text"
                    value={formData.productName}
                    onChange={(e) =>
                      setFormData({ ...formData, productName: e.target.value })
                    }
                    className={`w-full p-3 border rounded-lg ${formErrors.productName ? "border-red-500" : ""}`}
                    required
                  />
                  {formErrors.productName && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.productName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Product Code *
                  </label>
                  <ProductCodeBuilder
                    value={formData.productCode}
                    onChange={(code) =>
                      setFormData((prev) => ({ ...prev, productCode: code }))
                    }
                  />
                </div>

                {/* <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Warehouse A, Shelf 12"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    className="w-full p-3 border rounded-lg"
                  />
                </div> */}

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className={`w-full p-3 border rounded-lg ${formErrors.price ? "border-red-500" : ""}`}
                    required
                  />
                  {formErrors.price && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.price}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    {modalMode === "create"
                      ? "Initial Stock"
                      : "Stock Quantity"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.stockQuantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        stockQuantity: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded-lg ${formErrors.stockQuantity ? "border-red-500" : ""}`}
                    required={modalMode === "create"}
                  />
                  {formErrors.stockQuantity && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.stockQuantity}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Qty Required
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.qtyRequired}
                    onChange={(e) =>
                      setFormData({ ...formData, qtyRequired: e.target.value })
                    }
                    className="w-full p-3 border rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Returnable Qty
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.returnableQty}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        returnableQty: e.target.value,
                      })
                    }
                    className={`w-full p-3 border rounded-lg ${formErrors.returnableQty ? "border-red-500" : ""}`}
                  />
                  {formErrors.returnableQty && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.returnableQty}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Set how many units are currently returnable for this
                    product.
                  </p>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full p-3 border rounded-lg"
                    rows="2"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold"
                  >
                    {modalMode === "create" ? "Create" : "Update"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Description Modal */}
        {showDescriptionModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="absolute top-4 right-4 hover:text-gray-700"
              >
                <XCircle size={24} />
              </button>
              <h2 className="text-2xl font-bold mb-4">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {selectedDescription || "None"}
              </p>
            </div>
          </div>
        )}

        {/* Image Modal */}
        {showImageModal && selectedImage && (
          <div
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
            onClick={() => setShowImageModal(false)}
          >
            <div className="relative max-w-7xl max-h-full">
              <button
                onClick={() => setShowImageModal(false)}
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition"
              >
                <XCircle size={32} />
              </button>
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="text-white text-center mt-4 text-lg font-medium">
                {selectedImage.name}
              </div>
            </div>
          </div>
        )}

        {/* Accept Return Modal (quantity only) */}
        {showAcceptModal && acceptProduct && (
          <AcceptReturnModal
            product={acceptProduct}
            onClose={() => {
              setShowAcceptModal(false);
              setAcceptProduct(null);
            }}
            onAccepted={handleAfterAccept}
          />
        )}

        <ToastContainer position="top-right" autoClose={3000} />
      </div>
    </ErrorBoundary>
  );
}

/* ========= AcceptReturnModal (quantity-only, no notes) ========= */
const AcceptReturnModal = ({ product, onClose, onAccepted }) => {
  const [qty, setQty] = useState(product.returnableQty ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    const parsed = parseInt(qty, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error("Please enter a positive integer quantity to accept.", {
        autoClose: 3000,
      });
      return;
    }
    if (parsed > (product.returnableQty ?? 0)) {
      toast.error(`Cannot accept more than ${product.returnableQty}`, {
        autoClose: 3000,
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const data = await acceptReturnApi(product.productId, parsed);
      if (onAccepted) onAccepted(product.productId, parsed, data || {});
    } catch (err) {
      console.error("Accept return failed", err);
      toast.error(err.message || "Accept return failed", { autoClose: 4000 });
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-60">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-[420px] relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Close accept return modal"
        >
          <XCircle size={22} />
        </button>
        <h3 className="text-xl font-semibold mb-3">
          Accept Return — {product.productName}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Available to accept: <strong>{product.returnableQty}</strong>
        </p>

        <label className="text-sm font-medium">Quantity to accept</label>
        <input
          type="number"
          min={1}
          max={product.returnableQty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300 mb-3"
        />

        <div className="flex space-x-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              "Accepting..."
            ) : (
              <>
                <CheckCircle className="mr-2" /> Accept
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockPage;
