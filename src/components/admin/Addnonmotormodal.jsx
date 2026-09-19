import React, { useState } from "react";
import { X } from "lucide-react";
import { useNotify } from '../../hooks/useNotify';

const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

async function safeJson(res) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

const Modal = ({ title, onClose, children, widthClass = "max-w-2xl" }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4">
    <div className={`w-full ${widthClass}`}>
      <div className="relative bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <h3 className="font-display text-xl font-bold text-navy-800 mb-5 pr-8">{title}</h3>
        {children}
      </div>
    </div>
  </div>
);

export default function AddNonMotorModal({ orderId, customerName, onClose, onCreated }) {
  const [instanceName, setInstanceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { notifySuccess, notifyError } = useNotify();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!instanceName.trim()) {
      setError("Assembly name is required");
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      const res = await fetch(
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
            instance_type: "Non-Motor", // Fixed to Non-Motor
          }),
        }
      );

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }

      notifySuccess("Non-motor assembly created successfully");
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      console.error("Create non-motor failed:", err);
      setError(err.message || "Failed to create non-motor assembly");
      notifyError(err.message || "Failed to create non-motor assembly");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`Add Non-Motor Assembly — ${customerName}`}
      onClose={onClose}
      widthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Non-Motor Assembly:</strong> Create a non-motor item that consists of 
            multiple components. You can add components and track stage progress without 
            detailed process or material tracking.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1">
            Assembly Name *
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            className="w-full p-3 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
            placeholder="e.g., Control Panel Assembly, Wiring Harness, etc."
            disabled={loading}
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Give this assembly a descriptive name
          </p>
        </div>

        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="text-sm text-gray-700">
            <strong>Type:</strong> <span className="text-navy-700 font-medium">Non-Motor</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            This will be tracked through stages only (Assembly, Testing, PDI, Packing, Dispatch)
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-navy-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Assembly"}
          </button>
        </div>
      </form>
    </Modal>
  );
}