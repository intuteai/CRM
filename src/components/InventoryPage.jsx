// src/components/InventoryPage.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowDownUp, Filter, PlusCircle, Search, ChevronLeft, ChevronRight,
  Edit2, MoreVertical, Package, XCircle
} from 'lucide-react';
import { debounce } from 'lodash';
import { io } from 'socket.io-client';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
const formatDate = (dateString) => dateString ? new Date(dateString).toISOString().split('T')[0] : '';

// Data fetching hook
const useFetchInventory = ({ limit, offset }) => {
  const [inventory, setInventory] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    let isMounted = true;
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error("Authentication token missing. Please log in again.");
      }
      const url = `http://localhost:5000/api/inventory?limit=${limit}&offset=${offset}&force_refresh=true`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Inventory fetch failed: ${response.statusText}`);
      const { data, total } = await response.json();
      
      if (isMounted) {
        console.log('Fetched inventory data:', data, 'Total:', total);
        const normalizedData = data.map(item => ({
          ...item,
          price: item.price !== null ? Number(item.price) : 0,
          stock_quantity: item.stock_quantity || 0,
        }));
        setInventory(normalizedData);
        setTotalItems(total || 0);
        setError(null); // Clear any previous errors on successful fetch
      }
    } catch (err) {
      if (isMounted) {
        setError(err.message);
        console.error('Fetch error:', err);
      }
    } finally {
      if (isMounted) {
        setIsLoading(false);
      }
    }
    return () => { isMounted = false; };
  }, [limit, offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { inventory, totalItems, isLoading, error, refetchData: fetchData };
};

function InventoryPage({ userRole }) {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStock, setFilterStock] = useState('All');
  const [showEditForm, setShowEditForm] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const { inventory, totalItems, isLoading, error, refetchData } = useFetchInventory({ limit: itemsPerPage, offset: page * itemsPerPage });

  useEffect(() => {
    const socket = io('http://localhost:5000');
    socket.on('stockUpdate', (data) => {
      console.log('Received stockUpdate:', data);
      refetchData();
    });
    return () => socket.disconnect();
  }, [refetchData]);

  const debouncedSearch = useCallback(
    debounce((value) => {
      setSearchTerm(value);
    }, 300),
    []
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    debouncedSearch(value.toLowerCase());
  };

  const handleCreateItem = useCallback(async ({ product_name, stock_quantity, price }) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error("Authentication token missing.");
      const response = await fetch('http://localhost:5000/api/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ product_name, stock_quantity, price }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create item');
      }
      const newItem = await response.json();
      console.log('Created item:', newItem);
      setPage(0);
      setSearchInput('');
      setFilterStock('All');
      setTimeout(() => refetchData(), 100);
      setShowCreateForm(false);
    } catch (err) {
      throw err;
    }
  }, [refetchData]);

  const handleUpdateItem = useCallback(async (itemId, { product_name, stock_quantity, price }) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error("Authentication token missing.");
      const response = await fetch(`http://localhost:5000/api/inventory/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ product_name, stock_quantity, price }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update item (Status: ${response.status})`);
      }
      const updatedItem = await response.json();
      console.log('Updated item:', updatedItem);
      setTimeout(() => refetchData(), 100);
      setShowEditForm(false);
      setSelectedItem(null);
    } catch (err) {
      throw err;
    }
  }, [refetchData]);

  const confirmEdit = useCallback((itemId, formData) => {
    if (window.confirm("Are you sure you want to update this item?")) {
      return handleUpdateItem(itemId, formData);
    }
    return Promise.reject(new Error("Update cancelled."));
  }, [handleUpdateItem]);

  const initiateEdit = useCallback((item) => {
    setSelectedItem(item);
    setShowEditForm(true);
  }, []);

  const ActionsDropdown = ({ item, onEdit }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-gray-100 rounded-full"
          aria-label={`Actions for item ${item.product_id}`}
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            <button
              onClick={() => { onEdit(item); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
          </div>
        )}
      </div>
    );
  };

  const sortedInventory = useMemo(() => {
    const sortableInventory = [...inventory];
    if (sortConfig.key) {
      sortableInventory.sort((a, b) => {
        let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
        if (sortConfig.key === 'price' || sortConfig.key === 'stock_quantity') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        } else if (sortConfig.key === 'created_at') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }
        return aValue < bValue ? (sortConfig.direction === 'asc' ? -1 : 1) : aValue > bValue ? (sortConfig.direction === 'asc' ? 1 : -1) : 0;
      });
    }
    return sortableInventory;
  }, [inventory, sortConfig]);

  const filteredInventory = useMemo(() => {
    return sortedInventory.filter(item => {
      const matchesSearch = item.product_id.toString().includes(searchTerm) ||
                            item.product_name.toLowerCase().includes(searchTerm);
      const matchesStock = filterStock === 'All' || 
                           (filterStock === 'In Stock' && item.stock_quantity > 0) ||
                           (filterStock === 'Out of Stock' && item.stock_quantity === 0);
      return matchesSearch && matchesStock;
    });
  }, [sortedInventory, searchTerm, filterStock]);

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  }, []);

  if (userRole !== 'admin') {
    return <div className="min-h-screen flex items-center justify-center text-gray-800 text-2xl" role="alert">Access Denied</div>;
  }

  if (isLoading && !inventory.length) return (
    <div className="min-h-screen flex items-center justify-center" aria-live="polite">
      <div className="text-gray-600 text-xl animate-pulse">Loading inventory...</div>
    </div>
  );
  if (error && !showEditForm && !showCreateForm) return (
    <div className="min-h-screen flex items-center justify-center text-red-700" role="alert">
      {error}
      <button
        onClick={() => refetchData()}
        className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Inventory</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search Inventory..."
              value={searchInput}
              onChange={handleSearchChange}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300"
              aria-label="Search inventory"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <select
            value={filterStock}
            onChange={(e) => setFilterStock(e.target.value)}
            className="p-4 border rounded-lg focus:ring-2 focus:ring-amber-300"
            aria-label="Filter inventory by stock"
          >
            <option value="All">All Stock</option>
            <option value="In Stock">In Stock</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
          {/* Added Refresh Button */}
          <button
            onClick={() => refetchData()}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 transition-all duration-300 shadow-md text-lg"
            title="Refresh inventory"
            disabled={isLoading}
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center"
            disabled={isLoading}
            aria-label="Create new item"
          >
            <PlusCircle className="mr-2" /> Add Item
          </button>
        </div>

        {/* Optional: Show refreshing message */}
        {isLoading && inventory.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center">Refreshing data...</div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left" role="grid">
            <thead className="bg-amber-100">
              <tr role="row">
                {[
                  { key: 'product_id', label: 'Product ID' },
                  { key: 'product_name', label: 'Product Name' },
                  { key: 'stock_quantity', label: 'Stock Quantity' },
                  { key: 'price', label: 'Price' },
                  { key: 'created_at', label: 'Created At (IST)' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => key !== 'actions' && handleSort(key)}
                    onKeyDown={(e) => {
                      if (key !== 'actions' && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleSort(key);
                      }
                    }}
                    className={`py-5 px-3 ${key !== 'actions' ? 'cursor-pointer hover:bg-amber-200' : ''}`}
                    tabIndex={key !== 'actions' ? 0 : undefined}
                    aria-sort={sortConfig.key === key ? sortConfig.direction : undefined}
                    role="columnheader"
                  >
                    <div className="flex items-center">
                      {label}
                      {key !== 'actions' && <ArrowDownUp className="ml-2" size={16} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map(item => (
                <tr key={item.product_id} className="border-t hover:bg-amber-50" role="row">
                  <td className="py-4 px-3">{item.product_id}</td>
                  <td className="py-4 px-3">{item.product_name.replace(/<[^>]*>/g, '')}</td>
                  <td className="py-4 px-3">
                    <span className={`px-3 py-1 rounded-full text-white text-sm ${
                      item.stock_quantity > 0 ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                      {item.stock_quantity}
                    </span>
                  </td>
                  <td className="py-4 px-3">{formatCurrency(item.price)}</td>
                  <td className="py-4 px-3">
                    <div className="flex flex-col">
                      <span>{new Date(item.created_at).toLocaleDateString('en-IN')}</span>
                      <span className="text-sm text-gray-500">{new Date(item.created_at).toLocaleTimeString('en-IN')}</span>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <ActionsDropdown item={item} onEdit={initiateEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {filteredInventory.length} of {totalItems} items
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage(p => p > 0 ? p - 1 : 0)}
                  disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * itemsPerPage >= totalItems}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {filteredInventory.length === 0 && (
            <div className="text-center py-16 flex flex-col items-center justify-center text-gray-500" role="alert">
              <Package size={48} className="mb-4 text-gray-400" />
              <p className="text-lg">No inventory items found.</p>
              {searchTerm || filterStock !== 'All' ? (
                <p className="mt-2">Try adjusting your search or filters.</p>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center"
                >
                  <PlusCircle className="mr-2" /> Add Your First Item
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
            <button onClick={() => setShowCreateForm(false)} className="absolute top-4 right-4 text-gray-500" aria-label="Close create form">
              <XCircle size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6">Add New Item</h2>
            <CreateItemForm onSubmit={handleCreateItem} onClose={() => setShowCreateForm(false)} />
          </div>
        </div>
      )}

      {showEditForm && selectedItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
            <button onClick={() => setShowEditForm(false)} className="absolute top-4 right-4 text-gray-500" aria-label="Close edit form">
              <XCircle size={24} />
            </button>
            <h2 className="text-2xl font-bold mb-6">Edit Item #{selectedItem.product_id}</h2>
            <EditItemForm
              item={selectedItem}
              onSubmit={confirmEdit}
              onClose={() => setShowEditForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Create Item Form Component
const CreateItemForm = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    product_name: '',
    stock_quantity: 0,
    price: 0,
  });
  const [errors, setErrors] = useState({
    product_name: '',
    stock_quantity: '',
    price: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name, value) => {
    if (name === 'product_name' && !value.trim()) {
      return 'Product name is required';
    }
    if ((name === 'stock_quantity' || name === 'price') && value < 0) {
      return `${name === 'stock_quantity' ? 'Quantity' : 'Price'} cannot be negative`;
    }
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue = name === 'stock_quantity' ? parseInt(value) || 0 : 
                          name === 'price' ? parseFloat(value) || 0 : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue,
    }));
    
    setErrors(prev => ({
      ...prev,
      [name]: validateField(name, processedValue)
    }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      product_name: validateField('product_name', formData.product_name),
      stock_quantity: validateField('stock_quantity', formData.stock_quantity),
      price: validateField('price', formData.price)
    };
    setErrors(fieldErrors);
    
    if (Object.values(fieldErrors).some(err => err)) return;

    try {
      setIsSubmitting(true);
      await onSubmit(formData);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600" role="alert">{error}</p>}
      <div>
        <label className="text-gray-700 font-medium">Product Name</label>
        <input
          type="text"
          name="product_name"
          value={formData.product_name}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_name}
          aria-describedby={errors.product_name ? "product_name_error" : undefined}
          disabled={isSubmitting}
        />
        {errors.product_name && <p id="product_name_error" className="text-red-600 text-sm mt-1">{errors.product_name}</p>}
      </div>
      <div>
        <label className="text-gray-700 font-medium">Stock Quantity</label>
        <input
          type="number"
          name="stock_quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.stock_quantity}
          aria-describedby={errors.stock_quantity ? "stock_quantity_error" : undefined}
          disabled={isSubmitting}
        />
        {errors.stock_quantity && <p id="stock_quantity_error" className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>}
      </div>
      <div>
        <label className="text-gray-700 font-medium">Price (₹)</label>
        <input
          type="number"
          name="price"
          value={formData.price}
          onChange={handleChange}
          min="0"
          step="0.01"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.price}
          aria-describedby={errors.price ? "price_error" : undefined}
          disabled={isSubmitting}
        />
        {errors.price && <p id="price_error" className="text-red-600 text-sm mt-1">{errors.price}</p>}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
};

// Edit Item Form Component
const EditItemForm = ({ item, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    product_name: item.product_name,
    stock_quantity: item.stock_quantity,
    price: item.price,
  });
  const [errors, setErrors] = useState({
    product_name: '',
    stock_quantity: '',
    price: ''
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name, value) => {
    if (name === 'product_name' && !value.trim()) {
      return 'Product name is required';
    }
    if ((name === 'stock_quantity' || name === 'price') && value < 0) {
      return `${name === 'stock_quantity' ? 'Quantity' : 'Price'} cannot be negative`;
    }
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue = name === 'stock_quantity' ? parseInt(value) || 0 : 
                          name === 'price' ? parseFloat(value) || 0 : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: processedValue,
    }));
    
    setErrors(prev => ({
      ...prev,
      [name]: validateField(name, processedValue)
    }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      product_name: validateField('product_name', formData.product_name),
      stock_quantity: validateField('stock_quantity', formData.stock_quantity),
      price: validateField('price', formData.price)
    };
    setErrors(fieldErrors);
    
    if (Object.values(fieldErrors).some(err => err)) return;

    try {
      setIsSubmitting(true);
      await onSubmit(item.product_id, formData);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600" role="alert">{error}</p>}
      <div>
        <label className="text-gray-700 font-medium">Product Name</label>
        <input
          type="text"
          name="product_name"
          value={formData.product_name}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_name}
          aria-describedby={errors.product_name ? "product_name_error" : undefined}
          disabled={isSubmitting}
        />
        {errors.product_name && <p id="product_name_error" className="text-red-600 text-sm mt-1">{errors.product_name}</p>}
      </div>
      <div>
        <label className="text-gray-700 font-medium">Stock Quantity</label>
        <input
          type="number"
          name="stock_quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.stock_quantity}
          aria-describedby={errors.stock_quantity ? "stock_quantity_error" : undefined}
          disabled={isSubmitting}
        />
        {errors.stock_quantity && <p id="stock_quantity_error" className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>}
      </div>
      <div>
        <label className="text-gray-700 font-medium">Price (₹)</label>
        <input
          type="number"
          name="price"
          value={formData.price}
          onChange={handleChange}
          min="0"
          step="0.01"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.price}
          aria-describedby={errors.price ? "price_error" : undefined}
          disabled={isSubmitting}
        />
        {errors.price && <p id="price_error" className="text-red-600 text-sm mt-1">{errors.price}</p>}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default InventoryPage;