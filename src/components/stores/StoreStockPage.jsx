import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  ArrowDownUp,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  MoreVertical,
  XCircle,
  Eye,
  Download,
  Upload,
  PlusCircle,
  Package,
  SlidersHorizontal,
} from "lucide-react";
import { debounce } from "lodash";
import { io } from "socket.io-client";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';
import ProductCodeBuilder from "../shared/ProductCodeBuilder.jsx";
import StockHistory from "../shared/StockHistory.jsx";
import AdjustStockModal from "../shared/AdjustStockModal.jsx";
import { suggestPartNumber } from "../../utils/productCode";
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
import { fetchStockList, createStock, updateStock } from "../../utils/stockApi";

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
// Store has no price field: new items start at 0 and edits keep the stored price.
const PAGE_OPTIONS = { includePrice: false, includeReturnable: false };
const MAX_IMPORT_ERROR_TOASTS = 5;

const formatDate = (dateString) => {
  if (!dateString) return "N/A";

  const date = new Date(dateString);

  if (isNaN(date.getTime())) return "N/A";

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
};

/* Row actions menu — module level so it is not re-created on every render. */
function ActionsDropdown({ item, onEdit, onAdjust }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handle = (e) =>
      ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-2 hover:bg-gray-100 rounded-full"
        aria-label={`Actions for ${item.productName}`}
      >
        <MoreVertical size={20} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white shadow-lg rounded-lg border border-navy-100 z-10">
          <button
            type="button"
            onClick={() => {
              onEdit(item);
              setOpen(false);
            }}
            className="flex w-full px-4 py-2 text-sm text-navy-800 hover:bg-navy-50 transition-colors items-center"
          >
            <Edit2 size={16} className="mr-2" /> Edit
          </button>
          <button
            type="button"
            onClick={() => {
              onAdjust(item);
              setOpen(false);
            }}
            className="flex w-full px-4 py-2 text-sm text-navy-800 hover:bg-navy-50 transition-colors items-center"
          >
            <SlidersHorizontal size={16} className="mr-2" /> Adjust Stock
          </button>
        </div>
      )}
    </div>
  );
}

