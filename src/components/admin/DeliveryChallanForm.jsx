// src/pages/DeliveryChallanForm.jsx
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Modal from "react-modal";
import axios from "axios";
import { Plus, Download, Trash2, FileText, Search } from "lucide-react";
import { useSelector } from 'react-redux';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

Modal.setAppElement("#root");

const API_URL = import.meta.env.VITE_BACKEND_URL || "";
const MAX_FETCH_LIMIT = 5000;
const DISPLAY_LIMIT = 200;
const DEBOUNCE_MS = 200;

function formatDDMMYYYY(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function makeItem(overrides = {}) {
  const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    _uid: uid,
    source: "inventory",
    productId: null,
    productName: "",
    description: "",
    qty: "",
    remarks: "",
    returnable: false,
    ...overrides,
  };
}

export default function DeliveryChallanForm() {
  const DEFAULT_DATE = new Date().toISOString().slice(0, 10);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const socketStatus = useSelector(state => state.auth.socketStatus);
  const abortRef = useRef(null);
  const [form, setForm] = useState({
    challan_no: "",
    date: DEFAULT_DATE,
    order_no: "",
    order_date: "",
    vehicle_no: "",
    to_name: "",
    to_address: "",
    to_gst_number: "",
    items: [makeItem()],
  });

  const [inventoryList, setInventoryList] = useState([]);
  const [rawList, setRawList] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);

  const [productQueries, setProductQueries] = useState({});
  const [filteredProducts, setFilteredProducts] = useState({});
  const [dropdownOpen, setDropdownOpen] = useState({});
  const [selectedIndexMap, setSelectedIndexMap] = useState({});

  const debounceTimersRef = useRef({});

  /* ===========================
     Fetch / normalize lists
  ============================ */
  const fetchLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const invUrl = `${API_URL}/api/inventory?limit=${MAX_FETCH_LIMIT}&offset=0`;
      const rawUrl = `${API_URL}/api/stock?limit=${MAX_FETCH_LIMIT}&offset=0`;
      const [invRes, rawRes] = await Promise.all([fetch(invUrl, { headers }), fetch(rawUrl, { headers })]);
      const invJson = invRes.ok ? await invRes.json() : null;
      const rawJson = rawRes.ok ? await rawRes.json() : null;

      const normalize = (obj) => {
        if (!obj) return [];
        if (Array.isArray(obj)) return obj;
        if (Array.isArray(obj.data)) return obj.data;
        if (obj.data && Array.isArray(obj.data.items)) return obj.data.items;
        const firstArr = Object.values(obj).find((v) => Array.isArray(v));
        return Array.isArray(firstArr) ? firstArr : [];
      };

      const invArr = normalize(invJson);
      const rawArr = normalize(rawJson);

      setInventoryList(
        invArr.map((p) => ({
          product_id: p.product_id ?? p.productId ?? p.id ?? p.product_code ?? null,
          product_name: p.product_name ?? p.productName ?? p.name ?? p.product_code ?? "Unnamed",
        }))
      );
      setRawList(
        rawArr.map((p) => ({
          product_id: p.product_id ?? p.productId ?? p.id ?? p.product_code ?? null,
          product_name: p.product_name ?? p.productName ?? p.name ?? p.product_code ?? "Unnamed",
        }))
      );
    } catch (err) {
      console.error("Failed to load product lists:", err);
      setFetchError("Failed to load inventory/raw lists.");
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  /* ===========================
     Small helpers
  ============================ */
  const addItem = useCallback(() => {
    setForm((prev) => ({ ...prev, items: [...prev.items, makeItem()] }));
  }, []);

  const removeItemByUid = useCallback((uid) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((it) => it._uid !== uid) }));
    setProductQueries((p) => {
      const n = { ...p }; delete n[uid]; return n;
    });
    setFilteredProducts((p) => {
      const n = { ...p }; delete n[uid]; return n;
    });
    setDropdownOpen((p) => {
      const n = { ...p }; delete n[uid]; return n;
    });
    setSelectedIndexMap((p) => {
      const n = { ...p }; delete n[uid]; return n;
    });
    if (debounceTimersRef.current[uid]) {
      clearTimeout(debounceTimersRef.current[uid]);
      delete debounceTimersRef.current[uid];
    }
  }, []);

  const updateItemFieldByUid = useCallback((uid, field, value) => {
    setForm((prev) => {
      const items = prev.items.map((it) => {
        if (it._uid !== uid) return it;
        if (field === "source") {
          return { ...it, [field]: value, productId: null, productName: "" };
        }
        return { ...it, [field]: value };
      });
      return { ...prev, items };
    });
    if (field === "source") {
      setProductQueries((p) => ({ ...p, [uid]: "" }));
      setFilteredProducts((p) => ({ ...p, [uid]: [] }));
      setDropdownOpen((p) => ({ ...p, [uid]: false }));
      setSelectedIndexMap((p) => ({ ...p, [uid]: -1 }));
    }
  }, []);

  /* ===========================
     Filtering (debounced)
  ============================ */
  const performFilter = useCallback((uid, query) => {
    const it = form.items.find((x) => x._uid === uid);
    const src = it?.source || "inventory";
    const list = src === "raw" ? rawList : inventoryList;

    if (!query) {
      if (list.length === 0) {
        setFilteredProducts((p) => ({ ...p, [uid]: [{ product_id: null, product_name: "Loading products..." }] }));
      } else {
        setFilteredProducts((p) => ({ ...p, [uid]: list.slice(0, DISPLAY_LIMIT) }));
      }
      return;
    }

    const qq = query.toLowerCase();
    const out = [];
    for (let i = 0; i < list.length; ++i) {
      const item = list[i];
      const name = (item.product_name || "").toLowerCase();
      if (name.includes(qq) || String(item.product_id).includes(qq)) {
        out.push(item);
        if (out.length >= DISPLAY_LIMIT) break;
      }
    }

    if (out.length === 0) {
      setFilteredProducts((p) => ({ ...p, [uid]: [{ product_id: null, product_name: "No matches found" }] }));
    } else {
      setFilteredProducts((p) => ({ ...p, [uid]: out }));
    }
  }, [inventoryList, rawList, form.items]);

  const onProductQueryChange = useCallback((uid, q) => {
    setProductQueries((p) => ({ ...p, [uid]: q }));
    setDropdownOpen((p) => ({ ...p, [uid]: true }));
    setSelectedIndexMap((p) => ({ ...p, [uid]: -1 }));

    if (debounceTimersRef.current[uid]) clearTimeout(debounceTimersRef.current[uid]);
    debounceTimersRef.current[uid] = setTimeout(() => {
      performFilter(uid, q || "");
      delete debounceTimersRef.current[uid];
    }, DEBOUNCE_MS);
  }, [performFilter]);

  const selectProduct = useCallback((uid, prod) => {
    if (!prod || prod.product_id == null) return;

    setForm((prev) => {
      const items = prev.items.map((it) =>
        it._uid === uid
          ? { ...it, productId: prod.product_id, productName: prod.product_name }
          : it
      );
      return { ...prev, items };
    });

    setProductQueries((p) => ({ ...p, [uid]: prod.product_name }));
    setFilteredProducts((p) => ({ ...p, [uid]: [] }));
    setDropdownOpen((p) => ({ ...p, [uid]: false }));
    setSelectedIndexMap((p) => ({ ...p, [uid]: -1 }));
  }, []);

  const onProductKeyDown = useCallback((uid, e) => {
    const list = filteredProducts[uid] || [];
    if (!dropdownOpen[uid] || list.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndexMap((p) => ({
        ...p,
        [uid]: (p[uid] ?? -1) < list.length - 1 ? (p[uid] ?? -1) + 1 : 0,
      }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndexMap((p) => ({
        ...p,
        [uid]: (p[uid] ?? -1) > 0 ? (p[uid] ?? -1) - 1 : list.length - 1,
      }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = selectedIndexMap[uid] ?? -1;
      let pickIdx = idx;
      if (pickIdx < 0) {
        pickIdx = list.findIndex((x) => x.product_id != null);
      }
      if (pickIdx >= 0 && list[pickIdx] && list[pickIdx].product_id != null) {
        selectProduct(uid, list[pickIdx]);
      }
    } else if (e.key === "Escape") {
      setDropdownOpen((p) => ({ ...p, [uid]: false }));
    }
  }, [filteredProducts, dropdownOpen, selectedIndexMap, selectProduct]);

  /* ===========================
     Submit handler – FIXED PAYLOAD
  ============================ */
  const handleGenerate = useCallback(async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) {
      notifyError("Please login first.");
      return;
    }
    if (!form.challan_no) {
      notifyError("Challan No is required.");
      return;
    }
    if (!form.items.length) {
      notifyError("Add at least one item.");
      return;
    }
    for (let i = 0; i < form.items.length; ++i) {
      const it = form.items[i];
      if (!it.productId) {
        notifyError(`Select product for item #${i + 1}.`);
        return;
      }
      if (it.qty === "" || it.qty === null || isNaN(Number(it.qty)) || Number(it.qty) <= 0) {
        notifyError(`Enter valid qty for item #${i + 1}.`);
        return;
      }
    }

    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const payload = {
        challan_no: form.challan_no,
        date: form.date || null,
        order_no: form.order_no || "",
        order_date: form.order_date || null,
        vehicle_no: form.vehicle_no || "",
        to_name: form.to_name || "",
        to_address: form.to_address || "",
        to_gst_number: form.to_gst_number || "",
        items: form.items.map((it, idx) => ({
          sno: idx + 1,
          source: it.source || "inventory",
          productId: Number(it.productId),
          productName: it.productName,   // ✅ ADDED – this is what the PDF uses
          qty: Number(it.qty),
          remarks: it.remarks || "",
          returnable: !!it.returnable,
        })),
      };

      const response = await axios.post(`${API_URL}/api/delivery-challan/generate`, payload, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
        signal: controller.signal,
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = response.headers["content-disposition"];
      let filename = `DELIVERY_CHALLAN_${(form.challan_no || "challan").replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`;
      if (cd) {
        const m = cd.match(/filename="?(.+)"?/);
        if (m && m[1]) filename = m[1];
      }
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      notifySuccess("Delivery Challan PDF downloaded.");
      setIsOpen(false);
      fetchLists();
    } catch (err) {
      console.error("Generate challan error:", err);
      setFetchError("Failed to generate delivery challan.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [form, fetchLists]);

  /* ===========================
     Memoized ItemRow
  ============================ */
  const ItemRow = useCallback(
    React.memo(function ItemRowInner({
      it,
      index,
      productQuery,
      filtered,
      isOpen,
      selIdx,
      onQueryChange,
      onKeyDown,
      onSelect,
      onUpdateField,
      onRemove,
      loadingLists,
    }) {
      const uid = it._uid;
      return (
        <div className="grid grid-cols-12 gap-2 items-start mb-3">
          <div className="col-span-1 text-center pt-2 text-sm">{index + 1}</div>
          <div className="col-span-2">
            <label className="text-xs text-gray-600">Source</label>
            <select
              value={it.source}
              onChange={(e) => onUpdateField(uid, "source", e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="inventory">Finished Goods</option>
              <option value="raw">Raw Material</option>
            </select>
          </div>
          <div className="col-span-4 relative">
            <label className="text-xs text-gray-600">Product (select)</label>
            <div className="relative">
              <input
                type="text"
                value={productQuery ?? it.productName ?? ""}
                onChange={(e) => onQueryChange(uid, e.target.value)}
                onKeyDown={(e) => onKeyDown(uid, e)}
                onFocus={() => {
                  if (!productQuery) {
                    if (!filtered || filtered.length === 0) {
                      onQueryChange(uid, "");
                    }
                  }
                }}
                placeholder={loadingLists ? "Loading products..." : "Type to search product..."}
                className="w-full p-2 border rounded text-sm"
              />
              <div className="absolute left-2 top-2 text-gray-300 pointer-events-none">
                <Search size={14} />
              </div>
            </div>
            {isOpen && filtered && filtered.length > 0 && (
              <ul className="absolute z-40 w-full mt-1 bg-white rounded shadow-lg border max-h-60 overflow-auto">
                {filtered.map((p, pIndex) => (
                  <li
                    key={`${p.product_id ?? "nm"}-${pIndex}`}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      if (p.product_id != null) onSelect(uid, p);
                    }}
                    onMouseEnter={() => setSelectedIndexMap((m) => ({ ...m, [uid]: pIndex }))}
                    className={`px-3 py-2 cursor-pointer flex justify-between items-center text-sm ${
                      pIndex === selIdx ? "bg-amber-100 font-semibold" : "hover:bg-gray-50"
                    } ${p.product_id == null ? "text-gray-400 cursor-default" : ""}`}
                  >
                    <span className="truncate">{p.product_name}</span>
                    {p.product_id != null && <small className="text-gray-400 ml-2">#{p.product_id}</small>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-600">Qty</label>
            <input
              type="number"
              min="0"
              step="any"
              value={it.qty}
              onChange={(e) => onUpdateField(uid, "qty", e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="col-span-1 flex flex-col items-center">
            <label className="text-xs text-gray-600">Returnable</label>
            <input
              type="checkbox"
              checked={!!it.returnable}
              onChange={(e) => onUpdateField(uid, "returnable", e.target.checked)}
              className="mt-2"
              aria-label={`Returnable for item ${uid}`}
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-600">Remarks</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              value={it.remarks}
              onChange={(e) => onUpdateField(uid, "remarks", e.target.value)}
              placeholder="Remarks"
            />
          </div>
          <div className="col-span-12 text-right mt-1">
            <button type="button" onClick={() => onRemove(uid)} className="text-red-600 text-xs flex items-center gap-1 ml-auto">
              <Trash2 className="w-3 h-3" /> Remove row
            </button>
          </div>
        </div>
      );
    },
    (prev, next) => {
      if (prev.it !== next.it) return false;
      if (prev.productQuery !== next.productQuery) return false;
      const a = prev.filtered || [];
      const b = next.filtered || [];
      if (a.length !== b.length) return false;
      if (a.length > 0 && b.length > 0) {
        if (a[0].product_id !== b[0].product_id) return false;
        if (a[a.length - 1].product_id !== b[b.length - 1].product_id) return false;
      }
      if (prev.isOpen !== next.isOpen) return false;
      if (prev.selIdx !== next.selIdx) return false;
      if (prev.loadingLists !== next.loadingLists) return false;
      return true;
    })
  , []);

  const stableOnQueryChange = onProductQueryChange;
  const stableOnKeyDown = onProductKeyDown;
  const stableOnSelect = selectProduct;
  const stableOnUpdateField = updateItemFieldByUid;
  const stableOnRemove = removeItemByUid;

  const itemsForRender = useMemo(() => form.items, [form.items]);
  const { notifySuccess, notifyError } = useNotify();

  if (socketStatus === 'error' || fetchError) return <ConnectionError onRetry={() => setFetchError(null)} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-200 to-gray-300 p-6">
<div className="max-w-5xl mx-auto text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 tracking-tight">Delivery Challan Generator</h1>
        <div className="flex justify-center mb-12">
          <button
            onClick={() => {
              setIsOpen(true);
              if (!inventoryList.length || !rawList.length) fetchLists();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 rounded-xl shadow-md flex flex-col items-center gap-2 transition-all"
          >
            <FileText className="w-10 h-10" />
            <span className="text-lg font-semibold">Create Delivery Challan</span>
          </button>
        </div>
      </div>

      <Modal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        className="max-w-4xl mx-auto mt-8 bg-white rounded-2xl p-6 outline-none shadow-xl"
        overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
      >
        <h3 className="text-xl font-semibold mb-2 text-gray-800">Create Delivery Challan</h3>
        <div className="text-sm text-gray-600 mb-4">
          <span className="mr-6">
            Challan No.: <strong>{form.challan_no}</strong>
          </span>
          <span>Date: <strong>{formatDDMMYYYY(form.date || DEFAULT_DATE)}</strong></span>
        </div>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600">Challan No *</label>
              <input value={form.challan_no} onChange={(e) => setForm((p) => ({ ...p, challan_no: e.target.value }))} required className="w-full border rounded px-3 py-2 mt-1" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Order No</label>
              <input value={form.order_no} onChange={(e) => setForm((p) => ({ ...p, order_no: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600">Order Date</label>
              <input type="date" value={form.order_date} onChange={(e) => setForm((p) => ({ ...p, order_date: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Vehicle Number</label>
              <input value={form.vehicle_no} onChange={(e) => setForm((p) => ({ ...p, vehicle_no: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">GST No.</label>
              <input value={form.to_gst_number} onChange={(e) => setForm((p) => ({ ...p, to_gst_number: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600">To (Name) / M/s.</label>
              <input value={form.to_name} onChange={(e) => setForm((p) => ({ ...p, to_name: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
            </div>
            <div />
          </div>
          <div>
            <label className="block text-sm text-gray-600">To (Address)</label>
            <textarea rows={3} value={form.to_address} onChange={(e) => setForm((p) => ({ ...p, to_address: e.target.value }))} className="w-full border rounded px-3 py-2 mt-1" />
          </div>

          <div className="bg-gray-50 border rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold text-gray-800">Items</div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={addItem} className="text-blue-600 flex items-center gap-2 text-sm">
                  <Plus className="w-4 h-4" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm((p) => ({ ...p, items: [makeItem()] }));
                    setProductQueries({});
                    setFilteredProducts({});
                    setDropdownOpen({});
                    setSelectedIndexMap({});
                  }}
                  className="text-sm text-gray-600"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 mb-1">
              <div className="col-span-1 text-center">No.</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-4">Product</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-1 text-center">Ret?</div>
              <div className="col-span-2">Remarks</div>
            </div>
            {itemsForRender.map((it, idx) => (
              <div key={it._uid}>
                <ItemRow
                  it={it}
                  index={idx}
                  productQuery={productQueries[it._uid] ?? ""}
                  filtered={filteredProducts[it._uid] ?? []}
                  isOpen={!!dropdownOpen[it._uid]}
                  selIdx={selectedIndexMap[it._uid] ?? -1}
                  onQueryChange={stableOnQueryChange}
                  onKeyDown={stableOnKeyDown}
                  onSelect={stableOnSelect}
                  onUpdateField={stableOnUpdateField}
                  onRemove={stableOnRemove}
                  loadingLists={loadingLists}
                />
                <hr className="my-2" />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 border rounded-lg text-gray-700">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow flex items-center">
              <Download className="w-4 h-4 mr-2" />
              {loading ? "Generating..." : "Generate PDF"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}