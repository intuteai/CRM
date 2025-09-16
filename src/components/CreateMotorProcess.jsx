// import React, { useEffect, useMemo, useState } from "react";
// import { useParams } from "react-router-dom";
// import { toast } from "react-toastify";
// import {
//   Search,
//   ChevronDown,
//   Pencil,
//   X,
//   Calendar,
//   User,
//   Package,
//   AlertCircle,
// } from "lucide-react";

// // Modal component
// const Modal = ({ title, onClose, children, widthClass = "max-w-lg" }) => (
//   <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
//     <div className={`w-full ${widthClass}`}>
//       <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200">
//         <button
//           onClick={onClose}
//           className="absolute right-4 top-4 text-gray-500 hover:text-gray-700"
//           aria-label="Close"
//         >
//           <X size={22} />
//         </button>
//         <div className="p-6 border-b">
//           <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
//         </div>
//         <div className="p-6">{children}</div>
//       </div>
//     </div>
//   </div>
// );

// // ProcessRowEditor component
// function ProcessRowEditor({ row, onChange, onCancel, onSave, workOrderQuantity, processes }) {
//   const [error, setError] = useState("");

//   const handleSave = () => {
//     const completedQty = Number(row.completedQuantity);
//     const rawQty = Number(row.rawQtyUsed);
//     if (row.completedQuantity && (!Number.isInteger(completedQty) || completedQty < 0)) {
//       setError("Completed quantity must be a non-negative integer");
//       return;
//     }
//     if (row.rawQtyUsed && (!Number.isInteger(rawQty) || rawQty < 0)) {
//       setError("Raw quantity used must be a non-negative integer");
//       return;
//     }
//     if (completedQty > rawQty) {
//       setError("Completed quantity cannot exceed raw quantity used");
//       return;
//     }
//     if (row.responsiblePerson && (typeof row.responsiblePerson !== "string" || row.responsiblePerson.length > 255)) {
//       setError("Responsible person must be a string with max length 255");
//       return;
//     }
//     // Calculate total completed quantity, excluding the current process
//     const totalCompletedQty = processes
//       .filter(p => p.id !== row.id)
//       .reduce((sum, p) => sum + Number(p.completedQuantity || 0), 0);
//     const newTotalCompletedQty = totalCompletedQty + completedQty;
//     if (newTotalCompletedQty > workOrderQuantity) {
//       setError(`Total completed quantity (${newTotalCompletedQty}) cannot exceed work order quantity (${workOrderQuantity})`);
//       return;
//     }
//     setError("");
//     onSave();
//   };

//   return (
//     <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
//       <div>
//         <label className="block text-sm text-gray-700 mb-1">Responsible Person</label>
//         <input
//           type="text"
//           value={row.responsiblePerson || ""}
//           onChange={(e) => onChange({ ...row, responsiblePerson: e.target.value })}
//           className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
//           placeholder="e.g., Asha"
//         />
//       </div>
//       <div>
//         <label className="block text-sm text-gray-700 mb-1">Target Date</label>
//         <input
//           type="date"
//           value={row.targetDate || ""}
//           onChange={(e) => onChange({ ...row, targetDate: e.target.value })}
//           className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
//         />
//       </div>
//       <div>
//         <label className="block text-sm text-gray-700 mb-1">Raw Quantity Used</label>
//         <input
//           type="number"
//           value={row.rawQtyUsed ?? ""}
//           onChange={(e) => onChange({ ...row, rawQtyUsed: e.target.value })}
//           className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
//           placeholder="Enter raw quantity used"
//           min="0"
//           step="1"
//         />
//       </div>
//       <div>
//         <label className="block text-sm text-gray-700 mb-1">Completed Quantity</label>
//         <input
//           type="number"
//           value={row.completedQuantity ?? ""}
//           onChange={(e) => onChange({ ...row, completedQuantity: e.target.value })}
//           className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
//           placeholder="Enter completed quantity"
//           min="0"
//           step="1"
//         />
//       </div>
//       {error && (
//         <p className="text-sm text-red-600 mt-1">{error}</p>
//       )}
//       <div className="flex justify-end gap-3">
//         <button onClick={onCancel} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
//           Cancel
//         </button>
//         <button
//           onClick={handleSave}
//           className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
//         >
//           Save
//         </button>
//       </div>
//     </form>
//   );
// }

// // MaterialEditor component
// function MaterialEditor({ material, onCancel, onSave }) {
//   const [quantityPerUnit, setQuantityPerUnit] = useState(material.quantityPerUnit || 0);
//   const [requiredQuantity, setRequiredQuantity] = useState(material.requiredQuantity || 0);
//   const [error, setError] = useState("");

//   const handleSave = () => {
//     const qtyPerUnit = Number(quantityPerUnit);
//     const reqQty = Number(requiredQuantity);
//     if (!Number.isInteger(qtyPerUnit) || qtyPerUnit < 0) {
//       setError("Quantity per unit must be a non-negative integer");
//       return;
//     }
//     if (!Number.isInteger(reqQty) || reqQty < 0) {
//       setError("Required quantity must be a non-negative integer");
//       return;
//     }
//     if (qtyPerUnit < reqQty) {
//       setError("Required quantity cannot exceed quantity per unit");
//       return;
//     }
//     setError("");
//     onSave(qtyPerUnit, reqQty);
//   };

