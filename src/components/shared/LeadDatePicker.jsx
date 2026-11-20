import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  LEAD_YEAR_MIN,
  LEAD_YEAR_MAX,
  MONTH_NAMES,
  MONTH_SHORT,
  WEEKDAY_SHORT,
  addDays,
  addMonths,
  addYears,
  ariaLabel,
  clampIso,
  endOfWeek,
  formatDisplay,
  isValidIsoDate,
  monthMatrix,
  normaliseTyped,
  parseDisplay,
  partsFromIso,
  startOfWeek,
  todayIso,
} from "../../utils/leadDate";

const POPOVER_WIDTH = 304;
const GAP = 6;
const MOBILE_MAX = 640;
const YEARS_PER_PAGE = 12;
const INVALID_MSG = "Enter a real date as DD-MM-YYYY";

/**
 * Date picker for 'YYYY-MM-DD' values shown as DD-MM-YYYY.
 * Type the date (dashes are inserted for you, pasted dates are normalised) or
 * open the calendar. Value / onChange use 'YYYY-MM-DD', or '' when empty.
 */
export default function LeadDatePicker({ value = "", onChange, disabled = false, error, id }) {
  const autoId = useId();
  const inputId = id || `lead-date-${autoId}`;
  const errorId = `${inputId}-error`;
  const committed = isValidIsoDate(value) ? value : "";

  const [text, setText] = useState(formatDisplay(committed));
  const [localError, setLocalError] = useState(null);
  const [open, setOpen] = useState(false);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const popRef = useRef(null);

  // Follow value changes made outside (form reset, Clear, another item).
  useEffect(() => {
    setText(formatDisplay(committed));
    setLocalError(null);
  }, [committed]);

  const emit = useCallback(
    (iso) => {
      if (iso !== committed) onChange?.(iso);
    },
    [committed, onChange],
  );

  const commitText = useCallback(() => {
    const t = text.trim();
    if (!t) {
      setLocalError(null);
      emit("");
      return true;
    }
    const iso = parseDisplay(t);
    if (!iso) {
      setLocalError(INVALID_MSG);
      return false;
    }
    setLocalError(null);
    setText(formatDisplay(iso));
    emit(iso);
    return true;
  }, [text, emit]);

  const handleInput = (e) => {
    const next = normaliseTyped(e.target.value);
    setText(next);
    setLocalError(null);
    if (next.length === 10) {
      const iso = parseDisplay(next);
      if (iso) emit(iso);
    } else if (next === "") {
      emit("");
    }
  };

  const handleInputKey = (e) => {
    if (e.key === "Enter") {
      // Don't submit the surrounding form with a half-typed date.
      if (!commitText()) e.preventDefault();
      else if (text.trim() && text.trim().length !== 10) e.preventDefault();
    } else if (e.key === "ArrowDown" && (e.altKey || !open)) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation(); // close only the calendar, not the surrounding modal
      setOpen(false);
    }
  };

  const closeAndFocus = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const select = useCallback(
    (iso) => {
      setText(formatDisplay(iso));
      setLocalError(null);
      emit(iso);
      closeAndFocus();
    },
    [emit, closeAndFocus],
  );

  const clear = useCallback(() => {
    setText("");
    setLocalError(null);
    emit("");
    closeAndFocus();
  }, [emit, closeAndFocus]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const shownError = localError || error || null;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="DD-MM-YYYY"
            maxLength={10}
            value={text}
            disabled={disabled}
            onChange={handleInput}
            onBlur={() => {
              if (!open) commitText();
            }}
            onKeyDown={handleInputKey}
            aria-invalid={shownError ? "true" : undefined}
            aria-describedby={shownError ? errorId : undefined}
            className={`w-full p-3 pr-11 border rounded-lg font-mono tracking-wider text-navy-800 bg-white focus:outline-none focus:ring-2 focus:ring-gold-400 disabled:bg-gray-50 disabled:text-gray-400 ${shownError ? "border-red-500" : "border-navy-100"}`}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => (open ? setOpen(false) : setOpen(true))}
            aria-label="Open calendar"
            aria-haspopup="dialog"
            aria-expanded={open}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md transition-colors disabled:opacity-40 ${open ? "bg-navy-800 text-gold-400" : "text-navy-700 hover:bg-navy-50"}`}
          >
            <CalendarDays size={18} />
          </button>
        </div>
        {committed && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 px-3 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
            aria-label="Clear lead date"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>
      {shownError && (
        <p id={errorId} role="alert" className="text-red-500 text-xs mt-1">
          {shownError}
        </p>
      )}
      {open && (
        <CalendarPopover
          anchorRef={wrapRef}
          popRef={popRef}
          value={committed}
          onSelect={select}
          onClear={clear}
          onClose={closeAndFocus}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */

function usePopoverPosition(anchorRef, popRef) {
  const [pos, setPos] = useState(null);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < MOBILE_MAX) {
      setPos({ mobile: true });
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const height = popRef.current?.offsetHeight || 380;
    const below = vh - rect.bottom - GAP;
    const above = rect.top - GAP;
    const placeAbove = below < height + 8 && above > below;
    let top = placeAbove ? rect.top - height - GAP : rect.bottom + GAP;
    top = Math.max(8, Math.min(top, vh - height - 8));
    const left = Math.max(8, Math.min(rect.left, vw - POPOVER_WIDTH - 8));
    setPos({ mobile: false, top, left, placeAbove });
  }, [anchorRef, popRef]);

  useLayoutEffect(() => {
    measure();
    // Re-measure once the real height is known.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  return pos;
}

function CalendarPopover({ anchorRef, popRef, value, onSelect, onClear, onClose }) {
  const today = todayIso();
  const initial = clampIso(value || today);
  const init = partsFromIso(initial);

  const [view, setView] = useState("days"); // days | months | years
  const [viewYear, setViewYear] = useState(init.year);
  const [viewMonth, setViewMonth] = useState(init.month);
  const [focusIso, setFocusIso] = useState(initial);
  const [shown, setShown] = useState(false);
  const dayRefs = useRef(new Map());
  const pos = usePopoverPosition(anchorRef, popRef);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep the visible month in step with the keyboard-focused day.
  const moveFocus = useCallback((iso) => {
    const next = clampIso(iso);
    const p = partsFromIso(next);
    setFocusIso(next);
    setViewYear(p.year);
    setViewMonth(p.month);
  }, []);

  useEffect(() => {
    if (view !== "days") return undefined;
    const raf = requestAnimationFrame(() => dayRefs.current.get(focusIso)?.focus());
    return () => cancelAnimationFrame(raf);
  }, [focusIso, view, viewMonth, viewYear]);

  const shiftMonth = (n) => {
    const target = addMonths(`${viewYear}-${String(viewMonth).padStart(2, "0")}-01`, n);
    const p = partsFromIso(target);
    setViewYear(p.year);
    setViewMonth(p.month);
    const day = partsFromIso(focusIso).day;
    const dim = new Date(Date.UTC(p.year, p.month, 0)).getUTCDate();
    setFocusIso(`${p.year}-${String(p.month).padStart(2, "0")}-${String(Math.min(day, dim)).padStart(2, "0")}`);
  };

  const onGridKey = (e) => {
    const map = {
      ArrowLeft: () => addDays(focusIso, -1),
      ArrowRight: () => addDays(focusIso, 1),
      ArrowUp: () => addDays(focusIso, -7),
      ArrowDown: () => addDays(focusIso, 7),
      PageUp: () => (e.shiftKey ? addYears(focusIso, -1) : addMonths(focusIso, -1)),
      PageDown: () => (e.shiftKey ? addYears(focusIso, 1) : addMonths(focusIso, 1)),
      Home: () => startOfWeek(focusIso),
      End: () => endOfWeek(focusIso),
    };
    if (map[e.key]) {
      e.preventDefault();
      moveFocus(map[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(focusIso);
    }
  };

  const onPopKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // don't also close the surrounding modal
      if (view !== "days") setView("days");
      else onClose();
    } else if (e.key === "Tab") {
      // Keep focus inside the dialog.
      const focusable = popRef.current?.querySelectorAll('button:not([disabled]):not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const weeks = monthMatrix(viewYear, viewMonth);
  const atMin = viewYear === LEAD_YEAR_MIN && viewMonth === 1;
  const atMax = viewYear === LEAD_YEAR_MAX && viewMonth === 12;
  const yearPageStart = LEAD_YEAR_MIN + Math.floor((viewYear - LEAD_YEAR_MIN) / YEARS_PER_PAGE) * YEARS_PER_PAGE;

  const mobile = pos?.mobile;
  const style = mobile
    ? undefined
    : {
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        width: POPOVER_WIDTH,
        transformOrigin: pos?.placeAbove ? "bottom left" : "top left",
      };

  const navBtn =
    "p-1.5 rounded-md text-navy-700 hover:bg-navy-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400";
  const headBtn =
    "px-2 py-1 rounded-md font-display font-semibold text-navy-800 hover:bg-navy-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400";

  const content = (
    <>
      {mobile && (
        <div
          className={`fixed inset-0 z-[69] bg-navy-900/40 transition-opacity duration-200 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
          aria-hidden="true"
          onMouseDown={onClose}
        />
      )}
      <div
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-label="Choose lead date"
        onKeyDown={onPopKey}
        style={style}
        className={`fixed z-[70] bg-white border border-navy-100 shadow-2xl transition duration-150 ease-out motion-reduce:transition-none ${
          mobile
            ? `inset-x-0 bottom-0 rounded-t-2xl p-4 pb-6 ${shown ? "translate-y-0" : "translate-y-full"}`
            : `rounded-xl p-3 ${shown ? "opacity-100 scale-100" : "opacity-0 scale-95"}`
        }`}
      >
        {mobile && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-navy-100" aria-hidden="true" />}
        <div className="h-1 -mt-1 mb-2 rounded-full bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400 opacity-80" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          {view === "days" && (
            <>
              <button type="button" className={navBtn} onClick={() => shiftMonth(-1)} disabled={atMin} aria-label="Previous month">
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-0.5" aria-live="polite">
                <button type="button" className={headBtn} onClick={() => setView("months")} aria-label={`Choose month, ${MONTH_NAMES[viewMonth - 1]}`}>
                  {MONTH_NAMES[viewMonth - 1]}
                </button>
                <button type="button" className={headBtn} onClick={() => setView("years")} aria-label={`Choose year, ${viewYear}`}>
                  {viewYear}
                </button>
              </div>
              <button type="button" className={navBtn} onClick={() => shiftMonth(1)} disabled={atMax} aria-label="Next month">
                <ChevronRight size={18} />
              </button>
            </>
          )}
          {view === "months" && (
            <>
              <button type="button" className={navBtn} onClick={() => setViewYear((y) => Math.max(LEAD_YEAR_MIN, y - 1))} disabled={viewYear <= LEAD_YEAR_MIN} aria-label="Previous year">
                <ChevronLeft size={18} />
              </button>
              <button type="button" className={headBtn} onClick={() => setView("years")} aria-label={`Choose year, ${viewYear}`}>
                {viewYear}
              </button>
              <button type="button" className={navBtn} onClick={() => setViewYear((y) => Math.min(LEAD_YEAR_MAX, y + 1))} disabled={viewYear >= LEAD_YEAR_MAX} aria-label="Next year">
                <ChevronRight size={18} />
              </button>
            </>
          )}
          {view === "years" && (
            <>
              <button type="button" className={navBtn} onClick={() => setViewYear(Math.max(LEAD_YEAR_MIN, yearPageStart - YEARS_PER_PAGE))} disabled={yearPageStart <= LEAD_YEAR_MIN} aria-label="Earlier years">
                <ChevronLeft size={18} />
              </button>
              <span className="font-display font-semibold text-navy-800 text-sm">
                {yearPageStart} – {Math.min(LEAD_YEAR_MAX, yearPageStart + YEARS_PER_PAGE - 1)}
              </span>
              <button type="button" className={navBtn} onClick={() => setViewYear(Math.min(LEAD_YEAR_MAX, yearPageStart + YEARS_PER_PAGE))} disabled={yearPageStart + YEARS_PER_PAGE > LEAD_YEAR_MAX} aria-label="Later years">
                <ChevronRight size={18} />
              </button>
            </>
          )}
        </div>

        {/* Day grid */}
        {view === "days" && (
          <div role="grid" aria-label={`${MONTH_NAMES[viewMonth - 1]} ${viewYear}`} onKeyDown={onGridKey}>
            <div role="row" className="grid grid-cols-7 mb-1">
              {WEEKDAY_SHORT.map((d) => (
                <div key={d} role="columnheader" className="text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 py-1">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((row, wi) => (
              <div role="row" key={wi} className="grid grid-cols-7 gap-0.5">
                {row.map((cell, di) => {
                  if (!cell.iso) return <div role="gridcell" key={di} aria-disabled="true" />;
                  const selected = cell.iso === value;
                  const isToday = cell.iso === today;
                  const past = cell.iso < today;
                  const focused = cell.iso === focusIso;
                  let tone;
                  if (selected) tone = "bg-navy-800 text-white font-semibold shadow-md ring-2 ring-gold-400";
                  else if (!cell.inMonth) tone = "text-gray-300 hover:bg-navy-50";
                  else if (past) tone = "text-gray-400 hover:bg-navy-50";
                  else tone = "text-navy-800 hover:bg-gold-400/20";
                  return (
                    <div role="gridcell" key={di} aria-selected={selected}>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) dayRefs.current.set(cell.iso, el);
                          else dayRefs.current.delete(cell.iso);
                        }}
                        tabIndex={focused ? 0 : -1}
                        onClick={() => onSelect(cell.iso)}
                        onFocus={() => focusIso !== cell.iso && setFocusIso(cell.iso)}
                        aria-label={`${ariaLabel(cell.iso)}${isToday ? " (today)" : ""}`}
                        aria-current={isToday ? "date" : undefined}
                        className={`relative w-full aspect-square sm:h-9 sm:aspect-auto rounded-lg text-sm transition-colors duration-100 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1 ${tone} ${isToday && !selected ? "ring-1 ring-gold-500 font-semibold text-navy-900" : ""}`}
                      >
                        {cell.day}
                        {selected && (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-gold-400" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Month grid */}
        {view === "months" && (
          <div className="grid grid-cols-3 gap-1.5 py-1" role="listbox" aria-label={`Months of ${viewYear}`}>
            {MONTH_SHORT.map((m, i) => {
              const current = value && partsFromIso(value)?.year === viewYear && partsFromIso(value)?.month === i + 1;
              const active = i + 1 === viewMonth;
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={!!current}
                  onClick={() => {
                    setViewMonth(i + 1);
                    const day = partsFromIso(focusIso).day;
                    const dim = new Date(Date.UTC(viewYear, i + 1, 0)).getUTCDate();
                    setFocusIso(`${viewYear}-${String(i + 1).padStart(2, "0")}-${String(Math.min(day, dim)).padStart(2, "0")}`);
                    setView("days");
                  }}
                  className={`py-3 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${current ? "bg-navy-800 text-white ring-2 ring-gold-400" : active ? "bg-gold-400/20 text-navy-900 font-semibold" : "text-navy-800 hover:bg-navy-50"}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}

        {/* Year grid */}
        {view === "years" && (
          <div className="grid grid-cols-3 gap-1.5 py-1" role="listbox" aria-label="Years">
            {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart + i)
              .filter((y) => y <= LEAD_YEAR_MAX)
              .map((y) => {
                const current = value && partsFromIso(value)?.year === y;
                const active = y === viewYear;
                return (
                  <button
                    key={y}
                    type="button"
                    role="option"
                    aria-selected={!!current}
                    onClick={() => {
                      setViewYear(y);
                      setView("months");
                    }}
                    className={`py-3 rounded-lg text-sm font-mono transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ${current ? "bg-navy-800 text-white ring-2 ring-gold-400" : active ? "bg-gold-400/20 text-navy-900 font-semibold" : "text-navy-800 hover:bg-navy-50"} ${y === Number(today.slice(0, 4)) && !current ? "ring-1 ring-gold-500" : ""}`}
                  >
                    {y}
                  </button>
                );
              })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-navy-100">
          <button
            type="button"
            onClick={() => onSelect(today)}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-gold-500 text-navy-900 hover:bg-gold-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700"
          >
            Today
          </button>
          <span className="text-xs text-gray-400 font-mono" aria-hidden="true">
            {value ? formatDisplay(value) : "No date"}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            Clear
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
