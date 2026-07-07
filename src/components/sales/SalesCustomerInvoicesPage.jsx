import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate as importedFormatDate } from '../utils/helpers';
import { ArrowDownUp, RefreshCw, Search } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Fallback formatDate function in case the imported one is not available
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

function SalesCustomerInvoicesPage({ socket: providedSocket }) {
  const [invoices, setInvoices] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'invoice_id', direction: 'desc' });
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [limit] = useState(10);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const hasFetched = useRef(false);
  const isFetching = useRef(false);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

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

  const fetchInvoices = useCallback(async () => {
    if (isFetching.current) return;
    
    isFetching.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const url = cursor
        ? `${BASE_URL}/api/customer-invoices?limit=${limit}&cursor=${encodeURIComponent(cursor)}&force_refresh=true`
        : `${BASE_URL}/api/customer-invoices?limit=${limit}&force_refresh=true`;
      
      console.log('Fetching invoices from:', url);
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status: ${response.status}`);
      }

      const responseData = await response.json();
      console.log('Fetched response:', responseData);
      
      if (!responseData.data || !Array.isArray(responseData.data)) {
        throw new Error('Invalid data format');
      }
      
      if (responseData.data.length > 0 || cursor === null) {
        setInvoices(responseData.data);
        setTotalItems(responseData.total || 0);
        
        if (responseData.cursor && responseData.cursor !== cursor) {
          if (cursor !== null) {
            setCursorStack(prev => [...prev, cursor]);
          }
          setCursor(responseData.cursor);
        } else if (!responseData.cursor && responseData.data.length === 0) {
          if (cursorStack.length > 0) {
          } else {
            setCursor(null);
          }
        }
      } else if (responseData.data.length === 0 && cursor !== null) {
        if (cursorStack.length > 0) {
          const previousCursor = cursorStack[cursorStack.length - 1];
          setCursorStack(prev => prev.slice(0, -1));
          setCursor(previousCursor);
        } else {
          setCursor(null);
        }
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      notifyError(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [cursor, limit, cursorStack]);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchInvoices();
      hasFetched.current = true;
    }

    const handleConnect = () => {
      console.log('Socket connected');
    };

    const handleConnectError = (err) => {
      console.error('Socket connection error:', err);
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
    socket.on('invoiceUpdate', handleInvoiceUpdate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('invoiceUpdate', handleInvoiceUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchInvoices, socket, providedSocket]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchTerm('');
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
        field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [invoices, searchTerm]);

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

  const handlePrevPage = useCallback(() => {
    if (cursorStack.length > 0) {
      const previousCursor = cursorStack.pop();
      setCursorStack([...cursorStack]);
      setCursor(previousCursor);
    } else {
      setCursor(null);
    }
  }, [cursorStack]);

  const handleNextPage = useCallback(() => {
    if (invoices.length > 0 && !isLoading) {
      const lastInvoice = invoices[invoices.length - 1];
      if (lastInvoice && lastInvoice.issue_date) {
        if (cursor !== null) {
          setCursorStack(prev => [...prev, cursor]);
        }
        setCursor(lastInvoice.issue_date);
      }
    }
  }, [invoices, cursor, isLoading]);

  const handleRefresh = useCallback(() => {
    setCursor(null);
    setCursorStack([]);
    hasFetched.current = false;
    fetchInvoices();
  }, [fetchInvoices]);

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

  if (error) return <ConnectionError onRetry={fetchInvoices} />;

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
        Sales Customer Invoices
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
          </div>
          <button
            onClick={handleRefresh}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh invoices"
          >
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
            aria-label="Sales Customer Invoices table"
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
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className="py-5 px-3 text-gray-800 text-base font-semibold cursor-pointer hover:bg-amber-300 transition-all duration-200"
                    onClick={() => handleSort(key)}
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
                      <ArrowDownUp
                        size={16}
                        className={`ml-2 text-gray-600 ${
                          sortConfig.key === key ? 'text-gray-900' : 'opacity-50'
                        }`}
                        aria-hidden="true"
                      />
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
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {sortedInvoices.length} of {totalItems} invoices
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
                  disabled={invoices.length < limit || isLoading}
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

</div>
  );
}

export default SalesCustomerInvoicesPage; 
