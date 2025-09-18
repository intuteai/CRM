import React, { useState } from "react";
import { toast } from "react-toastify";
import { X } from "lucide-react";

// Utility to get backend URL (copied from CreateMotorProcess for consistency)
const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

// Modal component (reused from CreateMotorProcess for consistency)
const Modal = ({ title, onClose, children, widthClass = "max-w-2xl" }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className={`w-full ${widthClass}`}>
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
          aria-label="Close"
        >
          <X size={22} />
        </button>
        <div className="p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  </div>
);

function AddMotorModal({ orderId, customerName, onClose, onCreated }) {
  const [instanceName, setInstanceName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    // Input validation
    if (!instanceName.trim()) {
      setError("Instance name is required");
      setBusy(false);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      const response = await fetch(
        `${getBackendUrl()}/api/process/${orderId}/instance-groups`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            instance_name: instanceName.trim(),
            instance_type: "Motor",
          }),
        }
      );

      if (!response.ok) {
        const data = await response.text().then((txt) => {
          try {
            return JSON.parse(txt);
          } catch {
            return { error: txt || "Failed to create motor" };
          }
        });
        throw new Error(data.error || `Failed to create motor (${response.status})`);
      }

      const newMotor = await response.json();
      toast.success(`Motor "${newMotor.instanceName}" created`);
      onCreated(); // Call refetchAll to refresh motor list
      onClose(); // Close modal
    } catch (e) {
      setError(e.message || "Failed to create motor");
      toast.error(e.message || "Failed to create motor");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Add Motor for Order #${orderId}${customerName ? ` — ${customerName}` : ""}`}
      onClose={onClose}
      widthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Motor Name
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
            placeholder="e.g., Motor A"
            disabled={busy}
          />
        </div>
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border hover:bg-gray-50"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Creating…" : "Create Motor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default AddMotorModal;