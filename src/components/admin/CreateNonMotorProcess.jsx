import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Search,
  PlusCircle,
  RefreshCw,
  Pencil,
  X,
  Calendar,
  CheckCircle,
  Clock,
  Package,
  Trash2,
} from "lucide-react";
import AddNonMotorModal from "./Addnonmotormodal";
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

const normalizeNonMotor = (nm) => ({
  ...nm,
  instance_group_id:
    nm?.instance_group_id ?? nm?.instanceGroupId ?? nm?.id ?? nm?.group_id ?? null,
  instance_name:
    nm?.instance_name ?? nm?.instanceName ?? nm?.name ?? nm?.group_name ?? "",
  instance_type: nm?.instance_type ?? nm?.instanceType ?? nm?.type ?? "",
});

// ─── Status is now purely date-derived ────────────────────────────────
const getStageStatus = (stageDate) => {
  return stageDate ? "Completed" : "Pending";
};

const statusToBadgeClass = (status) => {
  switch (status) {
    case "Completed":
      return "bg-green-600 text-white";
    case "Pending":
    default:
      return "bg-gray-300 text-gray-800";
  }
};

const statusToLabel = (status, date) => {
  if (status === "Completed" && date) {
    return `Completed on ${new Date(date).toLocaleDateString("en-IN")}`;
  }
  return "Date not set";
};

/* ---------- generic modal ---------- */
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

