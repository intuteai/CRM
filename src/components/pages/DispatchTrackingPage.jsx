import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate as importedFormatDate } from '../../utils/helpers';
import { ArrowDownUp, RefreshCw, Search, Edit2, MoreVertical, XCircle } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from './ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

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

function DispatchTrackingPage({ socket: providedSocket }) {
  const [dispatchRecords, setDispatchRecords] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
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
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status: ${response.status}`);
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

  const ActionsDropdown = useCallback(
    ({ record, onEdit }) => {
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
            aria-label={`Actions for dispatch record ${record.tracking_id}`}
          >
            <MoreVertical size={20} />
          </button>
          {isOpen && (
            <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
              <button
                onClick={() => {
                  onEdit(record);
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
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading Dispatch Records...</div>
      </div>
    );
  }

  if (error && !showModal) return <ConnectionError onRetry={fetchDispatchRecords} />;

  if (dispatchRecords.length === 0 && !isLoading) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="status"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Dispatch Records Yet</h2>
          <p className="text-gray-600 mb-6">
            Your database is empty. Dispatch records will appear here once available!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Dispatch Tracking
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
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
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleRefresh}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh dispatch records"
          >
            {isLoading && dispatchRecords.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        {isLoading && dispatchRecords.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="Dispatch Tracking table"
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
                  { key: 'tracking_id', label: 'Tracking ID' },
                  { key: 'order_id', label: 'Order ID' },
                  { key: 'docket_number', label: 'Docket Number' },
                  { key: 'dispatch_date', label: 'Dispatch Date' },
                  { key: 'delivery_date', label: 'Delivery Date' },
                  { key: 'status', label: 'Status' },
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
              {sortedDispatchRecords.map((record) => (
                <tr
                  key={record.tracking_id}
                  className="border-t hover:bg-amber-50 transition-all duration-200"
                  role="row"
                >
                  <td className="py-4 px-3 text-gray-600 text-base">{record.sr_no}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{record.tracking_id}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{record.order_id || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{record.docket_number || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {record.dispatch_date ? formatDate(record.dispatch_date) : 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {record.delivery_date ? formatDate(record.delivery_date) : 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-base">
                    <span className={`px-2 py-1 rounded-full text-white text-xs font-medium ${
                      record.status === 'Delivered'          ? 'bg-green-600'  :
                      record.status === 'Partially Delivered'? 'bg-indigo-500' :
                      record.status === 'Shipped'            ? 'bg-blue-600'   :
                      record.status === 'Ready for Shipment' ? 'bg-teal-600'   :
                      record.status === 'Processing'         ? 'bg-yellow-600' :
                      record.status === 'Testing'            ? 'bg-purple-600' :
                      record.status === 'Cancelled'          ? 'bg-red-600'    :
                      'bg-amber-500'
                    }`}>
                      {record.status}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ActionsDropdown record={record} onEdit={handleEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {sortedDispatchRecords.length} of {totalItems} dispatch records
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={handlePrevPage}
                  disabled={offset === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={handleNextPage}
                  disabled={dispatchRecords.length < limit || isLoading}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
          {sortedDispatchRecords.length === 0 && (
            <div
              className="text-center py-12 text-gray-500 flex flex-col items-center"
              role="alert"
            >
              <Search className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">No dispatch records found matching your search.</p>
            </div>
          )}
        </div>
      </div>
      {showModal && selectedRecord && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
          role="dialog"
          aria-labelledby="edit-dispatch-title"
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
              id="edit-dispatch-title"
              className="text-2xl font-bold text-gray-800 mb-6"
            >
              Edit Dispatch Record #{selectedRecord.tracking_id}
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Tracking ID
                </label>
                <input
                  type="text"
                  placeholder="Enter Tracking ID"
                  value={formData.tracking_id}
                  onChange={(e) =>
                    setFormData({ ...formData, tracking_id: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Docket Number
                </label>
                <input
                  type="text"
                  placeholder="Enter Docket Number"
                  value={formData.docket_number}
                  onChange={(e) =>
                    setFormData({ ...formData, docket_number: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Dispatch Date
                </label>
                <input
                  type="date"
                  value={formData.dispatch_date}
                  onChange={(e) =>
                    setFormData({ ...formData, dispatch_date: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Delivery Date
                </label>
                <input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) =>
                    setFormData({ ...formData, delivery_date: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
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

export default DispatchTrackingPage;