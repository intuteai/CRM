import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowDownUp, RefreshCw, Search, Edit2, MoreVertical, XCircle, Plus } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Fallback formatDate function
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

function PurchaseInvoicesPage({ socket: providedSocket }) {
  const [invoices, setInvoices] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    supplierCode: '',
    supplierName: '',
    invoiceNumber: '',
    issueDate: '',
    description: '',
    unitPrice: '',
    quantity: '',
    linkPdf: '',
    productId: ''
  });
  const [sortConfig, setSortConfig] = useState({ key: 'invoiceId', direction: 'desc' });
  const [page, setPage] = useState(0);
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
      const url = `${BASE_URL}/api/purchase-invoices?limit=${limit}&offset=${page * limit}&force_refresh=true`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status: ${response.status}`);
      }

      const responseData = await response.json();
      if (!Array.isArray(responseData)) {
        throw new Error('Invalid data format');
      }

      setInvoices(responseData);
      setTotalItems(responseData.length ? responseData[0].total || responseData.length : 0);
    } catch (err) {
      console.error('Error fetching purchase invoices:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      notifyError(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [page, limit]);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchInvoices();
      hasFetched.current = true;
    }

    const handleInvoiceUpdate = ({ invoiceId, ...updatedData }) => {
      setInvoices((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        if (updatedData.status === 'Deleted') {
          notifyInfo(`Invoice #${invoiceId} deleted`, { autoClose: 2000 });
          return prev.filter((invoice) => invoice.invoiceId !== invoiceId);
        }

        const invoiceIndex = prev.findIndex((invoice) => invoice.invoiceId === invoiceId);
        if (invoiceIndex === -1) {
          notifyInfo(`Invoice #${invoiceId} created`, { autoClose: 2000 });
          return [{ ...updatedData, invoiceId }, ...prev];
        }

        const invoiceToUpdate = prev[invoiceIndex];
        if (
          invoiceToUpdate.srNo === updatedData.srNo &&
          invoiceToUpdate.supplierCode === updatedData.supplierCode &&
          invoiceToUpdate.supplierName === updatedData.supplierName &&
          invoiceToUpdate.invoiceNumber === updatedData.invoiceNumber &&
          invoiceToUpdate.issueDate === updatedData.issueDate &&
          invoiceToUpdate.description === updatedData.description &&
          invoiceToUpdate.unitPrice === updatedData.unitPrice &&
          invoiceToUpdate.quantity === updatedData.quantity &&
          invoiceToUpdate.linkPdf === updatedData.linkPdf &&
          invoiceToUpdate.productId === updatedData.productId
        ) {
          return prev;
        }

        const updatedInvoices = [...prev];
        updatedInvoices[invoiceIndex] = { ...invoiceToUpdate, ...updatedData };
        notifyInfo(`Invoice #${invoiceId} updated`, { autoClose: 2000 });
        return updatedInvoices;
      });
    };

    socket.on('invoiceUpdate', handleInvoiceUpdate);

    return () => {
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
        String(item.invoiceId || ''),
        String(item.srNo || ''),
        String(item.supplierCode || ''),
        String(item.supplierName || ''),
        String(item.invoiceNumber || ''),
        String(item.description || ''),
        String(item.productId || '')
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

  const handleCreate = useCallback(() => {
    setModalMode('create');
    setSelectedInvoice(null);
    setFormData({
      supplierCode: '',
      supplierName: '',
      invoiceNumber: '',
      issueDate: '',
      description: '',
      unitPrice: '',
      quantity: '',
      linkPdf: '',
      productId: ''
    });
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((invoice) => {
    setModalMode('edit');
    setSelectedInvoice(invoice);
    setFormData({
      supplierCode: invoice.supplierCode || '',
      supplierName: invoice.supplierName || '',
      invoiceNumber: invoice.invoiceNumber || '',
      issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().split('T')[0] : '',
      description: invoice.description || '',
      unitPrice: invoice.unitPrice || '',
      quantity: invoice.quantity || '',
      linkPdf: invoice.linkPdf || '',
      productId: invoice.productId || ''
    });
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(async (invoiceId) => {
    if (!window.confirm(`Are you sure you want to delete invoice #${invoiceId}?`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${BASE_URL}/api/purchase-invoices/${invoiceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Delete failed with status: ${response.status}`);
      }

      socket.emit('invoiceUpdate', { invoiceId, status: 'Deleted' });
      notifySuccess(`Invoice #${invoiceId} deleted successfully!`, { autoClose: 2000 });
    } catch (err) {
      console.error('Delete error:', err);
      notifyError(err.message || 'Delete failed', { autoClose: 3000 });
    }
  }, [socket]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setUploading(true);

      try {
        const token = localStorage.getItem('token');
        const method = modalMode === 'create' ? 'POST' : 'PUT';
        const url =
          modalMode === 'create'
            ? `${BASE_URL}/api/purchase-invoices`
            : `${BASE_URL}/api/purchase-invoices/${selectedInvoice.invoiceId}`;

        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            supplierCode: formData.supplierCode,
            supplierName: formData.supplierName,
            invoiceNumber: formData.invoiceNumber,
            issueDate: formData.issueDate,
            description: formData.description,
            unitPrice: parseFloat(formData.unitPrice),
            quantity: parseFloat(formData.quantity),
            linkPdf: formData.linkPdf,
            productId: parseInt(formData.productId)
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `${modalMode === 'create' ? 'Create' : 'Update'} failed with status: ${response.status}`);
        }

        const updatedInvoice = await response.json();
        if (modalMode === 'create') {
          setInvoices((prev) => [updatedInvoice, ...prev]);
          notifySuccess(`Invoice #${updatedInvoice.invoiceId} created successfully!`, { autoClose: 2000 });
        } else {
          setInvoices((prev) =>
            prev.map((inv) => (inv.invoiceId === updatedInvoice.invoiceId ? updatedInvoice : inv))
          );
          notifySuccess(`Invoice #${updatedInvoice.invoiceId} updated successfully!`, { autoClose: 2000 });
        }

        socket.emit('invoiceUpdate', updatedInvoice);
        setShowModal(false);
      } catch (err) {
        console.error(`${modalMode === 'create' ? 'Create' : 'Update'} error:`, err);
        notifyError(err.message || `${modalMode === 'create' ? 'Create' : 'Update'} failed`, { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [formData, modalMode, selectedInvoice, socket]
  );

  const ActionsDropdown = useCallback(
    ({ invoice, onEdit, onDelete }) => {
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
            aria-label={`Actions for invoice ${invoice.invoiceId}`}
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
              <button
                onClick={() => {
                  onDelete(invoice.invoiceId);
                  setIsOpen(false);
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <XCircle size={16} className="mr-2" /> Delete
              </button>
            </div>
          )}
        </div>
      );
    },
    []
  );

  const handlePrevPage = useCallback(() => {
    if (page > 0) setPage((prev) => prev - 1);
  }, [page]);

  const handleNextPage = useCallback(() => {
    if (invoices.length === limit) setPage((prev) => prev + 1);
  }, [invoices, limit]);

  const handleRefresh = useCallback(() => {
    setPage(0);
    hasFetched.current = false;
    fetchInvoices();
  }, [fetchInvoices]);

  if (isLoading && !invoices.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading Purchase Invoices...</div>
      </div>
    );
  }

  if (error && !showModal) return <ConnectionError onRetry={fetchInvoices} />;

  if (invoices.length === 0 && !isLoading) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="status"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Purchase Invoices Yet</h2>
          <p className="text-gray-600 mb-6">
            Your database is empty. Create a new invoice to get started!
          </p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300"
          >
            Create Invoice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Purchase Invoices
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-invoices" className="sr-only">
              Search Purchase Invoices
            </label>
            <input
              id="search-invoices"
              ref={searchInputRef}
              type="text"
              placeholder="Search by ID, Supplier, Invoice Number, Description, or Product ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleCreate}
            className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-300 transition-all duration-300 shadow-md text-lg flex items-center"
            aria-label="Create new invoice"
          >
            <Plus size={20} className="mr-2" /> Create
          </button>
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
            aria-label="Purchase Invoices table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr
                className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50"
                role="row"
              >
                {[
                  { key: 'srNo', label: 'Sr. No.' },
                  { key: 'invoiceId', label: 'Invoice ID' },
                  { key: 'supplierCode', label: 'Supplier Code' },
                  { key: 'supplierName', label: 'Supplier Name' },
                  { key: 'invoiceNumber', label: 'Invoice Number' },
                  { key: 'issueDate', label: 'Issue Date' },
                  { key: 'description', label: 'Description' },
                  { key: 'unitPrice', label: 'Unit Price' },
                  { key: 'quantity', label: 'Quantity' },
                  { key: 'productId', label: 'Product ID' },
                  { key: 'linkPdf', label: 'PDF Link' },
                  { key: 'createdAt', label: 'Created At' },
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
                  key={invoice.invoiceId}
                  className="border-t hover:bg-amber-50 transition-all duration-200"
                  role="row"
                >
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.srNo}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.invoiceId}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.supplierCode}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.supplierName}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.invoiceNumber}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{formatDate(invoice.issueDate)}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.description}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.unitPrice}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.quantity}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{invoice.productId || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {invoice.linkPdf ? (
                      <a
                        href={invoice.linkPdf}
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
                  <td className="py-4 px-3 text-gray-600 text-base">{formatDate(invoice.createdAt)}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ActionsDropdown invoice={invoice} onEdit={handleEdit} onDelete={handleDelete} />
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
                  disabled={page === 0}
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

      {showModal && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
          role="dialog"
          aria-labelledby="invoice-modal-title"
        >
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-[600px] relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close modal"
            >
              <XCircle size={24} />
            </button>
            <h2
              id="invoice-modal-title"
              className="text-2xl font-bold text-gray-800 mb-6"
            >
              {modalMode === 'create' ? 'Create Purchase Invoice' : `Edit Invoice #${selectedInvoice?.invoiceId}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Supplier Code</label>
                  <input
                    type="text"
                    placeholder="Enter Supplier Code"
                    value={formData.supplierCode}
                    onChange={(e) => setFormData({ ...formData, supplierCode: e.target.value })}
                    className="w-full p-3 border rounded-lg shadow-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Supplier Name</label>
                  <input
                    type="text"
                    placeholder="Enter Supplier Name"
                    value={formData.supplierName}
                    onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                    className="w-full p-3 border rounded-lg shadow-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">Invoice Number</label>
                <input
                  type="text"
                  placeholder="Enter Invoice Number"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="w-full p-3 border rounded-lg shadow-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">Issue Date</label>
                <input
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                  className="w-full p-3 border rounded-lg shadow-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">Description</label>
                <input
                  type="text"
                  placeholder="Enter Description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3 border rounded-lg shadow-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Unit Price</label>
                  <input
                    type="number"
                    placeholder="Enter Unit Price"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                    className="w-full p-3 border rounded-lg shadow-sm"
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-2">Quantity</label>
                  <input
                    type="number"
                    placeholder="Enter Quantity"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full p-3 border rounded-lg shadow-sm"
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">Product ID</label>
                <input
                  type="number"
                  placeholder="Enter Product ID"
                  value={formData.productId}
                  onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                  className="w-full p-3 border rounded-lg shadow-sm"
                  required
                  min="1"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">PDF Link</label>
                <input
                  type="url"
                  placeholder="Enter PDF Link"
                  value={formData.linkPdf}
                  onChange={(e) => setFormData({ ...formData, linkPdf: e.target.value })}
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600 transition-all duration-300 font-semibold"
              >
                {uploading ? (modalMode === 'create' ? 'Creating...' : 'Updating...') : (modalMode === 'create' ? 'Create' : 'Update')}
              </button>
            </form>
          </div>
        </div>
      )}

</div>
  );
}

export default PurchaseInvoicesPage;