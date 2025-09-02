// src/components/ProductionOrdersPage.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowDownUp, Filter, Search, ChevronLeft, ChevronRight,
  ShoppingCart
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const STATUS = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS = {
  [STATUS.PENDING]: 'bg-amber-500',
  [STATUS.PROCESSING]: 'bg-yellow-600',
  [STATUS.SHIPPED]: 'bg-blue-600',
  [STATUS.DELIVERED]: 'bg-green-600',
  [STATUS.CANCELLED]: 'bg-red-600',
};

const formatDate = (dateString) => (dateString ? new Date(dateString).toISOString().split('T')[0] : '');
const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
const calculateTotalAmount = (items) => items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0), 0);

const useFetchData = ({ limit, cursor, userRole }) => {
  const [orders, setOrders] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      console.log('Fetching data from:', backendUrl);

      const url = cursor
        ? `${backendUrl}/api/orders?limit=${limit}&cursor=${encodeURIComponent(cursor)}&force_refresh=true`
        : `${backendUrl}/api/orders?limit=${limit}&force_refresh=true`;

      const headers = { Authorization: `Bearer ${token}` };

      const fetchPromises = [
        fetch(url, { headers })
          .then((res) => {
            if (!res.ok) throw new Error(`Orders fetch failed: ${res.status} ${res.statusText}`);
            return res.json();
          })
          .catch((err) => {
            console.error('Orders fetch error:', err);
            return { orders: [], total: 0 };
          }),
        fetch(`${backendUrl}/api/inventory/available`, { headers })
          .then((res) => {
            if (!res.ok) throw new Error(`Products fetch failed: ${res.status} ${res.statusText}`);
            return res.json().then((data) => data.data || []);
          })
          .catch((err) => {
            console.error('Products fetch error:', err);
            return [];
          }),
      ];

      const [ordersData, productsData] = await Promise.all(fetchPromises);
      console.log('Raw /api/orders response:', ordersData); // Debug log

      const validOrders = (ordersData.orders || []).filter((o) => o && typeof o.id !== 'undefined');
      console.log('Fetched orders:', validOrders);
      setOrders(validOrders);
      setTotalOrders(ordersData.total || 0);
      setProducts((productsData || []).filter((p) => p && typeof p.product_id !== 'undefined'));
      setIsEmpty(validOrders.length === 0 && productsData.length === 0);
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message || 'Failed to fetch data');
      setIsEmpty(false);
      toast.error(err.message || 'Failed to fetch data', { autoClose: 3000 });
    } finally {
      setIsLoading(false);
    }
  }, [limit, cursor]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { orders, setOrders, totalOrders, products, isLoading, error, isEmpty, refetchData: fetchData };
};

function ProductionOrdersPage({ socket, userRole }) {
  const [cursor, setCursor] = useState(null);
  const [ordersPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const tableRef = useRef(null);

  const { orders, setOrders, totalOrders, products, isLoading, error, isEmpty, refetchData } = useFetchData({ limit: ordersPerPage, cursor, userRole });

  useEffect(() => {
    if (!socket) {
      console.warn('Socket.IO instance not available; real-time updates disabled');
      return;
    }

    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates', { autoClose: 3000 });
    });
    socket.on('orderUpdate', (updatedOrder) => {
      setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o)));
      toast.info(`Order #${updatedOrder.id} updated`, { autoClose: 3000 });
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('orderUpdate');
    };
  }, [socket, setOrders]);

  const sortedOrders = useMemo(() => {
    const sortableOrders = [...orders];
    if (sortConfig.key) {
      sortableOrders.sort((a, b) => {
        let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
        if (sortConfig.key === 'items') {
          aValue = (a.items || []).length;
          bValue = (b.items || []).length;
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
    const validOrders = sortedOrders.filter((order) => order && typeof order.id !== 'undefined');
    return validOrders.filter((order) => {
      const matchesSearch = (
        order.id.toString().includes(searchTerm.toLowerCase()) ||
        (order.customerName && order.customerName.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      const matchesStatus = filterStatus === 'All' || order.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [sortedOrders, searchTerm, filterStatus]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  }, []);

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
        <p className="text-gray-600 mb-6">No orders are available for your role.</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" role="alert">
      <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg flex flex-col items-center">
        <p className="mb-4">{error}</p>
        <button
          onClick={() => refetchData()}
          className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Production Orders</h1>
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
              {Object.values(STATUS).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => refetchData()}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh orders"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
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
                  { key: 'status', label: 'Status' },
                  { key: 'targetDeliveryDate', label: 'Target Delivery' },
                  { key: 'paymentStatus', label: 'Payment Status' },
                  { key: 'createdAt', label: 'Created At (IST)' },
                ].map((item) => (
                  <th
                    key={item.key}
                    className={`py-5 px-3 text-gray-800 text-base font-semibold ${item.key !== 'items' ? 'cursor-pointer hover:bg-amber-300' : ''} transition-all duration-200`}
                    onClick={() => item.key !== 'items' && handleSort(item.key)}
                    aria-sort={sortConfig.key === item.key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{item.label}</span>
                      {item.key !== 'items' && (
                        <ArrowDownUp
                          size={16}
                          className={`ml-2 text-gray-600 ${sortConfig.key === item.key ? 'text-gray-900' : 'opacity-50'}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-t hover:bg-amber-50 transition-all duration-200" role="row">
                  <td className="py-4 px-3 text-gray-600 text-base">{order.id}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{order.customerName || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ul className="space-y-1">
                      {(order.items || []).map((item, idx) => (
                        <li key={item.product_id || idx} className="text-sm">
                          {item.productName || 'Unknown'} (Qty: {item.quantity || 0})
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${STATUS_COLORS[order.status] || 'bg-gray-500'}`}>
                      {order.status || 'N/A'}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">{order.targetDeliveryDate ? formatDate(order.targetDeliveryDate) : 'Not Set'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{order.paymentStatus || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <div className="flex flex-col">
                      <span>{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : 'N/A'}</span>
                      <span className="text-sm text-gray-500">{order.createdAt ? new Date(order.createdAt).toLocaleTimeString('en-IN') : ''}</span>
                    </div>
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

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

export default ProductionOrdersPage;