import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  ChevronDown,
  Pencil,
  X,
  Calendar,
  User,
  Package,
  AlertCircle,
} from "lucide-react";

// ---------- Small UI primitives ----------
const Modal = ({ title, onClose, children, widthClass = "max-w-lg" }) => (
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

function StatusEditor({ task, targetDate, onCancel, onSave }) {
  const [t, setT] = useState(task || "");
  const [d, setD] = useState(targetDate || "");
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-700 mb-1">Task</label>
        <input
          type="text"
          value={t}
          onChange={(e) => setT(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          placeholder="Define the task…"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Target Date</label>
        <input
          type="date"
          value={d}
          onChange={(e) => setD(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
        />
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() => onSave(t, d)}
          className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function ProcessRowEditor({ row, onChange, onCancel, onSave }) {
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-700 mb-1">Qty of Raw Material Used</label>
        <input
          type="text"
          value={row.rawQtyUsed || ""}
          onChange={(e) => onChange({ ...row, rawQtyUsed: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          placeholder="e.g., 1 sheet / 8 rods"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Responsible Person</label>
        <input
          type="text"
          value={row.responsible || ""}
          onChange={(e) => onChange({ ...row, responsible: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          placeholder="e.g., Asha"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">Target Date</label>
        <input
          type="date"
          value={row.targetDate || ""}
          onChange={(e) => onChange({ ...row, targetDate: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
        />
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={onSave}
          className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function MaterialEditor({ material, onCancel, onSave }) {
  const [quantityPerUnit, setQuantityPerUnit] = useState(material.quantityPerUnit || 0);
  const [requiredQuantity, setRequiredQuantity] = useState(material.requiredQuantity || 0);
  const [error, setError] = useState("");

  const handleSave = () => {
    const qtyPerUnit = Number(quantityPerUnit);
    const reqQty = Number(requiredQuantity);
    if (!Number.isInteger(qtyPerUnit) || qtyPerUnit < 0) {
      setError("Quantity per unit must be a non-negative integer");
      return;
    }
    if (!Number.isInteger(reqQty) || reqQty < 0) {
      setError("Required quantity must be a non-negative integer");
      return;
    }
    if (qtyPerUnit < reqQty) {
      setError("Required quantity cannot exceed quantity per unit");
      return;
    }
    setError("");
    onSave(qtyPerUnit, reqQty);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-700 mb-1">
          Quantity per Unit (Raw Material ID: {material.rawMaterialId})
        </label>
        <input
          type="number"
          value={quantityPerUnit}
          onChange={(e) => setQuantityPerUnit(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          placeholder="Enter quantity per unit"
          min="0"
          step="1"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-700 mb-1">
          Required Quantity (Raw Material ID: {material.rawMaterialId})
        </label>
        <input
          type="number"
          value={requiredQuantity}
          onChange={(e) => setRequiredQuantity(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          placeholder="Enter required quantity"
          min="0"
          step="1"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
        >
          Save
        </button>
      </div>
    </form>
  );
}

// ---------- Helpers ----------
const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

async function safeJson(res) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

// ---------- Main ----------
export default function CreateMotorProcess() {
  const { orderId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // components + processes
  const [components, setComponents] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState(null);

  // raw materials (per selected component)
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [componentMaterials, setComponentMaterials] = useState([]);
  const [editMaterial, setEditMaterial] = useState(null);

  // order status card
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusEditMode, setStatusEditMode] = useState(false);
  const [orderTask, setOrderTask] = useState("Initial Fit-Up");
  const [orderTargetDate, setOrderTargetDate] = useState("");

  // per-process local edits (rawQtyUsed, responsible, targetDate)
  const [processLocalState, setProcessLocalState] = useState({});
  const [editRow, setEditRow] = useState(null);

  // ----- initial load: components (with processes) -----
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Authentication token missing");

        const url = `${getBackendUrl()}/api/process/components`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });

        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error(data?.error || `Failed to fetch components (${res.status})`);
        }

        const list = await res.json();
        setComponents(Array.isArray(list) ? list : []);
        const shell = list.find((c) => c.componentName?.toLowerCase() === "shell");
        const firstId = shell?.componentId ?? list[0]?.componentId ?? null;
        setSelectedComponentId(firstId);
      } catch (e) {
        setError(e.message || "Failed to load components");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // ----- load materials for selected component -----
  useEffect(() => {
    if (!selectedComponentId) return;
    const run = async () => {
      setMaterialsLoading(true);
      setMaterialsError("");
      setComponentMaterials([]);
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Authentication token missing");

        const url = `${getBackendUrl()}/api/process/components/${selectedComponentId}/materials`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });

        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error(data?.error || `Failed to fetch materials (${res.status})`);
        }

        const rows = await res.json();
        setComponentMaterials(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setMaterialsError(e.message || "Failed to load materials");
      } finally {
        setMaterialsLoading(false);
      }
    };
    run();
  }, [selectedComponentId]);

  // ----- save material edits -----
  const saveMaterialEdits = async (material, newQuantityPerUnit, newRequiredQuantity) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      const url = `${getBackendUrl()}/api/process/components/${material.componentId}/materials/${material.materialId}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ quantity_per_unit: newQuantityPerUnit, required_quantity: newRequiredQuantity }),
      });

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || `Failed to update material (${res.status})`);
      }

      const updatedMaterial = await res.json();
      setComponentMaterials((prev) =>
        prev.map((m) =>
          m.materialId === material.materialId
            ? { ...m, quantityPerUnit: updatedMaterial.quantityPerUnit, requiredQuantity: updatedMaterial.requiredQuantity }
            : m
        )
      );
      setEditMaterial(null);
    } catch (e) {
      setMaterialsError(e.message || "Failed to save material changes");
    }
  };

  // ----- derived state -----
  const options = useMemo(
    () => components.map((c) => ({ value: c.componentId, label: c.componentName })),
    [components]
  );

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedComponent = useMemo(
    () => components.find((c) => c.componentId === Number(selectedComponentId)),
    [components, selectedComponentId]
  );

  const processes = useMemo(() => {
    const base = (selectedComponent?.processes || [])
      .slice()
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return base.map((p) => {
      const local = processLocalState[p.processId] || {};
      return {
        id: p.processId,
        sequence: p.sequence,
        name: p.processName,
        responsible: local.responsible ?? p.responsiblePerson ?? "",
        rawQtyUsed: local.rawQtyUsed ?? "",
        targetDate: local.targetDate ?? "",
      };
    });
  }, [selectedComponent, processLocalState]);

  // ----- handlers -----
  const handleSearch = () => {
    const first = filteredOptions[0];
    if (first) setSelectedComponentId(first.value);
  };

  const openEdit = (row) => setEditRow({ ...row });

  const saveRowEdits = () => {
    if (!editRow) return;
    setProcessLocalState((prev) => ({
      ...prev,
      [editRow.id]: {
        rawQtyUsed: editRow.rawQtyUsed,
        responsible: editRow.responsible,
        targetDate: editRow.targetDate,
      },
    }));
    setEditRow(null);
  };

  const openMaterialEdit = (material) => setEditMaterial({ ...material });

  // ---------- render ----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Loading components…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-red-700 p-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle />
          <span className="font-semibold">Error</span>
        </div>
        <p className="text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Search + Select + Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Search + Select */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label htmlFor="component-search" className="block text-sm text-gray-600 mb-1">
                  Search by Component
                </label>
                <div className="relative">
                  <input
                    id="component-search"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g., Shell, Rotor, Stator"
                    className="w-full px-4 py-3 pl-10 border rounded-xl focus:ring-2 focus:ring-amber-300"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                </div>
              </div>
              <button
                onClick={handleSearch}
                className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium"
              >
                Search
              </button>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-600 mb-1">Select Component</label>
              <div className="relative">
                <select
                  className="w-full px-4 py-3 border rounded-xl appearance-none focus:ring-2 focus:ring-amber-300"
                  value={selectedComponentId ?? ""}
                  onChange={(e) => setSelectedComponentId(Number(e.target.value))}
                >
                  {filteredOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Raw Material Required */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Package size={18} className="text-amber-600" />
              Raw Material Required —{" "}
              <span className="font-normal text-gray-600">{selectedComponent?.componentName || "—"}</span>
            </h3>

            {materialsLoading ? (
              <p className="text-gray-600">Loading materials…</p>
            ) : materialsError ? (
              <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertCircle className="mt-0.5" size={18} />
                <div>
                  <p className="font-medium">Materials unavailable</p>
                  <p className="text-sm">{materialsError}</p>
                </div>
              </div>
            ) : componentMaterials.length ? (
              <ul className="divide-y">
                {componentMaterials.map((rm) => (
                  <li key={rm.materialId ?? `${rm.componentId}-${rm.rawMaterialId}`} className="py-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">Raw Material ID: {rm.rawMaterialId}</p>
                      <p className="text-sm text-gray-600">
                        Quantity / unit: <span className="font-medium">{rm.quantityPerUnit}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Required Quantity: <span className="font-medium">{rm.requiredQuantity}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {typeof rm.materialId !== "undefined" && (
                        <span className="text-xs text-gray-500">material_id: {rm.materialId}</span>
                      )}
                      <button
                        onClick={() => openMaterialEdit(rm)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-amber-50"
                      >
                        <Pencil size={16} className="text-amber-600" />
                        Edit
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">No materials listed.</p>
            )}
          </div>

          {/* Processes */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Processes</h3>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-3 pr-4">Seq</th>
                    <th className="py-3 pr-4">Process Name</th>
                    <th className="py-3 pr-4">Qty of Raw Material Used</th>
                    <th className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1">
                        <User size={14} /> Responsible
                      </span>
                    </th>
                    <th className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={14} /> Target Date
                      </span>
                    </th>
                    <th className="py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.length ? (
                    processes.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 text-gray-500">{p.sequence}</td>
                        <td className="py-3 pr-4 font-medium text-gray-900">{p.name}</td>
                        <td className="py-3 pr-4">{p.rawQtyUsed || "—"}</td>
                        <td className="py-3 pr-4">{p.responsible || "—"}</td>
                        <td className="py-3 pr-4">{p.targetDate || "—"}</td>
                        <td className="py-3">
                          <button
                            onClick={() => openEdit({ ...p })}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-amber-50"
                          >
                            <Pencil size={16} className="text-amber-600" />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-4 text-gray-500" colSpan={6}>
                        No processes listed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT: Order Status */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 sticky top-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Status</h3>
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">Task:</span> {orderTask || "—"} <br />
              <span className="font-medium">Target:</span> {orderTargetDate || "—"}
            </p>
            <button
              onClick={() => setShowStatusModal(true)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2.5 font-medium"
            >
              Define / Edit
            </button>
          </div>
        </div>
      </div>

      {/* Order Status Modal */}
      {showStatusModal && (
        <Modal
          title="Order Status"
          onClose={() => {
            setShowStatusModal(false);
            setStatusEditMode(false);
          }}
        >
          {!statusEditMode ? (
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Task:</span> {orderTask || "—"}
                </p>
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Target Date:</span> {orderTargetDate || "—"}
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setStatusEditMode(true)}
                  className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                >
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <StatusEditor
              task={orderTask}
              targetDate={orderTargetDate}
              onCancel={() => setStatusEditMode(false)}
              onSave={(t, d) => {
                setOrderTask(t);
                setOrderTargetDate(d);
                setStatusEditMode(false);
                setShowStatusModal(false);
              }}
            />
          )}
        </Modal>
      )}

      {/* Edit Process Row Modal */}
      {editRow && (
        <Modal title={`Edit: ${editRow.name}`} onClose={() => setEditRow(null)}>
          <ProcessRowEditor
            row={editRow}
            onChange={setEditRow}
            onCancel={() => setEditRow(null)}
            onSave={saveRowEdits}
          />
        </Modal>
      )}

      {/* Edit Material Modal */}
      {editMaterial && (
        <Modal
          title={`Edit Material: Raw Material ID ${editMaterial.rawMaterialId}`}
          onClose={() => setEditMaterial(null)}
        >
          <MaterialEditor
            material={editMaterial}
            onCancel={() => setEditMaterial(null)}
            onSave={(quantityPerUnit, requiredQuantity) => saveMaterialEdits(editMaterial, quantityPerUnit, requiredQuantity)}
          />
        </Modal>
      )}
    </div>
  );
}