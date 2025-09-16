import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import {
  Search,
  PlusCircle,
  RefreshCw,
  Pencil,
  X,
  Calendar,
  Package,
  AlertCircle,
} from "lucide-react";
import "react-toastify/dist/ReactToastify.css";
import AddMotorModal from "./AddMotorModal"; // Added import

/* ---------- shared utils ---------- */
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

// the ordered columns you asked for
const DESIRED_COMPONENT_ORDER = [
  "Shell",
  "Stack",
  "Winding",
  "Shaft",
  "Rotor",
  "Rotor Washer",
  "Bearing Plate",
  "Front Flange",
  "Rear Flange",
  ...STAGE_LIST, // appended at the end
];

const normalizeNameKey = (s = "") =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

// Normalize instance group objects to a consistent shape the UI expects
const normalizeMotor = (m) => ({
  ...m,
  instance_group_id:
    m?.instance_group_id ?? m?.instanceGroupId ?? m?.id ?? m?.group_id ?? null,
  instance_name:
    m?.instance_name ?? m?.instanceName ?? m?.name ?? m?.group_name ?? "",
  instance_type: m?.instance_type ?? m?.instanceType ?? m?.type ?? "",
});

// Status helpers (used only for work orders/components, not stages)
const DISPLAY_STATUS = {
  Pending: "Yet To Start",
  "In Progress": "In Progress",
  Completed: "Completed",
};
const STATUS_OPTIONS = ["Pending", "In Progress", "Completed"];
const statusToBadgeClass = (status) => {
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

/* ---------- generic modal ---------- */
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

/* ---------- Editors ---------- */
function ProcessRowEditor({
  row,
  onChange,
  onCancel,
  onSave,
  workOrderQuantity,
  processes,
}) {
  const [error, setError] = useState("");
  const handleSave = () => {
    const completedQty = Number(row.completedQuantity || 0);
    const rawQty = Number(row.rawQtyUsed || 0);
    if (!Number.isInteger(completedQty) || completedQty < 0) {
      setError("Completed quantity must be a non-negative integer");
      return;
    }
    if (!Number.isInteger(rawQty) || rawQty < 0) {
      setError("Raw quantity used must be a non-negative integer");
      return;
    }
    if (completedQty > rawQty) {
      setError("Completed quantity cannot exceed raw quantity used");
      return;
    }
    if (
      row.responsiblePerson &&
      (typeof row.responsiblePerson !== "string" ||
        row.responsiblePerson.length > 255)
    ) {
      setError("Responsible person must be a string with max length 255");
      return;
    }
    const totalCompletedQty = processes
      .filter((p) => p.id !== row.id)
      .reduce((sum, p) => sum + Number(p.completedQuantity || 0), 0);
    const newTotalCompletedQty = totalCompletedQty + completedQty;
    if (newTotalCompletedQty > workOrderQuantity) {
      setError(
        `Total completed quantity (${newTotalCompletedQty}) cannot exceed work order quantity (${workOrderQuantity})`
      );
      return;
    }
    setError("");
    onSave();
  };
  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div>
        <label className="block text-sm text-gray-700 mb-1">
          Responsible Person
        </label>
        <input
          type="text"
          value={row.responsiblePerson || ""}
          onChange={(e) =>
            onChange({ ...row, responsiblePerson: e.target.value })
          }
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Raw Quantity Used
          </label>
          <input
            type="number"
            value={row.rawQtyUsed ?? ""}
            onChange={(e) => onChange({ ...row, rawQtyUsed: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
            min="0"
            step="1"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Completed Quantity
          </label>
          <input
            type="number"
            value={row.completedQuantity ?? ""}
            onChange={(e) =>
              onChange({ ...row, completedQuantity: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
            min="0"
            step="1"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border hover:bg-gray-50"
        >
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

function MaterialEditor({ material, onCancel, onSave }) {
  const [quantityPerUnit, setQuantityPerUnit] = useState(
    material.quantityPerUnit || 0
  );
  const [requiredQuantity, setRequiredQuantity] = useState(
    material.requiredQuantity || 0
  );
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
          min="0"
          step="1"
        />
      </div>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border hover:bg-gray-50"
        >
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

/* Stage editor (for order-level stages like Assembly/Testing/...) */
function StageEditor({ stage, onCancel, onSave }) {
  const [targetDate, setTargetDate] = useState(
    stage.targetDate ?? stage.stageDate ?? ""
  );

  return (
    <Modal
      title={`Edit Stage: ${stage.name || stage.stageName}`}
      onClose={onCancel}
      widthClass="max-w-lg"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Target Date
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border">
            Cancel
          </button>
          <button
            onClick={() => onSave({ targetDate })}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Component Detail Modal ---------- */
function ComponentDetailModal({
  orderId,
  motor, // { instance_group_id, instance_name, ... }
  component, // { componentId, componentName, ... }
  existingWorkOrder, // may be null
  onClose,
  onAfterChange, // refetch hook from parent
}) {
  const [workOrder, setWorkOrder] = useState(existingWorkOrder || null);
  const [materials, setMaterials] = useState([]);
  const [processRows, setProcessRows] = useState([]);
  const [workOrderQuantity, setWorkOrderQuantity] = useState(0);
  const [editRow, setEditRow] = useState(null);
  const [editMaterial, setEditMaterial] = useState(null);
  const [busy, setBusy] = useState(false);

  const ensureWorkOrder = useCallback(async () => {
    if (workOrder) return workOrder;
    setBusy(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      // get required_quantity from component materials (fallback 1)
      let requiredQuantity = 1;
      const mRes = await fetch(
        `${getBackendUrl()}/api/process/components/${
          component.componentId
        }/materials`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      if (mRes.ok) {
        const mats = await mRes.json();
        const found = (mats || []).find((m) => m.requiredQuantity);
        requiredQuantity = found?.requiredQuantity || 1;
      }

      // create work order bound to this motor (instance group)
      const createRes = await fetch(
        `${getBackendUrl()}/api/process/${orderId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            component_id: component.componentId,
            instance_group_id: motor.instance_group_id,
            quantity: requiredQuantity,
            target_date: new Date().toISOString().split("T")[0],
          }),
        }
      );
      if (!createRes.ok) {
        const data = await safeJson(createRes);
        throw new Error(
          data?.error || `Failed to create work order (${createRes.status})`
        );
      }
      const wo = await createRes.json();
      setWorkOrder(wo);
      setWorkOrderQuantity(wo.quantity || 0);
      setProcessRows(
        (wo.processes || []).map((p) => ({
          id: p.processId,
          sequence: p.sequence,
          name: p.processName,
          responsiblePerson: p.responsiblePerson || "",
          targetDate: p.completionDate || "",
          completedQuantity: p.completedQuantity ?? 0,
          rawQtyUsed: p.rawQuantityUsed ?? 0,
        }))
      );

      // load materials
      const mats2 = await fetch(
        `${getBackendUrl()}/api/process/components/${
          component.componentId
        }/materials`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      setMaterials(mats2.ok ? await mats2.json() : []);

      toast.success("Work order created");
      if (onAfterChange) onAfterChange();
      return wo;
    } catch (e) {
      toast.error(e.message || "Failed to create work order");
      return null;
    } finally {
      setBusy(false);
    }
  }, [workOrder, orderId, component, motor, onAfterChange]);

  const hydrateExisting = useCallback(async () => {
    if (!existingWorkOrder) return;
    const wo = existingWorkOrder;
    setWorkOrder(wo);
    setWorkOrderQuantity(wo.quantity || 0);
    setProcessRows(
      (wo.processes || []).map((p) => ({
        id: p.processId,
        sequence: p.sequence,
        name: p.processName,
        responsiblePerson: p.responsiblePerson || "",
        targetDate: p.completionDate || "",
        completedQuantity: p.completedQuantity ?? 0,
        rawQtyUsed: p.rawQuantityUsed ?? 0,
      }))
    );
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${
          component.componentId
        }/materials`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      setMaterials(res.ok ? await res.json() : []);
    } catch {
      setMaterials([]);
    }
  }, [existingWorkOrder, component]);

  useEffect(() => {
    if (existingWorkOrder) hydrateExisting();
  }, [hydrateExisting, existingWorkOrder]);

  const saveRowEdits = async () => {
    if (!editRow) return;
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Authentication token missing");
      return;
    }
    try {
      const completedQty = editRow.completedQuantity
        ? Number(editRow.completedQuantity)
        : 0;
      const rawQty = editRow.rawQtyUsed ? Number(editRow.rawQtyUsed) : 0;
      const res = await fetch(
        `${getBackendUrl()}/api/process/${
          workOrder.workOrderId
        }/process-status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            process_id: Number(editRow.id),
            status: editRow.responsiblePerson ? "In Progress" : "Pending",
            completed_quantity: completedQty,
            raw_quantity_used: rawQty,
            completion_date: editRow.targetDate || null,
            responsible_person: editRow.responsiblePerson || null,
          }),
        }
      );
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(
          data?.error || `Failed to update process status (${res.status})`
        );
      }
      // refresh the work order payload
      const refetch = await fetch(
        `${getBackendUrl()}/api/process/${
          workOrder.orderId
        }?force_refresh=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      const data = (await refetch.json()) || {};
      const updated = (data.workOrders || []).find(
        (wo) => wo.workOrderId === Number(workOrder.workOrderId)
      );
      if (updated) {
        setWorkOrder(updated);
        setWorkOrderQuantity(updated.quantity || 0);
        setProcessRows(
          updated.processes.map((p) => ({
            id: p.processId,
            sequence: p.sequence,
            name: p.processName,
            responsiblePerson: p.responsiblePerson || "",
            targetDate: p.completionDate || "",
            completedQuantity: p.completedQuantity ?? 0,
            rawQtyUsed: p.rawQuantityUsed ?? 0,
          }))
        );
      }
      if (onAfterChange) onAfterChange();
      setEditRow(null);
      toast.success("Process updated");
    } catch (e) {
      toast.error(e.message || "Failed to save process changes");
    }
  };

  const openEditMaterial = (m) => setEditMaterial({ ...m });

  const saveMaterialEdits = async (
    material,
    newQuantityPerUnit,
    newRequiredQuantity
  ) => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("Authentication token missing");
      return;
    }
    try {
      // Construct URL for updating material
      const updateUrl = `${getBackendUrl()}/api/process/components/${
        material.componentId
      }/materials/${material.materialId}`;
      
      // Update material quantities
      const updateRes = await fetch(updateUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          quantity_per_unit: newQuantityPerUnit,
          required_quantity: newRequiredQuantity,
        }),
      });
      if (!updateRes.ok) {
        const data = await safeJson(updateRes);
        throw new Error(
          data?.error || `Failed to update material (${updateRes.status})`
        );
      }
      
      // Fetch updated materials list
      const materialsUrl = `${getBackendUrl()}/api/process/components/${
        component.componentId
      }/materials`;
      const mRes = await fetch(materialsUrl, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (mRes.ok) {
        setMaterials(await mRes.json());
      } else {
        setMaterials([]);
      }
      
      toast.success("Material updated");
      if (onAfterChange) onAfterChange();
      setEditMaterial(null);
    } catch (e) {
      console.error("Error in saveMaterialEdits:", e);
      toast.error(e.message || "Failed to save material changes");
    }
  };

  return (
    <Modal
      title={`${component.componentName} — ${
        motor.instance_name || "(unnamed)"
      }`}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <div className="space-y-6">
        {!workOrder && (
          <button
            onClick={ensureWorkOrder}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create Work Order"}
          </button>
        )}

        {/* Processes */}
        <div className="bg-white rounded-xl border p-4">
          <h4 className="text-lg font-semibold text-gray-800 mb-3">
            Processes
          </h4>
          {processRows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    <th className="py-2 pr-4">Seq</th>
                    <th className="py-2 pr-4">Process Name</th>
                    <th className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1">
                        <User size={14} /> Responsible
                      </span>
                    </th>
                    <th className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={14} /> Target Date
                      </span>
                    </th>
                    <th className="py-2 pr-4">Raw Qty Used</th>
                    <th className="py-2 pr-4">In use</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {processRows.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-gray-500">{p.sequence}</td>
                      <td className="py-2 pr-4 font-medium text-gray-900">
                        {p.name}
                      </td>
                      <td className="py-2 pr-4">
                        {p.responsiblePerson || "—"}
                      </td>
                      <td className="py-2 pr-4">{p.targetDate || "—"}</td>
                      <td className="py-2 pr-4">{p.rawQtyUsed}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`px-3 py-1 rounded-full text-white text-sm font-medium ${
                            Number(p.completedQuantity) === 0
                              ? "bg-red-600"
                              : Number(p.completedQuantity) ===
                                  Number(p.rawQtyUsed) &&
                                Number(p.completedQuantity) > 0
                              ? "bg-green-600"
                              : Number(p.completedQuantity) > 0 &&
                                Number(p.completedQuantity) <
                                  Number(p.rawQtyUsed)
                              ? "bg-yellow-600"
                              : "bg-gray-500"
                          }`}
                        >
                          {p.completedQuantity}
                        </span>
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => setEditRow(p)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-amber-50"
                        >
                          <Pencil size={16} className="text-amber-600" /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">
              No processes yet.{" "}
              {workOrder
                ? "Check component definition."
                : "Create the work order first."}
            </p>
          )}
        </div>

        {/* Materials */}
        <div className="bg-white rounded-xl border p-4">
          <h4 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Package size={18} className="text-amber-600" /> Raw Materials
          </h4>
          {materials?.length ? (
            <ul className="divide-y">
              {materials.map((rm) => (
                <li
                  key={rm.materialId ?? `${rm.componentId}-${rm.rawMaterialId}`}
                  className="py-3 flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      Raw Material ID: {rm.rawMaterialId}
                    </p>
                    <p className="text-sm text-gray-600">
                      Quantity / unit:{" "}
                      <span className="font-medium">{rm.quantityPerUnit}</span>
                    </p>
                    {"requiredQuantity" in rm && (
                      <p className="text-sm text-gray-600">
                        Required Quantity:{" "}
                        <span className="font-medium">
                          {rm.requiredQuantity}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof rm.materialId !== "undefined" && (
                      <span className="text-xs text-gray-500">
                        material_id: {rm.materialId}
                      </span>
                    )}
                    <button
                      onClick={() => openEditMaterial(rm)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-amber-50"
                    >
                      <Pencil size={16} className="text-amber-600" /> Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">No materials listed.</p>
          )}
        </div>
      </div>

      {/* nested editors */}
      {editRow && (
        <Modal
          title={`Edit: ${editRow.name}`}
          onClose={() => setEditRow(null)}
          widthClass="max-w-lg"
        >
          <ProcessRowEditor
            row={editRow}
            onChange={setEditRow}
            onCancel={() => setEditRow(null)}
            onSave={saveRowEdits}
            workOrderQuantity={workOrderQuantity}
            processes={processRows}
          />
        </Modal>
      )}

      {editMaterial && (
        <Modal
          title={`Edit Material: Raw Material ID ${editMaterial.rawMaterialId}`}
          onClose={() => setEditMaterial(null)}
          widthClass="max-w-lg"
        >
          <MaterialEditor
            material={editMaterial}
            onCancel={() => setEditMaterial(null)}
            onSave={(qpu, rq) => saveMaterialEdits(editMaterial, qpu, rq)}
          />
        </Modal>
      )}
    </Modal>
  );
}

/* ---------- Main Page: Grid with INLINE STATUS (components + stages as columns) ---------- */
export default function CreateMotorProcess({ socket }) {
  const { orderId } = useParams();

  // page state
  const [customerName, setCustomerName] = useState("");
  const [components, setComponents] = useState([]);
  const [motors, setMotors] = useState([]); // normalized instance groups
  const [workOrders, setWorkOrders] = useState([]); // each has status, etc
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);

  const [showAddMotor, setShowAddMotor] = useState(false);
  const [openDetail, setOpenDetail] = useState(null); // { motor, component, wo }
  const [stages, setStages] = useState([]);
  const [editStage, setEditStage] = useState(null); // current stage being edited

  // inline status editing state (for components only)
  const [editingCell, setEditingCell] = useState(null); // { motorId, componentId }
  const [editingValue, setEditingValue] = useState("Pending");

  // Listen for real-time updates via Socket.IO
  useEffect(() => {
    if (!socket) return;
    socket.on("instanceGroupUpdate", () => {
      console.log("Received instanceGroupUpdate event");
      refetchAll();
    });
    socket.on("stageUpdate", () => {
      console.log("Received stageUpdate event");
      fetchStages();
    });
    return () => {
      socket.off("instanceGroupUpdate");
      socket.off("stageUpdate");
    };
  }, [socket]);

  const tokenGuard = () => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Authentication token missing");
    return token;
  };

  // helpers to find/create WO
  const findWO = useCallback(
    (motorId, componentId) =>
      workOrders.find(
        (wo) =>
          Number(wo.instanceGroupId) === Number(motorId) &&
          Number(wo.componentId) === Number(componentId)
      ) || null,
    [workOrders]
  );

  const fetchRequiredQuantity = useCallback(async (componentId, token) => {
    try {
      const mRes = await fetch(
        `${getBackendUrl()}/api/process/components/${componentId}/materials`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      if (!mRes.ok) return 1;
      const mats = await mRes.json();
      const found = (mats || []).find((m) => m.requiredQuantity);
      return found?.requiredQuantity || 1;
    } catch {
      return 1;
    }
  }, []);

  const toStage = (x) => ({
    id: x.stageId ?? x.id,
    name: (x.stageName ?? x.stage_name ?? x.name ?? "").trim(),
    targetDate:
      x.targetDate ??
      x.stageDate ??
      x.target_date ??
      x.planned_date ??
      x.plannedDate ??
      "",
  });

  const fetchStages = useCallback(async () => {
    const token = tokenGuard();
    const r = await fetch(`${getBackendUrl()}/api/process/${orderId}/stages`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    const arr = r.ok ? await r.json() : [];
    const normalized = Array.isArray(arr) ? arr.map(toStage) : [];
    setStages(normalized);
    return normalized; // so callers can use the fresh list
  }, [orderId]);

  const createStage = useCallback(
    async (label) => {
      try {
        const token = tokenGuard();
        const res = await fetch(
          `${getBackendUrl()}/api/process/${orderId}/stages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify({
              stage_name: label, // send snake_case as required by backend
            }),
          }
        );
        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error(
            data?.error || `Failed to create stage (${res.status})`
          );
        }
        toast.success(`${label} stage created`);
        const list = await fetchStages(); // get fresh normalized list
        const created =
          list.find(
            (s) => normalizeNameKey(s.name) === normalizeNameKey(label)
          ) || null;
        if (created) setEditStage(created);
      } catch (e) {
        console.error("Error creating stage:", e);
        toast.error(
          e.message || `Could not create ${label} stage. Please try again.`
        );
      }
    },
    [orderId, fetchStages]
  );

  const stageByName = useMemo(() => {
    const map = new Map();
    stages.forEach((s) => map.set(normalizeNameKey(s.name), s));
    return map;
  }, [stages]);

  const createWorkOrderFor = useCallback(
    async (motor, component) => {
      const token = tokenGuard();
      const qty = await fetchRequiredQuantity(component.componentId, token);
      const res = await fetch(`${getBackendUrl()}/api/process/${orderId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          component_id: component.componentId,
          instance_group_id: motor.instance_group_id,
          quantity: qty,
          target_date: new Date().toISOString().split("T")[0],
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(
          data?.error || `Failed to create work order (${res.status})`
        );
      }
      return await res.json();
    },
    [orderId, fetchRequiredQuantity]
  );

  // choose a "board" process to reflect the cell's status
  function pickBoardProcess(wo) {
    if (!wo?.processes?.length) return null;
    const incomplete = wo.processes.find((p) => p.status !== "Completed");
    return (
      incomplete ||
      [...wo.processes].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))[0]
    );
  }

  // Update via existing /:workOrderId/process-status route
  const updateBoardStatusViaProcess = useCallback(async (wo, newStatus) => {
    const token = tokenGuard();
    const proc = pickBoardProcess(wo);
    if (!proc) throw new Error("No processes found for this work order");

    const body = {
      process_id: Number(proc.processId),
      status: newStatus,
      completed_quantity: Number(proc.completedQuantity ?? 0),
      raw_quantity_used: Number(proc.rawQuantityUsed ?? 0),
      completion_date: proc.completionDate || null,
      responsible_person: proc.responsiblePerson || null,
    };

    const res = await fetch(
      `${getBackendUrl()}/api/process/${wo.workOrderId}/process-status`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `${res.status} ${res.statusText} — ${text.slice(0, 200)}`
      );
    }
    return true;
  }, []);

  // Save stage edits
  const saveStageEdits = useCallback(
    async ({ targetDate }) => {
      try {
        const token = tokenGuard();
        const res = await fetch(
          `${getBackendUrl()}/api/process/${orderId}/stages`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify({
              stage_name: editStage.name,
              stage_date: targetDate || null,
            }),
          }
        );
        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error(
            data?.error || `Failed to update stage (${res.status})`
          );
        }
        toast.success("Stage updated");
        setEditStage(null);
        await fetchStages();
      } catch (e) {
        toast.error(e.message || "Failed to save stage");
      }
    },
    [editStage, orderId, fetchStages]
  );

  // main refetch
  const refetchAll = useCallback(async () => {
    setLoadingList(true);
    try {
      const token = tokenGuard();

      // motors
      const ig = await fetch(
        `${getBackendUrl()}/api/process/${orderId}/instance-groups`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      const rawList = ig.ok ? await ig.json() : [];
      const motorList = Array.isArray(rawList)
        ? rawList.map(normalizeMotor)
        : [];
      setMotors(motorList);

      // work orders
      const wo = await fetch(
        `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      const woData = wo.ok ? await wo.json() : { workOrders: [] };
      setWorkOrders(woData.workOrders || []);

      await fetchStages();
    } catch (e) {
      toast.error(e.message || "Failed to refresh");
    } finally {
      setLoadingList(false);
    }
  }, [orderId, fetchStages]);

  // initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = tokenGuard();

        // customer name for heading
        const ordersRes = await fetch(`${getBackendUrl()}/api/process/orders`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (ordersRes.ok) {
          const all = await ordersRes.json();
          const me = all.find((o) => String(o.orderId) === String(orderId));
          setCustomerName(me?.customerName || "Unknown");
        }

        // components master
        const comps = await fetch(`${getBackendUrl()}/api/process/components`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        setComponents(comps.ok ? await comps.json() : []);

        await refetchAll();
      } catch (e) {
        toast.error(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, refetchAll]);

  // Build the exact columns in the requested order.
  const displayColumns = useMemo(() => {
    const byName = new Map(
      (components || []).map((c) => [
        normalizeNameKey(c.componentName || ""),
        c,
      ])
    );

    return DESIRED_COMPONENT_ORDER.map((label) => {
      if (STAGE_LIST.includes(label)) {
        // These are order-level stages, not components
        return { label, isStage: true }; // don't mark missing
      }
      const hit = byName.get(normalizeNameKey(label));
      return hit ? { ...hit, label } : { label, missing: true };
    });
  }, [components]);

  // filter rows by search
  const filteredMotors = useMemo(() => {
    if (!search.trim()) return motors;
    const q = search.toLowerCase();
    return motors.filter((m) =>
      (m.instance_name || "").toLowerCase().includes(q)
    );
  }, [motors, search]);

  // details modal (optional)
  const openCellDetails = (motor, component) => {
    if (component.missing) return;
    const wo = findWO(motor.instance_group_id, component.componentId);
    setOpenDetail({ motor, component, wo });
  };

  // open inline editor for component cells
  const startEditStatus = (motorId, component, current) => {
    if (component.missing) {
      toast.warn(
        `“${component.label}” isn’t defined in Components. Add it in master to enable editing.`
      );
      return;
    }
    setEditingCell({ motorId, componentId: component.componentId });
    setEditingValue(current || "Pending");
  };

  // save inline status for component cells
  const saveStatus = async (motor, component, newStatus) => {
    try {
      if (component.missing)
        throw new Error(`Component “${component.label}” not defined`);
      let wo = findWO(motor.instance_group_id, component.componentId);
      if (!wo) {
        wo = await createWorkOrderFor(motor, component);
      }

      // refresh to get processes before updating
      const token = tokenGuard();
      const ref = await fetch(
        `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      const woData = ref.ok ? await ref.json() : { workOrders: [] };
      const freshWO = (woData.workOrders || []).find(
        (w) => w.workOrderId === wo.workOrderId
      );
      if (!freshWO) throw new Error("Work order not found after refresh");

      await updateBoardStatusViaProcess(freshWO, newStatus);
      toast.success("Status updated");
      setEditingCell(null);
      await refetchAll();
    } catch (e) {
      toast.error(`Failed to update status: ${e.message || e}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Loading motors…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Work Orders — Order #{orderId} —{" "}
        {customerName?.trim() ? customerName : "Unknown"}
      </h1>

      {/* toolbar */}
      <div className="max-w-7xl mx-auto mb-8 flex gap-6 flex-wrap items-end">
        <div className="relative flex-grow">
          <label htmlFor="search-motors" className="sr-only">
            Search Motors
          </label>
          <input
            id="search-motors"
            type="text"
            placeholder="Search by Motor Name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
        <button
          onClick={refetchAll}
          disabled={loadingList}
          className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg inline-flex items-center gap-2"
          aria-label="Refresh motors"
        >
          <RefreshCw className={loadingList ? "animate-spin" : ""} size={18} />
          {loadingList ? "Refreshing…" : "Refresh"}
        </button>
        <button
          onClick={() => setShowAddMotor(true)}
          className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md flex items-center"
          aria-label="Add motor"
        >
          <PlusCircle className="mr-2" /> Add Motor
        </button>
      </div>

      {/* grid: Motor Name + exact ordered columns (components + stages) */}
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50">
              <th className="py-5 px-3 text-gray-800 text-base font-semibold whitespace-nowrap">
                Motor Name
              </th>
              {displayColumns.map((col) => (
                <th
                  key={col.label}
                  className="py-5 px-3 text-gray-800 text-base font-semibold whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredMotors.length ? (
              filteredMotors.map((m) => (
                <tr
                  key={m.instance_group_id ?? m.instanceName ?? m.id}
                  className="border-t hover:bg-amber-50 transition-all duration-200"
                >
                  <td className="py-4 px-3 text-gray-800">
                    <div className="font-semibold">
                      {m.instance_name || "(unnamed)"}
                    </div>
                    {m.instance_type && (
                      <div className="text-sm text-gray-600">
                        {m.instance_type}
                      </div>
                    )}
                  </td>

                  {displayColumns.map((col) => {
                    // 1) Stage columns (order-level)
                    if (col.isStage) {
                      const s = stageByName.get(normalizeNameKey(col.label));
                      return (
                        <td
                          key={`stage-${col.label}`}
                          className="py-4 px-3 align-middle"
                        >
                          {s ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">
                                {s.targetDate || "—"}
                              </span>
                              <button
                                onClick={() =>
                                  setEditStage({ ...s, name: col.label })
                                }
                                className="text-gray-600 hover:text-amber-700 text-xs underline"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => createStage(col.label)}
                              className="px-2 py-1 text-xs rounded-lg border hover:bg-amber-50"
                              title={`Create ${col.label} stage`}
                            >
                              Set
                            </button>
                          )}
                        </td>
                      );
                    }

                    // 2) Component columns
                    if (col.missing) {
                      return (
                        <td
                          key={`${col.label}-missing`}
                          className="py-4 px-3 align-middle"
                        >
                          <span
                            className="text-xs text-gray-400 italic"
                            title="Define this in Components master to enable editing"
                          >
                            Not defined
                          </span>
                        </td>
                      );
                    }

                    const wo = findWO(m.instance_group_id, col.componentId);
                    const status = wo?.status || "Pending";
                    const isEditing =
                      editingCell &&
                      editingCell.motorId === m.instance_group_id &&
                      editingCell.componentId === col.componentId;

                    return (
                      <td
                        key={col.componentId}
                        className="py-4 px-3 align-middle"
                      >
                        {!isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                startEditStatus(
                                  m.instance_group_id,
                                  col,
                                  status
                                )
                              }
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${statusToBadgeClass(
                                status
                              )}`}
                              title="Click to edit status"
                            >
                              {DISPLAY_STATUS[status] || "Yet To Start"}
                            </button>
                            <button
                              onClick={() => openCellDetails(m, col)}
                              className="text-gray-600 hover:text-amber-700 text-xs underline"
                              title="Open details"
                            >
                              Details
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              className="border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-amber-300"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {DISPLAY_STATUS[opt]}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => saveStatus(m, col, editingValue)}
                              className="px-2 py-1 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCell(null)}
                              className="px-2 py-1 text-sm rounded-lg border hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={1 + displayColumns.length}
                  className="py-10 text-center text-gray-500"
                >
                  No motors found. Click “Add Motor” to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showAddMotor && (
        <AddMotorModal
          orderId={orderId}
          customerName={customerName}
          onClose={() => setShowAddMotor(false)}
          onCreated={refetchAll}
        />
      )}

      {openDetail && (
        <ComponentDetailModal
          orderId={orderId}
          motor={openDetail.motor}
          component={openDetail.component}
          existingWorkOrder={openDetail.wo}
          onClose={() => setOpenDetail(null)}
          onAfterChange={refetchAll}
        />
      )}

      {editStage && (
        <StageEditor
          stage={editStage}
          onCancel={() => setEditStage(null)}
          onSave={saveStageEdits}
        />
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