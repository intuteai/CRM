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
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className={`w-full ${widthClass}`}>
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="sticky top-4 right-4 float-right text-gray-500 hover:text-gray-700 z-10"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assembly Name *
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
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
            <strong>Type:</strong> <span className="text-blue-600">Non-Motor</span>
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

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Assembly"}
          </button>
        </div>
      </form>
    </Modal>
  );
}