//   return (
//     <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
//       <div>
//         <label className="block text-sm text-gray-700 mb-1">
//           Quantity per Unit (Raw Material ID: {material.rawMaterialId})
//         </label>
//         <input
//           type="number"
//           value={quantityPerUnit}
//           onChange={(e) => setQuantityPerUnit(e.target.value)}
//           className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
//           placeholder="Enter quantity per unit"
//           min="0"
//           step="1"
//         />
//       </div>
//       <div>
//         <label className="block text-sm text-gray-700 mb-1">
//           Required Quantity (Raw Material ID: {material.rawMaterialId})
//         </label>
//         <input
//           type="number"
//           value={requiredQuantity}
//           onChange={(e) => setRequiredQuantity(e.target.value)}
//           className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
//           placeholder="Enter required quantity"
//           min="0"
//           step="1"
//         />
//       </div>
//       {error && (
//         <p className="text-sm text-red-600 mt-1">{error}</p>
//       )}
//       <div className="flex justify-end gap-3">
//         <button onClick={onCancel} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
//           Cancel
//         </button>
//         <button
//           onClick={handleSave}
//           className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
//         >
//           Save
//         </button>
//       </div>
//     </form>
//   );
// }

// const getBackendUrl = () => import.meta.env.VITE_BACKEND_URL || "";

// async function safeJson(res) {
//   const txt = await res.text();
//   try {
//     return txt ? JSON.parse(txt) : null;
//   } catch {
//     return null;
//   }
// }

// const STAGE_LIST = ["Assembly", "Testing", "PDI", "Packing", "Dispatch"];
// const normalizeStages = (existing = []) => {
//   const by = new Map(existing.map(s => [s.stageName, s.stageDate || ""]));
//   return STAGE_LIST.map(name => ({ name, date: by.get(name) || "" }));
// };

// export default function CreateMotorProcess() {
//   const { orderId } = useParams();
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");

//   const [components, setComponents] = useState([]);
//   const [query, setQuery] = useState("");
//   const [selectedComponentId, setSelectedComponentId] = useState(null);
//   const [workOrderId, setWorkOrderId] = useState(null);
//   const [workOrderQuantity, setWorkOrderQuantity] = useState(0);

//   const [materialsLoading, setMaterialsLoading] = useState(false);
//   const [materialsError, setMaterialsError] = useState("");
//   const [componentMaterials, setComponentMaterials] = useState([]);
//   const [editMaterial, setEditMaterial] = useState(null);

//   const [processLocalState, setProcessLocalState] = useState({});
//   const [editRow, setEditRow] = useState(null);

//   const [showStatusModal, setShowStatusModal] = useState(false);
//   const [stages, setStages] = useState(STAGE_LIST.map(n => ({ name: n, date: "" })));
//   const [stagesLoading, setStagesLoading] = useState(false);
//   const [stagesError, setStagesError] = useState("");
//   const [stagesSaving, setStagesSaving] = useState(false);

//   // Fetch components
//   useEffect(() => {
//     const run = async () => {
//       setLoading(true);
//       setError("");
//       try {
//         const token = localStorage.getItem("token");
//         if (!token) throw new Error("Authentication token missing");

//         const url = `${getBackendUrl()}/api/process/components`;
//         const res = await fetch(url, {
//           headers: { Authorization: `Bearer ${token}` },
//           credentials: "include",
//         });

//         if (!res.ok) {
//           const data = await safeJson(res);
//           throw new Error(data?.error || `Failed to fetch components (${res.status})`);
//         }

//         const list = await res.json();
//         setComponents(Array.isArray(list) ? list : []);
//         const shell = list.find((c) => c.componentName?.toLowerCase() === "shell");
//         const firstId = shell?.componentId ?? list[0]?.componentId ?? null;
//         setSelectedComponentId(firstId);
//       } catch (e) {
//         setError(e.message || "Failed to load components");
//       } finally {
//         setLoading(false);
//       }
//     };
//     run();
//   }, []);

//   // Fetch or create work order and its processes
//   useEffect(() => {
//     if (!selectedComponentId || !orderId) return;

//     const run = async () => {
//       try {
//         const token = localStorage.getItem("token");
//         if (!token) throw new Error("Authentication token missing");

//         // Fetch work orders
//         const res = await fetch(
//           `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
//           {
//             headers: { Authorization: `Bearer ${token}` },
//             credentials: "include",
//           }
//         );

//         if (!res.ok) {
//           const data = await safeJson(res);
//           throw new Error(data?.error || `Failed to fetch work orders (${res.status})`);
//         }

//         const data = await res.json();
//         const existingWorkOrder = data.workOrders?.find(
//           (wo) => wo.componentId === Number(selectedComponentId)
//         );

//         if (existingWorkOrder) {
//           setWorkOrderId(existingWorkOrder.workOrderId);
//           setWorkOrderQuantity(existingWorkOrder.quantity);
//           const processState = {};
//           existingWorkOrder.processes.forEach((p) => {
//             processState[p.processId] = {
//               responsiblePerson: p.responsiblePerson || "",
//               targetDate: p.completionDate || "",
//               completedQuantity: p.completedQuantity ?? 0,
//               rawQtyUsed: p.rawQuantityUsed ?? 0,
//             };
//           });
//           setProcessLocalState(processState);
//           return;
//         }

