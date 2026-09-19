import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate as importedFormatDate } from '../../utils/helpers';
import { ArrowDownUp, RefreshCw, Search, Edit2, Eye, MoreVertical, X, XCircle } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from './ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const ORDER_STATUS_COLORS = {
  Pending:               'bg-gold-400/25 text-gold-600',
  Processing:            'bg-blue-100 text-blue-700',
  Testing:               'bg-purple-100 text-purple-700',
  'Ready for Shipment':  'bg-teal-100 text-teal-700',
  Shipped:               'bg-indigo-100 text-indigo-700',
  'Partially Delivered': 'bg-violet-100 text-violet-700',
  Delivered:             'bg-emerald-100 text-emerald-700',
  Cancelled:             'bg-red-100 text-red-700',
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  if (typeof importedFormatDate === 'function') {
    return importedFormatDate(dateString);
  }
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

function ActionsDropdown({ record, onEdit }) {
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
        aria-label={`Actions for dispatch record ${record.tracking_id}`}
      >
        <MoreVertical size={18} className="text-gray-500" />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg border border-navy-100 py-1">
          <button
            onClick={() => {
              onEdit(record);
              setIsOpen(false);
            }}
            className="flex items-center w-full px-4 py-2 text-sm text-navy-800 hover:bg-navy-50 transition-colors"
          >
            <Edit2 size={16} className="mr-2" /> Edit
          </button>
        </div>
      )}
    </div>
  );
}

