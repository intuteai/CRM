import { useState } from "react";
import { XCircle, Plus, Minus } from "lucide-react";
import { adjustStock } from "../../utils/stockApi";
import { normalizeStockItem, parseLooseNumber, NUMERIC_MAX } from "../../utils/stockForm";
import { useNotify } from "../../hooks/useNotify";

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Audited stock-in / stock-out for one raw material
 * (POST /api/stock/:id/adjust). Closes only after the server accepts it.
 * onDone receives the updated item (page shape, numbers).
 */
export default function AdjustStockModal({ item, onClose, onDone }) {
  const [direction, setDirection] = useState("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { notifySuccess } = useNotify();

  if (!item) return null;
  const current = Number(item.stockQuantity) || 0;
  const amount = parseLooseNumber(qty);
  const validAmount = Number.isFinite(amount) && round2(amount) > 0 && amount <= NUMERIC_MAX;
  const delta = validAmount ? round2(direction === "add" ? amount : -amount) : 0;
  const resulting = round2(current + delta);
  const belowZero = validAmount && resulting < 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validAmount) return setError("Enter a quantity greater than 0.");
    if (belowZero) return setError(`Only ${current} in stock — you can't remove ${round2(amount)}.`);
    if (!reason.trim()) return setError("Please give a reason for this change.");
    setError("");
    setSubmitting(true);
    try {
      const res = await adjustStock(item.productId, { quantity: delta, reason: reason.trim() });
      const updated =
        res && (res.product_name !== undefined || res.productName !== undefined)
          ? { ...item, ...normalizeStockItem(res) }
          : { ...item, stockQuantity: Number(res?.stockQuantity ?? res?.stock_quantity ?? resulting) };
      notifySuccess(`Stock for ${item.productName} is now ${updated.stockQuantity}`);
      onDone?.(updated);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Stock adjustment failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4" role="dialog">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-[440px] max-w-full max-h-[90vh] overflow-y-auto relative"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
          aria-label="Close adjust stock"
          disabled={submitting}
        >
          <XCircle size={22} />
        </button>
        <h3 className="font-display text-xl font-bold text-navy-800 mb-1 pr-8">Adjust Stock</h3>
        <p className="text-sm text-gray-500 mb-4">
          {item.productName} · <span className="font-mono">{item.productCode}</span>
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { key: "add", label: "Add stock", icon: Plus, on: "border-green-500 bg-green-50 text-green-700" },
            { key: "remove", label: "Remove stock", icon: Minus, on: "border-red-500 bg-red-50 text-red-700" },
          ].map(({ key, label, icon: Icon, on }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDirection(key)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 font-medium text-sm transition-colors ${
                direction === key ? on : "border-navy-100 text-gray-600 hover:bg-navy-50"
              }`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        <label className="block text-sm font-semibold text-navy-800 mb-1.5">Quantity</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full p-3 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 mb-3"
          autoFocus
        />

        <label className="block text-sm font-semibold text-navy-800 mb-1.5">Reason *</label>
        <input
          type="text"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={direction === "add" ? "e.g. Received from supplier" : "e.g. Issued to production, damaged"}
          className="w-full p-3 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 mb-3"
        />

        <div className="text-sm bg-navy-50 border border-navy-100 rounded-lg px-3 py-2 mb-3 flex justify-between">
          <span className="text-gray-500">
            Current: <strong className="text-navy-800">{current}</strong>
          </span>
          <span className="text-gray-500">
            After:{" "}
            <strong className={belowZero ? "text-red-600" : "text-navy-800"}>{validAmount ? resulting : "—"}</strong>
          </span>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || belowZero}
            className="px-4 py-2 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