//         // Fetch material requirements to determine quantity
//         const materialRes = await fetch(
//           `${getBackendUrl()}/api/process/components/${selectedComponentId}/materials`,
//           {
//             headers: { Authorization: `Bearer ${token}` },
//             credentials: "include",
//           }
//         );
//         let requiredQuantity = 5; // Default to 5 if no material data
//         if (materialRes.ok) {
//           const materials = await materialRes.json();
//           const material = materials.find(m => m.requiredQuantity);
//           requiredQuantity = material?.requiredQuantity || 5; // Use material's requiredQuantity or fallback to 5
//         }

//         // Create a new work order with dynamic quantity
//         const createRes = await fetch(`${getBackendUrl()}/api/process/${orderId}`, {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${token}`,
//           },
//           credentials: "include",
//           body: JSON.stringify({
//             component_id: selectedComponentId,
//             quantity: requiredQuantity, // Dynamic quantity from material or default
//             target_date: new Date().toISOString().split("T")[0],
//           }),
//         });

//         if (!createRes.ok) {
//           const data = await safeJson(createRes);
//           throw new Error(data?.error || `Failed to create work order (${createRes.status})`);
//         }

//         const newWorkOrder = await createRes.json();
//         setWorkOrderId(newWorkOrder.workOrderId);
//         setWorkOrderQuantity(newWorkOrder.quantity);
//         const processState = {};
//         newWorkOrder.processes.forEach((p) => {
//           processState[p.processId] = {
//             responsiblePerson: p.responsiblePerson || "",
//             targetDate: p.completionDate || "",
//             completedQuantity: p.completedQuantity ?? 0,
//             rawQtyUsed: p.rawQuantityUsed ?? 0,
//           };
//         });
//         setProcessLocalState(processState);
//         toast.success("Work order created successfully");
//       } catch (e) {
//         setError(e.message || "Failed to load or create work order");
//         toast.error(e.message || "Failed to load or create work order");
//       }
//     };
//     run();
//   }, [selectedComponentId, orderId]);

//   // Fetch materials
//   useEffect(() => {
//     if (!selectedComponentId) return;
//     const run = async () => {
//       setMaterialsLoading(true);
//       setMaterialsError("");
//       setComponentMaterials([]);
//       try {
//         const token = localStorage.getItem("token");
//         if (!token) throw new Error("Authentication token missing");

//         const url = `${getBackendUrl()}/api/process/components/${selectedComponentId}/materials`;
//         const res = await fetch(url, {
//           headers: { Authorization: `Bearer ${token}` },
//           credentials: "include",
//         });

//         if (!res.ok) {
//           const data = await safeJson(res);
//           throw new Error(data?.error || `Failed to fetch materials (${res.status})`);
//         }

//         const rows = await res.json();
//         setComponentMaterials(Array.isArray(rows) ? rows : []);
//       } catch (e) {
//         setMaterialsError(e.message || "Failed to load materials");
//         toast.error(e.message || "Failed to load materials");
//       } finally {
//         setMaterialsLoading(false);
//       }
//     };
//     run();
//   }, [selectedComponentId]);

//   // Fetch stages automatically on mount
//   useEffect(() => {
//     if (!orderId) return;

//     const loadStages = async () => {
//       setStagesLoading(true);
//       setStagesError("");
//       try {
//         const token = localStorage.getItem("token");
//         if (!token) throw new Error("Authentication token missing");

//         const res = await fetch(
//           `${getBackendUrl()}/api/process/${orderId}/stages?force_refresh=true`,
//           {
//             headers: { Authorization: `Bearer ${token}` },
//             credentials: "include",
//           }
//         );

//         if (!res.ok) {
//           const data = await safeJson(res);
//           throw new Error(data?.error || `Failed to fetch order stages (${res.status})`);
//         }

//         const existing = await res.json();
//         setStages(normalizeStages(existing));
//       } catch (e) {
//         setStagesError(e.message || "Unable to load order stages");
//         toast.error(e.message || "Unable to load order stages");
//       } finally {
//         setStagesLoading(false);
//       }
//     };

//     loadStages();
//   }, [orderId]);

//   // Save material edits
//   const saveMaterialEdits = async (material, newQuantityPerUnit, newRequiredQuantity) => {
//     try {
//       const token = localStorage.getItem("token");
//       if (!token) throw new Error("Authentication token missing");

//       const url = `${getBackendUrl()}/api/process/components/${material.componentId}/materials/${material.materialId}`;
//       const res = await fetch(url, {
//         method: "PUT",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         credentials: "include",
//         body: JSON.stringify({ quantity_per_unit: newQuantityPerUnit, required_quantity: newRequiredQuantity }),
//       });

//       if (!res.ok) {
//         const data = await safeJson(res);
//         throw new Error(data?.error || `Failed to update material (${res.status})`);
//       }

//       const updatedMaterial = await res.json();
//       setComponentMaterials((prev) =>
//         prev.map((m) =>
//           m.materialId === material.materialId
//             ? { ...m, quantityPerUnit: updatedMaterial.quantityPerUnit, requiredQuantity: updatedMaterial.requiredQuantity }
//             : m
//         )
//       );
//       setEditMaterial(null);
//       toast.success("Material updated successfully");

