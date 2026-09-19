import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatDate } from '../../utils/helpers';
import { ArrowDownUp, X, RefreshCw, Search, AlertCircle, Edit, Save, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

// Debounce Hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

function PriceListPage({ socket }) {
  const [priceItems, setPriceItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [editingItem, setEditingItem] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [page, setPage] = useState(0);
  const [limit] = useState(10); // Match PartDrawingsPage
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  const fetchPriceList = useCallback(
    async (currentPage, search = '', forceRefresh = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Authentication token missing.');
        const url = new URL(`${BASE_URL}/api/price-list`);
        url.searchParams.append('limit', limit);
        url.searchParams.append('offset', currentPage * limit);
        if (search) url.searchParams.append('search', encodeURIComponent(search));
        if (forceRefresh) url.searchParams.append('force_refresh', 'true');

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Server responded with status: ${response.status}`);
        }

        const responseData = await response.json();
        if (!Array.isArray(responseData.priceItems) || typeof responseData.total !== 'number') {
          throw new Error('Invalid data format: Expected { priceItems: array, total: number }');
        }

        const normalizedData = responseData.priceItems.map((item) => ({
          ...item,
          price: item.price !== null ? Number(item.price) : 0,
          productName: item.productName || 'N/A',
          createdAt: item.createdAt || '',
        }));

        setPriceItems(normalizedData);
        setTotalItems(responseData.total);
        setEditingItem(null);
      } catch (err) {
        console.error('Error fetching price list:', err);
        setError(err.message || 'Network error');
        notifyError(err.message || 'Network error', { autoClose: 3000 });
        setPriceItems([]);
      } finally {
        setIsLoading(false);
      }
    },
    [limit]
  );

  useEffect(() => {
    fetchPriceList(page, debouncedSearch);
  }, [fetchPriceList, page, debouncedSearch]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  useEffect(() => {
    if (!socket) return;

    socket.on('priceListUpdate', () => {
      console.log('Price list update received');
      fetchPriceList(page, debouncedSearch);
      notifyInfo('Price list updated', { autoClose: 2000 });
      if (tableRef.current) tableRef.current.focus();
    });

    return () => {
      socket.off('priceListUpdate');
    };
  }, [socket, fetchPriceList, page, debouncedSearch]);

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

        notifySuccess('Price updated successfully!', { autoClose: 2000 });
        setEditingItem(null);
        // Server emits priceListUpdate, triggering fetchPriceList via socket
      } catch (err) {
        console.error('Error updating price:', err);
        notifyError(err.message || 'Error updating price', { autoClose: 3000 });
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
      setPage(0);
      searchInputRef.current?.focus();
    }
  }, []);

  const handlePrevPage = useCallback(() => {
    if (page > 0) {
      setPage((prev) => prev - 1);
    }
  }, [page]);

  const handleNextPage = useCallback(() => {
    if ((page + 1) * limit < totalItems && !isLoading) {
      setPage((prev) => prev + 1);
    }
  }, [totalItems, limit, isLoading]);

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
      const searchTermLower = debouncedSearch.toLowerCase();
      return priceId.includes(searchTermLower) || productName.includes(searchTermLower);
    });
  }, [sortedPriceItems, debouncedSearch]);

  if (isLoading && !priceItems.length) {
    return (
      <div className="flex items-center justify-center py-24" aria-live="polite">
        <div className="text-gray-500 text-lg animate-pulse">Loading price list...</div>
      </div>
    );
  }

  if (error && !priceItems.length) return <ConnectionError onRetry={() => fetchPriceList(0, '', true)} />;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex gap-4 flex-wrap items-center">
          <div className="relative flex-grow min-w-[220px]">
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
              className="w-full p-3 pl-11 border border-navy-100 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
            />
            <Search
              className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={17}
              aria-hidden="true"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => fetchPriceList(0, '', true)}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
            aria-label="Refresh price list"
          >
            <RefreshCw size={16} aria-hidden={isLoading} />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && priceItems.length > 0 && (
          <div className="text-gray-500 text-sm text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        {filteredPriceItems.length === 0 ? (
          <div
            className="text-center py-12 flex flex-col items-center justify-center text-gray-400 bg-white rounded-xl shadow-sm"
            role="alert"
          >
            <svg
              className="w-12 h-12 mb-4 text-gray-300"
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
                  className="text-gold-600 hover:text-gold-500 underline transition-colors"
                >
                  clear the filter
                </button>
                .
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
            <table
              className="w-full text-left border-collapse"
              role="grid"
              aria-label="Price list table"
              ref={tableRef}
              tabIndex={0}
            >
              <thead>
                <tr className="bg-navy-50" role="row">
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
                      className={`py-3 px-3 text-navy-800 text-sm font-semibold ${
                        key !== 'actions'
                          ? 'cursor-pointer hover:bg-navy-100 focus:outline-none focus:bg-navy-100'
                          : ''
                      } transition-colors whitespace-nowrap`}
                      tabIndex={key !== 'actions' ? 0 : undefined}
                      aria-sort={sortConfig.key === key ? sortConfig.direction : 'none'}
                      role="columnheader"
                    >
                      <div className="flex items-center justify-between">
                        <span>{label}</span>
                        {key !== 'actions' && (
                          <ArrowDownUp
                            className={`ml-2 ${sortConfig.key === key ? 'text-gold-500' : 'text-navy-400/50'}`}
                            size={15}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filteredPriceItems.map((item) => {
                  const isEditing = editingItem === item.priceId;
                  return (
                    <tr
                      key={item.priceId}
                      className={`hover:bg-navy-50/60 transition-colors ${
                        isEditing ? 'bg-navy-50' : ''
                      }`}
                      role="row"
                    >
                      <td className="py-3.5 px-3 text-navy-800 font-medium">{item.priceId}</td>
                      <td className="py-3.5 px-3 text-gray-600 min-w-[180px] lg:min-w-0">{item.productName}</td>
                      <td className="py-3.5 px-3 text-gray-600">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-32 p-2 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                            autoFocus
                            aria-label={`Edit price for ${item.productName}`}
                          />
                        ) : item.price !== null && !isNaN(item.price) ? (
                          formatCurrency(item.price)
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-gray-600">
                        {item.createdAt ? (
                          <div className="flex flex-col">
                            <span>{formatDate(item.createdAt)}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(item.createdAt).toLocaleTimeString('en-IN')}
                            </span>
                          </div>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="py-3.5 px-3">
                        {isEditing ? (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleSavePrice(item)}
                              className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors"
                              aria-label={`Save price for ${item.productName}`}
                            >
                              <Save size={16} aria-hidden="true" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
                              aria-label={`Cancel editing for ${item.productName}`}
                            >
                              <XCircle size={16} aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleEditClick(item)}
                            className="p-2 bg-navy-800 text-white rounded-lg hover:bg-navy-700 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
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
            {totalItems > 0 && (
              <div className="flex justify-between items-center flex-wrap gap-2 p-4 bg-navy-50 border-t border-navy-100">
                <div className="text-gray-500 text-sm">
                  Showing {(page * limit) + 1}–{Math.min((page + 1) * limit, totalItems)} of {totalItems} price items
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={page === 0}
                    className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={(page + 1) * limit >= totalItems || isLoading}
                    className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                    aria-label="Next page"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

export default PriceListPage;