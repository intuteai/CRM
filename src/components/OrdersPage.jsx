import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  ArrowDownUp, Filter, PlusCircle, Search, ChevronLeft, ChevronRight,
  Edit2, CheckCircle, MoreVertical, Truck, ShoppingCart, DollarSign, XCircle, Trash2
} from 'lucide-react';
import { io } from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import CreateOrderForm from './CreateOrderForm';
import EditOrderForm from './EditOrderForm';

const formatDate = (dateString) => dateString ? new Date(dateString).toISOString().split('T')[0] : '';
const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
const calculateTotalAmount = (items) => items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0), 0);

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

const useFetchData = ({ limit, cursor }) => {
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      console.log('Fetching data from:', backendUrl); // Debug log
      const url = cursor 
        ? `${backendUrl}/api/orders?limit=${limit}&cursor=${encodeURIComponent(cursor)}&force_refresh=true`
        : `${backendUrl}/api/orders?limit=${limit}&force_refresh=true`;
      
      const [ordersRes, productsRes, customersRes] = await Promise.all([
        fetch(url, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => ({ ok: false })),
        fetch(`${backendUrl}/api/inventory/available`, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => ({ ok: false })),
        fetch(`${backendUrl}/api/users/customers`, { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => ({ ok: false })),
      ]);

      const [ordersData, productsData, customersData] = await Promise.all([
        ordersRes.ok ? ordersRes.json() : { orders: [], total: 0 },
        productsRes.ok ? productsRes.json().then(data => data.data || []) : [],
        customersRes.ok ? customersRes.json() : [],
      ]);

      const validOrders = (ordersData.orders || []).filter(o => o && typeof o.id !== 'undefined');
      setOrders(validOrders);
      setTotalOrders(ordersData.total || 0);
      setProducts((productsData || []).filter(p => p && typeof p.product_id !== 'undefined'));
      setCustomers((customersData || []).filter(c => c && typeof c.user_id !== 'undefined'));
      setIsEmpty(validOrders.length === 0 && productsData.length === 0 && customersData.length === 0);
      setError(null);
      console.log('Fetched products:', productsData); // Debug log
    } catch (err) {
      setError(err.message || 'Failed to fetch data');
      setIsEmpty(false);
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [limit, cursor]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { orders, setOrders, totalOrders, products, customers, isLoading, error, isEmpty, refetchData: fetchData };
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
  const [isCancelling, setIsCancelling] = useState(false);
  const tableRef = useRef(null);

  const { orders, setOrders, totalOrders, products, customers, isLoading, error, isEmpty, refetchData } = useFetchData({ limit: ordersPerPage, cursor });

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    console.log('Socket.IO connecting to:', backendUrl); // Debug log
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ['websocket'], // Prefer WebSocket over polling
    });
    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });
    socket.on('orderUpdate', (updatedOrder) => {
      setOrders(prev => prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o));
      toast.info(`Order #${updatedOrder.id} updated`, { autoClose: 3000 });
    });
    return () => socket.disconnect();
  }, [setOrders]);

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
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(newOrder),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create order');
      }
      await refetchData();
      setShowCreateForm(false);
      toast.success('Order created successfully', { autoClose: 3000 });
    } catch (error) {
      console.error('Create order error:', error);
      toast.error(`Failed to create order: ${error.message}`, { autoClose: 5000 });
    }
  }, [refetchData]);

  const handleUpdateOrder = useCallback(async (orderId, items, paymentStatus, targetDeliveryDate, status) => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const res = await fetch(`${backendUrl}/api/orders/${orderId}/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ items, payment_status: paymentStatus, targetDeliveryDate: targetDeliveryDate || null, status: status || 'Processing' }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update order');
    await refetchData();
    setShowEditForm(false);
    setSelectedOrder(null);
    toast.success('Order updated successfully', { autoClose: 3000 });
  }, [refetchData]);

  const handleCancelOrder = useCallback(async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order? This action cannot be undone.')) return;
    setIsCancelling(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to cancel order');
      await refetchData();
      toast.success('Order cancelled successfully', { autoClose: 3000 });
    } catch (error) {
      toast.error(error.message, { autoClose: 5000 });
    } finally {
      setIsCancelling(false);
    }
  }, [refetchData]);

  const handleStatusChange = useCallback(async (orderId, newStatus) => {
    if (!window.confirm(`Are you sure you want to change the status to ${newStatus}?`)) return;
    const order = orders.find(o => o.id === orderId);
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const res = await fetch(`${backendUrl}/api/orders/${orderId}/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ items: order.items, payment_status: order.paymentStatus, targetDeliveryDate: order.targetDeliveryDate, status: newStatus }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update status');
    await refetchData();
    toast.success(`Order status changed to ${newStatus}`, { autoClose: 3000 });
  }, [orders, refetchData]);

  const initiateEdit = useCallback((order) => {
    setSelectedOrder(order);
    setShowEditForm(true);
  }, []);

  const ActionsDropdown = ({ order, onEdit, onStatusChange, onCancel }) => {
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
      { icon: <Edit2 size={16} className="mr-2" />, label: 'Edit', action: () => { onEdit(order); setIsOpen(false); }, visible: order.status !== 'Cancelled' && order.status !== 'Delivered' },
      { icon: <ShoppingCart size={16} className="mr-2" />, label: 'Process Order', action: () => { onStatusChange(order.id, 'Processing'); setIsOpen(false); }, visible: order.status === 'Pending' },
      { icon: <Truck size={16} className="mr-2" />, label: 'Mark as Shipped', action: () => { onStatusChange(order.id, 'Shipped'); setIsOpen(false); }, visible: order.status === 'Processing' },
      { icon: <CheckCircle size={16} className="mr-2" />, label: 'Mark as Delivered', action: () => { onStatusChange(order.id, 'Delivered'); setIsOpen(false); }, visible: order.status === 'Shipped' },
      { icon: <DollarSign size={16} className="mr-2" />, label: 'Payment Details', action: () => { setSelectedOrder(order); setShowPaymentDetails(true); setIsOpen(false); }, visible: true },
      { icon: <Trash2 size={16} className="mr-2 text-red-600" />, label: 'Cancel Order', action: () => { onCancel(order.id); setIsOpen(false); }, visible: order.status !== 'Cancelled' && order.status !== 'Delivered' },
    ];

    return (
      <div ref={dropdownRef} className="relative">
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-gray-100 rounded-full" aria-label={`Actions for order ${order.id}`}>
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            {actionItems.filter(item => item.visible).map((item, index) => (
              <button key={index} onClick={item.action} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50" disabled={isCancelling && item.label === 'Cancel Order'}>
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

  const handleCreateButtonClick = useCallback(() => {
    console.log('Create Order button clicked', { isLoading, productsLength: products.length });
    setShowCreateForm(true);
  }, [isLoading, products.length]);

  if (isLoading && !orders.length) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" aria-live="polite">
      <div className="text-gray-600 text-xl animate-pulse">Loading orders...</div>
    </div>
  );

  if (isEmpty) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" role="status">
      <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
        <ShoppingCart className="mx-auto mb-4 text-gray-400" size={48} />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">No Orders Yet</h2>
        <p className="text-gray-600 mb-6">Your database is empty. Start by creating a new order!</p>
        <button
          onClick={handleCreateButtonClick}
          className="p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 flex items-center mx-auto"
        >
          <PlusCircle className="mr-2" /> Create First Order
        </button>
      </div>
    </div>
  );

  if (error && !showCreateForm && !showEditForm) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" role="alert">
      <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg flex flex-col items-center">
        <p className="mb-4">{error}</p>
        <div className="flex gap-4">
          <button 
            onClick={() => refetchData()} 
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
          <button 
            onClick={handleCreateButtonClick}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-300"
          >
            Create New Order
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Orders</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-orders" className="sr-only">Search Orders</label>
            <input
              id="search-orders"
              type="text"
              placeholder="Search by Order ID or Customer Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <div>
            <label htmlFor="status-filter" className="sr-only">Filter by Status</label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
            >
              <option value="All">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <button
            onClick={() => refetchData()}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh orders"
          >
            {isLoading && orders.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleCreateButtonClick}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md flex items-center"
            disabled={isLoading}
            aria-label="Create new order"
          >
            <PlusCircle className="mr-2" /> Create Order
          </button>
        </div>

        {isLoading && orders.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">Refreshing data...</div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table 
            className="w-full text-left border-collapse" 
            role="grid" 
            aria-label="Orders table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50" role="row">
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
                    className={`py-5 px-3 text-gray-800 text-base font-semibold ${key !== 'items' && key !== 'actions' ? 'cursor-pointer hover:bg-amber-300' : ''} transition-all duration-200`}
                    onClick={() => key !== 'items' && key !== 'actions' && handleSort(key)}
                    aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {key !== 'items' && key !== 'actions' && (
                        <ArrowDownUp 
                          size={16} 
                          className={`ml-2 text-gray-600 ${sortConfig.key === key ? 'text-gray-900' : 'opacity-50'}`} 
                          aria-hidden="true" 
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <tr key={order.id} className="border-t hover:bg-amber-50 transition-all duration-200" role="row">
                  <td className="py-4 px-3 text-gray-600 text-base">{order.id}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{order.customerName || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="text-sm">{item.productName} (Qty: {item.quantity})</li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">{formatCurrency(calculateTotalAmount(order.items))}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${
                      order.status === 'Pending' ? 'bg-amber-500' :
                      order.status === 'Processing' ? 'bg-yellow-600' :
                      order.status === 'Shipped' ? 'bg-blue-600' :
                      order.status === 'Delivered' ? 'bg-green-600' :
                      order.status === 'Cancelled' ? 'bg-red-600' : 'bg-gray-500'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">{order.targetDeliveryDate ? formatDate(order.targetDeliveryDate) : 'Not Set'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{order.paymentStatus || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <div className="flex flex-col">
                      <span>{new Date(order.createdAt).toLocaleDateString('en-IN')}</span>
                      <span className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleTimeString('en-IN')}</span>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ActionsDropdown 
                      order={order} 
                      onEdit={initiateEdit} 
                      onStatusChange={handleStatusChange}
                      onCancel={handleCancelOrder}
                    />
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
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCursor(orders[orders.length - 1]?.createdAt)}
                  disabled={orders.length < ordersPerPage}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-gray-500 flex flex-col items-center" role="alert">
              <Filter className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">No orders found matching your search or filter.</p>
            </div>
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
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50" role="dialog" aria-labelledby="payment-details-title">
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-[500px] relative">
            <button onClick={() => setShowPaymentDetails(false)} className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300" aria-label="Close payment details">
              <XCircle size={24} />
            </button>
            <h2 id="payment-details-title" className="text-2xl font-bold text-gray-800 mb-6">Payment Details for Order #{selectedOrder.id}</h2>
            <div className="space-y-4">
              <div><label className="text-gray-700 font-medium">Payment Status:</label><p className="text-gray-600">{selectedOrder.paymentStatus || 'N/A'}</p></div>
              <div><label className="text-gray-700 font-medium">Total Amount:</label><p className="text-gray-600">{formatCurrency(calculateTotalAmount(selectedOrder.items))}</p></div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

export default OrdersPage;