//       // Re-fetch materials to ensure consistency
//       const refetchMaterialsRes = await fetch(
//         `${getBackendUrl()}/api/process/components/${material.componentId}/materials`,
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           credentials: "include",
//         }
//       );
//       if (refetchMaterialsRes.ok) {
//         const rows = await refetchMaterialsRes.json();
//         setComponentMaterials(Array.isArray(rows) ? rows : []);
//       }

//       // Re-fetch work order to update workOrderQuantity
//       const refetchWorkOrderRes = await fetch(
//         `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           credentials: "include",
//         }
//       );
//       if (refetchWorkOrderRes.ok) {
//         const data = await refetchWorkOrderRes.json();
//         const workOrder = data.workOrders?.find(
//           (wo) => wo.componentId === Number(selectedComponentId)
//         );
//         if (workOrder) {
//           setWorkOrderId(workOrder.workOrderId);
//           setWorkOrderQuantity(workOrder.quantity);
//           const processState = {};
//           workOrder.processes.forEach((p) => {
//             processState[p.processId] = {
//               responsiblePerson: p.responsiblePerson || "",
//               targetDate: p.completionDate || "",
//               completedQuantity: p.completedQuantity ?? 0,
//               rawQtyUsed: p.rawQuantityUsed ?? 0,
//             };
//           });
//           setProcessLocalState(processState);
//         }
//       }
//     } catch (e) {
//       setMaterialsError(e.message || "Failed to save material changes");
//       toast.error(e.message || "Failed to save material changes");
//     }
//   };

//   // Save process edits
//   const saveRowEdits = async () => {
//     if (!editRow || !workOrderId) {
//       toast.error("Cannot save: Work order or process not selected");
//       return;
//     }

//     try {
//       const token = localStorage.getItem("token");
//       if (!token) throw new Error("Authentication token missing");

//       const completedQty = editRow.completedQuantity ? Number(editRow.completedQuantity) : 0;
//       const rawQty = editRow.rawQtyUsed ? Number(editRow.rawQtyUsed) : 0;

//       // Fetch current processes to validate total completed quantity
//       const res = await fetch(
//         `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           credentials: "include",
//         }
//       );
//       if (!res.ok) {
//         const data = await safeJson(res);
//         throw new Error(data?.error || `Failed to fetch work orders (${res.status})`);
//       }
//       const data = await res.json();
//       const workOrder = data.workOrders?.find(
//         (wo) => wo.workOrderId === Number(workOrderId)
//       );
//       if (!workOrder) {
//         throw new Error("Work order not found");
//       }
//       const totalCompletedQty = workOrder.processes
//         .filter(p => p.processId !== Number(editRow.id))
//         .reduce((sum, p) => sum + Number(p.completedQuantity || 0), 0);
//       const newTotalCompletedQty = totalCompletedQty + completedQty;
//       if (newTotalCompletedQty > workOrderQuantity) {
//         throw new Error(`Total completed quantity (${newTotalCompletedQty}) cannot exceed work order quantity (${workOrderQuantity})`);
//       }

//       if (!Number.isInteger(completedQty) || completedQty < 0) {
//         throw new Error("Completed quantity must be a non-negative integer");
//       }
//       if (!Number.isInteger(rawQty) || rawQty < 0) {
//         throw new Error("Raw quantity used must be a non-negative integer");
//       }
//       if (completedQty > rawQty) {
//         throw new Error("Completed quantity cannot exceed raw quantity used");
//       }
//       if (editRow.responsiblePerson && (typeof editRow.responsiblePerson !== "string" || editRow.responsiblePerson.length > 255)) {
//         throw new Error("Responsible person must be a string with max length 255");
//       }

//       const url = `${getBackendUrl()}/api/process/${workOrderId}/process-status`;
//       const updateRes = await fetch(url, {
//         method: "PUT",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         credentials: "include",
//         body: JSON.stringify({
//           process_id: Number(editRow.id),
//           status: editRow.responsiblePerson ? "In Progress" : "Pending",
//           completed_quantity: completedQty,
//           raw_quantity_used: rawQty,
//           completion_date: editRow.targetDate || null,
//           responsible_person: editRow.responsiblePerson || null,
//         }),
//       });

//       if (!updateRes.ok) {
//         const data = await safeJson(updateRes);
//         throw new Error(data?.error || `Failed to update process status (${updateRes.status})`);
//       }

//       const updatedWorkOrder = await updateRes.json();
//       setProcessLocalState((prev) => ({
//         ...prev,
//         [editRow.id]: {
//           responsiblePerson: editRow.responsiblePerson || "",
//           targetDate: editRow.targetDate || "",
//           completedQuantity: completedQty,
//           rawQtyUsed: rawQty,
//         },
//       }));
//       setEditRow(null);
//       toast.success("Process updated successfully");

