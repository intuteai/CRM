import React, { useState, useEffect } from "react";
import { XCircle, PlusCircle, Trash2 } from "lucide-react";
import Select from "react-select";

function EditOrderForm({
  order,
  availableProducts: initialProducts,
  onClose,
  onSubmit,
  validateOrderItems,
  getAvailableStock,
  formatDate,
}) {
  const [editedOrder, setEditedOrder] = useState({
    items: order.items.map((item) => ({
      product_id: String(item.product_id || ""),
      quantity: String(item.quantity || ""),
      price: String(item.price || ""),
      productName:
        item.productName ||
        initialProducts.find(
          (p) => String(p.product_id) === String(item.product_id),
        )?.product_name ||
        "Unknown",
    })),
    paymentStatus: order.paymentStatus || "Pending",
    targetDeliveryDate: order.targetDeliveryDate
      ? formatDate(order.targetDeliveryDate)
      : "",
    status: order.status || "Pending",
    statusReason: order.statusReason || "",
  });

  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableProducts, setAvailableProducts] = useState(initialProducts);

  // Items are locked once dispatched — Shipped, Partially Delivered, and Delivered are all post-dispatch.
  const isDispatched = order.status === "Shipped" || order.status === "Partially Delivered" || order.status === "Delivered";

  // Fetch fresh stock (with price and availability)
  useEffect(() => {
    const fetchStock = async () => {
      try {
        const token = localStorage.getItem("token");
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        // ✅ CHANGED: Use /available endpoint instead of /stock
        const response = await fetch(
          `${backendUrl}/api/inventory/available?limit=5000&offset=0`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include',
          },
        );
        if (!response.ok) throw new Error("Failed to fetch available stock");
        const json = await response.json();
        const data = json.data || json; // Handle both {data: []} and [] responses

        const normalized = (data || [])
          .filter((p) => p && typeof p.product_id !== "undefined")
          .map((p) => ({
            ...p,
            price: p.price != null ? Number(p.price) : 0,
            stock_quantity: p.stock_quantity ?? 0,
            available_quantity: p.available_quantity ?? 0, // ✅ NEW
            reserved_quantity: p.reserved_quantity ?? 0, // ✅ NEW
          }));

        setAvailableProducts(normalized);
        console.log("Fetched fresh stock for EditOrderForm:", normalized);
      } catch (error) {
        setFormErrors([error.message || "Failed to fetch stock"]);
      }
    };
    fetchStock();
  }, []);

  // Re-sync editedOrder when order or products change
  useEffect(() => {
    setEditedOrder({
      items: order.items.map((item) => ({
        product_id: String(item.product_id || ""),
        quantity: String(item.quantity || ""),
        price: String(item.price || ""),
        productName:
          item.productName ||
          availableProducts.find(
            (p) => String(p.product_id) === String(item.product_id),
          )?.product_name ||
          "Unknown",
      })),
      paymentStatus: order.paymentStatus || "Pending",
      targetDeliveryDate: order.targetDeliveryDate
        ? formatDate(order.targetDeliveryDate)
        : "",
      status: order.status || "Pending",
      statusReason: order.statusReason || "",
    });
  }, [order, availableProducts, formatDate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedOrder((prev) => ({ ...prev, [name]: value }));
  };

  // Handle item change with price auto-fill on product change
  const handleItemChange = (index, field, value) => {
    setEditedOrder((prev) => {
      const items = [...prev.items];
      const updatedItem = { ...items[index], [field]: value };

      if (field === "product_id") {
        const product = availableProducts.find(
          (p) => String(p.product_id) === String(value),
        );

        if (product) {
          updatedItem.productName = product.product_name;
          updatedItem.price =
            product.price !== undefined && product.price !== null
              ? String(product.price)
              : updatedItem.price || "";
        } else {
          updatedItem.productName = "Unknown";
          updatedItem.price = "";
        }
      }

      items[index] = updatedItem;
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setEditedOrder((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { product_id: "", quantity: "", price: "", productName: "" },
      ],
    }));
  };

  const removeItem = (index) => {
    setEditedOrder((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isDispatched) {
      const { isValid, errors } = validateOrderItems(
        editedOrder.items,
        availableProducts,
        getAvailableStock,
        order.id,
      );
      if (!isValid || errors.length > 0) {
        setFormErrors(errors);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const payload = {
        items: editedOrder.items.map((item) => ({
          product_id: parseInt(item.product_id, 10),
          quantity: parseInt(item.quantity, 10),
          price: parseFloat(item.price),
        })),
        payment_status: editedOrder.paymentStatus,
        targetDeliveryDate: editedOrder.targetDeliveryDate || null,
        status: editedOrder.status,
        status_reason: editedOrder.statusReason || null,
      };
      await onSubmit(
        order.id,
        payload.items,
        payload.payment_status,
        payload.targetDeliveryDate,
        payload.status,
        payload.status_reason,
      );
      setFormErrors([]);
    } catch (error) {
      setFormErrors([error.message || "Failed to update order"]);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50"
      role="dialog"
      aria-labelledby="edit-order-title"
    >
      <div className="bg-white p-8 rounded-2xl shadow-xl w-[600px] max-w-full max-h-[80vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
          aria-label="Close form"
        >
          <XCircle size={24} />
        </button>
        <h2
          id="edit-order-title"
          className="text-2xl font-bold mb-6 text-gray-800"
        >
          Edit Order #{order.id}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="targetDeliveryDate"
              className="text-gray-700 font-medium"
            >
              Target Delivery Date
            </label>
            <input
              id="targetDeliveryDate"
              type="date"
              name="targetDeliveryDate"
              value={editedOrder.targetDeliveryDate}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>

          <div>
            <label
              htmlFor="paymentStatus"
              className="text-gray-700 font-medium"
            >
              Payment Status
            </label>
            <select
              id="paymentStatus"
              name="paymentStatus"
              value={editedOrder.paymentStatus}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
            >
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          <div>
            <label htmlFor="status" className="text-gray-700 font-medium">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={editedOrder.status}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
              disabled={order.status === "Cancelled" || isDispatched}
            >
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Testing">Testing</option>
              <option value="Ready for Shipment">Ready for Shipment</option>
              <option value="Shipped">Shipped</option>
              <option value="Partially Delivered">Partially Delivered</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>

          <div>
            <label htmlFor="statusReason" className="text-gray-700 font-medium">
              Status Reason
              {editedOrder.status === "Partially Delivered" && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <textarea
              id="statusReason"
              name="statusReason"
              value={editedOrder.statusReason}
              onChange={handleInputChange}
              rows={2}
              placeholder={
                editedOrder.status === "Partially Delivered"
                  ? "Required — explain what was partially delivered and why"
                  : "Optional — add a note about the current status"
              }
              className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
            />
          </div>

          {/* ITEMS */}
          <div>
            <label className="text-gray-700 font-medium">Items</label>

            {/* Banner: explain why items are locked before the user tries to edit */}
            {isDispatched && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1 mb-3">
                Items are locked — this order has already been {order.status.toLowerCase()}.
                Changes to line items are no longer permitted.
              </p>
            )}

            {editedOrder.items.map((item, idx) => {
              // ✅ NEW: Get available quantity for selected product
              const selectedProduct = availableProducts.find(
                (p) => String(p.product_id) === String(item.product_id)
              );
              const availableQty = selectedProduct?.available_quantity ?? 0;

              return (
                <div key={idx} className="mb-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Product select – react-select with search & code */}
                    <div className="flex-[2] min-w-[380px]">
                      <Select
                        options={availableProducts
                          .filter((p) => p && typeof p.product_id !== "undefined")
                          .map((p) => ({
                            value: String(p.product_id),
                            label: p.product_name,
                            code: p.product_code || String(p.product_id),
                            available: p.available_quantity ?? 0,
                          }))}
                        value={
                          availableProducts
                            .filter(
                              (p) =>
                                String(p.product_id) === String(item.product_id),
                            )
                            .map((p) => ({
                              value: String(p.product_id),
                              label: p.product_name,
                              code: p.product_code || String(p.product_id),
                              available: p.available_quantity ?? 0,
                            }))[0] || null
                        }
                        onChange={(opt) =>
                          handleItemChange(idx, "product_id", opt ? opt.value : "")
                        }
                        isDisabled={isDispatched}
                        isClearable={!isDispatched}
                        backspaceRemovesValue={!isDispatched}
                        // search by name or product code
                        filterOption={(option, rawInput) => {
                          const input = rawInput.toLowerCase().trim();
                          const name = option.label?.toLowerCase() || "";
                          const code = option.data.code?.toLowerCase() || "";
                          return name.includes(input) || code.includes(input);
                        }}
                        formatOptionLabel={(option) => (
                          <div className="flex flex-col">
                            <span>{option.label}</span>
                            <span className="text-xs text-gray-500">
                              Code: {option.code} | Available: {option.available}
                            </span>
                          </div>
                        )}
                        styles={{
                          container: (base) => ({
                            ...base,
                            width: "100%",
                            minWidth: "380px",
                          }),
                          control: (base) => ({
                            ...base,
                            minHeight: "48px",
                            fontSize: "15px",
                            paddingLeft: "4px",
                            ...(isDispatched ? { backgroundColor: "#f3f4f6" } : {}),
                          }),
                          menu: (base) => ({
                            ...base,
                            zIndex: 9999,
                            width: "100%",
                          }),
                        }}
                      />
                    </div>

                    {/* Quantity */}
                    <input
                      type="number"
                      placeholder="Quantity"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(idx, "quantity", e.target.value)
                      }
                      disabled={isDispatched}
                      className={`flex-1 min-w-[110px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                        isDispatched ? "bg-gray-100 cursor-not-allowed" : ""
                      }`}
                      min="1"
                      required
                    />

                    {/* Price */}
                    <input
                      type="number"
                      placeholder="Price per Item"
                      value={item.price}
                      onChange={(e) =>
                        handleItemChange(idx, "price", e.target.value)
                      }
                      disabled={isDispatched}
                      className={`flex-1 min-w-[130px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                        isDispatched ? "bg-gray-100 cursor-not-allowed" : ""
                      }`}
                      min="0.01"
                      step="0.01"
                      required
                    />

                    {/* Remove button — hidden entirely when dispatched */}
                    {!isDispatched && editedOrder.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="p-2 text-red-500 hover:text-red-700"
                        aria-label="Remove item"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>

                  {/* ✅ NEW: Show available quantity warning */}
                  {item.product_id && !isDispatched && (
                    <div className="text-xs text-gray-600 mt-1 ml-1">
                      Available: <span className={`font-semibold ${availableQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {availableQty}
                      </span> units
                      {selectedProduct?.reserved_quantity > 0 && (
                        <span className="text-amber-600 ml-2">
                          (Reserved: {selectedProduct.reserved_quantity})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add button — hidden when dispatched */}
            {!isDispatched && (
              <button
                type="button"
                onClick={addItem}
                className="mt-2 flex items-center text-amber-500 hover:text-amber-700"
              >
                <PlusCircle className="mr-2" size={20} /> Add Item
              </button>
            )}
          </div>

          {formErrors.length > 0 && (
            <div className="text-red-700 bg-red-100 p-3 rounded-lg">
              {formErrors.map((error, idx) => (
                <p key={idx}>{error}</p>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              order.status === "Delivered" ||
              order.status === "Cancelled"
            }
            className="w-full p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            {isSubmitting ? "Updating..." : "Update Order"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default EditOrderForm;