// import React, { useState, useEffect } from 'react';
// import { XCircle, PlusCircle, Trash2 } from 'lucide-react';

// function EditOrderForm({ order, availableProducts: initialProducts, onClose, onSubmit, validateOrderItems, getAvailableStock, formatDate }) {
//   const [editedOrder, setEditedOrder] = useState({
//     items: order.items.map(item => ({
//       product_id: String(item.product_id || ''),
//       quantity: String(item.quantity || ''),
//       price: String(item.price || ''),
//       productName: item.productName || initialProducts.find(p => String(p.product_id) === String(item.product_id))?.product_name || 'Unknown',
//     })),
//     paymentStatus: order.paymentStatus || 'Pending',
//     targetDeliveryDate: order.targetDeliveryDate ? formatDate(order.targetDeliveryDate) : '',
//     status: order.status || 'Pending',
//   });
//   const [formErrors, setFormErrors] = useState([]);
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [availableProducts, setAvailableProducts] = useState(initialProducts);

//   useEffect(() => {
//     const fetchStock = async () => {
//       try {
//         const token = localStorage.getItem('token');
//         const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
//         const response = await fetch(`${backendUrl}/api/inventory/stock?force_refresh=true`, {
//           headers: { 'Authorization': `Bearer ${token}` },
//         });
//         if (!response.ok) throw new Error('Failed to fetch available stock');
//         const data = await response.json();
//         setAvailableProducts(data.filter(p => p && typeof p.product_id !== 'undefined'));
//         console.log('Fetched fresh stock for EditOrderForm:', data);
//       } catch (error) {
//         setFormErrors([error.message || 'Failed to fetch stock']);
//       }
//     };
//     fetchStock();
//   }, []);

//   useEffect(() => {
//     console.log('EditOrderForm initialized with order:', order);
//     console.log('Available products:', availableProducts);
//     setEditedOrder({
//       items: order.items.map(item => ({
//         product_id: String(item.product_id || ''),
//         quantity: String(item.quantity || ''),
//         price: String(item.price || ''),
//         productName: item.productName || availableProducts.find(p => String(p.product_id) === String(item.product_id))?.product_name || 'Unknown',
//       })),
//       paymentStatus: order.paymentStatus || 'Pending',
//       targetDeliveryDate: order.targetDeliveryDate ? formatDate(order.targetDeliveryDate) : '',
//       status: order.status || 'Pending',
//     });
//   }, [order, availableProducts, formatDate]);

//   const handleInputChange = (e) => {
//     const { name, value } = e.target;
//     setEditedOrder(prev => ({ ...prev, [name]: value }));
//   };

//   const handleItemChange = (index, field, value) => {
//     const updatedItems = [...editedOrder.items];
//     updatedItems[index][field] = value;
//     if (field === 'product_id') {
//       const product = availableProducts.find(p => String(p.product_id) === String(value));
//       updatedItems[index].productName = product ? product.product_name : 'Unknown';
//     }
//     setEditedOrder(prev => ({ ...prev, items: updatedItems }));
//     console.log('Item changed:', { index, field, value, updatedItems });
//   };

//   const addItem = () => {
//     setEditedOrder(prev => ({
//       ...prev,
//       items: [...prev.items, { product_id: '', quantity: '', price: '', productName: '' }],
//     }));
//   };

//   const removeItem = (index) => {
//     setEditedOrder(prev => ({
//       ...prev,
//       items: prev.items.filter((_, i) => i !== index),
//     }));
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     console.log('Submitting EditOrderForm with:', editedOrder);
//     const { isValid, errors } = validateOrderItems(editedOrder.items, availableProducts, getAvailableStock, order.id);

//     if (!isValid || errors.length > 0) {
//       console.log('Validation errors:', errors);
//       setFormErrors(errors);
//       return;
//     }