//       // Re-fetch work order to ensure consistency
//       const refetchRes = await fetch(
//         `${getBackendUrl()}/api/process/${orderId}?force_refresh=true`,
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           credentials: "include",
//         }
//       );
//       if (refetchRes.ok) {
//         const data = await refetchRes.json();
//         const workOrder = data.workOrders?.find(
//           (wo) => wo.componentId === Number(selectedComponentId)
//         );
//         if (workOrder) {
//           const processState = {};
//           workOrder.processes.forEach((p) => {
//             processState[p.processId] = {
//               responsiblePerson: p.responsiblePerson || "",
//               targetDate: p.completionDate || "",
//               completedQuantity: p.completedQuantity ?? 0,
//               rawQtyUsed: p.rawQuantityUsed ?? 0,
//             };
//           });
//           setProcessLocalState(processState);
//           setWorkOrderQuantity(workOrder.quantity);
//         }
//       }
//     } catch (e) {
//       toast.error(e.message || "Failed to save process changes");
//     }
//   };

//   // Save stages
//   const saveStages = async () => {
//     if (!orderId) return;
//     setStagesSaving(true);
//     try {
//       const token = localStorage.getItem("token");
//       if (!token) throw new Error("Authentication token missing");

//       const toSave = stages.filter(s => s.date);
//       let warnings = [];

//       for (const s of toSave) {
//         const res = await fetch(`${getBackendUrl()}/api/process/${orderId}/stages`, {
//           method: "PUT",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${token}`,
//           },
//           credentials: "include",
//           body: JSON.stringify({ stage_name: s.name, stage_date: s.date }),
//         });

//         if (!res.ok) {
//           const data = await safeJson(res);
//           warnings.push(`${s.name}: ${data?.error || `Failed (${res.status})`}`);
//         }
//       }

//       if (warnings.length) {
//         toast.error(`Some stages could not be saved:\n${warnings.join("\n")}`);
//       } else {
//         toast.success("Order stages updated successfully");
//       }

//       // Re-fetch stages
//       const refetchRes = await fetch(
//         `${getBackendUrl()}/api/process/${orderId}/stages?force_refresh=true`,
//         {
//           headers: { Authorization: `Bearer ${token}` },
//           credentials: "include",
//         }
//       );
//       if (refetchRes.ok) {
//         const existing = await refetchRes.json();
//         setStages(normalizeStages(existing));
//       }

//       setShowStatusModal(false);
//     } catch (e) {
//       toast.error(e.message || "Failed to save stages");
//     } finally {
//       setStagesSaving(false);
//     }
//   };

//   const options = useMemo(
//     () => components.map((c) => ({ value: c.componentId, label: c.componentName })),
//     [components]
//   );

//   const filteredOptions = useMemo(() => {
//     if (!query.trim()) return options;
//     const q = query.toLowerCase();
//     return options.filter((o) => o.label.toLowerCase().includes(q));
//   }, [options, query]);

//   const selectedComponent = useMemo(
//     () => components.find((c) => c.componentId === Number(selectedComponentId)),
//     [components, selectedComponentId]
//   );

//   const processes = useMemo(() => {
//     const base = (selectedComponent?.processes || [])
//       .slice()
//       .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
//     return base.map((p) => {
//       const local = processLocalState[p.processId] || {};
//       return {
//         id: p.processId,
//         sequence: p.sequence,
//         name: p.processName,
//         responsiblePerson: local.responsiblePerson ?? p.responsiblePerson ?? "",
//         targetDate: local.targetDate ?? p.completionDate ?? "",
//         completedQuantity: local.completedQuantity ?? p.completedQuantity ?? 0,
//         rawQtyUsed: local.rawQtyUsed ?? p.rawQuantityUsed ?? 0,
//       };
//     });
//   }, [selectedComponent, processLocalState]);

//   const getCompletedQtyColor = (rawQtyUsed, completedQty) => {
//     const raw = Number(rawQtyUsed);
//     const completed = Number(completedQty);
//     if (completed === 0) return "bg-red-600 text-white";
//     if (completed === raw && completed > 0) return "bg-green-600 text-white";
//     if (0 < completed && completed < raw) return "bg-yellow-600 text-white";
//     return "bg-gray-500 text-white"; // For invalid cases (e.g., completed > raw)
//   };

//   const handleSearch = () => {
//     const first = filteredOptions[0];
//     if (first) setSelectedComponentId(first.value);
//   };

//   const openEdit = (row) => setEditRow({ ...row });

//   const openMaterialEdit = (material) => setEditMaterial({ ...material });

//   const hasAnyDate = stages.some(s => s.date);
//   const nextDate = stages.map(s => s.date).filter(Boolean).sort()[0] || "";

//   if (loading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center text-gray-600">
//         Loading components…
//       </div>
//     );
//   }

//   if (error) {
//     return (
//       <div className="min-h-screen flex flex-col items-center justify-center text-red-700 p-6">
//         <div className="flex items-center gap-2 mb-3">
//           <AlertCircle />
//           <span className="font-semibold">Error</span>
//         </div>
//         <p className="text-center">{error}</p>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6">
//       <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
//         <div className="lg:col-span-2 space-y-6">
//           <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-4">
//             <div className="flex gap-3 items-end">
//               <div className="flex-1">
//                 <label htmlFor="component-search" className="block text-sm text-gray-600 mb-1">
//                   Search by Component
//                 </label>
//                 <div className="relative">
//                   <input
//                     id="component-search"
//                     type="text"
//                     value={query}
//                     onChange={(e) => setQuery(e.target.value)}
//                     placeholder="e.g., Shell, Rotor, Stator"
//                     className="w-full px-4 py-3 pl-10 border rounded-xl focus:ring-2 focus:ring-amber-300"
//                   />
//                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
//                 </div>
//               </div>
//               <button
//                 onClick={handleSearch}
//                 className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium"
//               >
//                 Search
//               </button>
//             </div>