/* ---------- Component Editor Modal ---------- */
function ComponentEditorModal({ nonMotor, workOrder, onClose, onAfterChange }) {
  const [components, setComponents] = useState([]);
  const [adding, setAdding] = useState(false);

  const [componentName, setComponentName] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (workOrder?.components) {
      setComponents(workOrder.components);
    }
  }, [workOrder]);

  const ensureWorkOrder = async () => {
    if (workOrder) return workOrder;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${getBackendUrl()}/api/process/${nonMotor.orderId}/work-orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            instance_group_id: nonMotor.instance_group_id,
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to create work order");
      const newWO = await res.json();
      return newWO;
    } catch (err) {
      notifyError("Failed to create work order");
      throw err;
    }
  };

  const handleAddComponent = async () => {
    if (!componentName.trim() || !quantity) {
      notifyError("Please enter component name and quantity");
      return;
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      notifyError("Quantity must be a positive integer");
      return;
    }

    setAdding(true);
    try {
      const token = localStorage.getItem("token");
      let component;

      // Try to create
      const compRes = await fetch(
        `${getBackendUrl()}/api/process/components`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            component_name: componentName.trim(),
            product_type: "Non-Motor",
          }),
        }
      );

      if (compRes.ok) {
        component = await compRes.json();
      } else {
        const errData = await safeJson(compRes);
        if (errData?.error?.includes("already exists")) {
          // Fetch existing
          const allRes = await fetch(
            `${getBackendUrl()}/api/process/components`,
            {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include",
            }
          );
          if (allRes.ok) {
            const all = await allRes.json();
            component = all.find(
              (c) =>
                c.componentName === componentName.trim() &&
                c.productType === "Non-Motor"
            );
          }
        }
        if (!component) {
          throw new Error(errData?.error || "Failed to create/find component");
        }
      }

      // Normalize id field – very important
      const componentId = component.componentId || component.component_id;

      if (!componentId) {
        throw new Error("Component ID not found in response");
      }

      const wo = await ensureWorkOrder();

      const attachRes = await fetch(
        `${getBackendUrl()}/api/process/work-orders/${wo.workOrderId}/components`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            component_id: componentId,
            quantity: qty,
          }),
        }
      );

      if (!attachRes.ok) {
        const errData = await safeJson(attachRes);
        throw new Error(errData?.error || "Failed to attach component");
      }

      notifySuccess("Component added");
      setComponentName("");
      setQuantity(1);

      // Instead of refetch — optimistic + trigger parent refresh
      setComponents((prev) => [
        ...prev,
        {
          componentName: componentName.trim(),
          quantity: qty,
          // minimal shape – real data comes from parent refresh
        },
      ]);

      if (onAfterChange) onAfterChange();
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Failed to add component");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal
      title={`Components — ${nonMotor.instance_name}`}
      onClose={onClose}
      widthClass="max-w-3xl"
    >
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Package className="text-blue-600" size={20} />
            <h4 className="font-semibold text-blue-900">Assembly Components</h4>
          </div>
          <p className="text-sm text-blue-800">
            Components added here are recorded only for this specific assembly.
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-gray-50">
          <h5 className="font-medium text-gray-700 mb-3">Add New Component</h5>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Component Name *
              </label>
              <input
                type="text"
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                placeholder="e.g. Main Control Unit, Terminal Block..."
                disabled={adding}
              />
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
                disabled={adding}
              />
            </div>

            <button
              onClick={handleAddComponent}
              disabled={adding || !componentName.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? "Adding..." : "Add Component"}
            </button>
          </div>
        </div>

        <div>
          <h5 className="font-medium text-gray-700 mb-3">
            Attached Components ({components.length})
          </h5>

          {components.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
              No components added yet
            </div>
          ) : (
            <div className="space-y-2">
              {components.map((comp, idx) => (
                <div
                  key={comp.id || comp.workOrderComponentId || idx}
                  className="flex items-center justify-between p-3 border rounded-lg bg-white"
                >
                  <div>
                    <div className="font-medium text-gray-800">
                      {comp.componentName}
                    </div>
                    <div className="text-sm text-gray-600">
                      Qty: {comp.quantity}
                    </div>
                  </div>
                  <button
                    disabled
                    title="Component removal is not supported yet"
                    className="text-gray-400 cursor-not-allowed p-2"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Stage Date Editor Modal ---------- */
function StageDateEditorModal({ workOrder, stageName, currentDate, onClose, onSave }) {
  const [targetDate, setTargetDate] = useState(currentDate || "");

  return (
    <Modal
      title={`Set Completion Date — ${stageName}`}
      onClose={onClose}
      widthClass="max-w-md"
    >
      <div className="space-y-5">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm">
          <p className="font-medium text-amber-800">
            Assembly: {workOrder?.instanceName || "—"}
          </p>
          <p className="mt-1 text-amber-700">
            This date is recorded only for this specific assembly.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Completion Date
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Leave empty to mark as not completed.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(targetDate || null)}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Main Page Component ---------- */
export default function CreateNonMotorProcess({ socket }) {
  const { orderId } = useParams();

  const [customerName, setCustomerName] = useState("");
  const [nonMotors, setNonMotors] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);

  const [showAddNonMotor, setShowAddNonMotor] = useState(false);
  const [openComponentEditor, setOpenComponentEditor] = useState(null);
  const [editStage, setEditStage] = useState(null);
  const { notifySuccess, notifyError, notifyWarning } = useNotify();

  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => refetchAll();

    socket.on("instanceGroupUpdate", handleUpdate);
    socket.on("workOrderUpdate", handleUpdate);

    return () => {
      socket.off("instanceGroupUpdate", handleUpdate);
      socket.off("workOrderUpdate", handleUpdate);
    };
  }, [socket]);

  const tokenGuard = () => {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Authentication token missing");
    return token;
  };

  const refetchAll = useCallback(async () => {
    setLoadingList(true);
    try {
      const token = tokenGuard();

      // Get instance groups (non-motors)
      const igRes = await fetch(
        `${getBackendUrl()}/api/process/${orderId}/instance-groups`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      if (igRes.ok) {
        const data = await igRes.json();
        const instances = Array.isArray(data) ? data.map(normalizeNonMotor) : [];
        setNonMotors(instances.filter((nm) => nm.instance_type === "Non-Motor"));
      }

      // Get all work orders + stages + components
      const woRes = await fetch(
        `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      if (woRes.ok) {
        const data = await woRes.json();
        setWorkOrders(data.workOrders || []);
      }
    } catch (err) {
      console.error(err);
      notifyError("Failed to refresh data");
    } finally {
      setLoadingList(false);
    }
  }, [orderId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = tokenGuard();

        // Get order / customer name
        const ordersRes = await fetch(`${getBackendUrl()}/api/process/orders`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (ordersRes.ok) {
          const all = await ordersRes.json();
          const current = all.find((o) => String(o.orderId) === String(orderId));
          setCustomerName(current?.customerName || "Unknown");
        }

        await refetchAll();
      } catch (err) {
        notifyError("Failed to load initial data");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId, refetchAll]);

  const filteredNonMotors = useMemo(() => {
    if (!search.trim()) return nonMotors;
    const q = search.toLowerCase();
    return nonMotors.filter((nm) =>
      (nm.instance_name || "").toLowerCase().includes(q)
    );
  }, [nonMotors, search]);

  const getWorkOrderForNonMotor = (instanceGroupId) => {
    return workOrders.find(
      (w) => Number(w.instanceGroupId) === Number(instanceGroupId)
    );
  };

  const getStageData = (workOrder, stageName) => {
    if (!workOrder?.stages) return null;
    return workOrder.stages.find((s) => s.stageName === stageName) || null;
  };

  const handleEditStageDate = (nonMotor, stageName) => {
    const wo = getWorkOrderForNonMotor(nonMotor.instance_group_id);
    if (!wo) {
      notifyWarning("Work order not created yet. Add at least one component first.");
      return;
    }

    const stage = getStageData(wo, stageName);
    setEditStage({
      workOrder: wo,
      stageName,
      currentDate: stage?.stageDate || "",
    });
  };

  const saveStageDate = async (date) => {
    if (!editStage) return;

    try {
      const token = tokenGuard();
      const res = await fetch(
        `${getBackendUrl()}/api/process/work-orders/${editStage.workOrder.workOrderId}/stages`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify({
            stage_name: editStage.stageName,
            stage_date: date || null,
          }),
        }
      );

      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err?.error || "Failed to update stage date");
      }

      notifySuccess(date ? "Date saved" : "Date cleared");
      setEditStage(null);
      await refetchAll();
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Could not save date");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        Loading non-motor assemblies…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 p-6 md:p-8">
      <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-8 md:mb-10 text-center">
        Non-Motor Assemblies — Order #{orderId} — {customerName}
      </h1>

      <div className="max-w-7xl mx-auto mb-6 flex flex-col sm:flex-row gap-4 md:gap-6">
        <div className="relative flex-grow">
          <input
            type="text"
            placeholder="Search assemblies by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-4 pl-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white shadow-sm"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={refetchAll}
            disabled={loadingList}
            className="px-5 py-3 bg-blue-100 text-blue-800 rounded-xl hover:bg-blue-200 flex items-center gap-2 shadow-sm"
          >
            <RefreshCw className={loadingList ? "animate-spin" : ""} size={18} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddNonMotor(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center gap-2 shadow-md"
          >
            <PlusCircle size={18} /> Add Non-Motor
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gradient-to-r from-blue-100 to-blue-50">
              <th className="py-5 px-4 font-semibold text-gray-800">Assembly</th>
              <th className="py-5 px-4 font-semibold text-gray-800">Components</th>
              {STAGE_LIST.map((stage) => (
                <th
                  key={stage}
                  className="py-5 px-4 font-semibold text-gray-800 whitespace-nowrap"
                >
                  {stage}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredNonMotors.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + STAGE_LIST.length}
                  className="py-12 text-center text-gray-500"
                >
                  No non-motor assemblies found. Add one to begin.
                </td>
              </tr>
            ) : (
              filteredNonMotors.map((nonMotor) => {
                const wo = getWorkOrderForNonMotor(nonMotor.instance_group_id);
                const componentCount = wo?.components?.length || 0;

                return (
                  <tr
                    key={nonMotor.instance_group_id}
                    className="border-t hover:bg-blue-50/60 transition-colors"
                  >
                    <td className="py-5 px-4">
                      <div className="font-semibold">
                        {nonMotor.instance_name || "(unnamed)"}
                      </div>
                      {nonMotor.instance_type && (
                        <div className="text-sm text-gray-600">
                          {nonMotor.instance_type}
                        </div>
                      )}
                    </td>

                    <td className="py-5 px-4">
                      <button
                        onClick={() =>
                          setOpenComponentEditor({
                            ...nonMotor,
                            orderId,
                            workOrder: wo,
                          })
                        }
                        className="text-blue-600 hover:underline flex items-center gap-2"
                      >
                        <Package size={16} />
                        {componentCount === 0
                          ? "Add Components"
                          : `${componentCount} component${componentCount !== 1 ? "s" : ""}`}
                      </button>
                    </td>

                    {STAGE_LIST.map((stageName) => {
                      const stageData = getStageData(wo, stageName);
                      const status = getStageStatus(stageData?.stageDate);
                      const displayText = statusToLabel(status, stageData?.stageDate);

                      return (
                        <td key={stageName} className="py-5 px-4">
                          {wo ? (
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleEditStageDate(nonMotor, stageName)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${statusToBadgeClass(
                                  status
                                )}`}
                                title="Click to set or change date"
                              >
                                {displayText}
                              </button>

                              {stageData?.stageDate && (
                                <button
                                  onClick={() => handleEditStageDate(nonMotor, stageName)}
                                  className="text-blue-600 hover:underline text-xs"
                                >
                                  edit
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">
                              Add components first
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showAddNonMotor && (
        <AddNonMotorModal
          orderId={orderId}
          customerName={customerName}
          onClose={() => setShowAddNonMotor(false)}
          onCreated={refetchAll}
        />
      )}

      {openComponentEditor && (
        <ComponentEditorModal
          nonMotor={openComponentEditor}
          workOrder={openComponentEditor.workOrder}
          onClose={() => setOpenComponentEditor(null)}
          onAfterChange={refetchAll}
        />
      )}

      {editStage && (
        <StageDateEditorModal
          workOrder={editStage.workOrder}
          stageName={editStage.stageName}
          currentDate={editStage.currentDate}
          onClose={() => setEditStage(null)}
          onSave={saveStageDate}
        />
      )}

</div>
  );
}