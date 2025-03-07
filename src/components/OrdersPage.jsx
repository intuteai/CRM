import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  ArrowDownUp, Filter, PlusCircle, Search, ChevronLeft, ChevronRight,
  Edit2, CheckCircle, MoreVertical, Truck, ShoppingCart, DollarSign, XCircle
} from 'lucide-react';
import CreateOrderForm from './CreateOrderForm';
import EditOrderForm from './EditOrderForm';

// Utility functions
const formatDate = (dateString) => dateString ? new Date(dateString).toISOString().split('T')[0] : '';
const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
const calculateTotalAmount = (items) => items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0), 0);

// Validation function
const validateOrderItems = (items, products, getAvailableStock, editingOrderId = null) => {
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
    if (!product || quantity <= 0 || !item.price || parseFloat(item.price) <= 0) {
      errors.push(product ? `Invalid quantity or price for ${product.product_name}` : `Product not found: ${item.product_id}`);
      return false;
    }
    const availableStock = getAvailableStock(item.product_id, editingOrderId);
    if (availableStock < quantity) {
      errors.push(`Insufficient stock for ${product.product_name}: ${availableStock} available`);
      return false;
    }
    return true;
  });
  return { isValid, errors };
};

// Data fetching hook
const useFetchData = ({ limit, cursor }) => {
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const url = cursor 
        ? `http://localhost:5000/api/orders?limit=${limit}&cursor=${encodeURIComponent(cursor)}&force_refresh=true`
        : `http://localhost:5000/api/orders?limit=${limit}&force_refresh=true`;
      const [ordersRes, productsRes, customersRes] = await Promise.all([
        fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('http://localhost:5000/api/inventory/available', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('http://localhost:5000/api/users/customers', { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);

      const [ordersData, productsData, customersData] = await Promise.all([
        ordersRes.ok ? ordersRes.json() : Promise.reject(new Error(`Orders fetch failed: ${ordersRes.statusText}`)),
        productsRes.ok ? productsRes.json().then(data => data.data || []) : Promise.reject(new Error('Products fetch failed')),
        customersRes.ok ? customersRes.json() : Promise.reject(new Error('Customers fetch failed')),
      ]);

      console.log('Raw ordersData from API:', ordersData);
      console.log('Raw productsData:', productsData);
      console.log('Raw customersData:', customersData);

      const validOrders = (ordersData.orders || []).filter(o => o && typeof o.id !== 'undefined');
      console.log('Filtered validOrders:', validOrders);
      setOrders(validOrders);
      setTotalOrders(ordersData.total || 0);
      setProducts((productsData || []).filter(p => p && typeof p.product_id !== 'undefined'));
      setCustomers((customersData || []).filter(c => c && typeof c.user_id !== 'undefined'));
      console.log('State updated - orders:', validOrders, 'totalOrders:', ordersData.total);
    } catch (err) {
      setError(err.message);
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [limit, cursor]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { orders, totalOrders, products, customers, isLoading, error, refetchData: fetchData };
};

function OrdersPage() {
  const [cursor, setCursor] = useState(null);
  const [ordersPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  const { orders, totalOrders, products, customers, isLoading, error, refetchData } = useFetchData({ limit: ordersPerPage, cursor });

  const getAvailableStock = useMemo(() => {
    const cache = {};
    return (productId, editingOrderId = null) => {
      const cacheKey = `${productId}-${editingOrderId || 'new'}`;
      if (cache[cacheKey] !== undefined) return cache[cacheKey];

      const validProducts = Array.isArray(products) ? products.filter(p => p && typeof p.product_id !== 'undefined') : [];
      const product = validProducts.find(p => String(p.product_id) === String(productId));
      if (!product) return (cache[cacheKey] = 0);

      let baseStock = product.stock_quantity;
      if (!editingOrderId) {
        const validOrders = Array.isArray(orders) ? orders.filter(o => o && Array.isArray(o.items)) : [];
        const reserved = validOrders.flatMap(o => o.items)
          .filter(item => item && String(item.product_id) === String(productId))
          .reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) || 0;
        return (cache[cacheKey] = Math.max(0, baseStock - reserved));
      }

      const originalOrder = orders.find(o => o && o.id === editingOrderId);
      const originalQty = originalOrder?.items
        ?.filter(item => item && String(item.product_id) === String(productId))
        .reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) || 0;
      const currentQty = selectedOrder?.items
        ?.filter(item => item && String(item.product_id) === String(productId))
        .reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) || 0;
      return (cache[cacheKey] = Math.max(0, baseStock + originalQty - currentQty));
    };
  }, [orders, products, selectedOrder]);

  const handleCreateOrder = useCallback(async (newOrder) => {
    console.log('Submitting newOrder:', newOrder);
    const res = await fetch('http://localhost:5000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify(newOrder),
    });
    if (!res.ok) {
      const errorData = await res.json();
      console.error('POST error response:', errorData);
      throw new Error(errorData.error || 'Failed to create order');
    }
    console.log('POST successful, refetching data...');
    await refetchData();
    setShowCreateForm(false);
  }, [refetchData]);

  const handleUpdateOrder = useCallback(async (orderId, items, paymentStatus, targetDeliveryDate, status) => {
    const res = await fetch(`http://localhost:5000/api/orders/${orderId}/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ items, payment_status: paymentStatus, targetDeliveryDate: targetDeliveryDate || null, status: status || 'Processing' }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update order');
    await refetchData();
    setShowEditForm(false);
    setSelectedOrder(null);
  }, [refetchData]);

  const handleStatusChange = useCallback(async (orderId, newStatus) => {
    if (!window.confirm(`Are you sure you want to change the status to ${newStatus}?`)) return;
    const order = orders.find(o => o.id === orderId);
    const res = await fetch(`http://localhost:5000/api/orders/${orderId}/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ items: order.items, payment_status: order.paymentStatus, targetDeliveryDate: order.targetDeliveryDate, status: newStatus }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update status');
    await refetchData();
  }, [orders, refetchData]);

  const initiateEdit = useCallback((order) => {
    setSelectedOrder(order);
    setShowEditForm(true);
  }, []);

  const ActionsDropdown = ({ order, onEdit, onStatusChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const actionItems = [
      { icon: <Edit2 size={16} className="mr-2" />, label: 'Edit', action: () => { onEdit(order); setIsOpen(false); }, visible: true },
      { icon: <ShoppingCart size={16} className="mr-2" />, label: 'Process Order', action: () => { onStatusChange(order.id, 'Processing'); setIsOpen(false); }, visible: order.status === 'Pending' },
      { icon: <Truck size={16} className="mr-2" />, label: 'Mark as Shipped', action: () => { onStatusChange(order.id, 'Shipped'); setIsOpen(false); }, visible: order.status === 'Processing' },
      { icon: <CheckCircle size={16} className="mr-2" />, label: 'Mark as Delivered', action: () => { onStatusChange(order.id, 'Delivered'); setIsOpen(false); }, visible: order.status === 'Shipped' },
      { icon: <DollarSign size={16} className="mr-2" />, label: 'Payment Details', action: () => { setSelectedOrder(order); setShowPaymentDetails(true); setIsOpen(false); }, visible: true },
    ];

    return (
      <div ref={dropdownRef} className="relative">
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-gray-100 rounded-full" aria-label={`Actions for order ${order.id}`}>
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            {actionItems.filter(item => item.visible).map((item, index) => (
              <button key={index} onClick={item.action} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sortedOrders = useMemo(() => {
    const sortableOrders = [...orders];
    if (sortConfig.key) {
      sortableOrders.sort((a, b) => {
        let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
        if (sortConfig.key === 'totalAmount') {
          aValue = calculateTotalAmount(a.items);
          bValue = calculateTotalAmount(b.items);
        } else if (sortConfig.key === 'items') {
          aValue = a.items.length;
          bValue = b.items.length;
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
    const validOrders = sortedOrders.filter(order => order && typeof order.id !== 'undefined');
    console.log('Valid orders after filtering:', validOrders);
    return validOrders.filter(order => {
      const matchesSearch = order.id.toString().includes(searchTerm.toLowerCase()) ||
                            order.customerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'All' || order.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [sortedOrders, searchTerm, filterStatus]);

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  }, []);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading orders...</div>;
  if (error && !showCreateForm && !showEditForm) return <div className="min-h-screen flex items-center justify-center text-red-700">{error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Orders</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search Orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300"
              aria-label="Search orders"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="p-4 border rounded-lg focus:ring-2 focus:ring-amber-300"
            aria-label="Filter orders by status"
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Shipped">Shipped</option>
            <option value="Delivered">Delivered</option>
          </select>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center"
            disabled={isLoading || !products.length}
            aria-label="Create new order"
          >
            <PlusCircle className="mr-2" /> Create Order
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-amber-100">
              <tr>
                {[
                  { key: 'id', label: 'Order ID' },
                  { key: 'customerName', label: 'Customer Name' },
                  { key: 'items', label: 'Items' },
                  { key: 'totalAmount', label: 'Total Amount' },
                  { key: 'status', label: 'Status' },
                  { key: 'targetDeliveryDate', label: 'Target Delivery' },
                  { key: 'paymentStatus', label: 'Payment Status' },
                  { key: 'createdAt', label: 'Created At (IST)' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => key !== 'items' && key !== 'actions' && handleSort(key)}
                    className={`py-5 px-3 ${key !== 'items' && key !== 'actions' ? 'cursor-pointer hover:bg-amber-200' : ''}`}
                  >
                    <div className="flex items-center">
                      {label}
                      {key !== 'items' && key !== 'actions' && <ArrowDownUp className="ml-2" size={16} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr key={order.id} className="border-t hover:bg-amber-50">
                  <td className="py-4 px-3">{order.id}</td>
                  <td className="py-4 px-3">{order.customerName}</td>
                  <td className="py-4 px-3">
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="text-sm">{item.productName} (Qty: {item.quantity})</li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-4 px-3">{formatCurrency(calculateTotalAmount(order.items))}</td>
                  <td className="py-4 px-3">
                    <span className={`px-3 py-1 rounded-full text-white text-sm ${
                      order.status === 'Pending' ? 'bg-amber-500' :
                      order.status === 'Processing' ? 'bg-yellow-600' :
                      order.status === 'Shipped' ? 'bg-blue-600' :
                      order.status === 'Delivered' ? 'bg-green-600' : 'bg-gray-500'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-4 px-3">{order.targetDeliveryDate ? formatDate(order.targetDeliveryDate) : 'Not Set'}</td>
                  <td className="py-4 px-3">{order.paymentStatus}</td>
                  <td className="py-4 px-3">
                    <div className="flex flex-col">
                      <span>{new Date(order.createdAt).toLocaleDateString('en-IN')}</span>
                      <span className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleTimeString('en-IN')}</span>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <ActionsDropdown order={order} onEdit={initiateEdit} onStatusChange={handleStatusChange} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalOrders > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {filteredOrders.length} of {totalOrders} orders
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCursor(null)}
                  disabled={!cursor}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCursor(orders[orders.length - 1]?.createdAt)}
                  disabled={orders.length < ordersPerPage}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-gray-500">No orders found.</div>
          )}
        </div>
      </div>

      {showCreateForm && (
        <CreateOrderForm
          customers={customers}
          availableProducts={products}
          onClose={() => setShowCreateForm(false)}
          onSubmit={handleCreateOrder}
          validateOrderItems={validateOrderItems}
          getAvailableStock={getAvailableStock}
          formatDate={formatDate}
        />
      )}

      {showEditForm && selectedOrder && (
        <EditOrderForm
          order={selectedOrder}
          availableProducts={products}
          onClose={() => setShowEditForm(false)}
          onSubmit={handleUpdateOrder}
          validateOrderItems={validateOrderItems}
          getAvailableStock={getAvailableStock}
          formatDate={formatDate}
        />
      )}

      {showPaymentDetails && selectedOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
            <button onClick={() => setShowPaymentDetails(false)} className="absolute top-4 right-4 text-gray-500" aria-label="Close payment details">
              <XCircle size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6">Payment Details for Order #{selectedOrder.id}</h2>
            <div className="space-y-4">
              <div><label className="text-gray-700 font-medium">Payment Status</label><p>{selectedOrder.paymentStatus}</p></div>
              <div><label className="text-gray-700 font-medium">Total Amount</label><p>{formatCurrency(calculateTotalAmount(selectedOrder.items))}</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrdersPage;