import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  ArrowDownUp,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  XCircle,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

function PartCreation() {
  const [parts, setParts] = useState([]);
  const [total, setTotal] = useState(0);
  const [partTypes, setPartTypes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({
    key: "partCode",
    direction: "asc",
  });
  const [page, setPage] = useState(0);
  const itemsPerPage = 10;

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit'
  const [selectedPart, setSelectedPart] = useState(null);
  const [previewCode, setPreviewCode] = useState(""); // from /next-code
  const [formData, setFormData] = useState({
    partTypeId: "",
    name: "",
    description: "",
    drawingNo: "",
    customerPartNo: "",
    supplierPartNo: "",
  });
  const [formErrors, setFormErrors] = useState({});

  const modalRef = useRef(null);

  // ----------------------------
  // Helpers
  // ----------------------------
  const formatDate = (value) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    if (!token) {
      throw new Error("Authentication token missing. Please log in again.");
    }
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  // ----------------------------
  // Fetch Part Types
  // ----------------------------
  const fetchPartTypes = useCallback(async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/parts/types`, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch part types");
      }
      const data = await res.json();
      setPartTypes(data || []);
    } catch (err) {
      console.error("Part types error:", err);
      toast.error(err.message || "Failed to load part types");
      setPartTypes([]);
    }
  }, []);

  // ----------------------------
  // Fetch Parts List
  // ----------------------------
  const fetchParts = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${BASE_URL}/api/parts?limit=1000&offset=0`,
        { headers }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch parts");
      }
      const { data, total } = await res.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid parts data format");
      }

      setParts(data);
      setTotal(total || data.length);
    } catch (err) {
      console.error("Parts error:", err);
      toast.error(err.message || "Failed to load parts");
      setParts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ----------------------------
  // Preview Next Code when Part Type changes
  // ----------------------------
  const fetchNextCode = useCallback(async (partTypeId) => {
    if (!partTypeId) {
      setPreviewCode("");
      return;
    }
    try {
      const headers = getAuthHeaders();
      const res = await fetch(
        `${BASE_URL}/api/parts/next-code?partTypeId=${partTypeId}`,
        { headers }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to preview next part code");
      }
      const data = await res.json();
      setPreviewCode(data.partCode || "");
    } catch (err) {
      console.error("Next code error:", err);
      toast.error(err.message || "Failed to preview part code");
      setPreviewCode("");
    }
  }, []);

  // ----------------------------
  // Initial Load
  // ----------------------------
  useEffect(() => {
    fetchPartTypes();
    fetchParts();
  }, [fetchPartTypes, fetchParts]);

  // reset to first page when search changes
  useEffect(() => {
    setPage(0);
  }, [searchTerm]);

  // Focus trap in modal
  useEffect(() => {
    if (!showModal || !modalRef.current) return;

    const firstInput = modalRef.current.querySelector("input, select, textarea");
    firstInput?.focus();

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusable = modalRef.current.querySelectorAll(
        "button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showModal]);

  // ----------------------------
  // Sorting / Filtering / Paging
  // ----------------------------
  const sortData = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const sortedParts = useMemo(() => {
    const arr = [...parts];
    if (!sortConfig.key) return arr;

    arr.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === "createdAt" || sortConfig.key === "updatedAt") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      } else {
        aVal = (aVal ?? "").toString().toLowerCase();
        bVal = (bVal ?? "").toString().toLowerCase();
      }

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return arr;
  }, [parts, sortConfig]);

  const filteredParts = useMemo(() => {
    if (!searchTerm.trim()) return sortedParts;
    const term = searchTerm.toLowerCase();
    return sortedParts.filter((p) =>
      [
        p.partCode,
        p.name,
        p.description,
        p.drawingNo,
        p.customerPartNo,
        p.supplierPartNo,
      ]
        .filter(Boolean)
        .some((value) =>
          value.toString().toLowerCase().includes(term)
        )
    );
  }, [sortedParts, searchTerm]);

  const paginatedParts = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredParts.slice(start, start + itemsPerPage);
  }, [filteredParts, page, itemsPerPage]);

  // ----------------------------
  // Modal handlers
  // ----------------------------
  const openCreateModal = () => {
    setModalMode("create");
    setSelectedPart(null);
    setFormData({
      partTypeId: "",
      name: "",
      description: "",
      drawingNo: "",
      customerPartNo: "",
      supplierPartNo: "",
    });
    setPreviewCode("");
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (part) => {
    setModalMode("edit");
    setSelectedPart(part);
    setFormData({
      partTypeId: part.partTypeId || "",
      name: part.name || "",
      description: part.description || "",
      drawingNo: part.drawingNo || "",
      customerPartNo: part.customerPartNo || "",
      supplierPartNo: part.supplierPartNo || "",
    });
    setPreviewCode(part.partCode || "");
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  // ----------------------------
  // Form validation
  // ----------------------------
  const validateForm = () => {
    const errors = {};
    if (modalMode === "create") {
      if (!formData.partTypeId) {
        errors.partTypeId = "Part Type is required";
      }
    }
    if (!formData.name.trim()) {
      errors.name = "Part name is required";
    }
    if (!formData.description.trim()) {
      errors.description = "Description is required";
    }
    // backend currently requires drawingNo
    if (!formData.drawingNo.trim()) {
      errors.drawingNo = "Drawing number is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ----------------------------
  // Submit create / edit
  // ----------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please fix the validation errors");
      return;
    }

    try {
      const headers = getAuthHeaders();
      const isCreate = modalMode === "create";

      let url;
      let method;

      if (isCreate) {
        url = `${BASE_URL}/api/parts`;
        method = "POST";
      } else {
        if (!selectedPart?.id) {
          throw new Error("Missing selected part id");
        }
        url = `${BASE_URL}/api/parts/${selectedPart.id}`;
        method = "PUT";
      }

      const body = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        drawingNo: formData.drawingNo.trim(),
        customerPartNo: formData.customerPartNo.trim() || undefined,
        supplierPartNo: formData.supplierPartNo.trim() || undefined,
      };

      if (isCreate) {
        body.partTypeId = Number(formData.partTypeId);
      }

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save part");
      }

      const saved = await res.json();
      toast.success(isCreate ? "Part created" : "Part updated");

      // Refresh from backend so we also get partTypeName, etc
      await fetchParts();
      setShowModal(false);
    } catch (err) {
      console.error("Save part error:", err);
      toast.error(err.message || "Failed to save part");
    }
  };

  // ----------------------------
  // Delete part
  // ----------------------------
  const handleDelete = async (part) => {
    if (!window.confirm(`Delete part ${part.partCode}?`)) return;

    try {
      const headers = getAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/parts/${part.id}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete part");
      }

      toast.success(`Part ${part.partCode} deleted`);
      await fetchParts();
    } catch (err) {
      console.error("Delete part error:", err);
      toast.error(err.message || "Failed to delete part");
    }
  };

  // ----------------------------
  // Actions menu component
  // ----------------------------
  const ActionsDropdown = ({ part }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <MoreVertical size={18} />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-20">
            <button
              onClick={() => {
                openEditModal(part);
                setOpen(false);
              }}
              className="w-full flex items-center px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
            >
              Edit
            </button>
            <button
              onClick={() => {
                handleDelete(part);
                setOpen(false);
              }}
              className="w-full flex items-center px-3 py-2 text-sm hover:bg-red-50 text-red-600"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // ----------------------------
  // Render
  // ----------------------------
  if (isLoading && !parts.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">
          Loading Parts...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Part Master
      </h1>

      <div className="max-w-6xl mx-auto">
        {/* Toolbar */}
        <div className="flex mb-8 gap-4 flex-wrap">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search by code, name, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <XCircle size={20} />
              </button>
            )}
          </div>

          <button
            onClick={openCreateModal}
            className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center shadow-md"
          >
            <Plus size={20} className="mr-2" /> Create Part
          </button>

          <button
            onClick={fetchParts}
            disabled={isLoading}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 flex items-center shadow-md disabled:opacity-60"
          >
            <RefreshCw size={20} className="mr-2" />
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Table */}
        {filteredParts.length === 0 && !isLoading ? (
          <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
            <Search className="mx-auto mb-4 text-gray-400" size={48} />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              No Parts Found
            </h2>
            <p className="text-gray-600 mb-6">
              {searchTerm
                ? "Try adjusting your search."
                : "Start by creating a part!"}
            </p>
            {!searchTerm && (
              <button
                onClick={openCreateModal}
                className="p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto"
              >
                <Plus className="mr-2" /> Create First Part
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50">
                  {[
                    { key: "partCode", label: "Part Code" },
                    { key: "name", label: "Part Name" },
                    { key: "description", label: "Description" },
                    { key: "drawingNo", label: "Drawing No" },
                    { key: "customerPartNo", label: "Customer Part No" },
                    { key: "supplierPartNo", label: "Supplier Part No" },
                    { key: "createdAt", label: "Created At" },
                    { key: "actions", label: "Actions" },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      className={`py-4 px-3 text-gray-800 font-semibold text-sm ${
                        key !== "actions"
                          ? "cursor-pointer hover:bg-amber-300"
                          : ""
                      }`}
                      onClick={() =>
                        key !== "actions" && sortData(key)
                      }
                    >
                      <div className="flex items-center justify-between">
                        {label}
                        {key !== "actions" && (
                          <ArrowDownUp
                            size={14}
                            className={`ml-2 text-gray-600 ${
                              sortConfig.key === key
                                ? "text-gray-900"
                                : "opacity-50"
                            }`}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedParts.map((part) => (
                  <tr
                    key={part.id}
                    className="border-t hover:bg-amber-50 transition"
                  >
                    <td className="py-3 px-3 text-gray-700 font-mono">
                      {part.partCode}
                    </td>
                    <td className="py-3 px-3 text-gray-700 font-medium">
                      {part.name}
                    </td>
                    <td className="py-3 px-3 text-gray-600 max-w-xs truncate">
                      {part.description}
                    </td>
                    <td className="py-3 px-3 text-gray-700">
                      {part.drawingNo || (
                        <span className="text-gray-400 italic">
                          Not set
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-700">
                      {part.customerPartNo || (
                        <span className="text-gray-400 italic">
                          Not set
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-700">
                      {part.supplierPartNo || (
                        <span className="text-gray-400 italic">
                          Not set
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-600 text-sm">
                      {formatDate(part.createdAt)}
                    </td>
                    <td className="py-3 px-3">
                      <ActionsDropdown part={part} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer / Pagination */}
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600 text-sm">
                Showing {paginatedParts.length} of {filteredParts.length} (
                Total: {total})
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setPage((p) => Math.max(0, p - 1))
                  }
                  disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-gray-700 text-sm">
                  Page {page + 1}
                </span>
                <button
                  onClick={() =>
                    setPage((p) =>
                      (p + 1) * itemsPerPage >= filteredParts.length
                        ? p
                        : p + 1
                    )
                  }
                  disabled={
                    (page + 1) * itemsPerPage >= filteredParts.length
                  }
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50">
          <div
            ref={modalRef}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-8 relative"
          >
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
            >
              <XCircle size={24} />
            </button>

            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              {modalMode === "create"
                ? "Create Part"
                : `Edit Part ${selectedPart?.partCode}`}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Part Type + Code Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {modalMode === "create" && (
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">
                      Part Type *
                    </label>
                    <select
                      value={formData.partTypeId}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          partTypeId: val,
                        }));
                        setPreviewCode("");
                        if (val) {
                          await fetchNextCode(Number(val));
                        }
                      }}
                      className={`w-full p-3 border rounded-lg ${
                        formErrors.partTypeId ? "border-red-500" : ""
                      }`}
                      required
                    >
                      <option value="">Select part type...</option>
                      {partTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.typeName} ({t.prefix})
                        </option>
                      ))}
                    </select>
                    {formErrors.partTypeId && (
                      <p className="text-red-500 text-sm mt-1">
                        {formErrors.partTypeId}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Part Code
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={
                      modalMode === "create"
                        ? previewCode || "Will be generated"
                        : selectedPart?.partCode || ""
                    }
                    className="w-full p-3 border rounded-lg bg-gray-50 text-gray-700"
                  />
                  {modalMode === "create" && previewCode && (
                    <p className="text-xs text-gray-500 mt-1">
                      Preview only – final code generated by backend.
                    </p>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  Part Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className={`w-full p-3 border rounded-lg ${
                    formErrors.name ? "border-red-500" : ""
                  }`}
                  required
                />
                {formErrors.name && (
                  <p className="text-red-500 text-sm mt-1">
                    {formErrors.name}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  Description *
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className={`w-full p-3 border rounded-lg ${
                    formErrors.description ? "border-red-500" : ""
                  }`}
                  required
                />
                {formErrors.description && (
                  <p className="text-red-500 text-sm mt-1">
                    {formErrors.description}
                  </p>
                )}
              </div>

              {/* Drawing + Customer + Supplier */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Drawing No *
                  </label>
                  <input
                    type="text"
                    value={formData.drawingNo}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        drawingNo: e.target.value,
                      }))
                    }
                    className={`w-full p-3 border rounded-lg ${
                      formErrors.drawingNo ? "border-red-500" : ""
                    }`}
                    required
                  />
                  {formErrors.drawingNo && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.drawingNo}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Customer Part Number
                  </label>
                  <input
                    type="text"
                    value={formData.customerPartNo}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        customerPartNo: e.target.value,
                      }))
                    }
                    className="w-full p-3 border rounded-lg"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Supplier Part Number
                  </label>
                  <input
                    type="text"
                    value={formData.supplierPartNo}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        supplierPartNo: e.target.value,
                      }))
                    }
                    className="w-full p-3 border rounded-lg"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold"
                >
                  {modalMode === "create" ? "Create Part" : "Update Part"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default PartCreation;
