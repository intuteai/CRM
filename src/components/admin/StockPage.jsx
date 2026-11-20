import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  ArrowDownUp,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  Plus,
  Edit2,
  XCircle,
  MoreVertical,
  Download,
  Upload,
  Eye,
  CheckCircle,
  SlidersHorizontal,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useNotify } from "../../hooks/useNotify";
import ConnectionError from "../pages/ConnectionError.jsx";
import { suggestPartNumber, isValidProductCode } from "../../utils/productCode";
import {
  normalizeStockItem,
  applyStockUpdate,
  EMPTY_FORM,
  formFromItem,
  validateStockForm,
  stockChanged,
  buildStockPayload,
  parseImportRows,
  compareLeadDate,
  formatLeadDate,
} from "../../utils/stockForm";
import { formatDisplay } from "../../utils/leadDate";
import { LeadDateCell, LeadDateField } from "../shared/LeadDate";
import {
  fetchStockList,
  createStock,
  updateStock,
  deleteStock,
  acceptReturn,
  uploadStockPhoto,
} from "../../utils/stockApi";
import ProductCodeBuilder from "../shared/ProductCodeBuilder";
import StockHistory from "../shared/StockHistory";
import AdjustStockModal from "../shared/AdjustStockModal";

const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ERROR_TOASTS = 5;

// Error Boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12 text-red-600 text-xl font-medium max-w-4xl mx-auto bg-red-50 rounded-2xl shadow-lg">
          Something went wrong: {this.state.error?.message || "Unknown error"}
        </div>
      );
    }
    return this.props.children;
  }
}

// Debounce Hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// Format Date Helper
const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatPrice = (price) => `₹${Number(price || 0).toFixed(2)}`;

// Weserv Image Proxy Helper
const getWeservUrl = (imageUrl) => {
  if (!imageUrl) return null;
  if (imageUrl.includes("images.weserv.nl")) return imageUrl;
  let directUrl = imageUrl;
  const driveMatch = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch)
    directUrl = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  return `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=1400&h=1000&fit=outside&output=webp&q=90`;
};

/* Row actions dropdown — top-level component (not recreated on every render) */
function StockActionsDropdown({
  item,
  onEdit,
  onDelete,
  onUploadPhoto,
  onOpenAccept,
  onOpenAdjust,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const handleEscape = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const canAccept = (item.returnableQty || 0) > 0;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 hover:bg-navy-50 rounded-full transition-colors"
        aria-label={`Actions for ${item.productName}`}
        aria-expanded={open}
      >
        <MoreVertical size={20} className="text-gray-500" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white shadow-lg rounded-lg border border-navy-100 py-1 z-10">
          <button
            type="button"
            onClick={() => {
              onEdit(item);
              setOpen(false);
            }}
            className="flex w-full px-4 py-2 text-sm text-navy-800 hover:bg-navy-50 items-center transition-colors"
          >
            <Edit2 size={16} className="mr-2" /> Edit
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenAdjust(item);
              setOpen(false);
            }}
            className="flex w-full px-4 py-2 text-sm text-navy-800 hover:bg-navy-50 items-center transition-colors"
          >
            <SlidersHorizontal size={16} className="mr-2" /> Adjust Stock
          </button>

          <label className="flex w-full px-4 py-2 text-sm text-navy-800 hover:bg-navy-50 items-center cursor-pointer transition-colors">
            <Upload size={16} className="mr-2" /> Upload Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // reset so picking the same file again still fires onChange
                e.target.value = "";
                if (file) onUploadPhoto(item.productId, file);
                setOpen(false);
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              onOpenAccept(item);
              setOpen(false);
            }}
            disabled={!canAccept}
            className={`flex w-full px-4 py-2 text-sm items-center transition-colors ${!canAccept ? "text-gray-400 cursor-not-allowed" : "text-navy-800 hover:bg-navy-50"}`}
          >
            <CheckCircle size={16} className="mr-2" /> Accept Return
          </button>

          <button
            type="button"
            onClick={() => {
              onDelete(item);
              setOpen(false);
            }}
            className="flex w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 items-center transition-colors"
          >
            <XCircle size={16} className="mr-2" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ==========================
   Main StockPage component
   ========================== */
