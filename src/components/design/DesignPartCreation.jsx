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
  Edit2,
  Eye,
} from "lucide-react";
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

// ----------------------------
// Row actions dropdown (top-level component, not recreated on every render)
// ----------------------------
function ActionsDropdown({ part, onEdit }) {
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
        className="p-2 rounded-full hover:bg-navy-50 transition-colors"
        aria-label={`Actions for part ${part.partCode}`}
      >
        <MoreVertical size={18} className="text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-white border border-navy-100 rounded-lg shadow-lg z-20 py-1">
          <button
            onClick={() => {
              onEdit(part);
              setOpen(false);
            }}
            className="w-full flex items-center px-3 py-2 text-sm text-navy-800 hover:bg-navy-50 transition-colors"
          >
            <Edit2 size={16} className="mr-2" /> Revise Part
          </button>
        </div>
      )}
    </div>
  );
}

function DesignPartCreation() {
  const [parts, setParts] = useState([]);
  const [total, setTotal] = useState(0);
  const [partTypes, setPartTypes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
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
  const [viewingPart, setViewingPart] = useState(null);

  const modalRef = useRef(null);
  const { notifySuccess, notifyError } = useNotify();

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
      notifyError(err.message || "Failed to load part types");
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
      setFetchError(err.message || "Failed to load parts");
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
      notifyError(err.message || "Failed to preview part code");
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
      notifyError("Please fix the validation errors");
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
      notifySuccess(isCreate ? "Part created" : "Part updated");

      // Refresh from backend so we also get partTypeName, etc
      await fetchParts();
      setShowModal(false);
    } catch (err) {
      console.error("Save part error:", err);
      notifyError(err.message || "Failed to save part");
    }
  };

  // ----------------------------
  // Render
  // ----------------------------
  if (isLoading && !parts.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-500 text-lg">
          <svg className="animate-spin h-6 w-6 text-gold-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Parts...
        </div>
      </div>
    );
  }

  if (fetchError) return <ConnectionError onRetry={fetchParts} />;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-grow min-w-[220px]">
          <input
            type="text"
            placeholder="Search by code, name, description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
          />
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Clear search"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>

        <button
          onClick={fetchParts}
          disabled={isLoading}
          className="flex items-center gap-2 px-5 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} />
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors"
        >
          <Plus size={18} /> Create Part
        </button>
      </div>

      {/* Table */}
      {filteredParts.length === 0 && !isLoading ? (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-navy-100 text-center">
          <Search className="mx-auto mb-4 text-gray-300" size={40} />
          <h2 className="font-display text-xl font-bold text-navy-800 mb-2">
            No Parts Found
          </h2>
          <p className="text-gray-500 mb-6">
            {searchTerm
              ? "Try adjusting your search."
              : "Start by creating a part!"}
          </p>
          {!searchTerm && (
            <button
              onClick={openCreateModal}
              className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors flex items-center gap-2 mx-auto"
            >
              <Plus size={18} /> Create First Part
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-navy-50 text-navy-800">
                {[
                  { key: "partCode", label: "Part Code" },
                  { key: "name", label: "Part Name" },
                  { key: "drawingNo", label: "Drawing No" },
                  { key: "createdAt", label: "Created At" },
                  { key: "details", label: "Details" },
                  { key: "actions", label: "Actions" },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className={`py-3 px-3 font-semibold text-sm ${
                      key !== "actions" && key !== "details"
                        ? "cursor-pointer hover:bg-navy-100"
                        : ""
                    } transition-colors whitespace-nowrap`}
                    onClick={() =>
                      key !== "actions" && key !== "details" && sortData(key)
                    }
                  >
                    <div className="flex items-center justify-between">
                      {label}
                      {key !== "actions" && key !== "details" && (
                        <ArrowDownUp
                          size={14}
                          className={`ml-2 ${
                            sortConfig.key === key
                              ? "text-gold-500"
                              : "text-navy-400/50"
                          }`}
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {paginatedParts.map((part) => (
                <tr
                  key={part.id}
                  className="hover:bg-navy-50/60 transition-colors"
                >
                  <td className="py-3.5 px-3 text-navy-800 font-medium font-mono">
                    {part.partCode}
                  </td>
                  <td className="py-3.5 px-3 text-gray-600">
                    {part.name}
                  </td>
                  <td className="py-3.5 px-3 text-gray-600">
                    {part.drawingNo || (
                      <span className="text-gray-400 italic">Not set</span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-gray-600 text-sm">
                    {formatDate(part.createdAt)}
                  </td>
                  <td className="py-3.5 px-3">
                    <button
                      onClick={() => setViewingPart(part)}
                      className="flex items-center gap-1.5 text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors"
                      aria-label={`View details for ${part.partCode}`}
                    >
                      <Eye size={15} />
                      View
                    </button>
                  </td>
                  <td className="py-3.5 px-3">
                    <ActionsDropdown
                      part={part}
                      onEdit={openEditModal}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer / Pagination */}
          <div className="flex flex-wrap gap-2 justify-between items-center p-4 bg-navy-50 border-t border-navy-100">
            <div className="text-gray-500 text-sm">
              Showing {paginatedParts.length} of {filteredParts.length} (Total: {total})
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setPage((p) => Math.max(0, p - 1))
                }
                disabled={page === 0}
                className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-gray-600 text-sm">
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
                className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div
            ref={modalRef}
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 relative"
          >
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <XCircle size={22} />
            </button>

            <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
              {modalMode === "create"
                ? "Create Part"
                : `Edit Part ${selectedPart?.partCode}`}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Part Type + Code Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {modalMode === "create" && (
                  <div>
                    <label className="block text-sm font-semibold text-navy-800 mb-1.5">
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
                      className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${
                        formErrors.partTypeId ? "border-red-500" : "border-navy-100"
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
                      <p className="text-red-600 text-sm mt-1">
                        {formErrors.partTypeId}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
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
                    className="w-full p-2.5 border border-navy-100 rounded-lg bg-gray-50 text-gray-700"
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">
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
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${
                    formErrors.name ? "border-red-500" : "border-navy-100"
                  }`}
                  required
                />
                {formErrors.name && (
                  <p className="text-red-600 text-sm mt-1">
                    {formErrors.name}
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">
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
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${
                    formErrors.description ? "border-red-500" : "border-navy-100"
                  }`}
                  required
                />
                {formErrors.description && (
                  <p className="text-red-600 text-sm mt-1">
                    {formErrors.description}
                  </p>
                )}
              </div>

              {/* Drawing + Customer + Supplier */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
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
                    className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${
                      formErrors.drawingNo ? "border-red-500" : "border-navy-100"
                    }`}
                    required
                  />
                  {formErrors.drawingNo && (
                    <p className="text-red-600 text-sm mt-1">
                      {formErrors.drawingNo}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
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
                    className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
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
                    className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors"
                >
                  {modalMode === "create" ? "Create Part" : "Update Part"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewingPart && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setViewingPart(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <XCircle size={20} />
            </button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
              {viewingPart.partCode || "Part Details"}
            </h2>
            <dl className="space-y-4">
              {[
                { label: "Part Name", value: viewingPart.name },
                { label: "Description", value: viewingPart.description },
                { label: "Drawing No", value: viewingPart.drawingNo },
                { label: "Customer Part No", value: viewingPart.customerPartNo },
                { label: "Supplier Part No", value: viewingPart.supplierPartNo },
                { label: "Created At", value: formatDate(viewingPart.createdAt) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="text-navy-800 mt-0.5">{value || "N/A"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setViewingPart(null)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DesignPartCreation;