function DispatchTrackingPage({ socket: providedSocket }) {
  const [dispatchRecords, setDispatchRecords] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [formData, setFormData] = useState({
    tracking_id: '',
    docket_number: '',
    dispatch_date: '',
    delivery_date: '',
    status: 'Pending',
  });
  const [sortConfig, setSortConfig] = useState({ key: 'sr_no', direction: 'asc' });
  const [offset, setOffset] = useState(0);
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

  const fetchDispatchRecords = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const url = `${BASE_URL}/api/dispatch-tracking?limit=${limit}&offset=${offset}&force_refresh=true`;
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
      setDispatchRecords(responseData);
      setTotalItems(responseData.length >= limit ? offset + responseData.length + 1 : offset + responseData.length);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      notifyError(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [limit, offset]);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchDispatchRecords();
      hasFetched.current = true;
    }
    const handleDispatchUpdate = ({ tracking_id, docket_number, dispatch_date, delivery_date, status }) => {
      setDispatchRecords((prev) => {
        if (!Array.isArray(prev)) return prev || [];
        if (status === 'Deleted') {
          notifyInfo(`Dispatch record #${tracking_id} deleted`, { autoClose: 2000 });
          return prev.filter((record) => record.tracking_id !== tracking_id);
        }
        const recordIndex = prev.findIndex((record) => record.tracking_id === tracking_id);
        if (recordIndex === -1) return prev;
        const recordToUpdate = prev[recordIndex];
        if (
          recordToUpdate.tracking_id === tracking_id &&
          recordToUpdate.docket_number === docket_number &&
          recordToUpdate.dispatch_date === dispatch_date &&
          recordToUpdate.delivery_date === delivery_date &&
          recordToUpdate.status === status
        ) {
          return prev;
        }
        const updatedRecords = [...prev];
        updatedRecords[recordIndex] = {
          ...recordToUpdate,
          tracking_id,
          docket_number,
          dispatch_date,
          delivery_date,
          status,
        };
        notifyInfo(`Dispatch record #${tracking_id} updated`, { autoClose: 2000 });
        return updatedRecords;
      });
    };
    socket.on('dispatchUpdate', handleDispatchUpdate);
    return () => {
      socket.off('dispatchUpdate', handleDispatchUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchDispatchRecords, socket, providedSocket]);

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

  const filteredDispatchRecords = useMemo(() => {
    if (!Array.isArray(dispatchRecords)) return [];
    return dispatchRecords.filter((item) => {
      if (!item) return false;
      const searchFields = [
        String(item.tracking_id || ''),
        String(item.sr_no || ''),
        String(item.order_id || ''),
        String(item.docket_number || ''),
        String(item.status || ''),
      ];
      return searchFields.some((field) =>
        field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [dispatchRecords, searchTerm]);

  const sortedDispatchRecords = useMemo(() => {
    if (!filteredDispatchRecords.length) return [];
    const sortableRecords = [...filteredDispatchRecords];
    return sortableRecords.sort((a, b) => {
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
  }, [filteredDispatchRecords, sortConfig]);

  const handleEdit = useCallback((record) => {
    setSelectedRecord(record);
    setFormData({
      tracking_id: record.tracking_id || '',
      docket_number: record.docket_number || '',
      dispatch_date: record.dispatch_date
        ? new Date(record.dispatch_date).toISOString().split('T')[0]
        : '',
      delivery_date: record.delivery_date
        ? new Date(record.delivery_date).toISOString().split('T')[0]
        : '',
      status: record.status || 'Pending',
    });
    setShowModal(true);
  }, []);

  const handleUpdate = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedRecord) return;
      setUploading(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/dispatch-tracking/${selectedRecord.tracking_id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tracking_id: formData.tracking_id,
            docket_number: formData.docket_number || null,
            dispatch_date: formData.dispatch_date || null,
            delivery_date: formData.delivery_date || null,
            status: formData.status,
          }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Update failed with status: ${response.status}`);
        }
        const updatedRecord = await response.json();
        setDispatchRecords((prev) =>
          prev.map((r) => (r.tracking_id === updatedRecord.tracking_id ? updatedRecord : r))
        );
        setShowModal(false);
        notifySuccess(`Dispatch record #${updatedRecord.tracking_id} updated successfully!`, {
          autoClose: 2000,
        });
      } catch (err) {
        console.error('Update error:', err);
        notifyError(err.message || 'Update failed', { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [selectedRecord, formData]
  );

  const handlePrevPage = useCallback(() => {
    if (offset > 0) {
      setOffset((prev) => Math.max(0, prev - limit));
    }
  }, [offset, limit]);

  const handleNextPage = useCallback(() => {
    if (dispatchRecords.length >= limit) {
      setOffset((prev) => prev + limit);
    }
  }, [dispatchRecords, limit]);

  const handleRefresh = useCallback(() => {
    setOffset(0);
    hasFetched.current = false;
    fetchDispatchRecords();
  }, [fetchDispatchRecords]);

  if (isLoading && !dispatchRecords.length) {
    return (
      <div className="flex items-center justify-center py-24" aria-live="polite">
        <div className="text-gray-500 text-lg animate-pulse">Loading Dispatch Records...</div>
      </div>
    );
  }

  if (error && !showModal) return <ConnectionError onRetry={fetchDispatchRecords} />;

  if (dispatchRecords.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center py-24" role="status">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-navy-100 text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-300" size={40} />
          <h2 className="font-display text-xl font-bold text-navy-800 mb-2">No Dispatch Records Yet</h2>
          <p className="text-gray-500 mb-6">
            Your database is empty. Dispatch records will appear here once available!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-grow min-w-[220px]">
          <label htmlFor="search-dispatch" className="sr-only">
            Search Dispatch Records
          </label>
          <input
            id="search-dispatch"
            ref={searchInputRef}
            type="text"
            placeholder="Search by Tracking ID, Sr. No., Order ID, Docket Number, or Status..."
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
          aria-label="Refresh dispatch records"
        >
          {isLoading && dispatchRecords.length > 0 ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {isLoading && dispatchRecords.length > 0 && (
        <div className="text-gray-500 text-sm text-center" aria-live="polite">
          Refreshing data...
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
        <table
          className="w-full text-left border-collapse"
          role="grid"
          aria-label="Dispatch Tracking table"
          ref={tableRef}
          tabIndex={0}
        >
          <thead>
            <tr className="bg-navy-50" role="row">
              {[
                { key: 'tracking_id', label: 'Tracking ID' },
                { key: 'docket_number', label: 'Docket Number' },
                { key: 'dispatch_date', label: 'Dispatch Date' },
                { key: 'delivery_date', label: 'Delivery Date' },
                { key: 'status', label: 'Status' },
                { key: 'actions', label: 'Actions' },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  className={`py-3 px-3 text-navy-800 text-sm font-semibold ${
                    key !== 'actions' ? 'cursor-pointer hover:bg-navy-100' : ''
                  } transition-colors whitespace-nowrap`}
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
                        size={14}
                        className={`ml-2 ${
                          sortConfig.key === key ? 'text-gold-500' : 'text-navy-400/50'
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
            {sortedDispatchRecords.map((record) => (
              <tr
                key={record.tracking_id}
                className="border-t border-navy-100 hover:bg-navy-50/60 transition-colors"
                role="row"
              >
                <td className="py-3.5 px-3 text-navy-800 font-medium">{record.tracking_id}</td>
                <td className="py-3.5 px-3 text-gray-600">{record.docket_number || 'N/A'}</td>
                <td className="py-3.5 px-3 text-gray-600">
                  {record.dispatch_date ? formatDate(record.dispatch_date) : 'N/A'}
                </td>
                <td className="py-3.5 px-3 text-gray-600">
                  {record.delivery_date ? formatDate(record.delivery_date) : 'N/A'}
                </td>
                <td className="py-3.5 px-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_COLORS[record.status] || 'bg-gray-100 text-gray-500'}`}>
                    {record.status}
                  </span>
                </td>
                <td className="py-3.5 px-3 text-gray-600">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setViewingRecord(record)}
                      className="flex items-center gap-1.5 text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors"
                      aria-label={`View details for dispatch record ${record.tracking_id}`}
                    >
                      <Eye size={15} />
                      View
                    </button>
                    <ActionsDropdown record={record} onEdit={handleEdit} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalItems > 0 && (
          <div className="flex justify-between items-center flex-wrap gap-2 p-4 bg-navy-50 border-t border-navy-100">
            <div className="text-gray-500 text-sm">
              Showing {sortedDispatchRecords.length} of {totalItems} dispatch records
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrevPage}
                disabled={offset === 0}
                className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={handleNextPage}
                disabled={dispatchRecords.length < limit || isLoading}
                className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
        {sortedDispatchRecords.length === 0 && (
          <div
            className="text-center py-12 text-gray-400 flex flex-col items-center"
            role="alert"
          >
            <Search className="mb-4 text-gray-300" size={40} />
            <p>No dispatch records found matching your search.</p>
          </div>
        )}
      </div>
      {showModal && selectedRecord && (
        <div
          className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-labelledby="edit-dispatch-title"
        >
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close edit modal"
            >
              <XCircle size={20} />
            </button>
            <h2
              id="edit-dispatch-title"
              className="font-display text-xl font-bold text-navy-800 mb-5"
            >
              Edit Dispatch Record #{selectedRecord.tracking_id}
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                  Tracking ID
                </label>
                <input
                  type="text"
                  placeholder="Enter Tracking ID"
                  value={formData.tracking_id}
                  onChange={(e) =>
                    setFormData({ ...formData, tracking_id: e.target.value })
                  }
                  className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 placeholder-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                  Docket Number
                </label>
                <input
                  type="text"
                  placeholder="Enter Docket Number"
                  value={formData.docket_number}
                  onChange={(e) =>
                    setFormData({ ...formData, docket_number: e.target.value })
                  }
                  className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                  Dispatch Date
                </label>
                <input
                  type="date"
                  value={formData.dispatch_date}
                  onChange={(e) =>
                    setFormData({ ...formData, dispatch_date: e.target.value })
                  }
                  className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                  Delivery Date
                </label>
                <input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) =>
                    setFormData({ ...formData, delivery_date: e.target.value })
                  }
                  className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1.5">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400"
                >
                  {['Pending', 'Processing', 'Testing', 'Ready for Shipment', 'Shipped', 'Partially Delivered', 'Delivered', 'Cancelled'].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-navy-800 text-white py-2.5 rounded-lg hover:bg-navy-700 transition-colors font-semibold disabled:opacity-50"
              >
                {uploading ? 'Updating...' : 'Update'}
              </button>
            </form>
          </div>
        </div>
      )}
      {viewingRecord && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setViewingRecord(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
              Dispatch Record #{viewingRecord.tracking_id}
            </h2>
            <dl className="space-y-4">
              {[
                { label: 'Sr. No.', value: viewingRecord.sr_no },
                { label: 'Tracking ID', value: viewingRecord.tracking_id },
                { label: 'Order ID', value: viewingRecord.order_id },
                { label: 'Docket Number', value: viewingRecord.docket_number },
                {
                  label: 'Dispatch Date',
                  value: viewingRecord.dispatch_date ? formatDate(viewingRecord.dispatch_date) : null,
                },
                {
                  label: 'Delivery Date',
                  value: viewingRecord.delivery_date ? formatDate(viewingRecord.delivery_date) : null,
                },
                { label: 'Status', value: viewingRecord.status },
              ].map(({ label, value }) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                  <dd className="text-navy-800 mt-0.5">{value || 'N/A'}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setViewingRecord(null)}
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

export default DispatchTrackingPage;
