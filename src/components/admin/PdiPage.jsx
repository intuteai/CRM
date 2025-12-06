import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate as importedFormatDate } from '../../utils/helpers';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ArrowDownUp, RefreshCw, Search, Edit2, MoreVertical, XCircle } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

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

function PdiPage({ socket: providedSocket }) {
  const [pdiReports, setPdiReports] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [formData, setFormData] = useState({
    report_link: '',
    inspection_date: '',
    status: 'Pending',
  });
  const [sortConfig, setSortConfig] = useState({ key: 'report_id', direction: 'desc' });
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [limit] = useState(10);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const hasFetched = useRef(false);
  const isFetching = useRef(false);

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

  const fetchPdiReports = useCallback(async () => {
    if (isFetching.current) return;
    
    isFetching.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const url = cursor
        ? `${BASE_URL}/api/pdi?limit=${limit}&cursor=${encodeURIComponent(cursor)}&force_refresh=true`
        : `${BASE_URL}/api/pdi?limit=${limit}&force_refresh=true`;
      
      console.log('Fetching PDI reports from:', url);
      
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
        setPdiReports(responseData.data);
        setTotalItems(responseData.total || 0);
        
        if (responseData.cursor && responseData.cursor !== cursor) {
          if (cursor !== null) {
            setCursorStack(prev => [...prev, cursor]);
          }
          setCursor(responseData.cursor);
        } else if (!responseData.cursor && responseData.data.length === 0) {
          if (cursorStack.length > 0) {
            // No-op: handled by prev/next navigation
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
      console.error('Error fetching PDI reports:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      toast.error(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [cursor, limit, cursorStack]);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchPdiReports();
      hasFetched.current = true;
    }

    const handleConnect = () => {
      console.log('Connected to Socket.IO in PdiPage');
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    };

    const handleConnectError = (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    };

    const handlePdiUpdate = ({ report_id, status, inspection_date, report_link }) => {
      setPdiReports((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        if (status === 'Deleted') {
          toast.info(`PDI report #${report_id} deleted`, { autoClose: 2000 });
          return prev.filter((report) => report.report_id !== report_id);
        }

        const reportIndex = prev.findIndex((report) => report.report_id === report_id);
        if (reportIndex === -1) return prev;

        const reportToUpdate = prev[reportIndex];
        if (
          reportToUpdate.status === status &&
          reportToUpdate.inspection_date === inspection_date &&
          reportToUpdate.report_link === report_link
        ) {
          return prev;
        }

        const updatedReports = [...prev];
        updatedReports[reportIndex] = {
          ...reportToUpdate,
          status,
          inspection_date,
          report_link,
        };

        toast.info(`PDI report #${report_id} updated`, { autoClose: 2000 });
        return updatedReports;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('pdiUpdate', handlePdiUpdate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('pdiUpdate', handlePdiUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchPdiReports, socket, providedSocket]);

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

  const filteredPdiReports = useMemo(() => {
    if (!Array.isArray(pdiReports)) return [];

    return pdiReports.filter((item) => {
      if (!item) return false;

      const searchFields = [
        String(item.report_id || ''),
        String(item.sr_no || ''),
        String(item.customer_id || ''),
        String(item.order_id || ''),
        String(item.status || ''),
        String(item.inspected_by || ''),
      ];

      return searchFields.some((field) =>
        field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [pdiReports, searchTerm]);

  const sortedPdiReports = useMemo(() => {
    if (!filteredPdiReports.length) return [];

    const sortableReports = [...filteredPdiReports];

    return sortableReports.sort((a, b) => {
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
  }, [filteredPdiReports, sortConfig]);

  const handleEdit = useCallback((report) => {
    setSelectedReport(report);
    setFormData({
      report_link: report.report_link || '',
      inspection_date: report.inspection_date
        ? new Date(report.inspection_date).toISOString().split('T')[0]
        : '',
      status: report.status || 'Pending',
    });
    setShowModal(true);
  }, []);

  const handleUpdate = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedReport) return;
      setUploading(true);

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/pdi/${selectedReport.report_id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            report_link: formData.report_link,
            inspection_date: formData.inspection_date,
            status: formData.status,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Update failed with status: ${response.status}`);
        }

        const updatedReport = await response.json();
        setPdiReports((prev) =>
          prev.map((r) => (r.report_id === updatedReport.report_id ? updatedReport : r))
        );
        setShowModal(false);
        toast.success(`PDI report #${updatedReport.report_id} updated successfully!`, {
          autoClose: 2000,
        });
      } catch (err) {
        console.error('Update error:', err);
        toast.error(err.message || 'Update failed', { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [selectedReport, formData]
  );

  const ActionsDropdown = useCallback(
    ({ report, onEdit }) => {
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
            aria-label={`Actions for PDI report ${report.report_id}`}
          >
            <MoreVertical size={20} />
          </button>
          {isOpen && (
            <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
              <button
                onClick={() => {
                  onEdit(report);
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
    if (cursorStack.length > 0) {
      const previousCursor = cursorStack.pop();
      setCursorStack([...cursorStack]);
      setCursor(previousCursor);
    } else {
      setCursor(null);
    }
  }, [cursorStack]);

  const handleNextPage = useCallback(() => {
    if (pdiReports.length > 0 && !isLoading) {
      const lastReport = pdiReports[pdiReports.length - 1];
      if (lastReport && lastReport.inspection_date) {
        if (cursor !== null) {
          setCursorStack(prev => [...prev, cursor]);
        }
        setCursor(lastReport.inspection_date);
      }
    }
  }, [pdiReports, cursor, isLoading]);

  const handleRefresh = useCallback(() => {
    setCursor(null);
    setCursorStack([]);
    hasFetched.current = false;
    fetchPdiReports();
  }, [fetchPdiReports]);

  if (isLoading && !pdiReports.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading PDI Reports...</div>
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
            onClick={() => {
              setError(null);
              hasFetched.current = false;
              setCursor(null);
              setCursorStack([]);
              fetchPdiReports();
            }}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (pdiReports.length === 0 && !isLoading) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="status"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No PDI Reports Yet</h2>
          <p className="text-gray-600 mb-6">
            Your database is empty. PDI reports will appear here once created!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        PDI Reports
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-pdi" className="sr-only">
              Search PDI Reports
            </label>
            <input
              id="search-pdi"
              ref={searchInputRef}
              type="text"
              placeholder="Search by Report ID, Customer ID, Order ID, Status, or Inspected By..."
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
            aria-label="Refresh PDI reports"
          >
            {isLoading && pdiReports.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && pdiReports.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="PDI Reports table"
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
                  { key: 'customer_id', label: 'Customer ID' },
                  { key: 'order_id', label: 'Order ID' },
                  { key: 'report_id', label: 'Report ID' },
                  { key: 'status', label: 'Status' },
                  { key: 'inspected_by', label: 'Inspected By' },
                  { key: 'inspection_date', label: 'Inspection Date' },
                  { key: 'report_link', label: 'PDI Report Link' },
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
              {sortedPdiReports.map((report) => (
                <tr
                  key={report.report_id}
                  className="border-t hover:bg-amber-50 transition-all duration-200"
                  role="row"
                >
                  <td className="py-4 px-3 text-gray-600 text-base">{report.sr_no}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.customer_id || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.order_id || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.report_id}</td>
                  <td
                    className={`py-4 px-3 text-base ${
                      report.status === 'Completed'
                        ? 'text-green-600'
                        : report.status === 'In Progress'
                        ? 'text-yellow-600'
                        : report.status === 'Failed'
                        ? 'text-red-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {report.status}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">{report.inspected_by || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {report.inspection_date ? formatDate(report.inspection_date) : 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {report.report_link ? (
                      <a
                        href={report.report_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        View Report
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ActionsDropdown report={report} onEdit={handleEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {sortedPdiReports.length} of {totalItems} PDI reports
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
                  disabled={pdiReports.length < limit || isLoading}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {sortedPdiReports.length === 0 && (
            <div
              className="text-center py-12 text-gray-500 flex flex-col items-center"
              role="alert"
            >
              <Search className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">No PDI reports found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && selectedReport && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
          role="dialog"
          aria-labelledby="edit-pdi-title"
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
              id="edit-pdi-title"
              className="text-2xl font-bold text-gray-800 mb-6"
            >
              Edit PDI Report #{selectedReport.report_id}
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  PDI Report Link
                </label>
                <input
                  type="url"
                  placeholder="Enter PDI report link"
                  value={formData.report_link}
                  onChange={(e) =>
                    setFormData({ ...formData, report_link: e.target.value })
                  }
                  className="w-full p-3 border rounded-lg shadow-sm"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Inspection Date
                </label>
                <input
                  type="date"
                  value={formData.inspection_date}
                  onChange={(e) =>
                    setFormData({ ...formData, inspection_date: e.target.value })
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
                  {['Pending', 'In Progress', 'Completed', 'Failed'].map((status) => (
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

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
        draggable
      />
    </div>
  );
}

export default PdiPage;