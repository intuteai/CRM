// src/components/CustomerOrdersPage.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  ArrowDownUp, Filter, PlusCircle, XCircle, Search, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { io } from 'socket.io-client';

// Utility functions
const formatDate = (dateString) => (dateString ? new Date(dateString).toISOString().split('T')[0] : '');
const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
const calculateTotalAmount = (items) => items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0), 0);

const validateOrderItems = (items, products, getTotalStock) => {
  const errors = [];
  const productIds = new Set();
  const isValid = items.every(item => {
    if (productIds.has(item.product_id)) {
      errors.push(`Duplicate product ID: ${item.product_id}`);
      return false;
    }
    productIds.add(item.product_id);
    const product = products.find(p => String(p.product_id) === String(item.product_id));
    const quantity = parseInt(item.quantity) || 0;
    if (!product || quantity <= 0) {
      errors.push(product ? `Invalid quantity for ${product.product_name}` : `Product not found: ${item.product_id}`);
      return false;
    }
    const totalStock = getTotalStock(item.product_id);
    if (totalStock < quantity) {
      errors.push(`Insufficient stock for ${product.product_name}: ${totalStock} available`);
      return false;
    }
    return true;
  });
  return { isValid, errors };
};

const useFetchData = ({ limit, cursor }) => {
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const url = cursor 
        ? `/api/orders?limit=${limit}&cursor=${encodeURIComponent(cursor)}&force_refresh=${forceRefresh}`
        : `/api/orders?limit=${limit}&force_refresh=${forceRefresh}`;
      const [ordersRes, productsRes] = await Promise.all([
        fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`/api/inventory/stock?force_refresh=${forceRefresh}`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      const [ordersData, productsData] = await Promise.all([
        ordersRes.ok ? ordersRes.json() : Promise.reject(new Error(`Orders fetch failed: ${ordersRes.statusText}`)),
        productsRes.ok ? productsRes.json() : Promise.reject(new Error('Products fetch failed')),
      ]);

      const validOrders = (ordersData.orders || []).filter(o => o && typeof o.id !== 'undefined');
      setOrders(validOrders);
      setTotalOrders(ordersData.total || 0);
      const validProducts = (productsData || []).filter(p => p && typeof p.product_id !== 'undefined');
      setProducts(validProducts);
      console.log('Updated products state:', validProducts);
    } catch (err) {
      setError(err.message);
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [limit, cursor]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  return { orders, totalOrders, products, isLoading, error, refetchData: fetchData };
};

function CustomerOrdersPage() {
  const [cursor, setCursor] = useState(null);
  const [ordersPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [newOrder, setNewOrder] = useState({ targetDeliveryDate: '', items: [{ product_id: '', quantity: 1 }] });
  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const socketRef = useRef(null);

  const { orders, totalOrders, products, isLoading, error, refetchData } = useFetchData({ limit: ordersPerPage, cursor });

  useEffect(() => {
    socketRef.current = io('http://localhost:5000');
    socketRef.current.on('connect', () => console.log('Connected to Socket.IO'));
    socketRef.current.on('stockUpdate', (data) => {
      console.log('Received stockUpdate event:', data);
      refetchData(true);
    });
    socketRef.current.on('orderUpdate', () => {
      console.log('Received orderUpdate event, refreshing data');
      refetchData(true);
    });
    socketRef.current.on('disconnect', () => console.log('Socket.IO disconnected'));
    return () => socketRef.current.disconnect();
  }, [refetchData]);

  const getTotalStock = useMemo(() => {
    const cache = {};
    return (productId) => {
      const cacheKey = `${productId}`;
      if (cache[cacheKey] !== undefined) return cache[cacheKey];

      const product = products.find(p => String(p.product_id) === String(productId));
      const totalStock = product ? product.stock_quantity : 0;
      console.log(`getTotalStock for ${productId}: stock=${totalStock}`);
      return (cache[cacheKey] = totalStock);
    };
  }, [products]);

  const handleCreateOrder = useCallback(async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormErrors([]);

    await refetchData(true); // Fetch latest data before validation
    const { isValid, errors } = validateOrderItems(newOrder.items, products, getTotalStock);
    if (!isValid) {
      setFormErrors(errors);
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = {
        targetDeliveryDate: newOrder.targetDeliveryDate,
        items: newOrder.items.map(item => ({
          product_id: parseInt(item.product_id, 10),
          quantity: parseInt(item.quantity, 10),
        })),
      };
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${localStorage.getItem('token')}` 
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create order');
      }
      await refetchData(true); // Refresh after creation
      setShowCreateForm(false);
      setNewOrder({ targetDeliveryDate: '', items: [{ product_id: '', quantity: 1 }] });
    } catch (err) {
      setFormErrors([err.message]);
    } finally {
      setIsSubmitting(false);
    }
  }, [newOrder, products, getTotalStock, refetchData]);

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  }, []);

  const sortedOrders = useMemo(() => {
    const sortableOrders = [...orders];
    if (sortConfig.key) {
      sortableOrders.sort((a, b) => {
        let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
        if (sortConfig.key === 'totalAmount') {
          aValue = calculateTotalAmount(a.items);
          bValue = calculateTotalAmount(b.items);
        } else if (sortConfig.key === 'createdAt' || sortConfig.key === 'targetDeliveryDate') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }
        return aValue < bValue ? (sortConfig.direction === 'asc' ? -1 : 1) : aValue > bValue ? (sortConfig.direction === 'asc' ? 1 : -1) : 0;
      });
    }
    return sortableOrders;
  }, [orders, sortConfig]);

  const filteredOrders = useMemo(() => {
    return sortedOrders.filter(order => {
      const matchesSearch = searchTerm === '' || 
        order.id.toString().includes(searchTerm) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'All' || order.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [sortedOrders, searchTerm, filterStatus]);

  if (isLoading && !orders.length) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
      <div className="text-gray-600 text-xl animate-pulse">Loading orders...</div>
    </div>
  );

  if (error && !showCreateForm) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
      <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg">
        {error}
        <button onClick={() => refetchData(true)} className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">My Orders</h1>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center mb-8 gap-4">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder="Search Orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md w-40"
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Shipped">Shipped</option>
            <option value="Delivered">Delivered</option>
          </select>
          {/* Refresh Button - Parallel to Search */}
          <button
            onClick={() => refetchData(true)}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 transition-all duration-300 shadow-md text-lg w-32"
            title="Refresh orders"
            disabled={isLoading}
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg shadow-md hover:shadow-lg font-semibold flex items-center w-44"
            disabled={products.length === 0}
          >
            <PlusCircle className="mr-2" /> Create Order
          </button>
        </div>

        {/* Optional: Show refreshing message */}
        {isLoading && orders.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center">Refreshing data...</div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gradient-to-r from-amber-100 to-amber-50">
              <tr>
                {[
                  { key: 'id', label: 'Order ID' },
                  { key: 'items', label: 'Items' },
                  { key: 'totalAmount', label: 'Total Amount' },
                  { key: 'status', label: 'Status' },
                  { key: 'targetDeliveryDate', label: 'Target Delivery' },
                  { key: 'paymentStatus', label: 'Payment Status' },
                  { key: 'createdAt', label: 'Created At (IST)' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => key !== 'items' && handleSort(key)}
                    className={`py-4 px-6 text-gray-700 text-lg font-semibold ${key !== 'items' ? 'cursor-pointer hover:bg-amber-100' : ''}`}
                  >
                    <div className="flex items-center">
                      {label}
                      {key !== 'items' && <ArrowDownUp className="ml-2 opacity-50 hover:opacity-100" size={16} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr key={order.id} className="border-t hover:bg-amber-50 transition-all duration-200">
                  <td className="py-4 px-6 text-gray-600 text-lg">{order.id}</td>
                  <td className="py-4 px-6 text-gray-600 text-lg">
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="text-sm">{item.productName} (Qty: {item.quantity})</li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-4 px-6 text-gray-600 text-lg">{formatCurrency(calculateTotalAmount(order.items))}</td>
                  <td className="py-4 px-6 text-gray-600 text-lg">
                    <span className={`px-3 py-1 rounded-full text-white text-base font-medium ${
                      order.status === 'Pending' ? 'bg-amber-400' :
                      order.status === 'Processing' ? 'bg-yellow-500' :
                      order.status === 'Shipped' ? 'bg-blue-500' :
                      order.status === 'Delivered' ? 'bg-green-500' : 'bg-gray-500'
                    }`}>
                      {order.status || 'Unknown'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-gray-600 text-lg">{order.targetDeliveryDate ? formatDate(order.targetDeliveryDate) : 'Not Set'}</td>
                  <td className="py-4 px-6 text-gray-600 text-lg">{order.paymentStatus || 'Unknown'}</td>
                  <td className="py-4 px-6 text-gray-600 text-lg">
                    {new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredOrders.length > 0 ? (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {filteredOrders.length} of {totalOrders} orders
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCursor(null)}
                  disabled={!cursor}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCursor(orders[orders.length - 1]?.createdAt)}
                  disabled={orders.length < ordersPerPage || totalOrders <= orders.length}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 text-xl">
              <Filter className="mx-auto mb-4 text-gray-400" size={48} />
              No orders found matching your search or filter.
            </div>
          )}
        </div>

        {showCreateForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg relative overflow-y-auto max-h-[90vh]">
              <button
                onClick={() => setShowCreateForm(false)}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
              >
                <XCircle size={24} />
              </button>
              <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b border-amber-100 pb-3">Create New Order</h2>
              {formErrors.length > 0 && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">
                  {formErrors.map((err, idx) => <p key={idx}>{err}</p>)}
                </div>
              )}
              <form onSubmit={handleCreateOrder} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-gray-700 font-medium">Target Delivery Date</label>
                  <input
                    type="date"
                    value={newOrder.targetDeliveryDate}
                    onChange={(e) => setNewOrder(prev => ({ ...prev, targetDeliveryDate: e.target.value }))}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-sm"
                    min={formatDate(new Date())}
                    required
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-gray-700 font-medium">Items</label>
                  {newOrder.items.map((item, idx) => (
                    <div key={idx} className="flex space-x-3 items-center">
                      <select
                        value={item.product_id}
                        onChange={(e) => {
                          setFormErrors([]);
                          setNewOrder(prev => {
                            const items = [...prev.items];
                            items[idx].product_id = e.target.value;
                            return { ...prev, items };
                          });
                        }}
                        className="w-2/3 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-base bg-white shadow-sm"
                        required
                      >
                        <option value="">Select Product</option>
                        {products.map(product => {
                          const totalStock = getTotalStock(product.product_id);
                          return (
                            <option
                              key={product.product_id}
                              value={product.product_id}
                              disabled={totalStock <= 0}
                            >
                              {product.product_name} (Stock: {totalStock})
                            </option>
                          );
                        })}
                      </select>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => {
                          setFormErrors([]);
                          const quantity = parseInt(e.target.value) || 1;
                          setNewOrder(prev => {
                            const items = [...prev.items];
                            items[idx].quantity = quantity;
                            return { ...prev, items };
                          });
                        }}
                        className="w-1/3 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-base bg-white shadow-sm"
                        min="1"
                        max={getTotalStock(item.product_id) || 999}
                        required
                      />
                      {newOrder.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewOrder(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))}
                          className="text-red-500 hover:text-red-700"
                        >
                          <XCircle size={20} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewOrder(prev => ({ ...prev, items: [...prev.items, { product_id: '', quantity: 1 }] }))}
                    className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-lg font-medium flex items-center"
                  >
                    <PlusCircle className="mr-1" size={20} /> Add Item
                  </button>
                </div>
                <div className="flex justify-end space-x-4 mt-6 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-5 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg shadow-md hover:shadow-lg font-semibold disabled:bg-gray-400"
                    disabled={isSubmitting || isLoading || products.length === 0}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Order'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CustomerOrdersPage;