const useFetchStock = () => {
  const [stockItems, setStockItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const json = await fetchStockList();
      const data = Array.isArray(json?.data) ? json.data : [];
      if (!mountedRef.current) return;
      setStockItems(data.map(normalizeStockItem));
      setTotalItems(Number(json?.total) || data.length);
      setError(null);
    } catch (err) {
      if (mountedRef.current) setError(err.message || "Failed to load stock");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { stockItems, setStockItems, totalItems, isLoading, error, refetchData: fetchData };
};

function StoreStockPage() {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({
    key: "createdAt",
    direction: "desc",
  });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [stockChangeReason, setStockChangeReason] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [partNumberAuto, setPartNumberAuto] = useState(true);
  const [partNumberAvailable, setPartNumberAvailable] = useState(true);
  const [viewingItem, setViewingItem] = useState(null);
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState("");
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedProductDescription, setSelectedProductDescription] =
    useState("");

  const tableRef = useRef(null);
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotify();

  const { stockItems, setStockItems, totalItems, isLoading, error, refetchData } =
    useFetchStock();

  // Latest list, for decisions made outside a state updater (socket handler).
  const itemsRef = useRef(stockItems);
  useEffect(() => {
    itemsRef.current = stockItems;
  }, [stockItems]);

  const debouncedSearch = useMemo(
    () => debounce((value) => setSearchTerm(value.toLowerCase()), 300),
    [],
  );

  useEffect(() => {
    debouncedSearch(searchInput);
    return () => debouncedSearch.cancel();
  }, [searchInput, debouncedSearch]);

  useEffect(() => setPage(0), [searchTerm]);

  // Socket Connection — only raw-material events are applied (finished-goods
  // stockUpdate events share the event name and product ids).
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: (cb) => cb({ token: localStorage.getItem('token') }),
      withCredentials: true,
      transports: ["websocket"],
    });

    const onStockUpdate = (payload) => {
      const preview = applyStockUpdate(itemsRef.current, payload);
      if (preview.needsRefetch) {
        refetchData();
        return;
      }
      if (preview.items === itemsRef.current) return;
      setStockItems((prev) => applyStockUpdate(prev, payload).items);
      const known = itemsRef.current.find((i) => i.productId === payload?.product_id);
      if (known && payload?.stock_quantity !== undefined && payload?.stock_quantity !== null) {
        notifyInfo(`${known.productName} → ${Number(payload.stock_quantity)}`);
      }
      tableRef.current?.focus();
    };

    socket.on("stockUpdate", onStockUpdate);

    return () => {
      socket.off("stockUpdate", onStockUpdate);
      socket.disconnect();
    };
  }, [refetchData, setStockItems, notifyInfo]);

  // QR Code
  const generateQRCode = useCallback(
    async (productCode, productName, description, location, elementId) => {
      try {
        const data = JSON.stringify({
          productCode,
          productName,
          description: description || "No description",
          location: location || "Not set",
        });
        await QRCode.toCanvas(document.getElementById(elementId), data, {
          width: 200,
          margin: 2,
          errorCorrectionLevel: "H",
        });
      } catch {
        notifyError("QR code generation failed");
      }
    },
    [notifyError],
  );

  useEffect(() => {
    if (showBarcodeModal && selectedBarcode) {
      generateQRCode(
        selectedBarcode,
        selectedProductName,
        selectedProductDescription,
        "",
        "qrcode-canvas",
      );
    }
  }, [
    showBarcodeModal,
    selectedBarcode,
    selectedProductName,
    selectedProductDescription,
    generateQRCode,
  ]);

  // Sorting & Filtering
  const sortedStock = useMemo(() => {
    const items = [...stockItems];
    if (sortConfig.key) {
      items.sort((a, b) => {
        if (sortConfig.key === "leadDate")
          return compareLeadDate(a.leadDate, b.leadDate, sortConfig.direction);
        let aVal = a[sortConfig.key] ?? "";
        let bVal = b[sortConfig.key] ?? "";
        if (
          ["stockQuantity", "qtyRequired", "productId"].includes(sortConfig.key)
        ) {
          aVal = Number(aVal);
          bVal = Number(bVal);
        } else if (sortConfig.key === "createdAt") {
          const aDate = new Date(aVal || 0).getTime();
          const bDate = new Date(bVal || 0).getTime();
          aVal = Number.isNaN(aDate) ? 0 : aDate;
          bVal = Number.isNaN(bDate) ? 0 : bDate;
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
    return sortedStock.filter((item) => {
      const terms = [
        item.productId,
        item.productName,
        item.productCode,
        item.location,
      ].map((s) => String(s ?? "").toLowerCase());
      return terms.some((t) => t.includes(searchTerm));
    });
  }, [sortedStock, searchTerm]);

  // Keep the page in range when the list shrinks (deletes, filters).
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(filteredStock.length / itemsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [filteredStock.length, itemsPerPage, page]);

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
      reader.onerror = () => notifyError("Could not read the file");
      reader.onload = async (e) => {
        setIsImporting(true);
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = sheet ? XLSX.utils.sheet_to_json(sheet) : [];

          if (!json.length) throw new Error("Empty file");

          const existingById = new Map(
            itemsRef.current.map((i) => [i.productId, i]),
          );
          const { valid, errors } = parseImportRows(json, {
            existingById,
            ...PAGE_OPTIONS,
          });

          errors
            .slice(0, MAX_IMPORT_ERROR_TOASTS)
            .forEach((msg) => notifyError(msg));
          if (errors.length > MAX_IMPORT_ERROR_TOASTS) {
            notifyError(`…and ${errors.length - MAX_IMPORT_ERROR_TOASTS} more invalid rows`);
          }
          if (!valid.length) return;

          let created = 0,
            updated = 0;
          const failures = [];

          for (const { productId, body } of valid) {
            try {
              const saved = productId
                ? await updateStock(productId, body)
                : await createStock(body);
              if (saved?.partNumberWarning) notifyWarning(saved.partNumberWarning);
              if (productId) updated++;
              else created++;
            } catch (err) {
              failures.push(`${body.productCode || body.productName}: ${err.message}`);
            }
          }

          await refetchData();
          setPage(0);
          const summary = `Imported: ${created} created, ${updated} updated${failures.length ? `, ${failures.length} failed` : ""}`;
          if (failures.length) {
            notifyWarning(summary);
            failures
              .slice(0, MAX_IMPORT_ERROR_TOASTS)
              .forEach((msg) => notifyError(msg));
          } else {
            notifySuccess(summary);
          }
        } catch (err) {
          notifyError(`Import failed: ${err.message}`);
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [refetchData, notifyError, notifySuccess, notifyWarning],
  );

  // Export Excel
  const exportToExcel = useCallback(() => {
    const data = filteredStock.map((item) => ({
      "Product ID": item.productId,
      "Product Code": item.productCode,
      "Product Name": item.productName,
      Description: item.description || "N/A",
      "Stock Quantity": item.stockQuantity,
      "Qty Required": item.qtyRequired,
      "Lead Date": formatDisplay(item.leadDate),
      "Created At (IST)": item.createdAt ? formatDate(item.createdAt) : "N/A",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Raw Materials");
    XLSX.writeFile(wb, "Raw_Material_Inventory.xlsx");
    notifySuccess("Exported to Excel!");
  }, [filteredStock, notifySuccess]);

  // Handlers
  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const showBarcode = useCallback((code, name, desc) => {
    setSelectedBarcode(code);
    setSelectedProductName(name);
    setSelectedProductDescription(desc);
    setShowBarcodeModal(true);
  }, []);

  const isEditStockChanged =
    modalMode === "edit" && !!selectedItem && stockChanged(formData, selectedItem);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isSubmitting) return;
      const isCreate = modalMode === "create";
      const errors = validateStockForm(formData, {
        mode: modalMode,
        requirePrice: false,
      });
      if (Object.keys(errors).length) {
        setFormErrors(errors);
        Object.values(errors).forEach((msg) => notifyError(msg));
        return;
      }
      setFormErrors({});
      // In auto mode the server assigns the part number, so a clash with the
      // suggested number must not block the create.
      if (!partNumberAvailable && !(isCreate && partNumberAuto)) {
        notifyError("Part Number is already in use — choose a different one.");
        return;
      }

      const body = buildStockPayload(formData, {
        mode: modalMode,
        original: selectedItem,
        ...PAGE_OPTIONS,
        partNumberAuto,
        stockChangeReason,
      });

      setIsSubmitting(true);
      try {
        const saved = isCreate
          ? await createStock(body)
          : await updateStock(selectedItem.productId, body);
        if (saved?.partNumberWarning) notifyWarning(saved.partNumberWarning);
        await refetchData();
        setShowModal(false);
        if (isCreate) setPage(0);
        notifySuccess(isCreate ? "Item created!" : "Item updated!");
      } catch (err) {
        notifyError(err.message || "Save failed");
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isSubmitting,
      formData,
      modalMode,
      selectedItem,
      refetchData,
      partNumberAuto,
      partNumberAvailable,
      stockChangeReason,
      notifyError,
      notifySuccess,
      notifyWarning,
    ],
  );

  const handleCreate = useCallback(() => {
    setModalMode("create");
    setSelectedItem(null);
    setFormData({ ...EMPTY_FORM });
    setStockChangeReason("");
    setFormErrors({});
    setPartNumberAuto(true);
    setPartNumberAvailable(true);
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((item) => {
    setModalMode("edit");
    setSelectedItem(item);
    setFormData(formFromItem(item));
    setStockChangeReason("");
    setFormErrors({});
    setPartNumberAvailable(true);
    setShowModal(true);
  }, []);

  const handleAdjusted = useCallback(
    (updated) => {
      setAdjustingItem(null);
      if (updated && (updated.productId ?? updated.product_id) !== undefined) {
        const next = normalizeStockItem(updated);
        setStockItems((prev) =>
          prev.map((i) => (i.productId === next.productId ? { ...i, ...next } : i)),
        );
      } else {
        refetchData();
      }
    },
    [setStockItems, refetchData],
  );

  // Focus Trap
  useEffect(() => {
    if (showModal && modalRef.current) {
      const first = modalRef.current.querySelector("input");
      first?.focus();
      const handle = (e) => {
        if (e.key !== "Tab" || !modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          "button, input, textarea",
        );
        if (!focusable.length) return;
        const firstEl = focusable[0],
          lastEl = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      };
      document.addEventListener("keydown", handle);
      return () => document.removeEventListener("keydown", handle);
    }
  }, [showModal]);

  // Render
  if (isLoading && !stockItems.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-gray-500 text-lg">
          Loading raw materials...
        </div>
      </div>
    );
  }

  if (error && !showModal && !viewingItem && !showBarcodeModal && !adjustingItem) return <ConnectionError onRetry={refetchData} />;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-grow min-w-[220px]">
          <input
            type="text"
            placeholder="Search by ID, Name, Code, or Location..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Escape" && (setSearchInput(""), setSearchTerm(""))
            }
            ref={searchInputRef}
            className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
          />
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            size={17}
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                setSearchTerm("");
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Clear search"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
        <button
          onClick={refetchData}
          disabled={isLoading}
          className="px-4 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50 flex items-center"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
        <button
          onClick={handleCreate}
          className="px-4 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors flex items-center"
        >
          <PlusCircle className="mr-2" size={18} /> Add Item
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center"
        >
          <Upload className="mr-2" size={16} /> {isImporting ? "Importing..." : "Import"}
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={importFromExcel}
          accept=".xlsx,.xls"
          className="hidden"
        />
        <button
          onClick={exportToExcel}
          disabled={!filteredStock.length}
          className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center"
        >
          <Download className="mr-2" size={16} /> Export
        </button>
      </div>

      {filteredStock.length === 0 && !isLoading ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-navy-100 text-center">
          <Package size={40} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No items found.</p>
          {!searchTerm && (
            <button
              onClick={handleCreate}
              className="mt-4 px-4 py-2 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors flex items-center mx-auto"
            >
              <PlusCircle className="mr-2" size={16} /> Add First Item
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
          <table
            className="w-full text-left"
            ref={tableRef}
            tabIndex={0}
          >
            <thead className="bg-navy-50">
              <tr>
                {[
                  { key: "productId", label: "ID" },
                  { key: "productCode", label: "Code" },
                  { key: "productName", label: "Name" },
                  { key: "stockQuantity", label: "Stock" },
                  { key: "leadDate", label: "Lead Date" },
                  { key: "qtyRequired", label: "Req" },
                  { key: "details", label: "Details" },
                  { key: "actions", label: "Actions" },
                ].map(({ key, label }) => {
                  const sortable = key !== "actions" && key !== "details";
                  return (
                    <th
                      key={key}
                      onClick={() => sortable && handleSort(key)}
                      onKeyDown={(e) =>
                        sortable && (e.key === "Enter" || e.key === " ") && handleSort(key)
                      }
                      className={`py-3 px-3 text-sm font-semibold text-navy-800 border-b border-navy-100 whitespace-nowrap ${sortable ? "cursor-pointer hover:bg-navy-100 transition-colors" : ""}`}
                      tabIndex={sortable ? 0 : -1}
                    >
                      <div className="flex items-center">
                        {label}
                        {sortable && (
                          <ArrowDownUp
                            className={`ml-2 ${sortConfig.key === key ? "text-gold-500" : "text-navy-400/50"}`}
                            size={14}
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
                return (
                  <tr
                    key={item.productId}
                    className="hover:bg-navy-50/60 transition-colors"
                  >
                    <td className="py-3.5 px-3 text-navy-800 font-medium">
                      {item.productId}
                    </td>
                    <td className="py-3.5 px-3 text-gray-600 font-mono text-sm">
                      {item.productCode}
                    </td>
                    <td className="py-3.5 px-3 text-navy-800 font-medium">
                      {item.productName}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${isLow ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}
                      >
                        {item.stockQuantity}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <LeadDateCell leadDate={item.leadDate} isLow={isLow} />
                    </td>
                    <td className="py-3.5 px-3 text-gray-600">
                      {item.qtyRequired}
                    </td>
                    <td className="py-3.5 px-3">
                      <button
                        onClick={() => setViewingItem(item)}
                        className="text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors flex items-center"
                      >
                        <Eye size={16} className="mr-1" /> View
                      </button>
                    </td>
                    <td className="py-3.5 px-3 sticky right-0 bg-white">
                      <ActionsDropdown
                        item={item}
                        onEdit={handleEdit}
                        onAdjust={setAdjustingItem}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-3 justify-between items-center p-4 bg-navy-50 border-t border-navy-100">
            <div className="text-gray-500 text-sm">
              Showing {paginatedStock.length} of {filteredStock.length}{" "}
              (Total: {totalItems})
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-6">
              <div className="flex gap-4 text-sm text-gray-500">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 mr-1.5"></div>{" "}
                  In Stock
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-1.5"></div>{" "}
                  Low
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * itemsPerPage >= filteredStock.length}
                  className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 overflow-y-auto pt-10 px-4 sm:px-0">
          <div
            className="bg-white p-4 sm:p-6 rounded-xl shadow-2xl w-[520px] max-w-full max-h-[90vh] overflow-y-auto relative"
            ref={modalRef}
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <XCircle size={20} />
            </button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-5 pr-8">
              {modalMode === "create"
                ? "Add Item"
                : `Edit #${selectedItem?.productId}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Product Name *</label>
                <input
                  type="text"
                  maxLength={100}
                  value={formData.productName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, productName: e.target.value }))
                  }
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.productName ? "border-red-500" : "border-navy-100"}`}
                  required
                />
                {formErrors.productName && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.productName}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">
                  Product Code (11 chars) *
                </label>
                <ProductCodeBuilder
                  key={`${modalMode}-${selectedItem?.productId ?? "new"}`}
                  value={formData.productCode}
                  onChange={(code) =>
                    setFormData((prev) => ({ ...prev, productCode: code }))
                  }
                  suggestedPartNumber={
                    modalMode === "create" ? suggestPartNumber(stockItems) : null
                  }
                  excludeId={modalMode === "edit" ? selectedItem?.productId : null}
                  onAutoFlagChange={setPartNumberAuto}
                  onAvailabilityChange={setPartNumberAvailable}
                />
                {formErrors.productCode && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.productCode}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">
                  {modalMode === "create" ? "Initial Stock" : "Stock Quantity"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formData.stockQuantity}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, stockQuantity: e.target.value }))
                  }
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.stockQuantity ? "border-red-500" : "border-navy-100"}`}
                  required={modalMode === "create"}
                />
                {formErrors.stockQuantity && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.stockQuantity}</p>
                )}
              </div>
              {isEditStockChanged && (
                <div>
                  <label className="block text-sm font-medium text-navy-800 mb-1">
                    Reason for stock change
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    placeholder={`Was ${selectedItem.stockQuantity} — e.g. physical count, damaged`}
                    value={stockChangeReason}
                    onChange={(e) => setStockChangeReason(e.target.value)}
                    className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional. Saved in the item&apos;s stock history.
                  </p>
                </div>
              )}
              <LeadDateField
                value={formData.leadDate}
                onChange={(iso) => {
                  setFormData((prev) => ({ ...prev, leadDate: iso }));
                  setFormErrors((prev) => ({ ...prev, leadDate: undefined }));
                }}
                error={formErrors.leadDate}
                labelClassName="block text-sm font-medium text-navy-800 mb-1"
              />
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Qty Required</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.qtyRequired}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, qtyRequired: e.target.value }))
                  }
                  className={`w-full p-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 ${formErrors.qtyRequired ? "border-red-500" : "border-navy-100"}`}
                />
                {formErrors.qtyRequired && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.qtyRequired}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-800 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                  rows="2"
                />
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
                  disabled={isSubmitting}
                  className={`px-5 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50 ${modalMode === "create" ? "bg-gold-500 text-navy-900 hover:bg-gold-400" : "bg-navy-800 text-white hover:bg-navy-700"}`}
                >
                  {isSubmitting ? "Saving..." : modalMode === "create" ? "Create" : "Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingItem && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto relative" role="dialog" aria-labelledby="stock-details-title">
            <button
              onClick={() => setViewingItem(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close details"
            >
              <XCircle size={20} />
            </button>
            <h2 id="stock-details-title" className="font-display text-xl font-bold text-navy-800 mb-5 pr-8">
              {viewingItem.productName || "Material Details"}
            </h2>
            <dl className="space-y-4">
              {[
                { label: "Product ID", value: viewingItem.productId },
                { label: "Product Code", value: viewingItem.productCode },
                { label: "Description", value: viewingItem.description },
                { label: "Stock Quantity", value: viewingItem.stockQuantity },
                { label: "Qty Required", value: viewingItem.qtyRequired },
                { label: "Lead Date", value: formatLeadDate(viewingItem.leadDate) },
                { label: "Location", value: viewingItem.location },
                { label: "Created", value: formatDate(viewingItem.createdAt) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="text-navy-800 mt-0.5 whitespace-pre-wrap">{value === undefined || value === null || value === "" ? "N/A" : value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6">
              <StockHistory productId={viewingItem.productId} />
            </div>
            <div className="flex justify-between mt-6">
              <button
                onClick={() => {
                  showBarcode(
                    viewingItem.productCode,
                    viewingItem.productName,
                    viewingItem.description,
                    viewingItem.location,
                  );
                  setViewingItem(null);
                }}
                className="px-4 py-2 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors"
              >
                Show QR Code
              </button>
              <button
                onClick={() => setViewingItem(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showBarcodeModal && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-2xl w-[500px] max-w-full max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setShowBarcodeModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <XCircle size={20} />
            </button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-4 pr-8">
              QR: {selectedProductName}
            </h2>
            <div className="space-y-1 text-sm text-gray-700 mb-4">
              <p>
                <strong>Code:</strong> {selectedBarcode}
              </p>
              {/* <p>
                <strong>Location:</strong> {selectedProductLocation}
              </p> */}
            </div>
            <canvas
              id="qrcode-canvas"
              className="w-full max-w-[200px] mx-auto mb-4"
            ></canvas>
            <button
              onClick={() => {
                const canvas = document.getElementById("qrcode-canvas");
                const a = document.createElement("a");
                a.href = canvas.toDataURL("image/png");
                a.download = `QR_${selectedBarcode}.png`;
                a.click();
                notifySuccess("Downloaded!");
              }}
              className="px-4 py-2 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors flex items-center mx-auto"
            >
              <Download className="mr-2" /> Download
            </button>
          </div>
        </div>
      )}

      {adjustingItem && (
        <AdjustStockModal
          item={adjustingItem}
          onClose={() => setAdjustingItem(null)}
          onDone={handleAdjusted}
        />
      )}
    </div>
  );
}

export default StoreStockPage;
