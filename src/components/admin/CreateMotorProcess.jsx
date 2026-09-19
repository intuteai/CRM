import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  PlusCircle,
  RefreshCw,
  Pencil,
  X,
  Calendar,
  Package,
  User,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";
import AddMotorModal from "./AddMotorModal";
import TestingEditor from "./TestingEditor";
import { useNotify } from '../../hooks/useNotify';

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
  ...STAGE_LIST,
];

const normalizeNameKey = (s = "") =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

const normalizeMotor = (m) => ({
  ...m,
  instance_group_id:
    m?.instance_group_id ?? m?.instanceGroupId ?? m?.id ?? m?.group_id ?? null,
  instance_name:
    m?.instance_name ?? m?.instanceName ?? m?.name ?? m?.group_name ?? "",
  instance_type: m?.instance_type ?? m?.instanceType ?? m?.type ?? "",
});

// Status helpers
const DISPLAY_STATUS = {
  Pending: "Yet To Start",
  "In Progress": "In Progress",
  Completed: "Completed",
};
const STATUS_OPTIONS = ["Pending", "In Progress", "Completed"];
const statusToBadgeClass = (status) => {
  switch (status) {
    case "Completed":
      return "bg-emerald-100 text-emerald-700";
    case "In Progress":
      return "bg-gold-400/25 text-gold-600";
    case "Pending":
    default:
      return "bg-gray-100 text-gray-500";
  }
};

