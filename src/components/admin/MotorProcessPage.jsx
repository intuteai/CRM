import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { toast, ToastContainer } from "react-toastify";
import {
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  X,
  Calendar,
  Package,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

/* ========================================
   UTILITIES & HELPERS
   ======================================== */

const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

async function safeJson(res) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : null;
  } catch {
    return null;
  }
}

const tokenGuard = () => {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Authentication token missing");
  return token;
};

const STATUS_COLUMNS = {
  Pending: { label: "Yet To Start", color: "bg-gray-100 border-gray-300" },
  "In Progress": { label: "In Progress", color: "bg-blue-100 border-blue-300" },
  Completed: { label: "Completed", color: "bg-green-100 border-green-300" },
};

const STATUS_OPTIONS = ["Pending", "In Progress", "Completed"];

const statusBadgeClass = (status) => {
  switch (status) {
    case "Completed":
      return "bg-green-600 text-white";
    case "In Progress":
      return "bg-yellow-600 text-white";
    case "Pending":
    default:
      return "bg-gray-400 text-white";
  }
};

// Derive component status from its processes — only look at backend-provided status
const deriveComponentStatus = (component) => {
  if (!component?.processes?.length) return "Pending";
  
  const processes = component.processes;
  const allCompleted = processes.every(p => p.status === "Completed");
  const anyInProgress = processes.some(p => p.status === "In Progress");
  
  if (allCompleted) return "Completed";
  if (anyInProgress) return "In Progress";
  return "Pending";
};

/* ========================================
   MODAL COMPONENT
   ======================================== */

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

/* ========================================
   CREATE WORK ORDER FORM
   ======================================== */

