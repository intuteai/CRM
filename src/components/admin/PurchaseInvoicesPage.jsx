import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ArrowDownUp, RefreshCw, Search, Edit2, MoreVertical, XCircle, Plus, Eye } from 'lucide-react';
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

function ActionsDropdown({ invoice, onEdit, onDelete }) {
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
        className="p-2 hover:bg-navy-50 rounded-full transition-colors"
        aria-label={`Actions for invoice ${invoice.invoiceId}`}
      >
        <MoreVertical size={18} className="text-gray-500" />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg border border-navy-100 py-1">
          <button
            onClick={() => {
              onEdit(invoice);
              setIsOpen(false);
            }}
            className="flex items-center w-full px-4 py-2 text-sm text-navy-800 hover:bg-navy-50 transition-colors"
          >
            <Edit2 size={16} className="mr-2" /> Edit
          </button>
          <button
            onClick={() => {
              onDelete(invoice.invoiceId);
              setIsOpen(false);
            }}
            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <XCircle size={16} className="mr-2" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function PurchaseInvoicesPage({ socket: providedSocket }) {
  const [invoices, setInvoices] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null);
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
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Server responded with status: ${response.status}`);
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
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Delete failed with status: ${response.status}`);
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
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || `${modalMode === 'create' ? 'Create' : 'Update'} failed with status: ${response.status}`);
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
      <div className="flex items-center justify-center py-24" aria-live="polite">
        <div className="text-gray-500 text-lg animate-pulse">Loading Purchase Invoices...</div>
      </div>
    );
  }

  if (error && !showModal) return <ConnectionError onRetry={fetchInvoices} />;

  if (invoices.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center py-24" role="status">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-navy-100 text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-300" size={40} />
          <h2 className="font-display text-xl font-bold text-navy-800 mb-2">No Purchase Invoices Yet</h2>
          <p className="text-gray-500 mb-6">
            Your database is empty. Create a new invoice to get started!
          </p>
          <button
            onClick={handleCreate}
            className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors flex items-center gap-2 mx-auto"
          >
            <Plus size={18} /> Create Invoice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-grow min-w-[220px]">
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
              className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
            />
            <Search size={17} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
            disabled={isLoading}
            aria-label="Refresh invoices"
          >
            {isLoading && invoices.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors"
            aria-label="Create new invoice"
          >
            <Plus size={16} /> Create
          </button>
        </div>

        {isLoading && invoices.length > 0 && (
          <div className="text-gray-500 text-sm text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="Purchase Invoices table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr className="bg-navy-50 text-navy-800" role="row">
                {[
                  { key: 'invoiceId', label: 'Invoice ID' },
                  { key: 'supplierName', label: 'Supplier Name' },
                  { key: 'invoiceNumber', label: 'Invoice Number' },
                  { key: 'issueDate', label: 'Issue Date' },
                  { key: 'unitPrice', label: 'Unit Price' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className={`px-5 py-3 text-sm font-semibold ${
                      key !== 'actions' ? 'cursor-pointer hover:bg-navy-100' : ''
                    } transition-colors whitespace-nowrap border-b border-navy-100`}
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
                          size={15}
                          className={`ml-2 ${sortConfig.key === key ? 'text-gold-500' : 'text-navy-400/50'}`}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-5 py-3 text-sm font-semibold whitespace-nowrap border-b border-navy-100" scope="col">
                  View
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {sortedInvoices.map((invoice) => (
                <tr
                  key={invoice.invoiceId}
                  className="hover:bg-navy-50/60 transition-colors"
                  role="row"
                >
                  <td className="px-5 py-3.5 text-navy-800 font-medium">{invoice.invoiceId}</td>
                  <td className="px-5 py-3.5 text-gray-600 min-w-[160px] lg:min-w-0">{invoice.supplierName}</td>
                  <td className="px-5 py-3.5 text-gray-600">{invoice.invoiceNumber}</td>
                  <td className="px-5 py-3.5 text-gray-600">{formatDate(invoice.issueDate)}</td>
                  <td className="px-5 py-3.5 text-gray-600">{invoice.unitPrice}</td>
                  <td className="px-5 py-3.5 text-gray-600">
                    <ActionsDropdown invoice={invoice} onEdit={handleEdit} onDelete={handleDelete} />
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setViewingInvoice(invoice)}
                      className="flex items-center gap-1.5 text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors"
                      aria-label={`View details for invoice ${invoice.invoiceId}`}
                    >
                      <Eye size={15} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center flex-wrap gap-2 p-4 bg-navy-50 border-t border-navy-100">
              <div className="text-gray-500 text-sm">
                Showing {sortedInvoices.length} of {totalItems} invoices
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
                  disabled={invoices.length < limit || isLoading}
                  className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {sortedInvoices.length === 0 && (
            <div
              className="text-center py-12 text-gray-400 flex flex-col items-center"
              role="alert"
            >
              <Search className="mb-4 text-gray-300" size={40} />
              <p>No invoices found matching your search.</p>
            </div>
          )}
        </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-labelledby="invoice-modal-title"
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close modal"
            >
              <XCircle size={20} />
            </button>
            <h2
              id="invoice-modal-title"
              className="font-display text-xl font-bold text-navy-800 mb-5"
            >
              {modalMode === 'create' ? 'Create Purchase Invoice' : `Edit Invoice #${selectedInvoice?.invoiceId}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">Supplier Code</label>
                  <input
                    type="text"
                    placeholder="Enter Supplier Code"
                    value={formData.supplierCode}
                    onChange={(e) => setFormData({ ...formData, supplierCode: e.target.value })}
                    className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">Supplier Name</label>
                  <input
                    type="text"
                    placeholder="Enter Supplier Name"
                    value={formData.supplierName}
                    onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                    className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">Invoice Number</label>
                <input
                  type="text"
                  placeholder="Enter Invoice Number"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">Issue Date</label>
                <input
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                  className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">Description</label>
                <input
                  type="text"
                  placeholder="Enter Description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">Unit Price</label>
                  <input
                    type="number"
                    placeholder="Enter Unit Price"
                    value={formData.unitPrice}
                    onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
                    className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">Quantity</label>
                  <input
                    type="number"
                    placeholder="Enter Quantity"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                    required
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">Product ID</label>
                <input
                  type="number"
                  placeholder="Enter Product ID"
                  value={formData.productId}
                  onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
                  className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                  required
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">PDF Link</label>
                <input
                  type="url"
                  placeholder="Enter PDF Link"
                  value={formData.linkPdf}
                  onChange={(e) => setFormData({ ...formData, linkPdf: e.target.value })}
                  className="w-full p-2.5 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-navy-800 text-white py-3 rounded-lg font-semibold hover:bg-navy-700 transition-colors disabled:opacity-50"
              >
                {uploading ? (modalMode === 'create' ? 'Creating...' : 'Updating...') : (modalMode === 'create' ? 'Create' : 'Update')}
              </button>
            </form>
          </div>
        </div>
      )}

      {viewingInvoice && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setViewingInvoice(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <XCircle size={18} />
            </button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
              Invoice #{viewingInvoice.invoiceId}
            </h2>
            <dl className="space-y-4">
              {[
                { label: 'Sr. No.', value: viewingInvoice.srNo },
                { label: 'Supplier Code', value: viewingInvoice.supplierCode },
                { label: 'Description', value: viewingInvoice.description },
                { label: 'Quantity', value: viewingInvoice.quantity },
                { label: 'Product ID', value: viewingInvoice.productId },
                { label: 'Created At', value: formatDate(viewingInvoice.createdAt) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="text-navy-800 mt-0.5 break-words">{value || 'N/A'}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">PDF Link</dt>
                <dd className="text-navy-800 mt-0.5">
                  {viewingInvoice.linkPdf ? (
                    <a
                      href={viewingInvoice.linkPdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      View PDF
                    </a>
                  ) : (
                    'N/A'
                  )}
                </dd>
              </div>
            </dl>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setViewingInvoice(null)}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

</div>
  );
}

export default PurchaseInvoicesPage;