/* ---------- generic modal ---------- */
const Modal = ({ title, onClose, children, widthClass = "max-w-2xl" }) => (
  <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
    <div className={`w-full ${widthClass}`}>
      <div className="relative bg-white rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors z-10"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <div className="p-4 sm:p-6 border-b border-navy-100">
          <h3 className="font-display text-xl font-bold text-navy-800 pr-8">{title}</h3>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
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
  maxAllowedQty,
  processes,
}) {
  const [error, setError] = useState("");

  const otherProcessesInUse = useMemo(() => {
    return processes
      .filter((p) => p.id !== row.id)
      .reduce((sum, p) => sum + Number(p.inUseQuantity || 0), 0);
  }, [processes, row.id]);

  const handleSave = () => {
    const completedQty = Number(row.completedQuantity || 0);
    const inUseQty = Number(row.inUseQuantity || 0);

    if (!Number.isInteger(completedQty) || completedQty < 0) {
      setError("Completed quantity must be a non-negative integer");
      return;
    }

    if (!Number.isInteger(inUseQty) || inUseQty < 0) {
      setError("In-use quantity must be a non-negative integer");
      return;
    }

    if (completedQty > maxAllowedQty) {
      setError(
        `Completed quantity (${completedQty}) cannot exceed available material (${maxAllowedQty})`
      );
      return;
    }

    const totalInUse = otherProcessesInUse + inUseQty;
    if (totalInUse > maxAllowedQty) {
      setError(
        `Total in-use across all processes (${totalInUse}) would exceed available material (${maxAllowedQty}). ` +
        `Other processes are using ${otherProcessesInUse}.`
      );
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

    setError("");
    onSave();
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-blue-900">📊 Material Status</span>
        </div>
        <div className="mt-2 space-y-1 text-sm text-blue-800">
          <div>
            Total Available: <span className="font-semibold">{maxAllowedQty}</span>
          </div>
          <div>
            Other Processes In-Use:{" "}
            <span className="font-semibold">{otherProcessesInUse}</span>
          </div>
          <div>
            This Process In-Use:{" "}
            <span className="font-semibold">{row.inUseQuantity || 0}</span>
          </div>
          <div className="pt-1 border-t border-blue-300">
            Total In-Use:{" "}
            <span className="font-semibold">
              {otherProcessesInUse + Number(row.inUseQuantity || 0)}
            </span>{" "}
            / {maxAllowedQty}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1">
          Responsible Person
        </label>
        <input
          type="text"
          value={row.responsiblePerson || ""}
          onChange={(e) => onChange({ ...row, responsiblePerson: e.target.value })}
          className="w-full px-3 py-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
          placeholder="e.g., Asha"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1">Target Date</label>
        <input
          type="date"
          value={row.targetDate || ""}
          onChange={(e) => onChange({ ...row, targetDate: e.target.value })}
          className="w-full px-3 py-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1">
          In-Use Quantity
          <span className="ml-2 text-xs text-gray-500">
            (Materials currently being worked on - shared globally)
          </span>
        </label>
        <input
          type="number"
          value={row.inUseQuantity ?? ""}
          onChange={(e) => onChange({ ...row, inUseQuantity: e.target.value })}
          className="w-full px-3 py-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1">
          Completed Quantity
          <span className="ml-2 text-xs text-gray-500">
            (Finished work - independent per process)
          </span>
        </label>
        <input
          type="number"
          value={row.completedQuantity ?? ""}
          onChange={(e) => onChange({ ...row, completedQuantity: e.target.value })}
          className="w-full px-3 py-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
          min="0"
          step="1"
          placeholder="0"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function MaterialEditor({ material, onCancel, onSave }) {
  const [quantity, setQuantity] = useState(material.quantity || 0);
  const [error, setError] = useState("");

  const handleSave = () => {
    const qty = Number(quantity);

    if (!Number.isInteger(qty) || qty <= 0) {
      setError("Quantity must be a positive integer");
      return;
    }

    setError("");
    onSave(qty);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-navy-800 mb-1">
          Quantity (Raw Material ID: {material.rawMaterialId})
        </label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full px-3 py-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
          min="1"
          step="1"
        />
      </div>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function AddMaterialModal({ wocId, onClose, onAdded }) {
  const { notifyError, notifySuccess } = useNotify();
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No auth token");

        const res = await fetch(`${getBackendUrl()}/api/stock?limit=10000&offset=0`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });

        if (!res.ok) throw new Error(`Stock API failed: ${res.status}`);

        const data = await res.json();

        if (!mounted) return;

        let items = Array.isArray(data)
          ? data
          : data?.items || data?.data || [];

        const normalizedItems = items.map((item) => ({
          productId: item.productId || item.product_id || item.id,
          productName:
            item.productName || item.product_name || item.name || item.description,
          productCode: item.productCode || item.product_code,
          stockQuantity: item.stockQuantity || item.stock_quantity || 0,
          price: item.price || 0,
          location: item.location || "",
          imageUrl: item.imageUrl || item.image_url || null,
        }));

        setStockItems(normalizedItems);
      } catch (err) {
        console.error("Failed to load stock items:", err);
        if (mounted) notifyError("Could not load raw materials list");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return stockItems;
    const q = searchTerm.toLowerCase();
    return stockItems.filter(
      (item) =>
        (item.productName || "").toLowerCase().includes(q) ||
        (item.productCode || "").toLowerCase().includes(q)
    );
  }, [stockItems, searchTerm]);

  const handleSelectItem = (item) => {
    setSelectedItem(item);
    setSearchTerm(item.productName || `Product ${item.productId}`);
    setShowDropdown(false);
  };

  const handleAdd = async () => {
    if (!selectedItem) {
      notifyError("Please select a raw material");
      return;
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      notifyError("Please enter a positive integer quantity");
      return;
    }

    setAddBusy(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${wocId}/materials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            raw_material_id: Number(selectedItem.productId),
            quantity: qty,
          }),
        }
      );

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData?.error || `HTTP ${res.status}`);
      }

      notifySuccess("Material added successfully");
      onAdded();
      onClose();
    } catch (err) {
      console.error("Add material failed:", err);
      notifyError(`Failed to add material: ${err.message}`);
    } finally {
      setAddBusy(false);
    }
  };

  return (
    <Modal title="Add Raw Material" onClose={onClose} widthClass="max-w-md">
      <div className="space-y-5">
        <div className="relative">
          <label className="block text-sm font-medium text-navy-800 mb-1">
            Raw Material
          </label>

          {loading ? (
            <div className="py-3 text-gray-500 text-center">Loading materials…</div>
          ) : stockItems.length === 0 ? (
            <div className="py-3 text-gold-600 text-center">
              No raw materials available in stock
            </div>
          ) : (
            <>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                  setSelectedItem(null);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full border border-navy-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
                placeholder="Search materials..."
                disabled={addBusy}
              />

              {showDropdown && filteredItems.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-navy-100 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredItems.map((item) => {
                    const name = item.productName || `Product ${item.productId}`;
                    const code = item.productCode ? ` [${item.productCode}]` : "";
                    const stock = item.stockQuantity;
                    const location = item.location ? ` • ${item.location}` : "";

                    return (
                      <div
                        key={item.productId}
                        onClick={() => handleSelectItem(item)}
                        className="px-4 py-3 hover:bg-navy-50 cursor-pointer border-b border-navy-100 last:border-0 transition-colors"
                      >
                        <div className="font-medium text-navy-800">
                          {name}
                          {code}
                        </div>
                        <div className="text-sm text-gray-600">
                          Stock: <span className="font-semibold">{stock}</span>
                          {location}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {showDropdown && filteredItems.length === 0 && searchTerm && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-navy-100 rounded-lg shadow-lg p-4 text-center text-gray-500">
                  No materials found matching "{searchTerm}"
                </div>
              )}

              {selectedItem && (
                <div className="mt-2 p-3 bg-navy-50 border border-navy-100 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-navy-800">
                        {selectedItem.productName}
                      </div>
                      <div className="text-sm text-gold-600">
                        Available: {selectedItem.stockQuantity}
                        {selectedItem.location && ` • ${selectedItem.location}`}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedItem(null);
                        setSearchTerm("");
                      }}
                      className="text-gray-400 hover:text-navy-800 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-navy-800 mb-1">
            Quantity
          </label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            step="1"
            className="w-full border border-navy-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold-400"
            placeholder="e.g. 150"
            disabled={addBusy || loading || stockItems.length === 0}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={addBusy}
            className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={addBusy || loading || stockItems.length === 0 || !selectedItem}
            className="px-5 py-2 bg-gold-500 text-navy-900 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-60"
          >
            {addBusy ? "Adding…" : "Add Material"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

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
          <label className="block text-sm font-medium text-navy-800 mb-1">Target Date</label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave({ targetDate })}
            className="px-4 py-2 rounded-lg bg-navy-800 text-white hover:bg-navy-700 transition-colors"
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
  motor,
  component,
  existingWorkOrderComponent,
  onClose,
  onAfterChange,
}) {
  const { notifyError, notifySuccess } = useNotify();
  const [workOrderComponent, setWorkOrderComponent] = useState(
    existingWorkOrderComponent || null
  );
  const [materials, setMaterials] = useState([]);
  const [processRows, setProcessRows] = useState([]);
  const [maxAllowedQty, setMaxAllowedQty] = useState(0);
  const [editRow, setEditRow] = useState(null);
  const [editMaterial, setEditMaterial] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [busy, setBusy] = useState(false);

  const calculateMaxAllowedQty = useCallback((mats = []) => {
    return mats.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
  }, []);

  const totalInUse = useMemo(() => {
    return processRows.reduce((sum, p) => sum + Number(p.inUseQuantity || 0), 0);
  }, [processRows]);

  const loadMaterialsAndProcesses = useCallback(
    async (wocId) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const matRes = await fetch(
          `${getBackendUrl()}/api/process/components/${wocId}/materials`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          }
        );
        if (matRes.ok) {
          const mats = await matRes.json();
          const safeMats = Array.isArray(mats) ? mats : [];
          setMaterials(safeMats);
          setMaxAllowedQty(calculateMaxAllowedQty(safeMats));
        }

        const procRes = await fetch(
          `${getBackendUrl()}/api/process/components/${wocId}/processes`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          }
        );
        if (procRes.ok) {
          const procs = await procRes.json();
          const safeProcs = Array.isArray(procs) ? procs : [];
          setProcessRows(
            safeProcs.map((p) => ({
              id: p.processId,
              sequence: p.sequence,
              name: p.processName,
              responsiblePerson: p.responsiblePerson || "",
              targetDate: p.completionDate || "",
              inUseQuantity: p.inUseQuantity ?? 0,
              completedQuantity: p.completedQuantity ?? 0,
              status: p.status || "Pending",
            }))
          );
        }
      } catch (err) {
        console.error("Error loading materials/processes:", err);
      }
    },
    [calculateMaxAllowedQty]
  );

  const ensureWorkOrderComponent = useCallback(async () => {
    if (workOrderComponent) return workOrderComponent;
    setBusy(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing");

      let wo = null;
      const woRes = await fetch(
        `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
        { headers: { Authorization: `Bearer ${token}` }, credentials: "include" }
      );
      if (woRes.ok) {
        const data = await woRes.json();
        wo = (data.workOrders || []).find(
          (w) => Number(w.instanceGroupId) === Number(motor.instance_group_id)
        );
      }

      if (!wo) {
        const createRes = await fetch(
          `${getBackendUrl()}/api/process/${orderId}/work-orders`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify({ instance_group_id: motor.instance_group_id }),
          }
        );
        if (!createRes.ok) throw new Error("Failed to create work order");
        wo = await createRes.json();
      }

      const addCompRes = await fetch(
        `${getBackendUrl()}/api/process/work-orders/${wo.workOrderId}/components`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            component_id: component.componentId,
            quantity: 1,
          }),
        }
      );

      if (!addCompRes.ok) throw new Error("Failed to add component");
      const newWOC = await addCompRes.json();

      setWorkOrderComponent(newWOC);
      await loadMaterialsAndProcesses(newWOC.workOrderComponentId);

      notifySuccess("Component added to work order");
      if (onAfterChange) onAfterChange();
      return newWOC;
    } catch (err) {
      notifyError(err.message || "Failed to initialize component");
      return null;
    } finally {
      setBusy(false);
    }
  }, [workOrderComponent, orderId, motor, component, onAfterChange, loadMaterialsAndProcesses]);

  const hydrateExisting = useCallback(async () => {
    if (!existingWorkOrderComponent) return;
    setWorkOrderComponent(existingWorkOrderComponent);
    await loadMaterialsAndProcesses(existingWorkOrderComponent.workOrderComponentId);
  }, [existingWorkOrderComponent, loadMaterialsAndProcesses]);

  useEffect(() => {
    if (existingWorkOrderComponent) hydrateExisting();
  }, [hydrateExisting, existingWorkOrderComponent]);

  const guardMaterialsExist = useCallback(() => {
    if (materials.length === 0) {
      notifyError("Please add at least one raw material first");
      return false;
    }
    return true;
  }, [materials]);

  const saveRowEdits = async () => {
    if (!editRow) return;
    if (!guardMaterialsExist()) return;

    const token = localStorage.getItem("token");
    if (!token) {
      notifyError("Authentication token missing");
      return;
    }

    try {
      const completedQty = Number(editRow.completedQuantity || 0);
      const inUseQty = Number(editRow.inUseQuantity || 0);

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
            process_id: Number(editRow.id),
            completed_quantity: completedQty,
            in_use_quantity: inUseQty,
            completion_date: editRow.targetDate || null,
            responsible_person: editRow.responsiblePerson || null,
          }),
        }
      );

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData?.error || "Failed to update process");
      }

      await loadMaterialsAndProcesses(workOrderComponent.workOrderComponentId);

      if (onAfterChange) onAfterChange();
      setEditRow(null);
      notifySuccess("Process updated");
    } catch (err) {
      notifyError(err.message || "Failed to save process");
    }
  };

  const saveMaterialEdits = async (material, newQuantity) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${workOrderComponent.workOrderComponentId}/materials/${material.workOrderMaterialId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({ quantity: newQuantity }),
        }
      );

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData?.error || "Failed to update material");
      }

      await loadMaterialsAndProcesses(workOrderComponent.workOrderComponentId);
      notifySuccess("Material updated");
      if (onAfterChange) onAfterChange();
      setEditMaterial(null);
    } catch (err) {
      notifyError(err.message || "Failed to save material");
    }
  };

  const deleteMaterial = async (materialId) => {
    if (!window.confirm("Are you sure you want to delete this material?")) {
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const res = await fetch(
        `${getBackendUrl()}/api/process/components/${workOrderComponent.workOrderComponentId}/materials/${materialId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );

      if (!res.ok) throw new Error("Failed to delete material");

      await loadMaterialsAndProcesses(workOrderComponent.workOrderComponentId);
      notifySuccess("Material deleted");
      if (onAfterChange) onAfterChange();
    } catch (err) {
      notifyError(err.message || "Failed to delete material");
    }
  };

  return (
    <Modal
      title={`${component.componentName} — ${motor.instance_name || "(unnamed)"}`}
      onClose={onClose}
      widthClass="max-w-4xl"
    >
      <div className="space-y-6">
        {!workOrderComponent && (
          <button
            onClick={ensureWorkOrderComponent}
            disabled={busy}
            className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors disabled:opacity-60"
          >
            {busy ? "Creating…" : "Initialize Component"}
          </button>
        )}

        {materials.length > 0 && (
          <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-semibold text-blue-900 mb-1">📦 Material Summary</h5>
                <div className="text-sm text-blue-800">
                  Total Available: <span className="font-bold">{maxAllowedQty}</span> units
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-blue-800">
                  Global In-Use: <span className="font-bold text-blue-600">{totalInUse}</span> / {maxAllowedQty}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Available for in-use: {maxAllowedQty - totalInUse}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-navy-100 p-5 shadow-sm">
          <h4 className="text-lg font-semibold text-navy-800 mb-4 flex items-center justify-between">
            <span>Processes</span>
            <span className="text-sm font-normal text-gray-500">
              Max allowed: {maxAllowedQty}
            </span>
          </h4>

          {processRows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left bg-navy-50 text-navy-800 font-semibold">
                    <th className="py-2 pr-4 pl-2">Seq</th>
                    <th className="py-2 pr-4">Process</th>
                    <th className="py-2 pr-4">Responsible</th>
                    <th className="py-2 pr-4">Target Date</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">In Use</th>
                    <th className="py-2 pr-4">Completed</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {processRows.map((p) => (
                    <tr key={p.id} className="hover:bg-navy-50/60 transition-colors">
                      <td className="py-3 pr-4 pl-2 text-gray-500">{p.sequence}</td>
                      <td className="py-3 pr-4 font-medium text-navy-800">{p.name}</td>
                      <td className="py-3 pr-4 text-gray-600">{p.responsiblePerson || "—"}</td>
                      <td className="py-3 pr-4 text-gray-600">{p.targetDate || "—"}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${statusToBadgeClass(
                            p.status
                          )}`}
                        >
                          {DISPLAY_STATUS[p.status] || "Yet To Start"}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-medium text-blue-600">
                          {p.inUseQuantity ?? 0}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="font-medium text-navy-800">{p.completedQuantity}</span>
                        <span className="text-gray-500"> / {maxAllowedQty}</span>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => setEditRow(p)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-navy-100 text-navy-800 rounded hover:bg-navy-50 transition-colors"
                        >
                          <Pencil size={15} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 py-6 text-center">
              {workOrderComponent
                ? "No processes defined for this component yet."
                : "Initialize the component first."}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-navy-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-navy-800 flex items-center gap-2">
              <Package size={18} className="text-gold-600" />
              Raw Materials
            </h4>
            {workOrderComponent && (
              <button
                onClick={() => setShowAddMaterial(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors"
              >
                <Plus size={16} /> Add Material
              </button>
            )}
          </div>

          {materials.length ? (
            <ul className="divide-y divide-navy-100">
              {materials.map((rm) => (
                <li
                  key={rm.workOrderMaterialId}
                  className="py-3 flex flex-wrap justify-between items-center gap-2"
                >
                  <div>
                    <div className="font-medium text-navy-800">
                      {rm.rawMaterialName || `Raw Material ${rm.rawMaterialId}`}
                    </div>
                    <div className="text-sm text-gray-600">
                      Qty: <span className="font-medium">{rm.quantity}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      ID: {rm.rawMaterialId}
                    </span>
                    <button
                      onClick={() => setEditMaterial(rm)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-navy-100 text-navy-800 rounded hover:bg-navy-50 transition-colors"
                    >
                      <Pencil size={15} /> Edit
                    </button>
                    <button
                      onClick={() => deleteMaterial(rm.workOrderMaterialId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      <Trash2 size={15} /> Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 py-6 text-center">
              No raw materials assigned yet.
              {workOrderComponent && " Click 'Add Material' to begin."}
            </p>
          )}
        </div>
      </div>

      {editRow && (
        <Modal
          title={`Edit Process: ${editRow.name}`}
          onClose={() => setEditRow(null)}
          widthClass="max-w-lg"
        >
          <ProcessRowEditor
            row={editRow}
            onChange={setEditRow}
            onCancel={() => setEditRow(null)}
            onSave={saveRowEdits}
            maxAllowedQty={maxAllowedQty}
            processes={processRows}
          />
        </Modal>
      )}

      {editMaterial && (
        <Modal
          title={`Edit Material — ID ${editMaterial.rawMaterialId}`}
          onClose={() => setEditMaterial(null)}
          widthClass="max-w-md"
        >
          <MaterialEditor
            material={editMaterial}
            onCancel={() => setEditMaterial(null)}
            onSave={(qty) => saveMaterialEdits(editMaterial, qty)}
          />
        </Modal>
      )}

      {showAddMaterial && workOrderComponent && (
        <AddMaterialModal
          wocId={workOrderComponent.workOrderComponentId}
          onClose={() => setShowAddMaterial(false)}
          onAdded={() => loadMaterialsAndProcesses(workOrderComponent.workOrderComponentId)}
        />
      )}
    </Modal>
  );
}

/* ---------- Main Page ---------- */
export default function CreateMotorProcess({ socket }) {
  const { orderId } = useParams();

  const [customerName, setCustomerName] = useState("");
  const [components, setComponents] = useState([]);
  const [motors, setMotors] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);

  const [showAddMotor, setShowAddMotor] = useState(false);
  const [openDetail, setOpenDetail] = useState(null);
  const [editStage, setEditStage] = useState(null);
  const [editTesting, setEditTesting] = useState(null);

  const [editingCell, setEditingCell] = useState(null);
  const [editingValue, setEditingValue] = useState("Pending");
  const { notifySuccess, notifyError, notifyWarning } = useNotify();

  // ────────────────────────────────────────────────
  //  refetchAll – now filters only Motor type
  // ────────────────────────────────────────────────
  const refetchAll = useCallback(async () => {
    setLoadingList(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No auth token");

      const igRes = await fetch(
        `${getBackendUrl()}/api/process/${orderId}/instance-groups`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      const igData = igRes.ok ? await igRes.json() : [];

      setMotors(
        Array.isArray(igData)
          ? igData
              .map(normalizeMotor)
              .filter((m) => m.instance_type === "Motor")
          : []
      );

      const woRes = await fetch(
        `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      const woData = woRes.ok ? await woRes.json() : { workOrders: [] };
      setWorkOrders(woData.workOrders || []);
    } catch (err) {
      console.error("Refresh failed:", err);
      notifyError("Failed to refresh data");
    } finally {
      setLoadingList(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!socket) return;

    socket.on("instanceGroupUpdate", () => {
      refetchAll();
    });

    return () => {
      socket.off("instanceGroupUpdate");
    };
  }, [socket, refetchAll]);

  const tokenGuard = () => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Authentication token missing");
    return token;
  };

  const findWorkOrderComponent = useCallback(
    (motorId, componentId) => {
      for (const wo of workOrders) {
        if (Number(wo.instanceGroupId) !== Number(motorId)) continue;
        const woc = (wo.components || []).find(
          (c) => Number(c.componentId) === Number(componentId)
        );
        if (woc) return woc;
      }
      return null;
    },
    [workOrders]
  );

  const deriveComponentStatusFromWOC = useCallback((woc) => {
    if (!woc?.processes?.length) return "Pending";
    const procs = woc.processes;
    if (procs.every((p) => p.status === "Completed")) return "Completed";
    if (procs.some((p) => p.status !== "Pending")) return "In Progress";
    return "Pending";
  }, []);

  const stagesByWorkOrder = useMemo(() => {
    const map = new Map();

    workOrders.forEach((wo) => {
      const stageMap = new Map();
      (wo.stages || []).forEach((s) => {
        const key = normalizeNameKey(s.stageName || s.stage_name || "");
        stageMap.set(key, {
          name: s.stageName || s.stage_name || "",
          targetDate: s.stageDate || s.targetDate || "",
          workOrderId: wo.workOrderId,
        });
      });
      map.set(Number(wo.instanceGroupId), stageMap);
    });

    return map;
  }, [workOrders]);

  const testingByWorkOrder = useMemo(() => {
    const map = new Map();

    workOrders.forEach((wo) => {
      const testingMap = new Map();
      (wo.testing || []).forEach((t) => {
        testingMap.set(t.testingType, t);
      });
      map.set(Number(wo.instanceGroupId), testingMap);
    });

    return map;
  }, [workOrders]);

  const ensureWorkOrderComponent = useCallback(
    async (motor, component) => {
      const token = tokenGuard();

      const existing = findWorkOrderComponent(
        motor.instance_group_id,
        component.componentId
      );
      if (existing) return existing;

      let workOrder = workOrders.find(
        (wo) => Number(wo.instanceGroupId) === Number(motor.instance_group_id)
      );

      if (!workOrder) {
        const createRes = await fetch(
          `${getBackendUrl()}/api/process/${orderId}/work-orders`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify({ instance_group_id: motor.instance_group_id }),
          }
        );
        if (!createRes.ok) throw new Error("Failed to create work order");
        workOrder = await createRes.json();
      }

      const addRes = await fetch(
        `${getBackendUrl()}/api/process/work-orders/${workOrder.workOrderId}/components`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            component_id: component.componentId,
            quantity: 1,
          }),
        }
      );

      if (!addRes.ok) throw new Error("Failed to add component to work order");
      return await addRes.json();
    },
    [orderId, workOrders, findWorkOrderComponent]
  );

  const updateComponentStatus = useCallback(
    async (woc, newStatus) => {
      const token = tokenGuard();

      const procRes = await fetch(
        `${getBackendUrl()}/api/process/components/${woc.workOrderComponentId}/processes`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      if (!procRes.ok) throw new Error("Cannot fetch processes");

      const processes = await procRes.json();
      if (!processes.length) throw new Error("No processes found");

      const targetProcess =
        processes.find((p) => p.status !== "Completed") || processes[0];

      let completedQty = targetProcess.completedQuantity ?? 0;
      let inUseQty = targetProcess.inUseQuantity ?? 0;

      if (newStatus === "Completed") {
        completedQty = 999999;
        inUseQty = 0;
      } else if (newStatus === "Pending") {
        completedQty = 0;
        inUseQty = 0;
      }

      const updateRes = await fetch(
        `${getBackendUrl()}/api/process/components/${woc.workOrderComponentId}/process-status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            process_id: Number(targetProcess.processId),
            completed_quantity: completedQty,
            in_use_quantity: inUseQty,
            completion_date: targetProcess.completionDate || null,
            responsible_person: targetProcess.responsiblePerson || null,
          }),
        }
      );

      if (!updateRes.ok) {
        const errData = await safeJson(updateRes);
        throw new Error(errData?.error || "Failed to update process status");
      }
      return true;
    },
    []
  );

  const saveStageEdits = useCallback(
    async ({ targetDate }) => {
      try {
        const token = tokenGuard();

        let workOrderId = editStage.workOrderId;

        if (!workOrderId) {
          const createRes = await fetch(
            `${getBackendUrl()}/api/process/${orderId}/work-orders`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              credentials: "include",
              body: JSON.stringify({ instance_group_id: editStage.motorInstanceGroupId }),
            }
          );
          if (!createRes.ok) throw new Error("Failed to create work order for motor");
          const wo = await createRes.json();
          workOrderId = wo.workOrderId;
        }

        const res = await fetch(
          `${getBackendUrl()}/api/process/work-orders/${workOrderId}/stages`,
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
          const errData = await safeJson(res);
          throw new Error(errData?.error || "Failed to update stage");
        }

        notifySuccess("Stage updated");
        setEditStage(null);
        await refetchAll();
      } catch (e) {
        notifyError(e.message || "Failed to save stage");
      }
    },
    [editStage, refetchAll, orderId]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = tokenGuard();

        const ordersRes = await fetch(`${getBackendUrl()}/api/process/orders`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (ordersRes.ok) {
          const all = await ordersRes.json();
          const current = all.find((o) => String(o.orderId) === String(orderId));
          setCustomerName(current?.customerName || "Unknown");
        }

        const compRes = await fetch(`${getBackendUrl()}/api/process/components`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (compRes.ok) setComponents(await compRes.json());

        await refetchAll();
      } catch (err) {
        notifyError("Failed to load initial data");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, refetchAll]);

  const displayColumns = useMemo(() => {
    const byName = new Map(
      components.map((c) => [normalizeNameKey(c.componentName || ""), c])
    );
    return DESIRED_COMPONENT_ORDER.map((label) => {
      if (STAGE_LIST.includes(label)) {
        return { label, isStage: true };
      }
      const hit = byName.get(normalizeNameKey(label));
      return hit ? { ...hit, label } : { label, missing: true };
    });
  }, [components]);

  const filteredMotors = useMemo(() => {
    // Extra safety layer – only Motors should be here anyway
    const motorOnly = motors.filter((m) => m.instance_type === "Motor");

    if (!search.trim()) return motorOnly;

    const q = search.toLowerCase();
    return motorOnly.filter((m) =>
      (m.instance_name || "").toLowerCase().includes(q)
    );
  }, [motors, search]);

  const openCellDetails = (motor, component) => {
    if (component.missing) return;
    const woc = findWorkOrderComponent(
      motor.instance_group_id,
      component.componentId
    );
    setOpenDetail({ motor, component, woc });
  };

  const startEditStatus = (motorId, component, current) => {
    if (component.missing) {
      notifyWarning(`Component "${component.label}" is not defined in master data`);
      return;
    }
    setEditingCell({ motorId, componentId: component.componentId });
    setEditingValue(current || "Pending");
  };

  const saveStatus = async (motor, component, newStatus) => {
    try {
      if (component.missing) throw new Error("Component not defined");

      let woc = findWorkOrderComponent(
        motor.instance_group_id,
        component.componentId
      );

      if (!woc) {
        woc = await ensureWorkOrderComponent(motor, component);
      }

      const matRes = await fetch(
        `${getBackendUrl()}/api/process/components/${woc.workOrderComponentId}/materials`,
        {
          headers: { Authorization: `Bearer ${tokenGuard()}` },
          credentials: "include",
        }
      );
      const mats = matRes.ok ? await matRes.json() : [];
      if (!Array.isArray(mats) || mats.length === 0) {
        notifyError("Cannot update status — please add raw materials first");
        return;
      }

      await updateComponentStatus(woc, newStatus);
      notifySuccess("Status updated");
      setEditingCell(null);
      await refetchAll();
    } catch (err) {
      notifyError(`Failed to update status: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500">
        Loading motors and configuration…
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <p className="text-sm text-gray-500">
        Order #{orderId} — <span className="text-navy-800 font-medium">{customerName || "Unknown Customer"}</span>
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder="Search motors by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
          />
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={refetchAll}
            disabled={loadingList}
            className="flex items-center gap-2 px-4 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={loadingList ? "animate-spin" : ""} size={16} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddMotor(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors"
          >
            <PlusCircle size={16} /> Add Motor
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-navy-50">
              <th className="py-3 px-4 font-semibold text-navy-800 text-sm">Motor</th>
              {displayColumns.map((col) => (
                <th
                  key={col.label}
                  className="py-3 px-4 font-semibold text-navy-800 text-sm whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100">
            {filteredMotors.length === 0 ? (
              <tr>
                <td
                  colSpan={1 + displayColumns.length}
                  className="py-12 text-center text-gray-400"
                >
                  No motors found. Add a motor to begin.
                </td>
              </tr>
            ) : (
              filteredMotors.map((motor) => (
                <tr
                  key={motor.instance_group_id}
                  className="hover:bg-navy-50/60 transition-colors"
                >
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-navy-800">{motor.instance_name || "(unnamed)"}</div>
                    <div className="text-sm text-gray-500">Motor</div>
                  </td>

                  {displayColumns.map((col) => {
                    if (col.isStage) {
                      const motorWorkOrder = workOrders.find(
                        (wo) => Number(wo.instanceGroupId) === Number(motor.instance_group_id)
                      );

                      if (col.label === "Testing") {
                        const testingMap = testingByWorkOrder.get(motor.instance_group_id);

                        return (
                          <td key="stage-Testing" className="py-3.5 px-4">
                            {["Primary", "Final"].map((type) => {
                              const entry = testingMap?.get(type);
                              return (
                                <div key={type} className="flex items-center gap-2 text-xs mb-1 last:mb-0">
                                  <span className="font-medium text-gray-600 w-14 shrink-0">{type}</span>
                                  <span className="text-gray-600">{entry?.testDate || "—"}</span>
                                  <button
                                    onClick={() =>
                                      setEditTesting({
                                        workOrderId: motorWorkOrder?.workOrderId ?? null,
                                        instanceGroupId: motor.instance_group_id,
                                        testingType: type,
                                        qty: entry?.qty ?? null,
                                        testDate: entry?.testDate ?? null,
                                        controllerType: entry?.controllerType ?? null,
                                      })
                                    }
                                    className="text-gold-600 hover:underline transition-colors"
                                  >
                                    {entry?.testDate ? "edit" : "add"}
                                  </button>
                                </div>
                              );
                            })}
                          </td>
                        );
                      }

                      const stageMap = stagesByWorkOrder.get(motor.instance_group_id);
                      const stage = stageMap?.get(normalizeNameKey(col.label));

                      return (
                        <td key={`stage-${col.label}`} className="py-3.5 px-4">
                          {stage ? (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-600">
                                {stage.targetDate || "—"}
                              </span>
                              <button
                                onClick={() =>
                                  setEditStage({
                                    ...stage,
                                    workOrderId: stage.workOrderId,
                                  })
                                }
                                className="text-gold-600 hover:underline text-xs transition-colors"
                              >
                                edit
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() =>
                                setEditStage({
                                  name: col.label,
                                  targetDate: "",
                                  workOrderId: motorWorkOrder?.workOrderId ?? null,
                                  motorInstanceGroupId: motorWorkOrder
                                    ? null
                                    : motor.instance_group_id,
                                })
                              }
                              className="text-xs text-gold-600 hover:underline italic transition-colors"
                            >
                              Add date
                            </button>
                          )}
                        </td>
                      );
                    }

                    if (col.missing) {
                      return (
                        <td key={col.label} className="py-3.5 px-4 text-xs text-gray-400 italic">
                          Not defined
                        </td>
                      );
                    }

                    const woc = findWorkOrderComponent(
                      motor.instance_group_id,
                      col.componentId
                    );
                    const status = woc
                      ? deriveComponentStatusFromWOC(woc)
                      : "Pending";

                    const isEditingThisCell =
                      editingCell?.motorId === motor.instance_group_id &&
                      editingCell?.componentId === col.componentId;

                    return (
                      <td key={col.componentId} className="py-3.5 px-4">
                        {isEditingThisCell ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              className="border border-navy-100 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {DISPLAY_STATUS[opt]}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => saveStatus(motor, col, editingValue)}
                              className="px-3 py-1.5 bg-navy-800 text-white rounded hover:bg-navy-700 transition-colors text-sm"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingCell(null)}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() =>
                                startEditStatus(motor.instance_group_id, col, status)
                              }
                              className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${statusToBadgeClass(
                                status
                              )}`}
                              title="Click to change status"
                            >
                              {DISPLAY_STATUS[status] || "Yet To Start"}
                            </button>
                            <button
                              onClick={() => openCellDetails(motor, col)}
                              className="text-sm text-gold-600 hover:underline transition-colors"
                            >
                              Details
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
          existingWorkOrderComponent={openDetail.woc}
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

      {editTesting && (
        <TestingEditor
          orderId={orderId}
          workOrderId={editTesting.workOrderId}
          instanceGroupId={editTesting.instanceGroupId}
          testingType={editTesting.testingType}
          initialQty={editTesting.qty}
          initialDate={editTesting.testDate}
          initialControllerType={editTesting.controllerType}
          onClose={() => setEditTesting(null)}
          onSaved={async () => {
            setEditTesting(null);
            await refetchAll();
          }}
        />
      )}

</div>
  );
}