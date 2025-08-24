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

const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

async function safeJson(res) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

const STAGE_LIST = ["Assembly", "Testing", "PDI", "Packing", "Dispatch"];
const normalizeStages = (existing = []) => {
  const by = new Map(existing.map(s => [s.stageName, s.stageDate || ""]));
  return STAGE_LIST.map(name => ({ name, date: by.get(name) || "" }));
};

export default function CreateMotorProcess() {
  const { orderId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [components, setComponents] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedComponentId, setSelectedComponentId] = useState(null);

  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState("");
  const [componentMaterials, setComponentMaterials] = useState([]);
  const [editMaterial, setEditMaterial] = useState(null);

  const [processLocalState, setProcessLocalState] = useState({});
  const [editRow, setEditRow] = useState(null);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [stages, setStages] = useState(STAGE_LIST.map(n => ({ name: n, date: "" })));
  const [stagesLoading, setStagesLoading] = useState(false);
  const [stagesError, setStagesError] = useState("");
  const [stagesSaving, setStagesSaving] = useState(false);

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

useEffect(() => {
  if (!showStatusModal || !orderId) return;

  const haveAnyLocalDates = stages.some(s => Boolean(s.date));
  if (haveAnyLocalDates) return;

  const loadStages = async () => {
    setStagesLoading(true);
    setStagesError("");
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      const res = await fetch(`${getBackendUrl()}/api/process/${orderId}?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || `Failed to fetch order stages (${res.status})`);
      }

      const data = await res.json();
      const existing = data?.workOrders?.[0]?.orderStages || [];
      setStages(normalizeStages(existing));
    } catch (e) {
      setStagesError(e.message || "Unable to load order stages");
    } finally {
      setStagesLoading(false);
    }
  };

  loadStages();
}, [showStatusModal, orderId]);  


  const saveStages = async () => {
    if (!orderId) return;
    setStagesSaving(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      const toSave = stages.filter(s => s.date);
      let warnings = [];

      for (const s of toSave) {
        const res = await fetch(`${getBackendUrl()}/api/process/${orderId}/stages`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({ stage_name: s.name, stage_date: s.date }),
        });

        if (!res.ok) {
          const data = await safeJson(res);
          warnings.push(`${s.name}: ${data?.error || `Failed (${res.status})`}`);
        }
      }

      if (warnings.length) {
        alert(`Some stages could not be saved:\n\n${warnings.join("\n")}`);
      } else {

      }

      setShowStatusModal(false);
    } catch (e) {
      alert(e.message || "Failed to save stages");
    } finally {
      setStagesSaving(false);
    }
  };

  const hasAnyDate = stages.some(s => s.date);
  const nextDate = stages.map(s => s.date).filter(Boolean).sort()[0] || "";

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
        <div className="lg:col-span-2 space-y-6">
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

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Package size={18} className="text-amber-600" />
              Raw Materials Needed for:{" "}
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
                      {"requiredQuantity" in rm && (
                        <p className="text-sm text-gray-600">
                          Required Quantity: <span className="font-medium">{rm.requiredQuantity}</span>
                        </p>
                      )}
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

        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 sticky top-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Status</h3>

            <div className="space-y-2 text-sm text-gray-700 mb-4">
              {stages.map(s => (
                <div key={s.name} className="flex justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-gray-600">{s.date || "—"}</span>
                </div>
              ))}
            </div>

            <div className="text-xs text-gray-500 mb-4">
              {hasAnyDate ? (
                <span>
                  Next target date: <span className="font-medium">{nextDate}</span>
                </span>
              ) : (
                <span>No target dates set</span>
              )}
            </div>

            <button
              onClick={() => setShowStatusModal(true)}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2.5 font-medium"
            >
              Edit Stages
            </button>
          </div>
        </div>
      </div>

      {showStatusModal && (
        <Modal
          title="Order Status"
          onClose={() => setShowStatusModal(false)}
          widthClass="max-w-2xl"
        >
          {stagesLoading ? (
            <p className="text-gray-600">Loading current stages…</p>
          ) : (
            <>
              {stagesError && (
                <div className="mb-4 flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <AlertCircle className="mt-0.5" size={18} />
                  <div>
                    <p className="font-medium">Couldn’t load existing stages</p>
                    <p className="text-sm">{stagesError}</p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-3 pr-4">Task</th>
                      <th className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={14} /> Target Date
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((s, idx) => (
                      <tr key={s.name} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-medium text-gray-900">{s.name}</td>
                        <td className="py-3 pr-4">
                          <input
                            type="date"
                            value={s.date}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStages(prev => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], date: val };
                                return copy;
                              });
                            }}
                            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  onClick={() => setStages(STAGE_LIST.map(n => ({ name: n, date: "" })))}
                  className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                  disabled={stagesSaving}
                >
                  Reset
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowStatusModal(false)}
                    className="px-4 py-2 rounded-lg border hover:bg-gray-50"
                    disabled={stagesSaving}
                  >
                    Close
                  </button>
                  <button
                    onClick={saveStages}
                    className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                    disabled={stagesSaving}
                  >
                    {stagesSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

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

      {editMaterial && (
        <Modal
          title={`Edit Material: Raw Material ID ${editMaterial.rawMaterialId}`}
          onClose={() => setEditMaterial(null)}
        >
          <MaterialEditor
            material={editMaterial}
            onCancel={() => setEditMaterial(null)}
            onSave={(quantityPerUnit, requiredQuantity) =>
              saveMaterialEdits(editMaterial, quantityPerUnit, requiredQuantity)
            }
          />
        </Modal>
      )}
    </div>
  );
}