//     try {
//       setIsSubmitting(true);
//       const payload = {
//         items: editedOrder.items.map(item => ({
//           product_id: parseInt(item.product_id, 10),
//           quantity: parseInt(item.quantity, 10),
//           price: parseFloat(item.price),
//         })),
//         payment_status: editedOrder.paymentStatus,
//         targetDeliveryDate: editedOrder.targetDeliveryDate || null,
//         status: editedOrder.status,
//       };
//       console.log('Sending payload to onSubmit:', payload);
//       await onSubmit(order.id, payload.items, payload.payment_status, payload.targetDeliveryDate, payload.status);
//       setFormErrors([]);
//     } catch (error) {
//       console.error('Edit order error:', error);
//       setFormErrors([error.message || 'Failed to update order']);
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50" role="dialog" aria-labelledby="edit-order-title">
//       <div className="bg-white p-8 rounded-2xl shadow-xl w-[600px] relative">
//         <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700" aria-label="Close form">
//           <XCircle size={24} />
//         </button>
//         <h2 id="edit-order-title" className="text-2xl font-bold mb-6 text-gray-800">Edit Order #{order.id}</h2>
//         <form onSubmit={handleSubmit} className="space-y-6">
//           <div>
//             <label htmlFor="targetDeliveryDate" className="text-gray-700 font-medium">Target Delivery Date</label>
//             <input
//               id="targetDeliveryDate"
//               type="date"
//               name="targetDeliveryDate"
//               value={editedOrder.targetDeliveryDate}
//               onChange={handleInputChange}
//               className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
//             />
//           </div>
//           <div>
//             <label htmlFor="paymentStatus" className="text-gray-700 font-medium">Payment Status</label>
//             <select
//               id="paymentStatus"
//               name="paymentStatus"
//               value={editedOrder.paymentStatus}
//               onChange={handleInputChange}
//               className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
//             >
//               <option value="Pending">Pending</option>
//               <option value="Paid">Paid</option>
//             </select>
//           </div>
//           <div>
//             <label htmlFor="status" className="text-gray-700 font-medium">Status</label>
//             <select
//               id="status"
//               name="status"
//               value={editedOrder.status}
//               onChange={handleInputChange}
//               className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
//               disabled={order.status === 'Delivered' || order.status === 'Cancelled'}
//             >
//               <option value="Pending">Pending</option>
//               <option value="Processing">Processing</option>
//               <option value="Shipped">Shipped</option>
//               <option value="Delivered">Delivered</option>
//             </select>
//           </div>
//           <div>
//             <label className="text-gray-700 font-medium">Items</label>
//             {editedOrder.items.map((item, idx) => (
//               <div key={idx} className="flex space-x-2 mb-3 items-center">
//                 <select
//                   value={item.product_id}
//                   onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
//                   className="w-1/3 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
//                   required
//                 >
//                   <option value="">Select Product</option>
//                   {availableProducts.filter(p => p && typeof p.product_id !== 'undefined').map(product => (
//                     <option
//                       key={product.product_id}
//                       value={product.product_id}
//                       disabled={getAvailableStock(product.product_id, order.id) <= 0 && item.product_id !== String(product.product_id)}
//                     >
//                       {product.product_name} (Available: {getAvailableStock(product.product_id, order.id)})
//                     </option>
//                   ))}
//                 </select>
//                 <input
//                   type="number"
//                   placeholder="Quantity"
//                   value={item.quantity}
//                   onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
//                   className="w-1/4 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
//                   min="1"
//                   required
//                 />
//                 <input
//                   type="number"
//                   placeholder="Price per Item"
//                   value={item.price}
//                   onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
//                   className="w-1/4 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
//                   min="0.01"
//                   step="0.01"
//                   required
//                 />
//                 {editedOrder.items.length > 1 && (
//                   <button
//                     type="button"
//                     onClick={() => removeItem(idx)}
//                     className="p-2 text-red-500 hover:text-red-700"
//                     aria-label="Remove item"
//                   >
//                     <Trash2 size={20} />
//                   </button>
//                 )}
//               </div>
//             ))}
//             <button
//               type="button"
//               onClick={addItem}
//               className="mt-2 flex items-center text-amber-500 hover:text-amber-700"
//             >
//               <PlusCircle className="mr-2" size={20} /> Add Item
//             </button>
//           </div>
//           {formErrors.length > 0 && (
//             <div className="text-red-700 bg-red-100 p-3 rounded-lg">
//               {formErrors.map((error, idx) => <p key={idx}>{error}</p>)}
//             </div>
//           )}
//           <button
//             type="submit"
//             disabled={isSubmitting || order.status === 'Delivered' || order.status === 'Cancelled'}
//             className="w-full p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
//           >
//             {isSubmitting ? 'Updating...' : 'Update Order'}
//           </button>
//         </form>
//       </div>
//     </div>
//   );
// }

// export default EditOrderForm;
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
  });

  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableProducts, setAvailableProducts] = useState(initialProducts);

  // Fetch fresh stock (with price)
  useEffect(() => {
    const fetchStock = async () => {
      try {
        const token = localStorage.getItem("token");
        const backendUrl =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
        const response = await fetch(
          `${backendUrl}/api/inventory/stock?force_refresh=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!response.ok) throw new Error("Failed to fetch available stock");
        const data = await response.json();

        const normalized = (data || [])
          .filter((p) => p && typeof p.product_id !== "undefined")
          .map((p) => ({
            ...p,
            price: p.price != null ? Number(p.price) : 0,
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
      };
      await onSubmit(
        order.id,
        payload.items,
        payload.payment_status,
        payload.targetDeliveryDate,
        payload.status,
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
              disabled={
                order.status === "Delivered" || order.status === "Cancelled"
              }
            >
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>

          {/* ITEMS */}
          <div>
            <label className="text-gray-700 font-medium">Items</label>
            {editedOrder.items.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-wrap gap-2 mb-3 items-center"
              >
                {/* Product select – react-select with search & code */}
                <div className="flex-[2] min-w-[380px]">
                  <Select
                    options={availableProducts
                      .filter(
                        (p) => p && typeof p.product_id !== "undefined",
                      )
                      .map((p) => ({
                        value: String(p.product_id),
                        label: p.product_name,
                        code: p.product_code || String(p.product_id),
                        isDisabled:
                          getAvailableStock(p.product_id, order.id) <= 0 &&
                          String(item.product_id) !== String(p.product_id),
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
                        }))[0] || null
                    }
                    onChange={(opt) =>
                      handleItemChange(
                        idx,
                        "product_id",
                        opt ? opt.value : "",
                      )
                    }
                    isClearable
                    backspaceRemovesValue
                    // search by name or product code
                    filterOption={(option, rawInput) => {
                      const input = rawInput.toLowerCase().trim();
                      const name =
                        option.label?.toLowerCase() ||
                        option.data.label?.toLowerCase() ||
                        "";
                      const code =
                        option.data.code?.toLowerCase() ||
                        option.code?.toLowerCase() ||
                        "";
                      return (
                        name.includes(input) ||
                        code.includes(input)
                      );
                    }}
                    formatOptionLabel={(option) => (
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-gray-500">
                          Code: {option.code}
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
                  className="flex-1 min-w-[110px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
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
                  className="flex-1 min-w-[130px] p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  min="0.01"
                  step="0.01"
                  required
                />

                {editedOrder.items.length > 1 && (
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
            ))}

            <button
              type="button"
              onClick={addItem}
              className="mt-2 flex items-center text-amber-500 hover:text-amber-700"
            >
              <PlusCircle className="mr-2" size={20} /> Add Item
            </button>
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
