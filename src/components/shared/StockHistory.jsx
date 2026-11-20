import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchAdjustments } from "../../utils/stockApi";

const SOURCE_LABELS = {
  create: "Created",
  edit: "Edited",
  adjust: "Adjustment",
  return: "Return accepted",
  purchase_invoice: "Purchase invoice",
};

const fmtQty = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

const fmtDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Recent stock changes for one raw material (GET /api/stock/:id/adjustments). */
export default function StockHistory({ productId, limit = 20 }) {
  const [state, setState] = useState({ loading: true, error: null, available: true, rows: [] });

  const load = useCallback(
    async (signal) => {
      if (!productId) return;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetchAdjustments(productId, limit, { signal });
        setState({
          loading: false,
          error: null,
          available: res?.available !== false,
          rows: Array.isArray(res?.data) ? res.data : [],
        });
      } catch (err) {
        if (err?.name === "AbortError") return;
        setState({ loading: false, error: err?.message || "Could not load stock history", available: true, rows: [] });
      }
    },
    [productId, limit],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent stock changes</h3>
        <button
          type="button"
          onClick={() => load()}
          disabled={state.loading}
          className="p-1 text-gray-400 hover:text-navy-800 disabled:opacity-50 transition-colors"
          aria-label="Reload stock history"
        >
          <RefreshCw size={14} className={state.loading ? "animate-spin" : ""} />
        </button>
      </div>

      {state.loading && !state.rows.length ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : state.error ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : !state.available ? (
        <p className="text-sm text-gray-400">Stock history isn&apos;t enabled yet.</p>
      ) : !state.rows.length ? (
        <p className="text-sm text-gray-400">No stock changes recorded yet.</p>
      ) : (
        <ul className="divide-y divide-navy-100 border border-navy-100 rounded-lg max-h-64 overflow-y-auto">
          {state.rows.map((r) => {
            const q = Number(r.quantity);
            const positive = q > 0;
            return (
              <li key={r.adjustmentId} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-semibold ${positive ? "text-green-600" : "text-red-600"}`}>
                    {positive ? "+" : "−"}
                    {fmtQty(Math.abs(q))}
                  </span>
                  <span className="text-xs text-gray-500">
                    {r.balanceAfter !== null && r.balanceAfter !== undefined && <>→ {fmtQty(r.balanceAfter)} · </>}
                    {fmtDate(r.createdAt)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  <span className="font-medium text-navy-800">{SOURCE_LABELS[r.source] || r.source || "Change"}</span>
                  {r.reason ? ` — ${r.reason}` : ""}
                  {r.createdByName ? ` · ${r.createdByName}` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