//             <div className="mt-4">
//               <label className="block text-sm text-gray-600 mb-1">Select Component</label>
//               <div className="relative">
//                 <select
//                   className="w-full px-4 py-3 border rounded-xl appearance-none focus:ring-2 focus:ring-amber-300"
//                   value={selectedComponentId ?? ""}
//                   onChange={(e) => setSelectedComponentId(Number(e.target.value))}
//                 >
//                   {filteredOptions.map((opt) => (
//                     <option key={opt.value} value={opt.value}>
//                       {opt.label}
//                     </option>
//                   ))}
//                 </select>
//                 <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
//               </div>
//             </div>
//           </div>

//           <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
//             <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
//               <Package size={18} className="text-amber-600" />
//               Raw Materials Needed for:{" "}
//               <span className="font-normal text-gray-600">{selectedComponent?.componentName || "—"}</span>
//             </h3>

//             {materialsLoading ? (
//               <p className="text-gray-600">Loading materials…</p>
//             ) : materialsError ? (
//               <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
//                 <AlertCircle className="mt-0.5" size={18} />
//                 <div>
//                   <p className="font-medium">Materials unavailable</p>
//                   <p className="text-sm">{materialsError}</p>
//                 </div>
//               </div>
//             ) : componentMaterials.length ? (
//               <ul className="divide-y">
//                 {componentMaterials.map((rm) => (
//                   <li key={rm.materialId ?? `${rm.componentId}-${rm.rawMaterialId}`} className="py-3 flex justify-between items-center">
//                     <div>
//                       <p className="font-medium text-gray-900">Raw Material ID: {rm.rawMaterialId}</p>
//                       <p className="text-sm text-gray-600">
//                         Quantity / unit: <span className="font-medium">{rm.quantityPerUnit}</span>
//                       </p>
//                       {"requiredQuantity" in rm && (
//                         <p className="text-sm text-gray-600">
//                           Required Quantity: <span className="font-medium">{rm.requiredQuantity}</span>
//                         </p>
//                       )}
//                     </div>
//                     <div className="flex items-center gap-2">
//                       {typeof rm.materialId !== "undefined" && (
//                         <span className="text-xs text-gray-500">material_id: {rm.materialId}</span>
//                       )}
//                       <button
//                         onClick={() => openMaterialEdit(rm)}
//                         className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-amber-50"
//                       >
//                         <Pencil size={16} className="text-amber-600" />
//                         Edit
//                       </button>
//                     </div>
//                   </li>
//                 ))}
//               </ul>
//             ) : (
//               <p className="text-gray-500">No materials listed.</p>
//             )}
//           </div>

//           <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5">
//             <h3 className="text-lg font-semibold text-gray-800 mb-4">Processes</h3>
//             <div className="overflow-x-auto">
//               <table className="min-w-full text-sm">
//                 <thead>
//                   <tr className="text-left text-gray-600 border-b">
//                     <th className="py-3 pr-4">Seq</th>
//                     <th className="py-3 pr-4">Process Name</th>
//                     <th className="py-3 pr-4">
//                       <span className="inline-flex items-center gap-1">
//                         <User size={14} /> Responsible
//                       </span>
//                     </th>
//                     <th className="py-3 pr-4">
//                       <span className="inline-flex items-center gap-1">
//                         <Calendar size={14} /> Target Date
//                       </span>
//                     </th>
//                     <th className="py-3 pr-4">Raw Qty Used</th>
//                     <th className="py-3 pr-4">In use</th>
//                     <th className="py-3">Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {processes.length ? (
//                     processes.map((p) => (
//                       <tr key={p.id} className="border-b last:border-0">
//                         <td className="py-3 pr-4 text-gray-500">{p.sequence}</td>
//                         <td className="py-3 pr-4 font-medium text-gray-900">{p.name}</td>
//                         <td className="py-3 pr-4">{p.responsiblePerson || "—"}</td>
//                         <td className="py-3 pr-4">{p.targetDate || "—"}</td>
//                         <td className="py-3 pr-4">{p.rawQtyUsed}</td>
//                         <td className="py-3 pr-4">
//                           <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${getCompletedQtyColor(p.rawQtyUsed, p.completedQuantity)}`}>
//                             {p.completedQuantity}
//                           </span>
//                         </td>
//                         <td className="py-3">
//                           <button
//                             onClick={() => openEdit({ ...p })}
//                             className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:bg-amber-50"
//                           >
//                             <Pencil size={16} className="text-amber-600" />
//                             Edit
//                           </button>
//                         </td>
//                       </tr>
//                     ))
//                   ) : (
//                     <tr>
//                       <td className="py-4 text-gray-500" colSpan={7}>
//                         No processes listed.
//                       </td>
//                     </tr>
//                   )}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         </div>

