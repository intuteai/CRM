import React, { useState, useEffect } from 'react';
import { XCircle, PlusCircle, Trash2 } from 'lucide-react';

function CreateOrderForm({ customers, onClose, onSubmit, validateOrderItems, formatDate }) {
  const [newOrder, setNewOrder] = useState({
    customerId: '',
    targetDeliveryDate: '',
    items: [{ product_id: '', quantity: '', price: '' }],
  });
  const [availableProducts, setAvailableProducts] = useState([]);
  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5000/api/inventory/stock', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to fetch available stock');
        const data = await response.json();
        setAvailableProducts(data);
      } catch (error) {
        setFormErrors([error.message]);
      }
    };
    fetchStock();
  }, []);

  const getAvailableStock = (productId) => {
    const product = availableProducts.find(p => p.product_id === parseInt(productId));
    return product ? product.stock_quantity : 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewOrder(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...newOrder.items];
    updatedItems[index][field] = value;
    setNewOrder(prev => ({ ...prev, items: updatedItems }));
  };

  const addItem = () => {
    setNewOrder(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: '', price: '' }],
    }));
  };

  const removeItem = (index) => {
    setNewOrder(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { isValid, errors } = validateOrderItems(newOrder.items, availableProducts, getAvailableStock);
    if (!isValid) {
      setFormErrors(errors);
      return;
    }
    try {
      setIsSubmitting(true);
      const payload = {
        user_id: newOrder.customerId,
        targetDeliveryDate: newOrder.targetDeliveryDate,
        items: newOrder.items.map(item => ({
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

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-[600px] relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500" aria-label="Close form">
          <XCircle size={24} />
        </button>
        <h2 className="text-2xl font-bold mb-6">Create New Order</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-gray-700 font-medium">Customer</label>
            <select
              name="customerId"
              value={newOrder.customerId}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-lg"
              required
            >
              <option value="">Select Customer</option>
              {customers.map(customer => (
                <option key={customer.user_id} value={customer.user_id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-gray-700 font-medium">Target Delivery Date</label>
            <input
              type="date"
              name="targetDeliveryDate"
              value={newOrder.targetDeliveryDate}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-lg"
              min={formatDate(new Date())}
            />
          </div>
          <div>
            <label className="text-gray-700 font-medium">Items</label>
            {newOrder.items.map((item, idx) => (
              <div key={idx} className="flex space-x-2 mb-3 items-center">
                <select
                  value={item.product_id}
                  onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                  className="w-1/3 p-3 border rounded-lg"
                  required
                >
                  <option value="">Select Product</option>
                  {availableProducts.map(product => (
                    <option
                      key={product.product_id}
                      value={product.product_id}
                      disabled={getAvailableStock(product.product_id) <= 0}
                    >
                      {product.product_name} (Available: {getAvailableStock(product.product_id)})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                  className="w-1/4 p-3 border rounded-lg"
                  min="1"
                  required
                />
                <input
                  type="number"
                  placeholder="Price"
                  value={item.price}
                  onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                  className="w-1/4 p-3 border rounded-lg"
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
            <div className="text-red-700">
              {formErrors.map((error, idx) => <p key={idx}>{error}</p>)}
            </div>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !newOrder.customerId}
            className="w-full p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:bg-gray-400"
          >
            {isSubmitting ? 'Submitting...' : 'Create Order'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CreateOrderForm;