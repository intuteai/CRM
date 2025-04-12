import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatDate } from '../utils/helpers';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ArrowDownUp, X, RefreshCw, Search, AlertCircle, Edit, Save, XCircle } from 'lucide-react';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

function PriceListPage({ socket }) {
  const [priceItems, setPriceItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [editingItem, setEditingItem] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);

  const fetchPriceList = useCallback(
    async (forceRefresh = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Authentication token missing.');
        const url = new URL(`${BASE_URL}/api/price-list`);
        if (forceRefresh) {
          url.searchParams.append('force_refresh', 'true');
        }

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch price list data');
        }

        const responseData = await response.json();
        if (!Array.isArray(responseData)) {
          throw new Error('Invalid data format: response must be an array');
        }

        const normalizedData = responseData.map((item) => ({
          ...item,
          price: item.price !== null ? Number(item.price) : 0,
          productName: item.productName || 'N/A',
          createdAt: item.createdAt || '',
        }));

        setPriceItems(normalizedData);
        setTotalItems(normalizedData.length || 0);
        setEditingItem(null);
      } catch (err) {
        console.error('Error fetching price list:', err);
        setError(err.message);
        toast.error(err.message || 'Network error', { autoClose: 3000 });
        setPriceItems([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {
      console.log('Connected to Socket.IO from PriceListPage');
      toast.info('Connected to real-time updates!', { autoClose: 2000 });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

    socket.on('priceListUpdate', () => {
      console.log('Price list update received');
      fetchPriceList();
      toast.info('Price list updated', { autoClose: 2000 });
      if (tableRef.current) tableRef.current.focus();
    });

    fetchPriceList();

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('priceListUpdate');
    };
  }, [socket, fetchPriceList]);

  const handleEditClick = useCallback((item) => {
    setEditingItem(item.priceId);
    setEditPrice(item.price.toString());
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingItem(null);
    setEditPrice('');
  }, []);

  const handleSavePrice = useCallback(
    async (item) => {
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Authentication token missing.');
        const response = await fetch(`${BASE_URL}/api/price-list/${item.priceId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            price: parseFloat(editPrice),
            item_description: item.itemDescription,
            product_id: item.productId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update price');
        }

        toast.success('Price updated successfully!', { autoClose: 2000 });
        setEditingItem(null);
        // Server emits priceListUpdate, triggering fetchPriceList via socket
      } catch (err) {
        console.error('Error updating price:', err);
        toast.error(err.message || 'Error updating price', { autoClose: 3000 });
      }
    },
    [editPrice]
  );

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchTerm('');
      searchInputRef.current?.focus();
    }
  }, []);

  const sortedPriceItems = useMemo(() => {
    const sortableItems = [...priceItems];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key] ?? '';
        let bValue = b[sortConfig.key] ?? '';
        if (sortConfig.key === 'priceId' || sortConfig.key === 'price') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        } else if (sortConfig.key === 'createdAt') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        } else {
          aValue = String(aValue).toLowerCase();
          bValue = String(bValue).toLowerCase();
        }
        return sortConfig.direction === 'asc'
          ? aValue < bValue
            ? -1
            : 1
          : aValue > bValue
          ? -1
          : 1;
      });
    }
    return sortableItems;
  }, [priceItems, sortConfig]);

  const filteredPriceItems = useMemo(() => {
    return sortedPriceItems.filter((item) => {
      const priceId = String(item.priceId || '');
      const productName = (item.productName || '').toLowerCase();
      const searchTermLower = searchTerm.toLowerCase();
      return priceId.includes(searchTermLower) || productName.includes(searchTermLower);
    });
  }, [sortedPriceItems, searchTerm]);

  if (isLoading && !priceItems.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading price list...</div>
      </div>
    );
  }

  if (error && !priceItems.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="alert"
      >
        <div className="text-red-700 flex items-center gap-4">
          <AlertCircle size={24} />
          {error}
          <button
            onClick={() => fetchPriceList(true)}
            className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Price List</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-price-list" className="sr-only">
              Search price list
            </label>
            <input
              id="search-price-list"
              ref={searchInputRef}
              type="text"
              placeholder="Search by Price ID or Product Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md hover:shadow-lg transition-all duration-300"
            />
            <Search
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
              aria-hidden="true"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => fetchPriceList(true)}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg flex items-center disabled:opacity-50"
            disabled={isLoading}
            aria-label="Refresh price list"
          >
            <RefreshCw className="mr-2" size={18} aria-hidden={isLoading} />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && priceItems.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        {filteredPriceItems.length === 0 ? (
          <div
            className="text-center py-16 flex flex-col items-center justify-center text-gray-500 bg-white rounded-2xl shadow-lg"
            role="alert"
          >
            <svg
              className="w-12 h-12 mb-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-lg">No price list items found.</p>
            {searchTerm && (
              <p className="mt-2">
                Try adjusting your search term or{' '}
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-amber-500 hover:text-amber-600 underline"
                >
                  clear the filter
                </button>
                .
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
            <table
              className="w-full text-left"
              role="grid"
              aria-label="Price list table"
              ref={tableRef}
              tabIndex={0}
            >
              <thead className="bg-amber-100">
                <tr role="row">
                  {[
                    { key: 'priceId', label: 'Price ID' },
                    { key: 'productName', label: 'Product Name' },
                    { key: 'price', label: 'Price' },
                    { key: 'createdAt', label: 'Created At (IST)' },
                    { key: 'actions', label: 'Actions' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => key !== 'actions' && handleSort(key)}
                      onKeyDown={(e) =>
                        key !== 'actions' &&
                        (e.key === 'Enter' || e.key === ' ') &&
                        (e.preventDefault(), handleSort(key))
                      }
                      className={`py-5 px-3 ${
                        key !== 'actions'
                          ? 'cursor-pointer hover:bg-amber-200 focus:outline-none focus:bg-amber-200'
                          : ''
                      }`}
                      tabIndex={key !== 'actions' ? 0 : undefined}
                      aria-sort={sortConfig.key === key ? sortConfig.direction : 'none'}
                      role="columnheader"
                    >
                      <div className="flex items-center">
                        {label}
                        {key !== 'actions' && (
                          <ArrowDownUp className="ml-2" size={16} aria-hidden="true" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPriceItems.map((item) => {
                  const isEditing = editingItem === item.priceId;
                  return (
                    <tr
                      key={item.priceId}
                      className={`border-t hover:bg-amber-50 ${
                        isEditing ? 'bg-amber-100/50' : ''
                      } transition-all duration-300`}
                      role="row"
                    >
                      <td className="py-4 px-3">{item.priceId}</td>
                      <td className="py-4 px-3">{item.productName}</td>
                      <td className="py-4 px-3">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-32 p-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                            autoFocus
                            aria-label={`Edit price for ${item.productName}`}
                          />
                        ) : item.price !== null && !isNaN(item.price) ? (
                          formatCurrency(item.price)
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="py-4 px-3">
                        {item.createdAt ? (
                          <div className="flex flex-col">
                            <span>{formatDate(item.createdAt)}</span>
                            <span className="text-sm text-gray-500">
                              {new Date(item.createdAt).toLocaleTimeString('en-IN')}
                            </span>
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="py-4 px-3">
                        {isEditing ? (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleSavePrice(item)}
                              className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 transition-all duration-300"
                              aria-label={`Save price for ${item.productName}`}
                            >
                              <Save size={16} aria-hidden="true" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all duration-300"
                              aria-label={`Cancel editing for ${item.productName}`}
                            >
                              <XCircle size={16} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEditClick(item)}
                            className="p-2 bg-amber-400 text-gray-800 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300"
                            aria-label={`Edit price for ${item.productName}`}
                          >
                            <Edit size={16} aria-hidden="true" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalItems > 0 && (
          <div className="flex justify-between items-center p-4 bg-gray-50">
            <div className="text-gray-600">
              Showing {filteredPriceItems.length} of {totalItems} price items
            </div>
          </div>
        )}
      </div>

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

export default PriceListPage;