//         <div className="lg:col-span-1">
//           <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 sticky top-6">
//             <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Status</h3>
//             {stagesLoading ? (
//               <p className="text-gray-600">Loading stages…</p>
//             ) : stagesError ? (
//               <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
//                 <AlertCircle className="mt-0.5" size={18} />
//                 <div>
//                   <p className="font-medium">Stages unavailable</p>
//                   <p className="text-sm">{stagesError}</p>
//                 </div>
//               </div>
//             ) : (
//               <div className="space-y-2 text-sm text-gray-700 mb-4">
//                 {stages.map(s => (
//                   <div key={s.name} className="flex justify-between">
//                     <span className="font-medium">{s.name}</span>
//                     <span className="text-gray-600">{s.date || "—"}</span>
//                   </div>
//                 ))}
//               </div>
//             )}
//             <div className="text-xs text-gray-500 mb-4">
//               {hasAnyDate ? (
//                 <span>
//                   Next target date: <span className="font-medium">{nextDate}</span>
//                 </span>
//               ) : (
//                 <span>No target dates set</span>
//               )}
//             </div>
//             <button
//               onClick={() => setShowStatusModal(true)}
//               className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-2.5 font-medium"
//             >
//               Edit Stages
//             </button>
//           </div>
//         </div>
//       </div>

//       {showStatusModal && (
//         <Modal
//           title="Order Status"
//           onClose={() => setShowStatusModal(false)}
//           widthClass="max-w-2xl"
//         >
//           {stagesLoading ? (
//             <p className="text-gray-600">Loading current stages…</p>
//           ) : (
//             <>
//               {stagesError && (
//                 <div className="mb-4 flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
//                   <AlertCircle className="mt-0.5" size={18} />
//                   <div>
//                     <p className="font-medium">Couldn’t load existing stages</p>
//                     <p className="text-sm">{stagesError}</p>
//                   </div>
//                 </div>
//               )}
//               <div className="overflow-x-auto">
//                 <table className="min-w-full text-sm">
//                   <thead>
//                     <tr className="text-left text-gray-600 border-b">
//                       <th className="py-3 pr-4">Task</th>
//                       <th className="py-3 pr-4">
//                         <span className="inline-flex items-center gap-1">
//                           <Calendar size={14} /> Target Date
//                         </span>
//                       </th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {stages.map((s, idx) => (
//                       <tr key={s.name} className="border-b last:border-0">
//                         <td className="py-3 pr-4 font-medium text-gray-900">{s.name}</td>
//                         <td className="py-3 pr-4">
//                           <input
//                             type="date"
//                             value={s.date}
//                             onChange={(e) => {
//                               const val = e.target.value;
//                               setStages(prev => {
//                                 const copy = [...prev];
//                                 copy[idx] = { ...copy[idx], date: val };
//                                 return copy;
//                               });
//                             }}
//                             className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
//                           />
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//               <div className="mt-6 flex justify-between">
//                 <button
//                   onClick={() => setStages(STAGE_LIST.map(n => ({ name: n, date: "" })))}
//                   className="px-4 py-2 rounded-lg border hover:bg-gray-50"
//                   disabled={stagesSaving}
//                 >
//                   Reset
//                 </button>
//                 <div className="flex gap-3">
//                   <button
//                     onClick={() => setShowStatusModal(false)}
//                     className="px-4 py-2 rounded-lg border hover:bg-gray-50"
//                     disabled={stagesSaving}
//                   >
//                     Close
//                   </button>
//                   <button
//                     onClick={saveStages}
//                     className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
//                     disabled={stagesSaving}
//                   >
//                     {stagesSaving ? "Saving…" : "Save"}
//                   </button>
//                 </div>
//               </div>
//             </>
//           )}
//         </Modal>
//       )}

//       {editRow && (
//         <Modal title={`Edit: ${editRow.name}`} onClose={() => setEditRow(null)}>
//           <ProcessRowEditor
//             row={editRow}
//             onChange={setEditRow}
//             onCancel={() => setEditRow(null)}
//             onSave={saveRowEdits}
//             workOrderQuantity={workOrderQuantity}
//             processes={processes}
//           />
//         </Modal>
//       )}

