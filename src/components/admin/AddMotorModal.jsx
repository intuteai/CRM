import React, { useState } from "react";
import { X } from "lucide-react";
import { useNotify } from '../../hooks/useNotify';

const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

// Modal component (reused from CreateMotorProcess for consistency)
const Modal = ({ title, onClose, children, widthClass = "max-w-2xl" }) => (
  <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
    <div className={`w-full ${widthClass}`}>
      <div className="relative bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-navy-800 transition-colors"
          aria-label="Close"
        >
          <X size={22} />
        </button>
        <div className="p-4 sm:p-6 border-b border-navy-100">
          <h3 className="font-display text-xl font-bold text-navy-800 pr-8">{title}</h3>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  </div>
);

function AddMotorModal({ orderId, customerName, onClose, onCreated }) {
  const [instanceName, setInstanceName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { notifySuccess, notifyError } = useNotify();

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
      notifySuccess(`Motor "${newMotor.instanceName}" created`);
      onCreated(); // Call refetchAll to refresh motor list
      onClose(); // Close modal
    } catch (e) {
      setError(e.message || "Failed to create motor");
      notifyError(e.message || "Failed to create motor");
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
          <label className="block text-sm font-medium text-navy-800 mb-1">
            Motor Name
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            className="w-full px-3 py-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
            placeholder="e.g., Motor A"
            disabled={busy}
          />
        </div>
        {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-gold-500 text-navy-900 hover:bg-gold-400 transition-colors disabled:opacity-60"
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
