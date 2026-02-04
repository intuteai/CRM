import React, { useState, useEffect } from "react";
import { XCircle, PlusCircle, Trash2 } from "lucide-react";
import Select from "react-select";

function CreateOrderForm({
  customers,
  onClose,
  onSubmit,
  validateOrderItems,
  formatDate,
}) {
  const [newOrder, setNewOrder] = useState({
    customerId: "",
    targetDeliveryDate: "",
    items: [{ product_id: "", quantity: "", price: "" }],
  });
  const [availableProducts, setAvailableProducts] = useState([]);
  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const token = localStorage.getItem("token");
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        // ✅ CHANGED: Use /available endpoint with holds calculation
        const response = await fetch(`${backendUrl}/api/inventory/available?limit=5000&offset=0`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
        });
        if (!response.ok) throw new Error("Failed to fetch available stock");
        const json = await response.json();
        const data = json.data || json; // Handle both {data: []} and [] responses

        const normalized = (data || []).map((p) => ({
          ...p,
          price: p.price != null ? Number(p.price) : 0,
          stock_quantity: p.stock_quantity ?? 0,
          available_quantity: p.available_quantity ?? 0, // ✅ NEW
          reserved_quantity: p.reserved_quantity ?? 0, // ✅ NEW
        }));

        setAvailableProducts(normalized);
      } catch (error) {
        setFormErrors([error.message]);
      }
    };
    fetchStock();
  }, []);

  // ✅ CHANGED: Use available_quantity instead of stock_quantity
  const getAvailableStock = (productId) => {
    const product = availableProducts.find(
      (p) => p.product_id === parseInt(productId)
    );
    return product ? (product.available_quantity ?? 0) : 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewOrder((prev) => ({ ...prev, [name]: value }));
  };

  // 🔹 NEW: handle customer change from react-select
  const handleCustomerChange = (option) => {
    setNewOrder((prev) => ({
      ...prev,
      customerId: option ? option.value : "",
    }));
  };

  const handleItemChange = (index, field, value) => {
    setNewOrder((prev) => {
      const items = [...prev.items];
      const updatedItem = { ...items[index], [field]: value };

      if (field === "product_id") {
        const product = availableProducts.find(
          (p) => String(p.product_id) === String(value)
        );

        if (product) {
          updatedItem.price =
            product.price !== undefined && product.price !== null
              ? String(product.price)
              : "";
        } else {
          updatedItem.price = "";
        }
      }

      items[index] = updatedItem;
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setNewOrder((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: "", quantity: "", price: "" }],
    }));
  };

  const removeItem = (index) => {
    setNewOrder((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateOrderItems(
      newOrder.items,
      availableProducts,
      getAvailableStock
    );

    if (newOrder.targetDeliveryDate) {
      const selectedDate = new Date(newOrder.targetDeliveryDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        errors.push("Warning: The selected delivery date is in the past.");
      }
    }

    if (!isValid) {
      setFormErrors(errors);
      return;
    }
    try {
      setIsSubmitting(true);
      const payload = {
        user_id: newOrder.customerId,
        targetDeliveryDate: newOrder.targetDeliveryDate,
        items: newOrder.items.map((item) => ({
          product_id: parseInt(item.product_id, 10),
          quantity: parseInt(item.quantity, 10),
          price: parseFloat(item.price),
        })),
      };
      await onSubmit(payload);
      setFormErrors([]);
      onClose();
    } catch (error) {
      setFormErrors([error.message]);
    } finally {
      setIsSubmitting(false);
    }
  };

  // build customer options for react-select
  const customerOptions = customers.map((c) => ({
    value: String(c.user_id),
    label: c.name || `Customer #${c.user_id}`,
    // you can add extra fields if you want to search by them too
    email: c.email,
    phone: c.phone,
  }));

  const selectedCustomer =
    customerOptions.find(
      (opt) => String(opt.value) === String(newOrder.customerId)
    ) || null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-[600px] max-w-full max-h-[80vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500"
          aria-label="Close form"
        >
          <XCircle size={24} />
        </button>
        <h2 className="text-2xl font-bold mb-6">Create New Order</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 🔍 Searchable Customer Select */}
          <div>
            <label className="text-gray-700 font-medium mb-1 block">
              Customer
            </label>
            <Select
              options={customerOptions}
              value={selectedCustomer}
              onChange={handleCustomerChange}
              isClearable
              backspaceRemovesValue
              placeholder="Select or search customer..."
              // optional: search by name + email + phone
              filterOption={(option, rawInput) => {
                const input = rawInput.toLowerCase().trim();
                const label = option.label?.toLowerCase() || "";
                const email = option.data.email?.toLowerCase() || "";
                const phone = option.data.phone?.toLowerCase() || "";
                return (
                  label.includes(input) ||
                  email.includes(input) ||
                  phone.includes(input)
                );
              }}
              styles={{
                container: (base) => ({
                  ...base,
                  width: "100%",
                }),
                control: (base) => ({
                  ...base,
                  minHeight: "48px",
                  fontSize: "15px",
                }),
                menu: (base) => ({
                  ...base,
                  zIndex: 9999,
                }),
              }}
            />
          </div>

          <div>
            <label className="text-gray-700 font-medium">
              Target Delivery Date
            </label>
            <input
              type="date"
              name="targetDeliveryDate"
              value={newOrder.targetDeliveryDate}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-lg"
            />
          </div>

          <div>
            <label className="text-gray-700 font-medium">Items</label>
            {newOrder.items.map((item, idx) => {
              // ✅ NEW: Show available quantity for selected product
              const selectedProduct = availableProducts.find(
                (p) => String(p.product_id) === String(item.product_id)
              );
              const availableQty = selectedProduct?.available_quantity ?? 0;

              return (
                <div key={idx} className="mb-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Product select – wide */}
                    <div className="flex-[2] min-w-[380px]">
                      <Select
                        options={availableProducts.map((p) => ({
                          value: String(p.product_id),
                          label: p.product_name,
                          code: p.product_code || String(p.product_id),
                          available: p.available_quantity ?? 0,
                        }))}
                        value={
                          availableProducts
                            .filter(
                              (p) =>
                                String(p.product_id) === String(item.product_id)
                            )
                            .map((p) => ({
                              value: String(p.product_id),
                              label: p.product_name,
                              code: p.product_code || String(p.product_id),
                              available: p.available_quantity ?? 0,
                            }))[0] || null
                        }
                        onChange={(opt) =>
                          handleItemChange(
                            idx,
                            "product_id",
                            opt ? opt.value : ""
                          )
                        }
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
                        isClearable
                        backspaceRemovesValue
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
                      className="flex-1 min-w-[110px] p-3 border rounded-lg"
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
                      className="flex-1 min-w-[130px] p-3 border rounded-lg"
                      min="0.01"
                      step="0.01"
                      required
                    />

                    {newOrder.items.length > 1 && (
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
                  {item.product_id && (
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

            <button
              type="button"
              onClick={addItem}
              className="mt-2 flex items-center text-amber-500 hover:text-amber-700"
            >
              <PlusCircle className="mr-2" size={20} /> Add Item
            </button>
          </div>

          {formErrors.length > 0 && (
            <div className="text-red-700">
              {formErrors.map((error, idx) => (
                <p key={idx}>{error}</p>
              ))}
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !newOrder.customerId}
            className="w-full p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-400"
          >
            {isSubmitting ? "Submitting..." : "Create Order"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CreateOrderForm;