//       {editMaterial && (
//         <Modal
//           title={`Edit Material: Raw Material ID ${editMaterial.rawMaterialId}`}
//           onClose={() => setEditMaterial(null)}
//         >
//           <MaterialEditor
//             material={editMaterial}
//             onCancel={() => setEditMaterial(null)}
//             onSave={(quantityPerUnit, requiredQuantity) =>
//               saveMaterialEdits(editMaterial, quantityPerUnit, requiredQuantity)
//             }
//           />
//         </Modal>
//       )}
//     </div>
//   );
// }

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
  User,
  Package,
  AlertCircle,
} from "lucide-react";
import "react-toastify/dist/ReactToastify.css";

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
    if (!Number.isInteger(completedQty) || completedQty < 0)
      return setError("Completed quantity must be a non-negative integer");
    if (!Number.isInteger(rawQty) || rawQty < 0)
      return setError("Raw quantity used must be a non-negative integer");
    if (completedQty > rawQty)
      return setError("Completed quantity cannot exceed raw quantity used");
    if (
      row.responsiblePerson &&
      (typeof row.responsiblePerson !== "string" ||
        row.responsiblePerson.length > 255)
    ) {
      return setError(
        "Responsible person must be a string with max length 255"
      );
    }
    const totalCompletedQty = processes
      .filter((p) => p.id !== row.id)
      .reduce((sum, p) => sum + Number(p.completedQuantity || 0), 0);
    const newTotalCompletedQty = totalCompletedQty + completedQty;
    if (newTotalCompletedQty > workOrderQuantity) {
      return setError(
        `Total completed quantity (${newTotalCompletedQty}) cannot exceed work order quantity (${workOrderQuantity})`
      );
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
    if (!Number.isInteger(qtyPerUnit) || qtyPerUnit < 0)
      return setError("Quantity per unit must be a non-negative integer");
    if (!Number.isInteger(reqQty) || reqQty < 0)
      return setError("Required quantity must be a non-negative integer");
    if (qtyPerUnit < reqQty)
      return setError("Required quantity cannot exceed quantity per unit");
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
  const [responsiblePerson, setResponsiblePerson] = useState(
    stage.responsiblePerson ?? stage.responsible_person ?? ""
  );
  const [targetDate, setTargetDate] = useState(
    stage.targetDate ?? stage.stageDate ?? ""
  );
  const [status, setStatus] = useState(stage.status || "Pending");

  return (
    <Modal
      title={`Edit Stage: ${stage.name || stage.stageName}`}
      onClose={onCancel}
      widthClass="max-w-lg"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-700 mb-1">
            Responsible Person
          </label>
          <input
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
            value={responsiblePerson}
            onChange={(e) => setResponsiblePerson(e.target.value)}
            placeholder="e.g., Asha"
          />
        </div>
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
        <div>
          <label className="block text-sm text-gray-700 mb-1">Status</label>
          <select
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {DISPLAY_STATUS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border">
            Cancel
          </button>
          <button
            onClick={() => onSave({ responsiblePerson, targetDate, status })}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Component Detail Modal (unchanged logic) ---------- */
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
      onAfterChange && onAfterChange();
      return wo;
    } catch (e) {
      toast.error(e.message || "Failed to create work order");
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
    existingWorkOrder ? hydrateExisting() : undefined;
  }, [hydrateExisting, existingWorkOrder]);

  const saveRowEdits = async () => {
    if (!editRow) return;
    const token = localStorage.getItem("token");
    if (!token) return toast.error("Authentication token missing");
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
      onAfterChange && onAfterChange();
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
    if (!token) return toast.error("Authentication token missing");
    try {
      const url = `${getBackendUrl()}/api/process/components/${
        material.componentId
      }/materials/${material.materialId}`;
      const res = await fetch(url, {
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
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(
          data?.error || `Failed to update material (${res.status})`
        );
      }
      toast.success("Material updated");
      const mRes = await fetch(
        `${getBackendUrl()}/api/process/components/${
          component.componentId
        }/materials`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      setMaterials(mRes.ok ? await mRes.json() : []);
      onAfterChange && onAfterChange();
      setEditMaterial(null);
    } catch (e) {
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
                          className={`px-3 py-1 rounded-full text-white text-sm font-medium ${(function () {
                            const raw = Number(p.rawQtyUsed);
                            const completed = Number(p.completedQuantity);
                            if (completed === 0) return "bg-red-600";
                            if (completed === raw && completed > 0)
                              return "bg-green-600";
                            if (0 < completed && completed < raw)
                              return "bg-yellow-600";
                            return "bg-gray-500";
                          })()}`}
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
export default function CreateMotorProcess() {
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

  // inline status editing state
  const [editingCell, setEditingCell] = useState(null); // { motorId, componentId }
  const [editingValue, setEditingValue] = useState("Pending");

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
    status: x.status ?? "Pending",
    targetDate:
      x.targetDate ??
      x.stageDate ??
      x.target_date ??
      x.planned_date ??
      x.plannedDate ??
      "",
    responsiblePerson: x.responsiblePerson ?? x.responsible_person ?? "",
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
              stage_name: label, // send snake_case too
              stageName: label,
              status: "Pending",
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
        toast.error(e.message || "Could not create stage");
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
    async ({ responsiblePerson, targetDate, status }) => {
      try {
        const token = tokenGuard();
        const id = editStage.stageId ?? editStage.id;
        const res = await fetch(
          `${getBackendUrl()}/api/process/${orderId}/stages/${id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify({
              // send both casings to be safe with backend
              status,
              target_date: targetDate || null,
              targetDate: targetDate || null,
              responsible_person: responsiblePerson || null,
              responsiblePerson: responsiblePerson || null,
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
                    // inside displayColumns.map(...) in the row renderer
                    if (col.isStage) {
                      const s = stageByName.get(normalizeNameKey(col.label));
                      return (
                        <td
                          key={`stage-${col.label}`}
                          className="py-4 px-3 align-middle"
                        >
                          {s ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${statusToBadgeClass(
                                  s.status || "Pending"
                                )}`}
                              >
                                {DISPLAY_STATUS[s.status || "Pending"] ||
                                  "Yet To Start"}
                              </span>
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

                    // 2) Component columns (existing behavior)
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
