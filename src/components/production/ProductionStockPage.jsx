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
  XCircle,
  Eye,
  Download,
  Upload,
  PlusCircle,
  Package,
} from "lucide-react";
import { debounce } from "lodash";
import { io } from "socket.io-client";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    amount,
  );

const formatDate = (value) => {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return `${date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

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
    pair: "CO",
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
  const partNum = code.slice(0, 4);
  let chartSymbol = code.slice(4, 5);
  let chartDigit = code.slice(5, 6);

  if (code.slice(4, 6) === "CO") {
    chartSymbol = "C";
    chartDigit = "";
  }
  const subAbbr = code.slice(6, 8);
  const storeNum = code.slice(8, 9);
  const colNum = code.slice(9, 10);
  const rowNum = code.slice(10, 11);
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

  const isComplete =
    derivedCode.length === 11 &&
    !derivedCode.includes("_") &&
    !!chart &&
    !!subAbbr &&
    !!storeNum &&
    !!colNum &&
    !!rowNum;

  useEffect(() => {
    if (manualMode) return;
    onChange?.(derivedCode.replace(/_/g, ""));
  }, [partNum, chart, subAbbr, storeNum, colNum, rowNum, manualMode]);

  const handleChartClick = (c) => {
    if (disabled) return;
    setChart(c);
    if (c.defaultSub) {
      setSubAbbr(c.defaultSub);
    } else {
      setSubAbbr("");
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

        {/* Row */}
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

const useFetchStock = () => {
  const [stockItems, setStockItems] = useState([]);
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
      const url = `${backendUrl}/api/stock?limit=5000&offset=0&force_refresh=true`;

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
          errorData.error || `Stock fetch failed: ${response.statusText}`,
        );
      }

      const { data, total } = await response.json();
      if (isMounted) {
        const normalizedData = data.map((item) => ({
          ...item,
          price: item.price !== null ? Number(item.price) : 0,
          stockQuantity: item.stockQuantity ?? 0,
          qtyRequired: item.qtyRequired ?? 0,
          description: item.description || "",
          productCode: item.productCode || item.product_code || "",
          productName: item.productName || "",
          productId: item.productId,
          createdAt: item.createdAt || item.created_at || null,
        }));
        setStockItems(normalizedData);
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

  return { stockItems, totalItems, isLoading, error, refetchData: fetchData };
};

function ProductionStockPage() {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
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
    stockQuantity: "",
    qtyRequired: "",
    price: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState("");
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState("");
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedProductDescription, setSelectedProductDescription] =
    useState("");
  const [selectedProductPrice, setSelectedProductPrice] = useState(0);

  const tableRef = useRef(null);
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const { notifySuccess, notifyError } = useNotify();

  const { stockItems, totalItems, isLoading, error, refetchData } =
    useFetchStock();

  const debouncedSearch = useCallback(
    debounce((value) => setSearchTerm(value.toLowerCase()), 300),
    [],
  );

  useEffect(() => {
    debouncedSearch(searchInput);
    return () => debouncedSearch.cancel();
  }, [searchInput, debouncedSearch]);

  useEffect(() => setPage(0), [searchTerm]);

  // Socket.IO connection
  useEffect(() => {
    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ["websocket"],
    });

    socket.on("stockUpdate", () => {
      refetchData();
      tableRef.current?.focus();
    });

    return () => socket.disconnect();
  }, [refetchData]);

  // QR Code generation
  const generateQRCode = useCallback(
    async (
      productCode,
      productName,
      description,
      location,
      price,
      elementId,
    ) => {
      try {
        const data = JSON.stringify({
          productCode,
          productName,
          description: description || "No description",
          price: formatCurrency(price),
        });
        await QRCode.toCanvas(document.getElementById(elementId), data, {
          width: 200,
          margin: 2,
          errorCorrectionLevel: "H",
        });
      } catch (err) {
        notifyError("QR code generation failed", { autoClose: 3000 });
      }
    },
    [],
  );

  useEffect(() => {
    if (showBarcodeModal && selectedBarcode) {
      const item = stockItems.find((i) => i.productCode === selectedBarcode);
      generateQRCode(
        selectedBarcode,
        selectedProductName,
        selectedProductDescription,
        item?.location,
        item?.price,
        "qrcode-canvas",
      );
    }
  }, [
    showBarcodeModal,
    selectedBarcode,
    selectedProductName,
    selectedProductDescription,
    stockItems,
    generateQRCode,
  ]);

  // Sorting & Filtering
  const sortedStock = useMemo(() => {
    const items = [...stockItems];
    if (sortConfig.key) {
      items.sort((a, b) => {
        let aVal = a[sortConfig.key] ?? "";
        let bVal = b[sortConfig.key] ?? "";

        if (
          ["stockQuantity", "qtyRequired", "productId", "price"].includes(
            sortConfig.key,
          )
        ) {
          aVal = Number(aVal);
          bVal = Number(bVal);
        } else if (sortConfig.key === "createdAt") {
          const aDate = new Date(aVal);
          const bDate = new Date(bVal);
          aVal = Number.isNaN(aDate.getTime()) ? 0 : aDate.getTime();
          bVal = Number.isNaN(bDate.getTime()) ? 0 : bDate.getTime();
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
      return terms.some((t) => t.includes(searchTerm));
    });
  }, [sortedStock, searchTerm]);

  const paginatedStock = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredStock.slice(start, start + itemsPerPage);
  }, [filteredStock, page, itemsPerPage]);

  const validateImportRow = useCallback((row, index) => {
    const errors = [];

    const productName = String(row["Product Name"] ?? "").trim();
    const productCode = String(row["Product Code"] ?? "").trim();

    if (!productName) {
      errors.push(`Row ${index + 1}: Product Name required`);
    }

    if (!productCode || productCode.length !== 11) {
      errors.push(`Row ${index + 1}: Product Code must be 11 characters`);
    }

    const stock = Number(row["Stock Quantity"]);
    if (!Number.isFinite(stock) || stock < 0) {
      errors.push(`Row ${index + 1}: Stock Quantity must be non-negative`);
    }

    const price = Number(
      String(row["Price (₹)"] ?? "0").replace(/[^0-9.]/g, ""),
    );
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`Row ${index + 1}: Price must be non-negative`);
    }

    return errors;
  }, []);

  const exportToExcel = useCallback(() => {
    const excelSorted = [...filteredStock].sort(
      (a, b) => a.productId - b.productId,
    );

    const data = excelSorted.map((item) => ({
      "Product ID": item.productId,
      "Product Code": item.productCode,
      "Product Name": item.productName,
      Description: item.description || "N/A",
      "Stock Quantity": item.stockQuantity,
      "Qty Required": item.qtyRequired,
      "Price (₹)": formatCurrency(item.price),
      "Created At (IST)": item.createdAt ? formatDate(item.createdAt) : "N/A",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Raw Materials");
    XLSX.writeFile(wb, "Production_Raw_Material_Inventory.xlsx");

    notifySuccess("Exported to Excel!");
  }, [filteredStock]);

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
                stockQuantity: parseInt(row["Stock Quantity"] || 0),
                price: parseFloat(
                  String(row["Price (₹)"] || "0").replace(/[^0-9.]/g, ""),
                ),
                description:
                  String(row["Description"] || "").trim() || undefined,
                qtyRequired: parseInt(row["Qty Required"] || 0),
                productId: row["Product ID"]
                  ? parseInt(row["Product ID"])
                  : undefined,
              });
            }
          });

          if (errors.length) errors.forEach((e) => notifyError(e));
          if (!valid.length) return;

          const token = localStorage.getItem("token");
          let created = 0,
            updated = 0,
            failed = 0;

          for (const row of valid) {
            try {
              const { productId, ...body } = row;
              const url = productId
                ? `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/stock/${productId}`
                : `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/stock`;
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

              if (!res.ok) throw new Error((await res.json()).error);
              productId ? updated++ : created++;
            } catch {
              failed++;
            }
          }

          await refetchData();
          setPage(0);
          notifySuccess(
            `Imported: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ""}`,
          );
        } catch (err) {
          notifyError(`Import failed: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
      event.target.value = "";
    },
    [validateImportRow, refetchData],
  );

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const showDescription = useCallback((desc) => {
    setSelectedDescription(desc || "No description");
    setShowDescriptionModal(true);
  }, []);

  const showBarcode = useCallback((code, name, desc, location, price) => {
    setSelectedBarcode(code);
    setSelectedProductName(name);
    setSelectedProductDescription(desc);
    setSelectedProductPrice(price);
    setShowBarcodeModal(true);
  }, []);

  const ActionsDropdown = ({ item, onEdit }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      const handle = (e) =>
        ref.current && !ref.current.contains(e.target) && setOpen(false);
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }, []);
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="p-2 hover:bg-gray-100 rounded-full"
        >
          <MoreVertical size={20} />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5 z-10">
            <button
              onClick={() => {
                onEdit(item);
                setOpen(false);
              }}
              className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 items-center"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
          </div>
        )}
      </div>
    );
  };

  // ✅ FIXED: changed length check from 10 to 11
  const validateForm = useCallback(() => {
    const errors = {};
    if (!formData.productName.trim()) errors.productName = "Required";
    if (!formData.productCode || formData.productCode.length !== 11)
      errors.productCode = "Must be 11 characters";
    const stock = parseInt(formData.stockQuantity);
    if (
      (modalMode === "create" || modalMode === "edit") &&
      (isNaN(stock) || stock < 0)
    ) {
      errors.stockQuantity = "Must be non-negative";
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) errors.price = "Must be non-negative";
    return errors;
  }, [formData, modalMode]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const errors = validateForm();
      if (Object.keys(errors).length) {
        setFormErrors(errors);
        Object.values(errors).forEach((e) => notifyError(e));
        return;
      }

      try {
        const token = localStorage.getItem("token");
        const isCreate = modalMode === "create";
        const url = isCreate
          ? `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/stock`
          : `${import.meta.env.VITE_BACKEND_URL || "http://localhost:5000"}/api/stock/${selectedItem.productId}`;

        const body = {
          productName: formData.productName,
          description: formData.description || undefined,
          productCode: formData.productCode,
          stockQuantity: isCreate
            ? parseInt(formData.stockQuantity)
            : undefined,
          qtyRequired: parseInt(formData.qtyRequired) || 0,
          price: parseFloat(formData.price),
        };

        const res = await fetch(url, {
          method: isCreate ? "POST" : "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          credentials: "include",
        });

        if (!res.ok) throw new Error((await res.json()).error);
        await refetchData();
        setShowModal(false);
        setPage(0);
        notifySuccess(isCreate ? "Item created!" : "Item updated!");
      } catch (err) {
        notifyError(err.message);
      }
    },
    [formData, modalMode, selectedItem, refetchData],
  );

  const handleCreate = useCallback(() => {
    setModalMode("create");
    setSelectedItem(null);
    setFormData({
      productName: "",
      description: "",
      productCode: "",
      stockQuantity: "",
      qtyRequired: "",
      price: "",
      location: "",
    });
    setFormErrors({});
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((item) => {
    setModalMode("edit");
    setSelectedItem(item);
    setFormData({
      productName: item.productName || "",
      description: item.description || "",
      productCode: item.productCode || "",
      stockQuantity: item.stockQuantity || "",
      qtyRequired: item.qtyRequired || "",
      price: item.price || "",
    });
    setFormErrors({});
    setShowModal(true);
  }, []);

  useEffect(() => {
    if (showModal && modalRef.current) {
      const first = modalRef.current.querySelector("input");
      first?.focus();
      const handle = (e) => {
        if (e.key !== "Tab") return;
        const focusable = modalRef.current.querySelectorAll(
          "button, input, textarea",
        );
        const firstEl = focusable[0],
          lastEl = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      };
      document.addEventListener("keydown", handle);
      return () => document.removeEventListener("keydown", handle);
    }
  }, [showModal]);

  if (isLoading && !stockItems.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">
          Loading production materials...
        </div>
      </div>
    );
  }

  if (error && !showModal && !showDescriptionModal && !showBarcodeModal) return <ConnectionError onRetry={refetchData} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">
        Production Raw Material Inventory
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-4 flex-wrap">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search by ID, Name, Code..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Escape" && (setSearchInput(""), setSearchTerm(""))
              }
              ref={searchInputRef}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
            />
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              size={20}
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput("");
                  setSearchTerm("");
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XCircle size={20} />
              </button>
            )}
          </div>
          <button
            onClick={refetchData}
            disabled={isLoading}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 flex items-center shadow-md"
          >
            Refresh
          </button>
          <button
            onClick={handleCreate}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md"
          >
            <PlusCircle className="mr-2" size={20} /> Add Item
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md"
          >
            <Upload className="mr-2" size={20} /> Import
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
            <Download className="mr-2" size={20} /> Export
          </button>
        </div>

        {filteredStock.length === 0 && !isLoading ? (
          <div className="bg-white p-16 rounded-2xl shadow-lg text-center">
            <Package size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg text-gray-600">No materials found.</p>
            {!searchTerm && (
              <button
                onClick={handleCreate}
                className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto"
              >
                <PlusCircle className="mr-2" /> Add First Item
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
            <table
              className="w-full text-left min-w-[1300px]"
              ref={tableRef}
              tabIndex={0}
            >
              <thead className="bg-amber-100">
                <tr>
                  {[
                    { key: "productId", label: "ID" },
                    { key: "productCode", label: "Code" },
                    { key: "productName", label: "Name" },
                    { key: "description", label: "Desc" },
                    { key: "stockQuantity", label: "Stock" },
                    { key: "qtyRequired", label: "Req" },
                    { key: "price", label: "Price" },
                    { key: "createdAt", label: "Created" },
                    { key: "qrcode", label: "QR" },
                    { key: "actions", label: "Actions" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() =>
                        key !== "actions" && key !== "qrcode" && handleSort(key)
                      }
                      className={`py-5 px-3 text-base font-medium ${key !== "actions" && key !== "qrcode" ? "cursor-pointer hover:bg-amber-200" : ""}`}
                      tabIndex={key !== "actions" && key !== "qrcode" ? 0 : -1}
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
                {paginatedStock.map((item) => {
                  const isLow = item.stockQuantity < item.qtyRequired;
                  return (
                    <tr
                      key={item.productId}
                      className="border-t hover:bg-amber-50"
                    >
                      <td className="py-4 px-3 text-gray-700">
                        {item.productId}
                      </td>
                      <td className="py-4 px-3 text-gray-700 font-mono">
                        {item.productCode}
                      </td>
                      <td className="py-4 px-3 text-gray-700 font-medium">
                        {item.productName}
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
                      <td className="py-4 px-3">
                        <span
                          className={`px-3 py-1 rounded-full text-white text-sm ${isLow ? "bg-red-500" : "bg-green-500"}`}
                        >
                          {item.stockQuantity}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-gray-700">
                        {item.qtyRequired}
                      </td>
                      <td className="py-4 px-3 text-gray-700">
                        {formatCurrency(item.price)}
                      </td>
                      <td className="py-4 px-3 text-sm text-gray-600">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="py-4 px-3">
                        <button
                          onClick={() =>
                            showBarcode(
                              item.productCode,
                              item.productName,
                              item.description,
                              item.location,
                              item.price,
                            )
                          }
                          className="text-amber-600 hover:text-amber-800 flex items-center"
                        >
                          <Eye size={16} className="mr-1" /> QR
                        </button>
                      </td>
                      <td className="py-4 px-3 sticky right-0 bg-white">
                        <ActionsDropdown item={item} onEdit={handleEdit} />
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
                <div className="flex gap-4">
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
                    disabled={(page + 1) * itemsPerPage >= filteredStock.length}
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

      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 overflow-y-auto py-10">
          <div
            className="bg-white p-8 rounded-2xl shadow-xl w-[520px] max-h-[90vh] overflow-y-auto relative"
            ref={modalRef}
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4"
            >
              <XCircle size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6">
              {modalMode === "create"
                ? "Add Item"
                : `Edit #${selectedItem?.productId}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Product Name *</label>
                <input
                  type="text"
                  value={formData.productName}
                  onChange={(e) =>
                    setFormData({ ...formData, productName: e.target.value })
                  }
                  className={`w-full p-3 border rounded-lg ${formErrors.productName ? "border-red-500" : ""}`}
                  required
                />
              </div>
              <div>
                <label className="block font-medium mb-1">
                  Product Code (11 chars) *
                </label>
                <ProductCodeBuilder
                  value={formData.productCode}
                  onChange={(code) =>
                    setFormData({ ...formData, productCode: code })
                  }
                />
                {formErrors.productCode && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.productCode}</p>
                )}
              </div>
              <div>
                <label className="block font-medium mb-1">Price (₹) *</label>
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
              </div>
              <div>
                <label className="block font-medium mb-1">
                  {modalMode === "create" ? "Initial Stock" : "Stock Quantity"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.stockQuantity}
                  onChange={(e) =>
                    setFormData({ ...formData, stockQuantity: e.target.value })
                  }
                  className={`w-full p-3 border rounded-lg ${formErrors.stockQuantity ? "border-red-500" : ""}`}
                  required={modalMode === "create"}
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Qty Required</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.qtyRequired}
                  onChange={(e) =>
                    setFormData({ ...formData, qtyRequired: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Description</label>
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

      {showDescriptionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
            <button
              onClick={() => setShowDescriptionModal(false)}
              className="absolute top-4 right-4"
            >
              <XCircle size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-4">Description</h2>
            <p className="text-gray-700 whitespace-pre-wrap">
              {selectedDescription}
            </p>
          </div>
        </div>
      )}

      {showBarcodeModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
            <button
              onClick={() => setShowBarcodeModal(false)}
              className="absolute top-4 right-4"
            >
              <XCircle size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-4">
              QR: {selectedProductName}
            </h2>
            <div className="space-y-1 text-sm text-gray-700 mb-4">
              <p>
                <strong>Code:</strong> {selectedBarcode}
              </p>
              <p>
                <strong>Price:</strong> {formatCurrency(selectedProductPrice)}
              </p>
            </div>
            <canvas
              id="qrcode-canvas"
              className="w-full max-w-[200px] mx-auto mb-4"
            ></canvas>
            <button
              onClick={() => {
                const canvas = document.getElementById("qrcode-canvas");
                const a = document.createElement("a");
                a.href = canvas.toDataURL("image/png");
                a.download = `QR_${selectedBarcode}.png`;
                a.click();
                notifySuccess("Downloaded!");
              }}
              className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto"
            >
              <Download className="mr-2" /> Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductionStockPage;