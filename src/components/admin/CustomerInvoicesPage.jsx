import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate as importedFormatDate } from '../../utils/helpers';
import { ArrowDownUp, RefreshCw, Search, Edit2, MoreVertical, XCircle, X } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Fallback formatDate function
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  if (typeof importedFormatDate === 'function') {
    return importedFormatDate(dateString);
  }
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

// Utility function to format numbers as INR
const formatINR = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

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

// Throttle function to limit fetch frequency
function throttle(func, limit) {
  let lastFunc;
  let lastRan;
  return function (...args) {
    if (!lastRan) {
      func(...args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func(...args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

function CustomerInvoicesPage({ socket: providedSocket }) {
  const [invoices, setInvoices] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [formData, setFormData] = useState({
    invoice_number: '',
    issue_date: '',
    link_pdf: '',
  });
  const [sortConfig, setSortConfig] = useState({ key: 'invoice_id', direction: 'desc' });
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [limit] = useState(10);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const isFetching = useRef(false);

  const debouncedSearch = useDebounce(searchTerm, 300);
  const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotify();

  const socket = useMemo(
    () =>
      providedSocket ||
      io(BASE_URL, {
        withCredentials: true,
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      }),
    [providedSocket]
  );

  const fetchInvoices = useCallback(
    async (currentCursor, search = '') => {
      if (isFetching.current) {
        console.log('Skipping fetch: already fetching', { currentCursor, search });
        return;
      }
      isFetching.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');
        const url = currentCursor
          ? `${BASE_URL}/api/customer-invoices?limit=${limit}&cursor=${encodeURIComponent(currentCursor)}&force_refresh=true&search=${encodeURIComponent(search)}`
          : `${BASE_URL}/api/customer-invoices?limit=${limit}&force_refresh=true&search=${encodeURIComponent(search)}`;

        console.log('Fetching invoices from:', url);

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = errorText || `Server responded with status: ${response.status}`;
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.code === 'RATE_LIMIT_EXCEEDED') {
              errorMessage = 'Too many requests. Please wait a moment and try again.';
            }
          } catch (e) {
            // Not JSON, use raw errorText
          }
          throw new Error(errorMessage);
        }

        const responseData = await response.json();
        console.log('Fetched response:', responseData);

        if (!responseData.data || !Array.isArray(responseData.data)) {
          throw new Error('Invalid data format');
        }

        setInvoices(responseData.data);
        setTotalItems(responseData.total || 0);
        setCursor(responseData.data.length > 0 && responseData.cursor ? responseData.cursor : null);
      } catch (err) {
        console.error('Error fetching invoices:', err);
        const errorMessage = err.message || 'Network error. Please try again later.';
        setError(errorMessage);
        notifyError(errorMessage, { autoClose: 5000 });
      } finally {
        setIsLoading(false);
        isFetching.current = false;
      }
    },
    [limit]
  );

  const throttledFetchInvoices = useMemo(
    () => throttle(fetchInvoices, 1000),
    [fetchInvoices]
  );

  // Initial fetch and search
  useEffect(() => {
    console.log('Running fetch effect', { searchTerm, debouncedSearch });
    throttledFetchInvoices(null, debouncedSearch);
  }, [throttledFetchInvoices, debouncedSearch]);

  useEffect(() => {
    const handleConnect = () => {
      console.log('Connected to Socket.IO in CustomerInvoicesPage');
      notifySuccess('Connected to real-time updates!', { autoClose: 2000 });
    };

    const handleConnectError = (err) => {
      console.error('Socket connection error:', err);
      notifyError('Failed to connect to real-time updates.', { autoClose: 3000 });
    };

    const handleDisconnect = () => {
      console.log('Socket.IO disconnected from App');
      notifyWarning('Disconnected from real-time updates. Attempting to reconnect...', { autoClose: 3000 });
    };

    const handleInvoiceUpdate = ({ invoice_id, invoice_number, total_value, issue_date, status }) => {
      setInvoices((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        if (status === 'Deleted') {
          notifyInfo(`Invoice #${invoice_id} deleted`, { autoClose: 2000 });
          return prev.filter((invoice) => invoice.invoice_id !== invoice_id);
        }

        const invoiceIndex = prev.findIndex((invoice) => invoice.invoice_id === invoice_id);
        if (invoiceIndex === -1) return prev;

        const invoiceToUpdate = prev[invoiceIndex];
        if (
          invoiceToUpdate.invoice_number === invoice_number &&
          invoiceToUpdate.total_value === total_value &&
          invoiceToUpdate.issue_date === issue_date
        ) {
          return prev;
        }

        const updatedInvoices = [...prev];
        updatedInvoices[invoiceIndex] = {
          ...invoiceToUpdate,
          invoice_number,
          total_value,
          issue_date,
        };

        notifyInfo(`Invoice #${invoice_id} updated`, { autoClose: 2000 });
        return updatedInvoices;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);
    socket.on('invoiceUpdate', handleInvoiceUpdate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);
      socket.off('invoiceUpdate', handleInvoiceUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [socket, providedSocket]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchTerm('');
      setCursor(null);
      setCursorStack([]);
      searchInputRef.current?.focus();
    }
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!Array.isArray(invoices)) return [];

    return invoices.filter((item) => {
      if (!item) return false;

      const searchFields = [
        String(item.invoice_id || ''),
        String(item.sr_no || ''),
        String(item.invoice_number || ''),
        String(item.customer_id || ''),
        String(item.order_id || ''),
        String(item.total_value || ''),
      ];

      return searchFields.some((field) =>
        field.toLowerCase().includes((debouncedSearch || '').toLowerCase())
      );
    });
  }, [invoices, debouncedSearch]);

  const sortedInvoices = useMemo(() => {
    if (!filteredInvoices.length) return [];

    const sortableInvoices = [...filteredInvoices];
    return sortableInvoices.sort((a, b) => {
      const valueA = a[sortConfig.key] ?? '';
      const valueB = b[sortConfig.key] ?? '';

      if (valueA < valueB) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredInvoices, sortConfig]);

  const handleEdit = useCallback((invoice) => {
    setSelectedInvoice(invoice);
    setFormData({
      invoice_number: invoice.invoice_number || '',
      issue_date: invoice.issue_date
        ? new Date(invoice.issue_date).toISOString().split('T')[0]
        : '',
      link_pdf: invoice.link_pdf || '',
    });
    setShowModal(true);
  }, []);

  const handleUpdate = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedInvoice) return;
      setUploading(true);

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${BASE_URL}/api/customer-invoices/${selectedInvoice.invoice_id}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              invoice_number: formData.invoice_number,
              issue_date: formData.issue_date,
              link_pdf: formData.link_pdf,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = errorText || `Update failed with status: ${response.status}`;
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.code === 'RATE_LIMIT_EXCEEDED') {
              errorMessage = 'Too many requests. Please wait a moment and try again.';
            }
          } catch (e) {
            // Not JSON, use raw errorText
          }
          throw new Error(errorMessage);
        }

        const updatedInvoice = await response.json();
        setInvoices((prev) =>
          prev.map((inv) => (inv.invoice_id === updatedInvoice.invoice_id ? updatedInvoice : inv))
        );
        setShowModal(false);
        notifySuccess(`Invoice #${updatedInvoice.invoice_id} updated successfully!`, {
          autoClose: 2000,
        });
      } catch (err) {
        console.error('Update error:', err);
        notifyError(err.message || 'Update failed', { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [selectedInvoice, formData]
  );

  const ActionsDropdown = useCallback(
    ({ invoice, onEdit }) => {
      const [isOpen, setIsOpen] = useState(false);
      const dropdownRef = useRef(null);

      useEffect(() => {
        const handleClickOutside = (event) => {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target))
            setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }, []);

      return (
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 hover:bg-gray-100 rounded-full"
            aria-label={`Actions for invoice ${invoice.invoice_id}`}
          >
            <MoreVertical size={20} />
          </button>
          {isOpen && (
            <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
              <button
                onClick={() => {
                  onEdit(invoice);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Edit2 size={16} className="mr-2" /> Edit
              </button>
            </div>
          )}
        </div>
      );
    },
    []
  );

  const handlePrevPage = useCallback(() => {
    console.log('Previous page clicked', { cursor, cursorStack });
    if (cursorStack.length > 0) {
      const previousCursor = cursorStack[cursorStack.length - 1];
      setCursorStack((prev) => prev.slice(0, -1));
      setCursor(previousCursor);
      throttledFetchInvoices(previousCursor, debouncedSearch);
    } else if (cursor !== null) {
      setCursor(null);
      setCursorStack([]);
      throttledFetchInvoices(null, debouncedSearch);
    }
  }, [cursorStack, cursor, throttledFetchInvoices, debouncedSearch]);

  const handleNextPage = useCallback(() => {
    console.log('Next page clicked', { cursor, cursorStack });
    if (invoices.length > 0 && !isLoading && cursor !== null) {
      const nextCursor = invoices[invoices.length - 1].issue_date;
      setCursorStack((prev) => [...prev, cursor]);
      setCursor(nextCursor);
      throttledFetchInvoices(nextCursor, debouncedSearch);
    }
  }, [invoices, cursor, isLoading, throttledFetchInvoices, debouncedSearch]);

  const handleRefresh = useCallback(() => {
    console.log('Refresh clicked');
    setSearchTerm('');
    setCursor(null);
    setCursorStack([]);
    throttledFetchInvoices(null, '');
  }, [throttledFetchInvoices]);

  if (isLoading && !invoices.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading Invoices...</div>
      </div>
    );
  }

  if (error && !showModal) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="alert"
      >
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg flex flex-col items-center">
          <p className="mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (invoices.length === 0 && !isLoading) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="status"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Invoices Yet</h2>
          <p className="text-gray-600 mb-6">
            Your database is empty. Invoices will appear here once created!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Customer Invoices
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-invoices" className="sr-only">
              Search Invoices
            </label>
            <input
              id="search-invoices"
              ref={searchInputRef}
              type="text"
              placeholder="Search by Invoice ID, Number, Customer ID, Order ID, or Total Value..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <button
            onClick={handleRefresh}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg flex items-center"
            disabled={isLoading}
            aria-label="Refresh invoices"
          >
            <RefreshCw size={20} className="mr-2" />
            {isLoading && invoices.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && invoices.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="Customer Invoices table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr
                className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50"
                role="row"
              >
                {[
                  { key: 'sr_no', label: 'Sr. No.' },
                  { key: 'invoice_id', label: 'Invoice ID' },
                  { key: 'invoice_number', label: 'Invoice Number' },
                  { key: 'customer_name', label: 'Customer Name' },
                  { key: 'order_id', label: 'Order ID' },
                  { key: 'order_status', label: 'Order Status' },
                  { key: 'total_value', label: 'Total Value' },
                  { key: 'issue_date', label: 'Issue Date' },
                  { key: 'link_pdf', label: 'PDF Link' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className={`py-5 px-3 text-gray-800 text-base font-semibold ${
                      key !== 'actions' ? 'cursor-pointer hover:bg-amber-300' : ''
                    } transition-all duration-200`}
                    onClick={() => key !== 'actions' && handleSort(key)}
                    aria-sort={
                      sortConfig.key === key
                        ? sortConfig.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {key !== 'actions' && (
                        <ArrowDownUp
                          size={16}
                          className={`ml-2 text-gray-600 ${
                            sortConfig.key === key ? 'text-gray-900' : 'opacity-50'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedInvoices.map((invoice) => (
                <tr
                  key={invoice.invoice_id}
                  className="border-t hover:bg-amber-50 transition-all duration-200"
                  role="row"
                >
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.sr_no}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.invoice_id}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.invoice_number}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {invoice.customer_name || 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {invoice.order_id || 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {invoice.order_status || 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {formatINR(parseFloat(invoice.total_value))}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {invoice.issue_date ? formatDate(invoice.issue_date) : 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {invoice.link_pdf ? (
                      <a
                        href={invoice.link_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        View PDF
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ActionsDropdown invoice={invoice} onEdit={handleEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {invoices.length} of {totalItems} invoices
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handlePrevPage}
                  disabled={cursorStack.length === 0 && cursor === null}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={invoices.length < limit || isLoading || cursor === null}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {sortedInvoices.length === 0 && (
            <div
              className="text-center py-12 text-gray-500 flex flex-col items-center"
              role="alert"
            >
              <Search className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">No invoices found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && selectedInvoice && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
          role="dialog"
          aria-labelledby="edit-invoice-title"
        >
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-[500px] relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close edit modal"
            >
              <XCircle size={24} />
            </button>
            <h2
              id="edit-invoice-title"
              className="text-2xl font-bold text-gray-800 mb-6"
            >
              Edit Invoice #{selectedInvoice.invoice_id}
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Invoice Number
                </label>
                <input
                  type="text"
                  placeholder="Enter invoice number"
                  value={formData.invoice_number}
                  onChange={(e) =>
                    setFormData({ ...formData, invoice_number: e.target.value })
                  }
                  required
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Total Value
                </label>
                <p className="w-full p-3 bg-gray-100 rounded-lg shadow-sm">
                  {formatINR(parseFloat(selectedInvoice.total_value))}
                </p>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) =>
                    setFormData({ ...formData, issue_date: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  PDF Link
                </label>
                <input
                  type="url"
                  placeholder="Enter PDF link"
                  value={formData.link_pdf}
                  onChange={(e) =>
                    setFormData({ ...formData, link_pdf: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600 transition-all duration-300 font-semibold"
              >
                {uploading ? 'Updating...' : 'Update'}
              </button>
            </form>
          </div>
        </div>
      )}

</div>
  );
}

export default CustomerInvoicesPage;