function StockPage({ socket }) {
  const [stockItems, setStockItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({
    key: "createdAt",
    direction: "desc",
  });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [modalKey, setModalKey] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [stockChangeReason, setStockChangeReason] = useState("");
  const [suggestedPartNumber, setSuggestedPartNumber] = useState(null);
  const [partNumberAuto, setPartNumberAuto] = useState(true);
  const [partNumberAvailable, setPartNumberAvailable] = useState(true);
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [acceptProduct, setAcceptProduct] = useState(null);
  const [adjustProduct, setAdjustProduct] = useState(null);

  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const itemsRef = useRef(stockItems);
  const fetchSeqRef = useRef(0);
  const debouncedSearch = useDebounce(searchInput, 300);

  // ---- Part selector state (for modal) ----
  const [partSearch, setPartSearch] = useState("");
  const [allParts, setAllParts] = useState([]);
  const [isPartLoading, setIsPartLoading] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [partsLoaded, setPartsLoaded] = useState(false);
  const partDropdownRef = useRef(null);
  const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotify();
  // ----------------------------------------

  // Keep a ref of the latest list so socket handlers never work on stale data
  useEffect(() => {
    itemsRef.current = stockItems;
  }, [stockItems]);

  const setItems = useCallback((next) => {
    itemsRef.current = next;
    setStockItems(next);
  }, []);

  const replaceItem = useCallback(
    (updatedRaw) => {
      if (!updatedRaw) return;
      const updated = normalizeStockItem(updatedRaw);
      setItems(
        itemsRef.current.map((it) =>
          it.productId === updated.productId ? { ...it, ...updated } : it,
        ),
      );
    },
    [setItems],
  );

  // Fetch Stock (ignores responses from older, overlapping requests)
  const fetchStock = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setIsLoading(true);
    try {
      const resp = await fetchStockList();
      if (seq !== fetchSeqRef.current) return;
      const data = resp?.data;
      if (!Array.isArray(data)) throw new Error("Invalid data format from server");
      const normalized = data.map(normalizeStockItem);
      setItems(normalized);
      setTotalItems(Number(resp.total) || normalized.length);
      setError(null);
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      setError(err.message || "Failed to fetch stock data");
      notifyError(err.message || "Failed to fetch stock data", { autoClose: 3000 });
    } finally {
      if (seq === fetchSeqRef.current) setIsLoading(false);
    }
  }, [setItems, notifyError]);

  // Socket Updates — registers and removes ONLY its own handlers
  useEffect(() => {
    if (!socket) return;
    let wasDisconnected = false;

    const onDisconnect = () => {
      wasDisconnected = true;
      notifyWarning("Real-time connection lost");
    };
    const onConnect = () => {
      if (!wasDisconnected) return;
      wasDisconnected = false;
      notifySuccess("Reconnected!", { autoClose: 2000 });
      fetchStock();
    };
    const onStockUpdate = (payload) => {
      const prev = itemsRef.current;
      const { items, needsRefetch } = applyStockUpdate(prev, payload);
      if (items !== prev) {
        setItems(items);
        if (payload?.status === "deleted") {
          notifyInfo(`Product #${payload.product_id} deleted`, { autoClose: 2000 });
        }
      }
      if (needsRefetch) fetchStock();
    };

    socket.on("disconnect", onDisconnect);
    socket.on("connect", onConnect);
    socket.on("stockUpdate", onStockUpdate);

    return () => {
      socket.off("disconnect", onDisconnect);
      socket.off("connect", onConnect);
      socket.off("stockUpdate", onStockUpdate);
    };
  }, [socket, fetchStock, setItems, notifyInfo, notifySuccess, notifyWarning]);

  // Initial Load
  useEffect(() => {
    fetchStock();
    return () => {
      // invalidate any in-flight request so it can't set state after unmount
      fetchSeqRef.current += 1;
    };
  }, [fetchStock]);

  // Search & Pagination
  useEffect(() => setSearchTerm(debouncedSearch), [debouncedSearch]);
  useEffect(() => setPage(0), [searchTerm]);

  // Modal Focus Trap + Escape to close
  useEffect(() => {
    if (showModal && modalRef.current) {
      const targetInput =
        modalRef.current.querySelector('input[name="productName"]') ||
        modalRef.current.querySelector("input");
      targetInput?.focus();
      const handleKey = (e) => {
        if (e.key === "Escape") {
          setShowModal(false);
          return;
        }
        if (e.key !== "Tab" || !modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          "button, input, textarea",
        );
        if (!focusable.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [showModal]);

  // ---- Parts API + filtering for modal ----
  const loadParts = useCallback(async () => {
    if (partsLoaded || isPartLoading) return;
    try {
      setIsPartLoading(true);
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token missing.");

      const res = await fetch(`${BASE_URL}/api/parts?limit=500&offset=0`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch parts (${res.status})`);
      }
      const json = await res.json();
      setAllParts(Array.isArray(json.data) ? json.data : []);
      setPartsLoaded(true);
    } catch (err) {
      notifyError(err.message || "Failed to load parts", { autoClose: 3000 });
    } finally {
      setIsPartLoading(false);
    }
  }, [partsLoaded, isPartLoading, notifyError]);

  const filteredParts = useMemo(() => {
    const term = partSearch.toLowerCase().trim();
    if (!term) return allParts.slice(0, 20);
    return allParts
      .filter(
        (p) =>
          (p.partCode || "").toLowerCase().includes(term) ||
          (p.name || "").toLowerCase().includes(term) ||
          (p.drawingNo || "").toLowerCase().includes(term),
      )
      .slice(0, 20);
  }, [partSearch, allParts]);

  useEffect(() => {
    if (!showPartDropdown) return;
    const handleClickOutside = (event) => {
      if (
        partDropdownRef.current &&
        !partDropdownRef.current.contains(event.target)
      )
        setShowPartDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPartDropdown]);

  const handlePartSearchChange = (e) => {
    setPartSearch(e.target.value);
    setShowPartDropdown(true);
    if (!partsLoaded && !isPartLoading) loadParts();
  };

  const handlePartSelect = (part) => {
    const code = String(part.partCode || "").trim().toUpperCase();
    const codeUsable = isValidProductCode(code);
    setFormData((prev) => ({
      ...prev,
      productName: part.name || prev.productName,
      description: part.description || prev.description,
      ...(codeUsable ? { productCode: code } : {}),
    }));
    setFormErrors((prev) => ({
      ...prev,
      productName: "",
      description: "",
      ...(codeUsable ? { productCode: "" } : {}),
    }));
    if (codeUsable) {
      // remount the builder so it shows the selected code
      setModalKey((k) => k + 1);
    } else if (code) {
      notifyInfo(
        `Part code "${part.partCode}" isn't an 11-character stock code — set the Product Code below.`,
        { autoClose: 4000 },
      );
    }
    setPartSearch(`${part.partCode} — ${part.name}`);
    setShowPartDropdown(false);
  };
  // -----------------------------------------

  // Sorting & Filtering
  const sortedStock = useMemo(() => {
    const items = [...stockItems];
    if (sortConfig.key) {
      const numeric = [
        "productId",
        "price",
        "stockQuantity",
        "qtyRequired",
        "returnableQty",
      ].includes(sortConfig.key);
      items.sort((a, b) => {
        if (sortConfig.key === "leadDate")
          return compareLeadDate(a.leadDate, b.leadDate, sortConfig.direction);
        let aVal = a[sortConfig.key] ?? "";
        let bVal = b[sortConfig.key] ?? "";
        if (numeric) {
          aVal = Number(aVal) || 0;
          bVal = Number(bVal) || 0;
        } else if (sortConfig.key === "createdAt") {
          aVal = new Date(aVal || 0).getTime() || 0;
          bVal = new Date(bVal || 0).getTime() || 0;
        } else {
          aVal = String(aVal).toLowerCase();
          bVal = String(bVal).toLowerCase();
        }
        if (aVal === bVal) return 0;
        return (
          (aVal < bVal ? -1 : 1) * (sortConfig.direction === "asc" ? 1 : -1)
        );
      });
    }
    return items;
  }, [stockItems, sortConfig]);

  const filteredStock = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return sortedStock;
    return sortedStock.filter((item) =>
      [item.productId, item.productName, item.productCode, item.location]
        .map((s) => String(s ?? "").toLowerCase())
        .some((t) => t.includes(term)),
    );
  }, [sortedStock, searchTerm]);

  const pageCount = Math.max(1, Math.ceil(filteredStock.length / itemsPerPage));

  // Keep the page in range when rows disappear (delete, live update, filter)
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const paginatedStock = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredStock.slice(start, start + itemsPerPage);
  }, [filteredStock, page, itemsPerPage]);

  // Import Excel
  const importFromExcel = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => notifyError("Could not read the file", { autoClose: 3000 });
      reader.onload = async (e) => {
        setIsImporting(true);
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = sheet ? XLSX.utils.sheet_to_json(sheet) : [];
          if (!rows.length) throw new Error("The file has no rows");

          const existingById = new Map(
            itemsRef.current.map((i) => [i.productId, i]),
          );
          const { valid, errors } = parseImportRows(rows, {
            existingById,
            includePrice: true,
            includeReturnable: true,
          });

          errors
            .slice(0, MAX_IMPORT_ERROR_TOASTS)
            .forEach((msg) => notifyError(msg, { autoClose: 5000 }));
          if (errors.length > MAX_IMPORT_ERROR_TOASTS) {
            notifyError(
              `…and ${errors.length - MAX_IMPORT_ERROR_TOASTS} more invalid row(s) skipped`,
              { autoClose: 5000 },
            );
          }
          if (!valid.length) {
            notifyWarning("No valid rows to import", { autoClose: 3000 });
            return;
          }

          let created = 0,
            updated = 0;
          const failures = [];
          for (const { productId, body } of valid) {
            try {
              if (productId) {
                await updateStock(productId, body);
                updated++;
              } else {
                await createStock(body);
                created++;
              }
            } catch (err) {
              failures.push(
                `${body.productCode || body.productName || "Row"}: ${err.message}`,
              );
            }
          }

          await fetchStock();
          setPage(0);
          const summary = `Import: ${created} created, ${updated} updated${failures.length ? `, ${failures.length} failed` : ""}`;
          if (failures.length) {
            notifyWarning(summary, { autoClose: 6000 });
            failures
              .slice(0, MAX_IMPORT_ERROR_TOASTS)
              .forEach((msg) => notifyError(msg, { autoClose: 6000 }));
          } else {
            notifySuccess(summary, { autoClose: 5000 });
          }
        } catch (err) {
          notifyError(`Import failed: ${err.message}`, { autoClose: 4000 });
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [fetchStock, notifyError, notifySuccess, notifyWarning],
  );

  // Export Excel (includes Returnable Qty)
  const exportToExcel = useCallback(() => {
    const data = filteredStock.map((item) => ({
      "Product ID": item.productId,
      "Product Name": item.productName,
      "Product Code": item.productCode,
      Location: item.location || "N/A",
      "Stock Quantity": Number(item.stockQuantity),
      "Returnable Qty": Number(item.returnableQty || 0),
      "Qty Required": Number(item.qtyRequired),
      "Lead Date": formatDisplay(item.leadDate),
      "Price (₹)": formatPrice(item.price),
      Description: item.description || "",
      "Created At": item.createdAt ? formatDate(item.createdAt) : "N/A",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Raw Materials");
    XLSX.writeFile(wb, "Raw_Material_Inventory.xlsx");
    notifySuccess("Exported to Excel!", { autoClose: 2000 });
  }, [filteredStock, notifySuccess]);

  // Sorting
  const sortData = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  // Modal Handlers
  const openModal = useCallback(() => {
    setFormErrors({});
    setStockChangeReason("");
    setPartNumberAvailable(true);
    setPartSearch("");
    setShowPartDropdown(false);
    setModalKey((k) => k + 1);
    setShowModal(true);
  }, []);

  const handleCreate = useCallback(() => {
    setModalMode("create");
    setSelectedItem(null);
    setFormData({ ...EMPTY_FORM });
    setPartNumberAuto(true);
    // computed once per opening, from the current list
    setSuggestedPartNumber(suggestPartNumber(itemsRef.current));
    openModal();
  }, [openModal]);

  const handleEdit = useCallback(
    (item) => {
      setModalMode("edit");
      setSelectedItem(item);
      setFormData(formFromItem(item));
      setSuggestedPartNumber(null);
      openModal();
    },
    [openModal],
  );

  const handleDelete = useCallback(
    async (item) => {
      const label = item.productName
        ? `"${item.productName}" (#${item.productId})`
        : `product #${item.productId}`;
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
      try {
        await deleteStock(item.productId);
        setItems(itemsRef.current.filter((i) => i.productId !== item.productId));
        setTotalItems((t) => Math.max(0, t - 1));
        notifySuccess(`Product #${item.productId} deleted`);
      } catch (err) {
        notifyError(err.message || "Delete failed", { autoClose: 5000 });
      }
    },
    [setItems, notifySuccess, notifyError],
  );

  const isCreateMode = modalMode === "create";
  const editStockChanged =
    !isCreateMode && !!selectedItem && stockChanged(formData, selectedItem);

  // Submit (create/update)
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSaving) return;
      const isCreate = modalMode === "create";
      const errors = validateStockForm(formData, {
        mode: modalMode,
        requirePrice: true,
      });
      const realErrors = Object.fromEntries(
        Object.entries(errors).filter(([, v]) => v),
      );
      if (Object.keys(realErrors).length) {
        setFormErrors(realErrors);
        notifyError("Please fix the highlighted fields.");
        return;
      }
      // In auto mode the server assigns the part number, so a clash with the
      // suggestion doesn't matter. A typed / edited part number must be free.
      if (!partNumberAvailable && !(isCreate && partNumberAuto)) {
        setFormErrors((prev) => ({
          ...prev,
          productCode: "Part Number is already in use — choose a different one.",
        }));
        notifyError("Part Number is already in use — choose a different one.");
        return;
      }

      const body = buildStockPayload(formData, {
        mode: modalMode,
        original: selectedItem,
        includePrice: true,
        includeReturnable: true,
        partNumberAuto,
        stockChangeReason: stockChangeReason.trim() || undefined,
      });

      setIsSaving(true);
      try {
        const saved = isCreate
          ? await createStock(body)
          : await updateStock(selectedItem.productId, body);

        if (isCreate) {
          await fetchStock();
          setPage(0);
        } else {
          replaceItem(saved);
        }
        setShowModal(false);
        notifySuccess(isCreate ? "Product created!" : "Product updated!");
        if (saved?.partNumberWarning) {
          notifyWarning(saved.partNumberWarning, { autoClose: 6000 });
        }
      } catch (err) {
        if (err.code === "PART_NUMBER_TAKEN" || err.code === "DUPLICATE_CODE") {
          setFormErrors((prev) => ({ ...prev, productCode: err.message }));
        }
        notifyError(err.message || "Save failed", { autoClose: 5000 });
      } finally {
        setIsSaving(false);
      }
    },
    [
      isSaving,
      formData,
      modalMode,
      selectedItem,
      partNumberAuto,
      partNumberAvailable,
      stockChangeReason,
      fetchStock,
      replaceItem,
      notifyError,
      notifySuccess,
      notifyWarning,
    ],
  );

  // Upload Photo
  const uploadPhoto = useCallback(
    async (productId, file) => {
      if (!file) return;
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
        notifyError("Only JPEG, PNG, WebP or GIF images can be uploaded.");
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        notifyError("Image is larger than 8 MB.");
        return;
      }
      setUploadingId(productId);
      notifyInfo(`Uploading ${file.name}...`);
      try {
        const result = await uploadStockPhoto(productId, file);
        const imageUrl = result?.imageUrl || result?.image_url || null;
        if (imageUrl) {
          setItems(
            itemsRef.current.map((item) =>
              item.productId === productId ? { ...item, imageUrl } : item,
            ),
          );
        }
        notifySuccess("Image uploaded successfully!");
      } catch (err) {
        notifyError(`Upload failed: ${err.message}`, { autoClose: 5000 });
      } finally {
        setUploadingId(null);
      }
    },
    [setItems, notifyError, notifyInfo, notifySuccess],
  );

  const handleAccepted = useCallback(
    (updated) => {
      replaceItem(updated);
      setAcceptProduct(null);
      notifySuccess("Return accepted — stock updated", { autoClose: 2500 });
    },
    [replaceItem, notifySuccess],
  );

  const handleAdjusted = useCallback(
    (updated) => {
      // AdjustStockModal shows its own success toast
      replaceItem(updated);
      setAdjustProduct(null);
    },
    [replaceItem],
  );

  // Keep an open View modal in sync with live/edited data
  const viewingLive = viewingItem
    ? stockItems.find((i) => i.productId === viewingItem.productId) || viewingItem
    : null;

  // Render
  if (isLoading && !stockItems.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-500 text-lg">
          <svg className="animate-spin h-6 w-6 text-gold-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Stock...
        </div>
      </div>
    );
  }

  // Only replace the page when nothing has loaded; a failed refresh keeps the table
  if (error && !stockItems.length && !showModal && !viewingItem)
    return <ConnectionError onRetry={fetchStock} />;

  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto space-y-4">
          {/* Toolbar */}
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-grow min-w-[220px]">
              <input
                id="search-stock"
                ref={searchInputRef}
                type="text"
                placeholder="Search by ID, Name, Code, or Location..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchInput("");
                    setSearchTerm("");
                  }
                }}
                className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
              />
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchTerm("");
                  }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy-800 transition-colors"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={fetchStock}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <Upload size={16} /> {isImporting ? "Importing..." : "Import Excel"}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={importFromExcel}
              accept=".xlsx,.xls"
              className="hidden"
            />
            <button
              type="button"
              onClick={exportToExcel}
              disabled={!filteredStock.length}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} /> Export Excel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors ml-auto"
            >
              <Plus size={16} /> Create Product
            </button>
          </div>

          {/* Table */}
          {filteredStock.length === 0 && !isLoading ? (
            <div className="bg-white p-8 rounded-xl shadow-sm border border-navy-100 text-center">
              <Search className="mx-auto mb-4 text-gray-300" size={40} />
              <h2 className="font-display text-xl font-bold text-navy-800 mb-2">
                No Items Found
              </h2>
              <p className="text-gray-500 mb-6">
                {searchTerm
                  ? "Try adjusting your search."
                  : "Start by creating a product!"}
              </p>
              {!searchTerm && (
                <button
                  type="button"
                  onClick={handleCreate}
                  className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors flex items-center gap-2 mx-auto"
                >
                  <Plus size={16} /> Create First Product
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
              <table
                className="w-full text-left border-collapse"
                ref={tableRef}
                tabIndex={0}
              >
                <thead>
                  <tr className="bg-navy-50 text-navy-800">
                    {[
                      { key: "productId", label: "ID" },
                      { key: "productName", label: "Name" },
                      { key: "stockQuantity", label: "Stock" },
                      { key: "leadDate", label: "Lead Date" },
                      { key: "returnableQty", label: "Returnable Qty" },
                      { key: "price", label: "Price (₹)" },
                      { key: "view", label: "View" },
                      { key: "actions", label: "Actions" },
                    ].map(({ key, label }) => {
                      const sortable = key !== "view" && key !== "actions";
                      return (
                        <th
                          key={key}
                          className={`px-5 py-3 text-sm font-semibold whitespace-nowrap border-b border-navy-100 transition-colors ${sortable ? "cursor-pointer hover:bg-navy-100" : ""}`}
                          onClick={() => sortable && sortData(key)}
                          onKeyDown={(e) =>
                            (e.key === "Enter" || e.key === " ") &&
                            sortable &&
                            sortData(key)
                          }
                          tabIndex={sortable ? 0 : -1}
                          aria-sort={
                            sortConfig.key === key
                              ? sortConfig.direction === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <div className="flex items-center justify-between">
                            {label}
                            {sortable && (
                              <ArrowDownUp
                                size={15}
                                className={`ml-2 ${sortConfig.key === key ? "text-gold-500" : "text-navy-400/50"}`}
                              />
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {paginatedStock.map((item) => {
                    const isLow = item.stockQuantity < item.qtyRequired;
                    const stockClass = isLow ? "text-red-600" : "text-green-600";
                    const weservImageUrl = getWeservUrl(item.imageUrl);
                    const priceNotSet = !(Number(item.price) > 0);
                    return (
                      <tr
                        key={item.productId}
                        className="hover:bg-navy-50/60 transition-colors"
                      >
                        <td className="px-5 py-3.5 text-navy-800 font-medium">
                          {item.productId}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {weservImageUrl ? (
                              <img
                                src={weservImageUrl}
                                alt={item.productName}
                                className="w-10 h-10 shrink-0 rounded-md object-cover border border-navy-100 cursor-pointer hover:opacity-80 transition-colors"
                                onClick={() => {
                                  setSelectedImage({
                                    url: weservImageUrl,
                                    name: item.productName,
                                  });
                                  setShowImageModal(true);
                                }}
                                onError={(e) => {
                                  e.target.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 shrink-0 rounded-md bg-gray-100 border border-navy-100 flex items-center justify-center text-xs text-gray-400">
                                No
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-navy-800">
                                {item.productName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {item.productCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={`px-5 py-3.5 font-medium ${stockClass}`}>
                          {item.stockQuantity}
                          {isLow && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                              Low
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5">
                          <LeadDateCell leadDate={item.leadDate} isLow={isLow} />
                        </td>

                        {/* Returnable Qty (clickable -> opens edit modal) */}
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            title="Click to edit returnable qty"
                            className={`px-3 py-1 rounded-full text-white text-sm transition-colors ${item.returnableQty > 0 ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-400 hover:bg-gray-500"}`}
                          >
                            {item.returnableQty ?? 0}
                          </button>
                        </td>

                        <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">
                          {priceNotSet ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gold-400/25 text-gold-600 border border-gold-400/40"
                              title="No price set — edit this item to add one"
                            >
                              Not set
                            </span>
                          ) : (
                            formatPrice(item.price)
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => setViewingItem(item)}
                            className="flex items-center gap-1.5 text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors"
                            aria-label={`View details for ${item.productName}`}
                          >
                            <Eye size={15} /> View
                          </button>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <StockActionsDropdown
                              item={item}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                              onUploadPhoto={uploadPhoto}
                              onOpenAccept={setAcceptProduct}
                              onOpenAdjust={setAdjustProduct}
                            />
                            {uploadingId === item.productId && (
                              <span className="text-sm text-gold-600 animate-pulse">
                                Uploading...
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex flex-wrap gap-3 justify-between items-center p-4 bg-navy-50 border-t border-navy-100">
                <div className="text-gray-500 text-sm">
                  Showing {paginatedStock.length} of {filteredStock.length}{" "}
                  (Total: {totalItems}) · Page {page + 1} of {pageCount}
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 mr-1.5"></div>{" "}
                      In Stock
                    </div>
                    <div className="flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 mr-1.5"></div>{" "}
                      Low
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                      aria-label="Previous page"
                      className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                      disabled={page >= pageCount - 1}
                      aria-label="Next page"
                      className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div
            className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto relative"
              ref={modalRef}
            >
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
                aria-label="Close"
              >
                <XCircle size={22} />
              </button>
              <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
                {isCreateMode
                  ? "Create Product"
                  : `Edit #${selectedItem?.productId}`}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Part search */}
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    Search Part (optional)
                  </label>
                  <div className="relative" ref={partDropdownRef}>
                    <input
                      name="partSearch"
                      type="text"
                      value={partSearch}
                      onChange={handlePartSearchChange}
                      onFocus={() => {
                        setShowPartDropdown(true);
                        if (!partsLoaded && !isPartLoading) loadParts();
                      }}
                      placeholder="Type part code or name..."
                      className="w-full p-3 pl-9 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                    />
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    {showPartDropdown && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-navy-100 rounded-lg shadow-lg">
                        {isPartLoading && (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            Loading parts...
                          </div>
                        )}
                        {!isPartLoading && filteredParts.length === 0 && (
                          <div className="px-3 py-2 text-sm text-gray-500">
                            No parts found.
                          </div>
                        )}
                        {!isPartLoading &&
                          filteredParts.map((part) => (
                            <button
                              key={part.id}
                              type="button"
                              onClick={() => handlePartSelect(part)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-navy-50/60 transition-colors"
                            >
                              <div className="font-medium text-navy-800">
                                {part.partCode} — {part.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {part.partTypeName}
                                {part.drawingNo
                                  ? ` • Drawing: ${part.drawingNo}`
                                  : ""}
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Selecting a part fills Product Name and Description, and the
                    Product Code when it is a valid 11-character code.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    Product Name *
                  </label>
                  <input
                    name="productName"
                    type="text"
                    maxLength={100}
                    value={formData.productName}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, productName: e.target.value }))
                    }
                    className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.productName ? "border-red-500" : "border-navy-100"}`}
                  />
                  {formErrors.productName && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.productName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    Product Code *
                  </label>
                  <ProductCodeBuilder
                    key={modalKey}
                    value={formData.productCode}
                    onChange={(code) => {
                      setFormData((prev) => ({ ...prev, productCode: code }));
                      setFormErrors((prev) =>
                        prev.productCode ? { ...prev, productCode: "" } : prev,
                      );
                    }}
                    suggestedPartNumber={isCreateMode ? suggestedPartNumber : null}
                    excludeId={!isCreateMode ? selectedItem?.productId : null}
                    onAutoFlagChange={setPartNumberAuto}
                    onAvailabilityChange={setPartNumberAvailable}
                  />
                  {isCreateMode && partNumberAuto && (
                    <p className="text-xs text-gray-500 mt-1">
                      Part number is assigned automatically when you save
                      (matches the new product ID). Type one to set it yourself.
                    </p>
                  )}
                  {formErrors.productCode && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.productCode}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, price: e.target.value }))
                    }
                    className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.price ? "border-red-500" : "border-navy-100"}`}
                  />
                  {formErrors.price && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.price}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    {isCreateMode ? "Initial Stock" : "Stock Quantity"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.stockQuantity}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        stockQuantity: e.target.value,
                      }))
                    }
                    className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.stockQuantity ? "border-red-500" : "border-navy-100"}`}
                  />
                  {formErrors.stockQuantity && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.stockQuantity}
                    </p>
                  )}
                  {editStockChanged && (
                    <div className="mt-2">
                      <label className="block text-xs font-semibold text-navy-800 mb-1">
                        Reason for stock change (optional)
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        value={stockChangeReason}
                        onChange={(e) => setStockChangeReason(e.target.value)}
                        placeholder={`Was ${selectedItem?.stockQuantity} — e.g. physical count correction`}
                        className="w-full p-2.5 border border-gold-400/60 bg-gold-400/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        The change is recorded in the item&apos;s stock history.
                      </p>
                    </div>
                  )}
                </div>

                <LeadDateField
                  value={formData.leadDate}
                  onChange={(iso) => {
                    setFormData((prev) => ({ ...prev, leadDate: iso }));
                    setFormErrors((prev) => ({ ...prev, leadDate: undefined }));
                  }}
                  error={formErrors.leadDate}
                />

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    Qty Required
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formData.qtyRequired}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, qtyRequired: e.target.value }))
                    }
                    className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.qtyRequired ? "border-red-500" : "border-navy-100"}`}
                  />
                  {formErrors.qtyRequired && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.qtyRequired}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Recalculated automatically whenever a BOM using this
                    material changes.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    Returnable Qty
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.returnableQty}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        returnableQty: e.target.value,
                      }))
                    }
                    className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.returnableQty ? "border-red-500" : "border-navy-100"}`}
                  />
                  {formErrors.returnableQty && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.returnableQty}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Set how many units are currently returnable for this
                    product.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    maxLength={5000}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, description: e.target.value }))
                    }
                    className={`w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.description ? "border-red-500" : "border-navy-100"}`}
                    rows="2"
                  />
                  {formErrors.description && (
                    <p className="text-red-500 text-sm mt-1">
                      {formErrors.description}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
                  >
                    {isSaving
                      ? "Saving..."
                      : isCreateMode
                        ? "Create"
                        : "Update"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Details Modal */}
        {viewingLive && (
          <div
            className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
              <button
                type="button"
                onClick={() => setViewingItem(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
              <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
                {viewingLive.productName || "Product Details"}
              </h2>
              <dl className="space-y-4">
                {[
                  { label: "Product ID", value: viewingLive.productId },
                  { label: "Product Code", value: viewingLive.productCode },
                  {
                    label: "Price (₹)",
                    value:
                      Number(viewingLive.price) > 0
                        ? formatPrice(viewingLive.price)
                        : "Not set",
                  },
                  { label: "Stock Quantity", value: viewingLive.stockQuantity },
                  {
                    label: "Returnable Qty",
                    value: viewingLive.returnableQty ?? 0,
                  },
                  { label: "Qty Required", value: viewingLive.qtyRequired },
                  { label: "Lead Date", value: formatLeadDate(viewingLive.leadDate) },
                  { label: "Location", value: viewingLive.location },
                  { label: "Description", value: viewingLive.description },
                  {
                    label: "Created At",
                    value: formatDate(viewingLive.createdAt),
                  },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {label}
                    </dt>
                    <dd className="text-navy-800 mt-0.5 whitespace-pre-wrap">
                      {value || value === 0 ? value : "N/A"}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                  Stock History
                </h3>
                <StockHistory productId={viewingLive.productId} />
              </div>
              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setViewingItem(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Image Modal */}
        {showImageModal && selectedImage && (
          <div
            className="fixed inset-0 bg-navy-900/90 flex items-center justify-center z-50 p-4"
            onClick={() => setShowImageModal(false)}
          >
            <div className="relative max-w-7xl max-h-full">
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="absolute -top-12 right-0 text-white hover:text-gold-400 transition-colors"
                aria-label="Close image"
              >
                <XCircle size={32} />
              </button>
              <img
                src={selectedImage.url}
                alt={selectedImage.name}
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="text-white text-center mt-4 text-lg font-medium">
                {selectedImage.name}
              </div>
            </div>
          </div>
        )}

        {/* Accept Return Modal */}
        {acceptProduct && (
          <AcceptReturnModal
            product={acceptProduct}
            onClose={() => setAcceptProduct(null)}
            onAccepted={handleAccepted}
          />
        )}

        {/* Adjust Stock Modal */}
        {adjustProduct && (
          <AdjustStockModal
            item={adjustProduct}
            onClose={() => setAdjustProduct(null)}
            onDone={handleAdjusted}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

/* ========= AcceptReturnModal — closes only after the server accepts ========= */
const AcceptReturnModal = ({ product, onClose, onAccepted }) => {
  const available = Number(product.returnableQty) || 0;
  const [qty, setQty] = useState(String(available));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleAccept = async () => {
    const parsed = Number(qty);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setErrorMsg("Enter a quantity greater than 0.");
      return;
    }
    if (parsed > available) {
      setErrorMsg(`Cannot accept more than ${available}.`);
      return;
    }
    setErrorMsg("");
    setIsSubmitting(true);
    try {
      const updated = await acceptReturn(product.productId, Math.round(parsed * 100) / 100);
      onAccepted(updated);
    } catch (err) {
      // keep the modal open so the user can see what went wrong and retry
      setErrorMsg(err.message || "Accept return failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-[420px] max-w-full max-h-[90vh] overflow-y-auto relative">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
          aria-label="Close accept return modal"
        >
          <XCircle size={22} />
        </button>
        <h3 className="font-display text-xl font-bold text-navy-800 mb-3 pr-8">
          Accept Return — {product.productName}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Available to accept: <strong>{available}</strong>
          <span className="block text-xs text-gray-500 mt-1">
            Accepted units are added back to stock ({product.stockQuantity} now).
          </span>
        </p>

        <label className="text-sm font-semibold text-navy-800 mb-1.5 block">
          Quantity to accept
        </label>
        <input
          type="number"
          min={0.01}
          step="0.01"
          max={available}
          value={qty}
          onChange={(e) => {
            setQty(e.target.value);
            if (errorMsg) setErrorMsg("");
          }}
          onKeyDown={(e) => e.key === "Enter" && !isSubmitting && handleAccept()}
          className={`w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 mb-2 ${errorMsg ? "border-red-500" : "border-navy-100"}`}
        />
        {errorMsg && <p className="text-red-500 text-sm mb-2">{errorMsg}</p>}

        <div className="flex gap-3 justify-end mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="px-4 py-2 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              "Accepting..."
            ) : (
              <>
                <CheckCircle size={16} /> Accept
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockPage;