function CreateWorkOrderForm({ orderId, instanceGroups, onClose, onCreated }) {
  const [instanceGroupId, setInstanceGroupId] = useState("");
  const [targetDate, setTargetDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!instanceGroupId) {
      toast.error("Please select a motor/instance");
      return;
    }

    setLoading(true);
    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/${orderId}/work-orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            instance_group_id: instanceGroupId,
            target_date: targetDate,
          }),
        }
      );

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || `Failed to create work order (${res.status})`);
      }

      const workOrder = await res.json();
      toast.success("Work order created successfully");
      onCreated(workOrder);
      onClose();
    } catch (error) {
      toast.error(error.message || "Failed to create work order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Motor / Instance *
        </label>
        <select
          value={instanceGroupId}
          onChange={(e) => setInstanceGroupId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
          required
        >
          <option value="">Select Motor/Instance</option>
          {instanceGroups.map((ig) => (
            <option key={ig.instanceGroupId} value={ig.instanceGroupId}>
              {ig.instanceName} ({ig.instanceType})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Date
        </label>
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Work Order"}
        </button>
      </div>
    </form>
  );
}

/* ========================================
   ADD COMPONENT TO WORK ORDER FORM
   ======================================== */

function AddComponentForm({ workOrder, components, onClose, onAdded }) {
  const [componentId, setComponentId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!componentId) {
      toast.error("Please select a component");
      return;
    }

    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      toast.error("Quantity must be a positive integer");
      return;
    }

    setLoading(true);
    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/work-orders/${workOrder.workOrderId}/components`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            component_id: componentId,
            quantity: Number(quantity),
          }),
        }
      );

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || `Failed to add component (${res.status})`);
      }

      const component = await res.json();
      toast.success("Component added to work order");
      onAdded(component);
      onClose();
    } catch (error) {
      toast.error(error.message || "Failed to add component");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Component *
        </label>
        <select
          value={componentId}
          onChange={(e) => setComponentId(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
          required
        >
          <option value="">Select Component</option>
          {components.map((comp) => (
            <option key={comp.componentId} value={comp.componentId}>
              {comp.componentName} ({comp.productType})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Quantity *
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
          required
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg border hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add Component"}
        </button>
      </div>
    </form>
  );
}

/* ========================================
   ENHANCED PROCESS DETAIL MODAL WITH IN_USE AND COMPLETED
   ======================================== */

function ProcessDetailModal({ workOrderComponent, onClose, onUpdate }) {
  const [processes, setProcesses] = useState(workOrderComponent.processes || []);
  const [materials, setMaterials] = useState(workOrderComponent.materials || []);
  const [availableStock, setAvailableStock] = useState([]);
  const [activeTab, setActiveTab] = useState("materials");
  
  const [editingProcess, setEditingProcess] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  
  const [processFormData, setProcessFormData] = useState({
    completedQuantity: 0,
    inUseQuantity: 0,
    completionDate: "",
    responsiblePerson: "",
  });

  const [materialFormData, setMaterialFormData] = useState({
    rawMaterialId: "",
    quantity: 1,
  });

  const totalPlannedMaterial = useMemo(() => 
    materials.reduce((sum, m) => sum + m.quantity, 0), 
    [materials]
  );

  const canEditProcesses = materials.length > 0;

  useEffect(() => {
    if (!materials.length) {
      toast.error("⚠️ REQUIRED: Please add raw materials first before updating processes!", {
        autoClose: false,
        closeButton: true,
      });
    }
  }, [materials]);

  useEffect(() => {
    fetchMaterials();
    fetchAvailableStock();
  }, [workOrderComponent.workOrderComponentId]);

  const fetchMaterials = async () => {
    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${workOrderComponent.workOrderComponentId}/materials`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );

      if (res.ok) {
        const data = await res.json();
        setMaterials(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch materials:", err);
    }
  };

  const fetchAvailableStock = async () => {
    try {
      const token = tokenGuard();
      const res = await fetch(`${getBackendUrl()}/api/stock`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setAvailableStock(data.stock || []);
      }
    } catch (error) {
      console.error("Failed to fetch stock:", error);
    }
  };

  const startEditProcess = (process) => {
    if (!canEditProcesses) {
      toast.error("❌ Cannot edit process: Please add raw materials first in the 'Raw Materials' tab");
      setActiveTab("materials");
      return;
    }

    setEditingProcess(process);
    setProcessFormData({
      completedQuantity: process.completedQuantity || 0,
      inUseQuantity: process.inUseQuantity || 0,
      completionDate: process.completionDate || "",
      responsiblePerson: process.responsiblePerson || "",
    });
  };

  const handleSaveProcess = async () => {
    if (!editingProcess) return;

    const completedQty = Number(processFormData.completedQuantity);
    const inUseQty = Number(processFormData.inUseQuantity);

    if (!Number.isInteger(completedQty) || completedQty < 0) {
      toast.error("Completed quantity must be a non-negative integer");
      return;
    }

    if (!Number.isInteger(inUseQty) || inUseQty < 0) {
      toast.error("In-use quantity must be a non-negative integer");
      return;
    }

    if (!canEditProcesses) {
      toast.error("Cannot update process without raw materials assigned");
      return;
    }

    if (completedQty > totalPlannedMaterial) {
      toast.error(
        `Completed quantity (${completedQty}) cannot exceed planned material (${totalPlannedMaterial} units)`
      );
      return;
    }

    try {
      const token = tokenGuard();

      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${workOrderComponent.workOrderComponentId}/process-status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            process_id: editingProcess.processId,
            completed_quantity: completedQty,
            in_use_quantity: inUseQty,
            completion_date: processFormData.completionDate || null,
            responsible_person: processFormData.responsiblePerson || null,
          }),
        }
      );

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || `Failed to update process (${res.status})`);
      }

      const updated = await res.json();

      setProcesses((prev) =>
        prev.map((p) =>
          p.processId === editingProcess.processId
            ? {
                ...p,
                status: updated.status,
                completedQuantity: updated.completed_quantity,
                inUseQuantity: updated.in_use_quantity,
                completionDate: updated.completion_date,
                responsiblePerson: updated.responsible_person,
              }
            : p
        )
      );

      toast.success("Process updated successfully");
      setEditingProcess(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.message || "Failed to update process");
    }
  };

  const handleAddMaterial = async (e) => {
    e.preventDefault();

    const rawMaterialId = Number(materialFormData.rawMaterialId);
    const quantity = Number(materialFormData.quantity);

    if (!rawMaterialId || !Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Please select a material and enter a valid quantity");
      return;
    }

    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${workOrderComponent.workOrderComponentId}/materials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            raw_material_id: rawMaterialId,
            quantity: quantity,
          }),
        }
      );

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to add material");
      }

      const newMaterial = await res.json();
      
      const stockItem = availableStock.find(s => s.productId === rawMaterialId);
      
      setMaterials((prev) => [
        ...prev.filter(m => m.rawMaterialId !== rawMaterialId),
        {
          workOrderMaterialId: newMaterial.workOrderMaterialId,
          rawMaterialId: newMaterial.rawMaterialId,
          rawMaterialName: stockItem?.productName || "Unknown",
          quantity: newMaterial.quantity,
        },
      ]);

      toast.success("✅ Material added! You can now update processes.", {
        autoClose: 3000,
      });
      setShowAddMaterial(false);
      setMaterialFormData({ rawMaterialId: "", quantity: 1 });
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.message || "Failed to add material");
    }
  };

  const handleDeleteMaterial = async (materialId) => {
    if (!window.confirm("Are you sure you want to delete this material?")) {
      return;
    }

    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${workOrderComponent.workOrderComponentId}/materials/${materialId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );

      if (!res.ok) {
        throw new Error("Failed to delete material");
      }

      setMaterials((prev) => prev.filter(m => m.workOrderMaterialId !== materialId));
      toast.success("Material deleted successfully");
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.message || "Failed to delete material");
    }
  };

  return (
    <Modal
      title={`${workOrderComponent.componentName} - Details`}
      onClose={onClose}
      widthClass="max-w-5xl"
    >
      <div className="space-y-4">
        {/* Component Info */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Component:</span>{" "}
              <span className="font-medium">{workOrderComponent.componentName}</span>
            </div>
            <div>
              <span className="text-gray-600">Type:</span>{" "}
              <span className="font-medium">{workOrderComponent.productType}</span>
            </div>
            <div>
              <span className="text-gray-600">Quantity:</span>{" "}
              <span className="font-medium">{workOrderComponent.quantity}</span>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        {!canEditProcesses && (
          <div className="bg-red-50 border-2 border-red-300 p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={24} />
              <div>
                <h4 className="font-bold text-red-900 mb-1">Action Required: Add Raw Materials</h4>
                <p className="text-sm text-red-800">
                  You must assign raw materials before you can update process status. 
                  Click the <strong>"Raw Materials"</strong> tab below and add at least one material.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Material Summary */}
        {canEditProcesses && (
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">
                ✅ Total Planned Material: {totalPlannedMaterial} units
              </span>
              <div className="text-xs text-blue-700">
                <span className="font-semibold">
                  {processes.reduce((sum, p) => sum + (p.completedQuantity || 0), 0)} completed
                </span>
                {" • "}
                <span className="font-semibold">
                  {processes.reduce((sum, p) => sum + (p.inUseQuantity || 0), 0)} in use
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab("materials")}
              className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                activeTab === "materials"
                  ? "border-blue-600 text-blue-600"
                  : !canEditProcesses 
                    ? "border-red-500 text-red-600 animate-pulse" 
                    : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Raw Materials ({materials.length})
              {!canEditProcesses && (
                <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                  Required
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("processes")}
              className={`px-4 py-2 border-b-2 font-medium transition-colors ${
                activeTab === "processes"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              } ${!canEditProcesses ? "opacity-50" : ""}`}
              disabled={!canEditProcesses}
            >
              Processes ({processes.length})
            </button>
          </div>
        </div>

        {/* Materials Tab */}
        {activeTab === "materials" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold text-gray-700">Planned Raw Materials</h4>
              <button
                onClick={() => setShowAddMaterial(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
              >
                <Plus size={16} />
                Add Material
              </button>
            </div>

            {materials.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-2 pr-4">Material Name</th>
                      <th className="py-2 pr-4">Quantity Required</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((material) => (
                      <tr key={material.workOrderMaterialId} className="border-b hover:bg-gray-50">
                        <td className="py-2 pr-4 font-medium">{material.rawMaterialName}</td>
                        <td className="py-2 pr-4">{material.quantity}</td>
                        <td className="py-2">
                          <button
                            onClick={() => handleDeleteMaterial(material.workOrderMaterialId)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete material"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Package className="mx-auto mb-3 text-gray-400" size={48} />
                <p className="text-gray-600 font-medium mb-2">No materials assigned yet</p>
                <p className="text-sm text-gray-500 mb-4">
                  Add raw materials to enable process tracking
                </p>
                <button
                  onClick={() => setShowAddMaterial(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
                >
                  <Plus size={18} />
                  Add Your First Material
                </button>
              </div>
            )}
          </div>
        )}

        {/* Processes Tab */}
        {activeTab === "processes" && (
          <div className="space-y-4">
            {!canEditProcesses && (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800">
                <p className="font-medium">⚠️ Processes are locked</p>
                <p>Add raw materials in the "Raw Materials" tab to unlock process editing.</p>
              </div>
            )}
            
            {processes.length ? (
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-[1100px] text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      <th className="py-2 pr-4">Seq</th>
                      <th className="py-2 pr-4">Process Name</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">In Use</th>
                      <th className="py-2 pr-4">Completed</th>
                      <th className="py-2 pr-4">Responsible</th>
                      <th className="py-2 pr-4">Target Date</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((process) => (
                      <tr key={process.processId} className="border-b hover:bg-gray-50">
                        <td className="py-2 pr-4">{process.sequence}</td>
                        <td className="py-2 pr-4 font-medium">{process.processName}</td>
                        <td className="py-2 pr-4">
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${statusBadgeClass(
                              process.status
                            )}`}
                          >
                            {process.status || "Pending"}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          {canEditProcesses ? (
                            <span className="font-medium text-blue-600">{process.inUseQuantity || 0}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {canEditProcesses ? (
                            <>
                              <span className="font-medium">{process.completedQuantity || 0}</span>
                              <span className="text-gray-500"> / {totalPlannedMaterial}</span>
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">{process.responsiblePerson || "—"}</td>
                        <td className="py-2 pr-4">{process.completionDate || "—"}</td>
                        <td className="py-2">
                          <button
                            onClick={() => startEditProcess(process)}
                            disabled={!canEditProcesses}
                            className={`${
                              canEditProcesses 
                                ? "text-blue-600 hover:text-blue-800" 
                                : "text-gray-300 cursor-not-allowed"
                            }`}
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                No processes defined for this component
              </p>
            )}
          </div>
        )}
      </div>

      {/* Edit Process Modal */}
      {editingProcess && (
        <Modal
          title={`Edit: ${editingProcess.processName}`}
          onClose={() => setEditingProcess(null)}
          widthClass="max-w-lg"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                In-Use Quantity *
                <span className="text-xs text-gray-500 ml-2">
                  (Materials currently being worked on)
                </span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={processFormData.inUseQuantity}
                onChange={(e) =>
                  setProcessFormData({ ...processFormData, inUseQuantity: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Completed Quantity *
                <span className="text-xs text-gray-500 ml-2">
                  (Max: {totalPlannedMaterial} units)
                </span>
              </label>
              <input
                type="number"
                min="0"
                max={totalPlannedMaterial}
                step="1"
                value={processFormData.completedQuantity}
                onChange={(e) =>
                  setProcessFormData({ ...processFormData, completedQuantity: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsible Person
              </label>
              <input
                type="text"
                value={processFormData.responsiblePerson}
                onChange={(e) =>
                  setProcessFormData({ ...processFormData, responsiblePerson: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                placeholder="e.g., John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Completion Date
              </label>
              <input
                type="date"
                value={processFormData.completionDate}
                onChange={(e) =>
                  setProcessFormData({ ...processFormData, completionDate: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setEditingProcess(null)}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProcess}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Material Modal */}
      {showAddMaterial && (
        <Modal
          title="Add Raw Material"
          onClose={() => {
            setShowAddMaterial(false);
            setMaterialFormData({ rawMaterialId: "", quantity: 1 });
          }}
          widthClass="max-w-lg"
        >
          <form onSubmit={handleAddMaterial} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Raw Material *
              </label>
              <select
                value={materialFormData.rawMaterialId}
                onChange={(e) =>
                  setMaterialFormData({ ...materialFormData, rawMaterialId: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                required
              >
                <option value="">Select Raw Material</option>
                {availableStock.map((stock) => (
                  <option key={stock.productId} value={stock.productId}>
                    {stock.productName} (Stock: {stock.stockQuantity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity Required *
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={materialFormData.quantity}
                onChange={(e) =>
                  setMaterialFormData({ ...materialFormData, quantity: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                required
              />
            </div>

            <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
              <p className="font-medium mb-1">Note:</p>
              <p>
                This material will be assigned to this specific component instance. 
                The quantity represents how much of this material is needed for this work order component.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddMaterial(false);
                  setMaterialFormData({ rawMaterialId: "", quantity: 1 });
                }}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Add Material
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}

/* ========================================
   KANBAN BOARD
   ======================================== */

function KanbanBoard({ workOrders, onRefresh }) {
  const allComponents = useMemo(() => {
    const components = [];

    // Only process Motor type work orders
    workOrders
      .filter(wo => wo.instanceType === "Motor")
      .forEach((wo) => {
        wo.components.forEach((comp) => {
          components.push({
            ...comp,
            workOrderId: wo.workOrderId,
            instanceName: wo.instanceName,
            instanceType: wo.instanceType,
            derivedStatus: deriveComponentStatus(comp),
          });
        });
      });

    return components;
  }, [workOrders]);

  const [selectedComponent, setSelectedComponent] = useState(null);

  const handleDragEnd = async (result) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newStatus = destination.droppableId;
    const workOrderComponentId = draggableId;

    try {
      const token = tokenGuard();
      const component = allComponents.find(
        (c) => c.workOrderComponentId === Number(workOrderComponentId)
      );

      if (!component) {
        toast.error("Component not found");
        return;
      }

      if (!component.materials || component.materials.length === 0) {
        toast.error("❌ Cannot update status: Please add raw materials to this component first");
        return;
      }

      const targetProcess =
        component.processes.find((p) => p.status !== "Completed") ||
        component.processes[0];

      if (!targetProcess) {
        toast.error("No processes found for this component");
        return;
      }

      const totalPlannedMaterial = component.materials.reduce((s, m) => s + m.quantity, 0);
      
      let completedQty = targetProcess.completedQuantity || 0;
      let inUseQty   = targetProcess.inUseQuantity || 0;
      
      if (newStatus === "Completed") {
        completedQty = totalPlannedMaterial;
        inUseQty = 0;
      }

      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${workOrderComponentId}/process-status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            process_id: targetProcess.processId,
            completed_quantity: completedQty,
            in_use_quantity: inUseQty,
            completion_date: targetProcess.completionDate || null,
            responsible_person: targetProcess.responsiblePerson || null,
          }),
        }
      );

      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to update status");
      }

      toast.success("Status updated");
      onRefresh();
    } catch (error) {
      toast.error(error.message || "Failed to update status");
    }
  };

  const componentsByStatus = useMemo(() => {
    const grouped = {
      Pending: [],
      "In Progress": [],
      Completed: [],
    };

    allComponents.forEach((comp) => {
      const status = comp.derivedStatus;
      if (grouped[status]) {
        grouped[status].push(comp);
      }
    });

    return grouped;
  }, [allComponents]);

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Object.entries(STATUS_COLUMNS).map(([status, config]) => (
            <div key={status} className="flex flex-col">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-1">
                  {config.label}
                </h3>
                <p className="text-sm text-gray-500">
                  {componentsByStatus[status].length} components
                </p>
              </div>

              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-4 rounded-lg border-2 ${
                      config.color
                    } ${
                      snapshot.isDraggingOver ? "bg-blue-50" : ""
                    } min-h-[400px]`}
                  >
                    <div className="space-y-3">
                      {componentsByStatus[status].map((component, index) => {
                        const totalPlanned = component.materials?.reduce((s, m) => s + m.quantity, 0) || 0;
                        const totalCompleted = component.processes?.reduce((s, p) => s + (p.completedQuantity || 0), 0) || 0;
                        const totalInUse = component.processes?.reduce((s, p) => s + (p.inUseQuantity || 0), 0) || 0;
                        const progressPercent = totalPlanned > 0 ? (totalCompleted / totalPlanned) * 100 : 0;

                        return (
                          <Draggable
                            key={component.workOrderComponentId}
                            draggableId={String(component.workOrderComponentId)}
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`bg-white p-4 rounded-lg shadow-sm border ${
                                  snapshot.isDragging ? "shadow-lg" : ""
                                } cursor-pointer hover:shadow-md transition-shadow`}
                                onClick={() => setSelectedComponent(component)}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-semibold text-gray-800">
                                    {component.componentName}
                                  </h4>
                                  <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                                    Qty: {component.quantity}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mb-2">
                                  {component.instanceName} ({component.instanceType})
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                                  <User size={12} />
                                  {component.processes[0]?.responsiblePerson || "Unassigned"}
                                </div>
                                <div className="mt-2 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                                      <div
                                        className="bg-blue-600 h-2 rounded-full transition-all"
                                        style={{ width: `${progressPercent}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-gray-500">
                                      {totalPlanned > 0 ? `${totalCompleted}/${totalPlanned}` : "—"}
                                    </span>
                                  </div>
                                  {totalInUse > 0 && (
                                    <div className="text-xs text-blue-600">
                                      🔄 {totalInUse} in use
                                    </div>
                                  )}
                                </div>
                                {!component.materials?.length && (
                                  <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
                                    <AlertCircle size={12} />
                                    <span>No materials</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {selectedComponent && (
        <ProcessDetailModal
          workOrderComponent={selectedComponent}
          onClose={() => setSelectedComponent(null)}
          onUpdate={onRefresh}
        />
      )}
    </>
  );
}

/* ========================================
   MAIN COMPONENT
   ======================================== */

export default function ProcessManagement({ socket }) {
  const { orderId } = useParams();

  const [workOrders, setWorkOrders] = useState([]);
  const [components, setComponents] = useState([]);
  const [instanceGroups, setInstanceGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [showAddComponent, setShowAddComponent] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("kanban");

  useEffect(() => {
    if (!socket) return;

    socket.on("processUpdate", () => {
      console.log("Process update received");
      fetchWorkOrders();
    });

    return () => {
      socket.off("processUpdate");
    };
  }, [socket]);

  const fetchWorkOrders = useCallback(async () => {
    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );

      if (!res.ok) {
        throw new Error("Failed to fetch work orders");
      }

      const data = await res.json();
      // ── Only keep Motor type work orders ──
      setWorkOrders(
        (data.workOrders || []).filter(
          wo => wo.instanceType === "Motor"
        )
      );
    } catch (error) {
      toast.error(error.message || "Failed to load work orders");
    }
  }, [orderId]);

  const fetchComponents = useCallback(async () => {
    try {
      const token = tokenGuard();
      const res = await fetch(`${getBackendUrl()}/api/process/components`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (res.ok) {
        setComponents(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch components:", error);
    }
  }, []);

  const fetchInstanceGroups = useCallback(async () => {
    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/${orderId}/instance-groups`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );

      if (res.ok) {
        const data = await res.json();
        // ── Only keep Motor type instances ──
        setInstanceGroups(
          data.filter(ig => ig.instanceType === "Motor")
        );
      }
    } catch (error) {
      console.error("Failed to fetch instance groups:", error);
    }
  }, [orderId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWorkOrders();
    setRefreshing(false);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        fetchWorkOrders(),
        fetchComponents(),
        fetchInstanceGroups(),
      ]);
      setLoading(false);
    })();
  }, [fetchWorkOrders, fetchComponents, fetchInstanceGroups]);

  const filteredWorkOrders = useMemo(() => {
    // Only consider Motor work orders
    const motorWOs = workOrders.filter(
      wo => wo.instanceType === "Motor"
    );

    if (!searchQuery.trim()) return motorWOs;

    const q = searchQuery.toLowerCase();
    return motorWOs.filter(
      wo =>
        wo.instanceName?.toLowerCase().includes(q) ||
        wo.components.some(c =>
          c.componentName?.toLowerCase().includes(q)
        )
    );
  }, [workOrders, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-gray-600">Loading processes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Process Management
          </h1>
          <p className="text-gray-600">Order #{orderId}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-4 items-center flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search motors or components..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                />
              </div>

              <div className="flex gap-2 border rounded-lg p-1">
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`px-4 py-2 rounded ${
                    viewMode === "kanban"
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Kanban
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-4 py-2 rounded ${
                    viewMode === "list"
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  List
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-2 rounded-lg border hover:bg-gray-50 flex items-center gap-2"
              >
                <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={() => setShowCreateWorkOrder(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus size={18} />
                New Work Order
              </button>
            </div>
          </div>
        </div>

        {viewMode === "kanban" ? (
          <KanbanBoard workOrders={filteredWorkOrders} onRefresh={handleRefresh} />
        ) : (
          <div className="bg-white rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-4 font-semibold">Work Order</th>
                    <th className="text-left p-4 font-semibold">Motor/Instance</th>
                    <th className="text-left p-4 font-semibold">Components</th>
                    <th className="text-left p-4 font-semibold">Target Date</th>
                    <th className="text-left p-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkOrders.map((wo) => (
                    <tr key={wo.workOrderId} className="border-b hover:bg-gray-50">
                      <td className="p-4">
                        <span className="font-mono text-sm">WO-{wo.workOrderId}</span>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium">{wo.instanceName}</p>
                          <p className="text-sm text-gray-500">{wo.instanceType}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="space-y-1">
                          {wo.components.map((comp) => (
                            <div
                              key={comp.workOrderComponentId}
                              className="flex items-center gap-2"
                            >
                              <span className="text-sm">{comp.componentName}</span>
                              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                Qty: {comp.quantity}
                              </span>
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${statusBadgeClass(
                                  deriveComponentStatus(comp)
                                )}`}
                              >
                                {deriveComponentStatus(comp)}
                              </span>
                            </div>
                          ))}
                          {wo.components.length === 0 && (
                            <span className="text-sm text-gray-400">No components yet</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-sm">{wo.targetDate || "—"}</span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => setShowAddComponent(wo)}
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                        >
                          <Plus size={14} />
                          Add Component
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredWorkOrders.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">
                        No work orders found. Create one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreateWorkOrder && (
        <Modal title="Create Work Order" onClose={() => setShowCreateWorkOrder(false)}>
          <CreateWorkOrderForm
            orderId={orderId}
            instanceGroups={instanceGroups}
            onClose={() => setShowCreateWorkOrder(false)}
            onCreated={handleRefresh}
          />
        </Modal>
      )}

      {showAddComponent && (
        <Modal
          title={`Add Component - ${showAddComponent.instanceName}`}
          onClose={() => setShowAddComponent(null)}
        >
          <AddComponentForm
            workOrder={showAddComponent}
            components={components}
            onClose={() => setShowAddComponent(null)}
            onAdded={handleRefresh}
          />
        </Modal>
      )}

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
      />
    </div>
  );
}