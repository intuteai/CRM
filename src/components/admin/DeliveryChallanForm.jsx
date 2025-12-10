// src/pages/DeliveryChallanForm.jsx
import React, { useState, useRef } from "react";
import Modal from "react-modal";
import axios from "axios";
import { Plus, Download, Trash2, FileText } from "lucide-react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

Modal.setAppElement("#root");

const API_URL = import.meta.env.VITE_BACKEND_URL || "";

export default function DeliveryChallanForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

 
  const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    challan_no: "",
    date: DEFAULT_DATE,
    order_no: "",
    order_date: "",
    vehicle_no: "",
    to_name: "",
    to_address: "",
    to_gst_number: "",
    items: [
      {
        description: "",
        qty: "",
        remarks: "",
      },
    ],
  });

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", qty: "", remarks: "" }],
    }));
  };

  const removeItem = (i) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== i),
    }));

  const updateItem = (i, field, val) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[i] = { ...items[i], [field]: val };
      return { ...prev, items };
    });
  };

  const displayDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    if (!token) {
      toast.error("Please login first.");
      return;
    }

    if (!form.challan_no) {
      toast.error("Challan No is required.");
      return;
    }

    if (!form.items.length) {
      toast.error("Add at least one item.");
      return;
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
          description:
            it.description && String(it.description).trim()
              ? it.description
              : "",
          qty:
            it.qty !== "" && it.qty !== null
              ? Number(it.qty)
              : "",
          remarks: it.remarks || "",
        })),
      };

      const response = await axios.post(
        `${API_URL}/api/delivery-challan/generate`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
          signal: controller.signal,
        }
      );

      const blob = new Blob([response.data], {
        type: "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      const cd = response.headers["content-disposition"];
      let filename = `DELIVERY_CHALLAN_${(form.challan_no || "challan")
        .replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`;

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

      toast.success("Delivery Challan PDF downloaded.");
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate delivery challan.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-200 to-gray-300 p-6">
      <ToastContainer position="top-right" />

      <div className="max-w-5xl mx-auto text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 tracking-tight">
          Delivery Challan Generator
        </h1>

        {/* Center button card, like Proforma */}
        <div className="flex justify-center mb-12">
          <button
            onClick={() => setIsOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 rounded-xl shadow-md flex flex-col items-center gap-2 transition-all"
          >
            <FileText className="w-10 h-10" />
            <span className="text-lg font-semibold">
              Create Delivery Challan
            </span>
          </button>
        </div>
      </div>

      {/* MODAL FORM */}
      <Modal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(false)}
        className="max-w-4xl mx-auto mt-8 bg-white rounded-2xl p-6 outline-none shadow-xl"
        overlayClassName="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center z-50 overflow-y-auto"
      >
        <h3 className="text-xl font-semibold mb-2 text-gray-800">
          Create Delivery Challan
        </h3>

        {/* display meta like your PDF top right box */}
        <div className="text-sm text-gray-600 mb-4">
          <span className="mr-6">
            Challan No.:{" "}
            <strong>{form.challan_no}</strong>
          </span>
          <span>
            Date: <strong>{displayDate(form.date || DEFAULT_DATE)}</strong>
          </span>
        </div>

        <form onSubmit={handleGenerate} className="space-y-4">
          {/* Row 1: Challan / Date / Order No */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600">
                Challan No *
              </label>
              <input
                value={form.challan_no}
                onChange={(e) =>
                  setForm({ ...form, challan_no: e.target.value })
                }
                required
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600">
                Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm({ ...form, date: e.target.value })
                }
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600">
                Order No
              </label>
              <input
                value={form.order_no}
                onChange={(e) =>
                  setForm({ ...form, order_no: e.target.value })
                }
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
          </div>

          {/* Row 2: Order Date / Vehicle No / GST No */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600">
                Order Date
              </label>
              <input
                type="date"
                value={form.order_date}
                onChange={(e) =>
                  setForm({ ...form, order_date: e.target.value })
                }
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600">
                Vehicle Number
              </label>
              <input
                value={form.vehicle_no}
                onChange={(e) =>
                  setForm({ ...form, vehicle_no: e.target.value })
                }
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600">
                GST No. 
              </label>
              <input
                value={form.to_gst_number}
                onChange={(e) =>
                  setForm({ ...form, to_gst_number: e.target.value })
                }
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
          </div>

          {/* To section: Name + Address */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600">
                To (Name) / M/s.
              </label>
              <input
                value={form.to_name}
                onChange={(e) =>
                  setForm({ ...form, to_name: e.target.value })
                }
                className="w-full border rounded px-3 py-2 mt-1"
              />
            </div>
            <div>
              {/* keep second half empty to match PDF spacing */}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600">
              To (Address)
            </label>
            <textarea
              rows={3}
              value={form.to_address}
              onChange={(e) =>
                setForm({ ...form, to_address: e.target.value })
              }
              className="w-full border rounded px-3 py-2 mt-1"
            />
          </div>

          {/* ITEMS TABLE (No / Description / Qty / Remarks) */}
          <div className="bg-gray-50 border rounded-lg p-3">
            <div className="flex justify-between items-center mb-2">
              <div className="font-semibold text-gray-800">
                Items
              </div>
              <button
                type="button"
                onClick={addItem}
                className="text-blue-600 flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>

            {/* Header row to mimic PDF columns */}
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-600 mb-1">
              <div className="col-span-1 text-center">No.</div>
              <div className="col-span-6">Description</div>
              <div className="col-span-2 text-center">Qty</div>
              <div className="col-span-3">Remarks</div>
            </div>

            {form.items.map((it, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-start mb-2"
              >
                <div className="col-span-1 text-center pt-2 text-sm">
                  {idx + 1}
                </div>

                <textarea
                  rows={2}
                  className="col-span-6 border rounded px-2 py-1 text-sm"
                  value={it.description}
                  onChange={(e) =>
                    updateItem(idx, "description", e.target.value)
                  }
                  placeholder="Description of goods"
                />

                <input
                  type="number"
                  className="col-span-2 border rounded px-2 py-1 text-sm"
                  value={it.qty}
                  onChange={(e) => updateItem(idx, "qty", e.target.value)}
                  placeholder="Qty"
                />

                <input
                  className="col-span-3 border rounded px-2 py-1 text-sm"
                  value={it.remarks}
                  onChange={(e) =>
                    updateItem(idx, "remarks", e.target.value)
                  }
                  placeholder="Remarks"
                />

                <div className="col-span-12 text-right mt-1">
                  {form.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-600 text-xs flex items-center gap-1 ml-auto"
                    >
                      <Trash2 className="w-3 h-3" /> Remove row
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 border rounded-lg text-gray-700"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              {loading ? "Generating..." : "Generate PDF"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}