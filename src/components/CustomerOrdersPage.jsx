import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowDownUp, 
  Filter, 
  PlusCircle, 
  XCircle, 
  Search, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';

function CustomerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newOrder, setNewOrder] = useState({ targetDeliveryDate: '', items: [{ product_id: '', quantity: 1 }] });
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalOrders, setTotalOrders] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    fetchOrders();
    fetchProducts();
  }, []);

  const fetchOrders = async (cursor = null, append = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = cursor ? `/api/orders?cursor=${cursor}` : '/api/orders';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      
      const data = await res.json();
      console.log('Fetched orders:', data);
      
      // Ensure data.orders is an array before proceeding
      if (!Array.isArray(data.orders)) {
        console.error('Expected orders array, got:', data.orders);
        throw new Error('Invalid data format received from server');
      }
      
      setOrders(prev => append ? [...prev, ...data.orders] : data.orders);
      setTotalOrders(data.total || 0);
      setNextCursor(data.nextCursor || null);
      
      // Reset to page 1 if not appending data
      if (!append) {
        setCurrentPage(1);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Failed to load orders. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/inventory/available', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      
      const { data } = await res.json();
      console.log('Fetched products:', data);
      
      if (!Array.isArray(data)) {
        console.error('Expected products array, got:', data);
        throw new Error('Invalid product data format');
      }
      
      setProducts(data);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to load products');
    }
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    
    // Validation checks
    if (!newOrder.targetDeliveryDate) {
      setError('Target delivery date is required');
      return;
    }
    
    if (!newOrder.items.length) {
      setError('At least one item is required');
      return;
    }
    
    if (newOrder.items.some(item => !item.product_id)) {
      setError('Please select a product for each item');
      return;
    }
    
    // Check if products are loaded
    if (products.length === 0) {
      setError('Product data is not available. Please try again.');
      return;
    }
    
    // Stock validation
    const invalidItems = newOrder.items.filter(item => {
      const productId = parseInt(item.product_id);
      const quantity = parseInt(item.quantity) || 0;
      
      if (isNaN(productId) || isNaN(quantity) || quantity <= 0) {
        return true;
      }
      
      const product = products.find(p => p.product_id === productId);
      return !product || product.stock_quantity < quantity;
    });
    
    if (invalidItems.length > 0) {
      setError('Some items have invalid product selection or insufficient stock');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    
    try {
      const payload = {
        targetDeliveryDate: newOrder.targetDeliveryDate,
        items: newOrder.items.map(item => ({
          product_id: parseInt(item.product_id),
          quantity: parseInt(item.quantity) || 1
        }))
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
      
      // Reset form and state
      await fetchOrders(); // This also resets pagination to page 1
      setShowCreateForm(false);
      setNewOrder({ targetDeliveryDate: '', items: [{ product_id: '', quantity: 1 }] });
    } catch (err) {
      console.error('Order creation error:', err);
      setError(err.message || 'Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add/remove item helpers
  const addItem = () => {
    setNewOrder(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 1 }]
    }));
  };

  const removeItem = (index) => {
    setNewOrder(prev => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index)
    }));
  };

  const updateItem = (index, field, value) => {
    setNewOrder(prev => {
      const newItems = [...prev.items];
      newItems[index] = { 
        ...newItems[index], 
        [field]: field === 'quantity' ? (parseInt(value) || 1) : value 
      };
      return { ...prev, items: newItems };
    });
  };

  // Calculate total with proper type checking
  const calculateOrderTotal = (orderItems) => {
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return 0;
    }
    
    return orderItems.reduce((sum, item) => {
      const price = typeof item.price === 'number' ? item.price : 0;
      const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
      return sum + (price * quantity);
    }, 0);
  };

  // Sort orders with proper handling
  const sortedOrders = useMemo(() => {
    if (!Array.isArray(orders) || orders.length === 0) {
      return [];
    }
    
    let sortableOrders = [...orders];
    
    if (sortConfig.key) {
      sortableOrders.sort((a, b) => {
        if (!a || !b) return 0;
        
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === 'totalAmount') {
          aValue = calculateOrderTotal(a.items);
          bValue = calculateOrderTotal(b.items);
        } else if (sortConfig.key === 'createdAt') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return sortableOrders;
  }, [orders, sortConfig]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    if (!Array.isArray(sortedOrders)) {
      return [];
    }
    
    return sortedOrders.filter(order => {
      if (!order) return false;
      
      const matchesSearch = searchTerm === '' || 
        (order.id && order.id.toString().includes(searchTerm.toLowerCase())) ||
        (order.customerName && order.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
        
      const matchesStatus = filterStatus === 'All' || order.status === filterStatus;
      
      return matchesSearch && matchesStatus;
    });
  }, [sortedOrders, searchTerm, filterStatus]);

  // Pagination logic
  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentOrders = filteredOrders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ordersPerPage));

  const paginate = (pageNumber) => {
    setCurrentPage(Math.max(1, Math.min(pageNumber, totalPages)));
  };

  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Loading state
  if (isLoading && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">Loading orders...</div>
      </div>
    );
  }

  // Error state
  if (error && !showCreateForm && orders.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg">
          {error}
          <button
            onClick={() => { setError(null); fetchOrders(); }}
            className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">My Orders</h1>
      <div className="max-w-6xl mx-auto">
        {/* Search and filters section */}
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search Orders..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value.toLowerCase());
                setCurrentPage(1);
              }}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="p-4 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300 appearance-none"
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Shipped">Shipped</option>
            <option value="Delivered">Delivered</option>
          </select>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
          >
            <PlusCircle className="mr-2" /> Create Order
          </button>
        </div>

        {/* Table section */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gradient-to-r from-amber-100 to-amber-50">
              <tr>
                {[
                  { key: 'id', label: 'Order ID' },
                  { key: 'totalAmount', label: 'Total Amount' },
                  { key: 'status', label: 'Status' },
                  { key: 'targetDeliveryDate', label: 'Target Delivery' },
                  { key: 'paymentStatus', label: 'Payment Status' },
                  { key: 'createdAt', label: 'Created At (IST)' }
                ].map(({ key, label }) => (
                  <th 
                    key={key} 
                    onClick={() => handleSort(key)}
                    className="py-4 px-6 text-gray-700 text-lg font-semibold cursor-pointer hover:bg-amber-100 transition-colors group"
                  >
                    <div className="flex items-center">
                      {label}
                      <ArrowDownUp 
                        className={`ml-2 opacity-50 group-hover:opacity-100 transition-opacity ${sortConfig.key === key ? 'opacity-100' : ''}`} 
                        size={16} 
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentOrders.map((order) => {
                if (!order) return null;
                
                const totalAmount = calculateOrderTotal(order.items);
                const hasValidPricing = Array.isArray(order.items) && 
                  order.items.length > 0 && 
                  order.items.every(item => typeof item.price === 'number');
                
                return (
                  <tr key={order.id} className="border-t hover:bg-amber-50 transition-all duration-200">
                    <td className="py-4 px-6 text-gray-600 text-lg">{order.id}</td>
                    <td className="py-4 px-6 text-gray-600 text-lg">
                      {hasValidPricing ? `₹${totalAmount.toFixed(2)}` : 'Pending Pricing'}
                    </td>
                    <td className="py-4 px-6 text-gray-600 text-lg">
                      <span
                        className={`px-3 py-1 rounded-full text-white text-base font-medium ${
                          order.status === 'Pending' ? 'bg-amber-400' :
                          order.status === 'Processing' ? 'bg-yellow-500' :
                          order.status === 'Shipped' ? 'bg-blue-500' :
                          order.status === 'Delivered' ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                      >
                        {order.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-600 text-lg">{order.targetDeliveryDate || 'Not set'}</td>
                    <td className="py-4 px-6 text-gray-600 text-lg">{order.paymentStatus || 'Unknown'}</td>
                    <td className="py-4 px-6 text-gray-600 text-lg">
                      {order.createdAt ? 
                        new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 
                        'Unknown'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination section */}
          {filteredOrders.length > 0 ? (
            <div className="flex justify-between items-center p-4 bg-gray-50 flex-wrap gap-2">
              <div className="text-gray-600">
                Showing {indexOfFirstOrder + 1} to {Math.min(indexOfLastOrder, filteredOrders.length)} of {filteredOrders.length} orders
              </div>
              <div className="flex space-x-2 flex-wrap">
                <button
                  onClick={() => paginate(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors flex items-center"
                >
                  <ChevronLeft size={20} />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  // Show pages around current page
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={i}
                      onClick={() => paginate(pageNum)}
                      className={`p-2 w-10 rounded-lg transition-colors ${
                        currentPage === pageNum 
                        ? 'bg-amber-500 text-white' 
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => paginate(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors flex items-center"
                >
                  <ChevronRight size={20} />
                </button>
                {nextCursor && (
                  <button
                    onClick={() => fetchOrders(nextCursor, true)}
                    className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    Load More
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 text-xl">
              <Filter className="mx-auto mb-4 text-gray-400" size={48} />
              No orders found matching your search or filter.
            </div>
          )}
        </div>
      </div>

      {/* Create Order Modal */}
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
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>
            )}
            <form onSubmit={handleCreateOrder} className="space-y-5">
              <div className="space-y-2">
                <label className="text-gray-700 font-medium">Target Delivery Date</label>
                <input
                  type="date"
                  value={newOrder.targetDeliveryDate}
                  onChange={(e) => setNewOrder(prev => ({ ...prev, targetDeliveryDate: e.target.value }))}
                  className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-sm transition-all duration-300"
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="space-y-3">
                <label className="text-gray-700 font-medium">Items</label>
                {newOrder.items.map((item, idx) => (
                  <div key={idx} className="flex space-x-3 items-center">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(idx, 'product_id', e.target.value)}
                      className="w-2/3 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-base bg-white shadow-sm transition-all duration-300"
                      required
                    >
                      <option value="">Select Product</option>
                      {products.map(product => (
                        <option 
                          key={product.product_id} 
                          value={product.product_id}
                          disabled={product.stock_quantity === 0}
                        >
                          {product.product_name} (Stock: {product.stock_quantity}, ₹{product.price?.toFixed(2) || 'N/A'})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="w-1/3 p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-base bg-white shadow-sm transition-all duration-300"
                      min="1"
                      required
                    />
                    {newOrder.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle size={20} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addItem}
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-lg transition-colors duration-300 font-medium flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add Item
              </button>
              <div className="flex justify-end space-x-4 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-5 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors duration-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-300 font-semibold"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerOrdersPage;