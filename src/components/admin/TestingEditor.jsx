import React, { useState } from "react";
import { useNotify } from '../../hooks/useNotify';

const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

const tokenGuard = () => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Authentication token missing");
  return token;
};

/**
 * Shared editor for a single Testing sub-item (Primary or Final).
 * If `workOrderId` is null, the work order is created first using
 * `orderId` + `instanceGroupId` (mirrors the Motor page's on-demand
 * work-order creation for stage dates). Non-Motor callers should
 * already guarantee a workOrderId exists before opening this.
 */
export default function TestingEditor({
  orderId,
  workOrderId,
  instanceGroupId,
  testingType,
  initialQty,
  initialDate,
  initialControllerType,
  onClose,
  onSaved,
}) {
  const [qty, setQty] = useState(initialQty ?? "");
  const [date, setDate] = useState(initialDate ?? "");
  const [controllerType, setControllerType] = useState(initialControllerType ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { notifySuccess, notifyError } = useNotify();

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const token = tokenGuard();
      let woId = workOrderId;

      if (!woId) {
        const createRes = await fetch(`${getBackendUrl()}/api/process/${orderId}/work-orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          credentials: "include",
          body: JSON.stringify({ instance_group_id: instanceGroupId }),
        });
        if (!createRes.ok) throw new Error("Failed to create work order");
        const wo = await createRes.json();
        woId = wo.workOrderId;
      }

      const res = await fetch(`${getBackendUrl()}/api/process/work-orders/${woId}/testing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify({
          testing_type: testingType,
          qty: qty === "" ? null : Number(qty),
          test_date: date || null,
          controller_type: controllerType || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to save testing result");
      }

      notifySuccess("Testing result saved");
      onSaved();
    } catch (err) {
      setError(err.message || "Failed to save testing result");
      notifyError(err.message || "Failed to save testing result");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          {testingType} Testing
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
            <input
              type="number"
              min="0"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Controller Type</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
              value={controllerType}
              onChange={(e) => setControllerType(e.target.value)}
              placeholder="e.g. Sine wave controller X"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border" disabled={saving}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
