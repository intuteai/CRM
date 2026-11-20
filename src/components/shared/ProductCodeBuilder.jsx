import { useState, useEffect, useRef } from "react";
import {
  PRODUCT_CHARTS,
  SUB_CODES,
  SEG,
  pad4,
  buildCode,
  parseCode,
  chartPair,
} from "../../utils/productCode";
import { checkPartNumber } from "../../utils/stockApi";

/**
 * 11-character raw-material product code builder:
 * part number · chart pair · sub code · store · column · row.
 * Checks part-number availability against /api/stock/check-part-number
 * (in builder mode and, when the first 4 characters are digits, in manual mode).
 */
export default function ProductCodeBuilder({
  value = "",
  onChange,
  disabled = false,
  suggestedPartNumber = null,
  excludeId = null,
  onAutoFlagChange,
  onAvailabilityChange,
}) {
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
  // A code that can't be parsed into known segments opens in manual mode so it stays visible/editable.
  const [manualMode, setManualMode] = useState(!!value && value.length === 11 && !parsed?.chart);
  const [manualVal, setManualVal] = useState(value || "");

  // Keep the latest callbacks without re-running effects when parents re-render.
  const onChangeRef = useRef(onChange);
  const onAutoRef = useRef(onAutoFlagChange);
  const onAvailRef = useRef(onAvailabilityChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onAutoRef.current = onAutoFlagChange;
    onAvailRef.current = onAvailabilityChange;
  });

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

  // Report the built code whenever a builder segment changes.
  useEffect(() => {
    if (manualMode) return;
    onChangeRef.current?.(derivedCode.replace(/_/g, ""));
  }, [derivedCode, manualMode]);

  useEffect(() => {
    onAutoRef.current?.(!partTouched);
  }, [partTouched]);

  // Part number being checked: builder part, or the first 4 digits typed in manual mode.
  const manualPart = /^\d{4}/.test(manualVal) ? manualVal.slice(0, 4) : null;
  const partToCheck = manualMode ? manualPart : partNum;

  useEffect(() => {
    if (!partToCheck || partToCheck.length !== 4) {
      setCheckStatus(null);
      onAvailRef.current?.(true);
      return;
    }
    onAvailRef.current?.(false);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCheckStatus({ checking: true });
      try {
        const data = await checkPartNumber(partToCheck, excludeId, controller.signal);
        setCheckStatus({ checking: false, ...data });
        onAvailRef.current?.(data?.available !== false);
      } catch (err) {
        if (err?.name !== "AbortError") {
          // The server re-checks on save; don't block the form on a failed lookup.
          setCheckStatus(null);
          onAvailRef.current?.(true);
        }
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [partToCheck, excludeId]);

  const handleChartClick = (c) => {
    if (disabled) return;
    setChart(c);
    setSubAbbr(c.defaultSub || "");
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

  const availabilityNote = (
    <>
      {checkStatus?.checking && <p className="text-xs text-gray-400 mt-1">Checking availability…</p>}
      {checkStatus && !checkStatus.checking && checkStatus.available === true && (
        <p className="text-xs text-green-600 mt-1">✓ Part number {partToCheck} is available</p>
      )}
      {checkStatus && !checkStatus.checking && checkStatus.available === false && (
        <p className="text-xs text-red-600 mt-1">
          ✗ Part number {partToCheck} is already used by {checkStatus.conflictProductName} (#
          {checkStatus.conflictProductId})
        </p>
      )}
    </>
  );

  const seg_part = derivedCode.slice(0, 4);
  const seg_chart = chartPair(chart);
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
              const v = e.target.value.toUpperCase().replace(/\s/g, "");
              setManualVal(v);
              setPartTouched(true);
              onChangeRef.current?.(v);
            }}
            placeholder="Enter 11-char code manually"
            className="flex-1 p-2 border border-navy-100 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-xs px-3 py-2 bg-navy-50 text-navy-800 rounded-lg hover:bg-navy-100 transition-colors whitespace-nowrap"
          >
            ← Use Builder
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Must be exactly 11 characters: 4 digits, 4 letters/digits, then 3 digits.
        </p>
        {availabilityNote}
      </div>
    );
  }

  return (
    <div className="border border-navy-100 rounded-xl bg-white p-3 sm:p-4 space-y-4 shadow-sm">
      {/* ── Live Preview ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Code Preview</p>
          {isComplete ? (
            <span className="text-xs bg-green-100 text-green-700 border border-green-300 px-2 py-1 rounded-full font-semibold">
              ✓ 11 / 11
            </span>
          ) : (
            <span className="text-xs bg-gold-400/25 text-gold-600 border border-gold-400/40 px-2 py-1 rounded-full">
              {[seg_part, seg_chart, seg_sub, seg_store, seg_col, seg_row].join("").length} / 11
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 bg-white border-2 border-navy-100 rounded-xl px-2 sm:px-4 py-3 shadow-inner justify-center font-mono text-lg sm:text-2xl tracking-[0.1em] sm:tracking-[0.2em] select-all overflow-x-auto">
          <span className={`${SEG.part} font-black`}>{seg_part}</span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.chart} font-black`}>
            {seg_chart || <span className="text-gray-200 text-lg">??</span>}
          </span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.sub} font-black`}>
            {seg_sub || <span className="text-gray-200 text-lg">??</span>}
          </span>
          <span className="text-gray-200 font-thin">·</span>
          <span className={`${SEG.store} font-black`}>
            {seg_store || <span className="text-gray-200 text-lg">?</span>}
          </span>
          <span className={`${SEG.col} font-black`}>
            {seg_col || <span className="text-gray-200 text-lg">?</span>}
          </span>
          <span className={`${SEG.row} font-black`}>
            {seg_row || <span className="text-gray-200 text-lg">?</span>}
          </span>
        </div>

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

      <hr className="border-navy-100" />

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
            → <code className={`${SEG.part} font-bold text-base`}>{partNum}</code>
          </span>
        </div>
        {availabilityNote}
      </div>

      {/* ── ② Product Chart ── */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <span className={`${SEG.chart} font-black text-sm`}>②</span>
          Product Chart
          <span className="font-normal text-gray-400 ml-1">— 2-char pair, auto-fills Sub Code</span>
        </label>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {PRODUCT_CHARTS.map((c) => (
            <button
              key={c.symbol}
              type="button"
              onClick={() => handleChartClick(c)}
              title={c.defaultSub ? `Auto-fills sub: ${c.defaultSub}` : "No default sub code"}
              className={`py-3 px-1 rounded-xl border-2 text-center transition-all duration-150 select-none
                ${
                  chart?.symbol === c.symbol
                    ? "border-purple-500 bg-purple-100 shadow-md scale-105"
                    : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <div className={`text-xl font-black ${SEG.chart} leading-none tracking-tight`}>
                {c.pair ? c.pair[0] : c.symbol}
                <span className="text-gray-400">{c.pair ? c.pair[1] : c.digit}</span>
              </div>
              <div className="text-[10px] font-semibold text-gray-600 mt-1">{c.label}</div>
              <div className="text-[9px] text-purple-400 mt-0.5">{c.defaultSub ? `→ ${c.defaultSub}` : " "}</div>
            </button>
          ))}
        </div>
        {chart && (
          <div className="mt-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{chart.label}</span>
            <span className="text-gray-400">·</span>
            <span>
              Pair: <code className={`${SEG.chart} font-black`}>{chartPair(chart)}</code>
            </span>
            {chart.defaultSub && (
              <>
                <span className="text-gray-400">·</span>
                <span>
                  Sub auto-set to: <code className={`${SEG.sub} font-black`}>{chart.defaultSub}</code>
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── ③ Sub Code ── */}
      <div>
        <label className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
          <span className={`${SEG.sub} font-black text-sm`}>③</span>
          Sub Code
          <span className="font-normal text-gray-400 ml-1">— 2-char abbreviation</span>
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
          {!subAbbr && <span className="text-xs text-gray-300">type any 2-char code here</span>}
        </div>
      </div>

      <hr className="border-navy-100" />

      {/* ── ④⑤⑥ Store / Column / Row ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { key: "store", n: "④", label: "Store #", val: storeNum, set: setStoreNum, ring: "focus:ring-red-300" },
          { key: "col", n: "⑤", label: "Column", val: colNum, set: setColNum, ring: "focus:ring-orange-300" },
          { key: "row", n: "⑥", label: "Row", val: rowNum, set: setRowNum, ring: "focus:ring-teal-300" },
        ].map(({ key, n, label, val, set, ring }) => (
          <div key={key}>
            <label className="text-xs font-bold text-gray-600 mb-1.5 flex items-center gap-1">
              <span className={`${SEG[key]} font-black text-sm`}>{n}</span> {label}{" "}
              <span className="font-normal text-gray-400">(1 digit)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={val}
              onChange={(e) => !disabled && set(e.target.value.replace(/\D/g, "").slice(0, 1))}
              placeholder="1"
              className={`w-full p-3 border border-gray-300 rounded-lg font-mono text-2xl text-center focus:ring-2 ${ring} bg-white ${key === "row" ? "mb-1.5" : ""}`}
              disabled={disabled}
            />
            {key === "row" && (
              <div className="grid grid-cols-5 gap-1">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => !disabled && setRowNum(r)}
                    className={`py-1.5 sm:py-1 rounded border text-xs font-bold transition-all duration-100
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
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const code = isComplete ? derivedCode.replace(/_/g, "") : "";
            setManualMode(true);
            setManualVal(code);
            onChangeRef.current?.(code);
          }}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Enter code manually instead →
        </button>
      </div>
    </div>
  );
}
