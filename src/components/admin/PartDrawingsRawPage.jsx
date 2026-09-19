import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate as importedFormatDate } from '../../utils/helpers';
import { ArrowDownUp, RefreshCw, Search, Edit2, MoreVertical, X, Eye } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Fallback formatDate function
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  if (typeof importedFormatDate === 'function') {
    return importedFormatDate(dateString);
  }
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

// Simple Error Boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12 text-red-600 text-xl font-medium max-w-4xl mx-auto bg-red-50 rounded-xl shadow-sm">
          Something went wrong: {this.state.error?.message || 'Unknown error'}
        </div>
      );
    }
    return this.props.children;
  }
}

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

function ActionsDropdown({ drawing, onEdit }) {
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
        aria-label={`Actions for drawing ${drawing.srNo}`}
      >
        <MoreVertical size={18} className="text-gray-500" />
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-40 bg-white shadow-lg rounded-lg border border-navy-100 py-1">
          <button
            onClick={() => {
              onEdit(drawing);
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

function PartDrawingsRawPage({ socket: providedSocket }) {
  const [drawings, setDrawings] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const [viewingDrawing, setViewingDrawing] = useState(null);
  const [formData, setFormData] = useState({ drawingLink: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });
  const [page, setPage] = useState(0);
  const [limit] = useState(10);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const modalRef = useRef(null);
  const debouncedSearch = useDebounce(searchInput, 300);
  const { notifySuccess, notifyError } = useNotify();

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

  const fetchDrawings = useCallback(async (currentPage, searchTerm = '') => {
    setIsLoading(true);
    setError(null);
    const controller = new AbortController();

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing.');

      const url = `${BASE_URL}/api/part-drawings-raw?limit=${limit}&offset=${currentPage * limit}&force_refresh=true&search=${encodeURIComponent(searchTerm)}`;
      console.log('Fetching raw part drawings from:', url);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Server responded with status: ${response.status}`);
      }

      const responseData = await response.json();
      console.log('Fetched response:', responseData);

      if (!responseData.drawings || typeof responseData.total !== 'number') {
        throw new Error('Invalid data format: Expected { drawings: array, total: number }');
      }

      const normalizedData = responseData.drawings.map((item) => ({
        srNo: item.srNo || null,
        drawingId: item.drawingId || 0,
        productName: item.productName || 'N/A',
        itemName: item.itemName || 'N/A',
        drawingLink: item.drawingLink || '',
        updatedAt: item.updatedAt || '',
        productId: item.productId || null,
      }));

      setDrawings(normalizedData);
      setTotalItems(responseData.total);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error fetching raw part drawings:', err);
        const errorMessage = err.message || 'Network error. Please try again later.';
        setError(errorMessage);
        notifyError(errorMessage, { autoClose: 3000 });
        setDrawings([]);
      }
    } finally {
      setIsLoading(false);
    }

    return () => controller.abort();
  }, [limit]);

  // Initial Fetch and Page/Search Change
  useEffect(() => {
    let mounted = true;
    fetchDrawings(page, debouncedSearch).then(cleanup => {
      if (!mounted) cleanup();
    });
    return () => {
      mounted = false;
    };
  }, [fetchDrawings, page, debouncedSearch]);

  // Reset page when search term changes
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  // Socket Connection Management
  useEffect(() => {
    if (!socket) return;

    const handleDrawingsUpdate = () => {
      fetchDrawings(page, debouncedSearch); // Refetch to ensure consistency
    };

    socket.on('partDrawingsRawUpdate', handleDrawingsUpdate);

    return () => {
      socket.off('partDrawingsRawUpdate', handleDrawingsUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [socket, providedSocket, page, debouncedSearch, fetchDrawings]);

  // Modal Focus Trap
  useEffect(() => {
    if (showModal) {
      const firstInput = modalRef.current?.querySelector('input');
      if (firstInput) firstInput.focus();

      const handleTabKey = (e) => {
        if (e.key === 'Tab') {
          const focusableElements = modalRef.current?.querySelectorAll(
            'button, input, a, select, textarea'
          );
          if (!focusableElements) return;
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      document.addEventListener('keydown', handleTabKey);
      return () => document.removeEventListener('keydown', handleTabKey);
    }
  }, [showModal]);

  const sortedDrawings = useMemo(() => {
    return [...drawings].sort((a, b) => {
      let aValue = a[sortConfig.key] ?? '';
      let bValue = b[sortConfig.key] ?? '';

      if (sortConfig.key === 'updatedAt') {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      } else if (['srNo', 'drawingId', 'productId'].includes(sortConfig.key)) {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else {
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [drawings, sortConfig]);

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchInput('');
      setPage(0);
      searchInputRef.current?.focus();
    }
  }, []);

  const handleEdit = useCallback((drawing) => {
    setSelectedDrawing(drawing);
    setFormData({ drawingLink: drawing.drawingLink || '' });
    setShowModal(true);
  }, []);

  const handleUpdate = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedDrawing) return;
      setUploading(true);

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/part-drawings-raw/${selectedDrawing.srNo}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            drawing_link: formData.drawingLink.trim(),
            product_id: selectedDrawing.productId,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || `Update failed with status: ${response.status}`);
        }

        notifySuccess(`Drawing #${selectedDrawing.srNo} updated successfully!`, {
          autoClose: 2000,
        });
        setShowModal(false);
        fetchDrawings(page, debouncedSearch); // Refetch to ensure consistency
      } catch (err) {
        console.error('Update error:', err);
        notifyError(err.message || 'Update failed', { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [selectedDrawing, formData, page, debouncedSearch, fetchDrawings]
  );

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

  const handleRefresh = useCallback(() => {
    setSearchInput('');
    setPage(0);
    fetchDrawings(0, '');
  }, [fetchDrawings]);

  if (isLoading && !drawings.length) {
    return (
      <ErrorBoundary>
        <div className="flex items-center justify-center py-24" aria-live="polite">
          <div className="flex items-center gap-3 text-gray-500 text-lg">
            <svg className="animate-spin h-6 w-6 text-gold-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading Raw Part Drawings...
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (error && !showModal) return <ConnectionError onRetry={() => fetchDrawings(0, '')} />;

  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-grow min-w-[220px]">
            <label htmlFor="search-drawings" className="sr-only">
              Search Raw Part Drawings
            </label>
            <input
              id="search-drawings"
              ref={searchInputRef}
              type="text"
              placeholder="Search by Sr. No., Drawing ID, Product Name, Item Name, or Product ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
            />
            <Search size={17} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
            {searchInput && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-navy-800 transition-colors"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
            disabled={isLoading}
            aria-label="Refresh raw part drawings"
          >
            <RefreshCw size={16} />
            {isLoading && drawings.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && drawings.length > 0 && (
          <div className="text-gray-500 text-sm text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        {sortedDrawings.length === 0 && !isLoading ? (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-navy-100 text-center" role="status">
            <Search className="mx-auto mb-4 text-gray-300" size={40} />
            <h2 className="font-display text-xl font-bold text-navy-800 mb-2">No Raw Part Drawings Found</h2>
            <p className="text-gray-500 mb-6">
              No drawings match your search or filters.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
            <table
              className="w-full text-left border-collapse"
              role="grid"
              aria-label="Raw Part Drawings table"
              ref={tableRef}
              tabIndex={0}
            >
              <thead>
                <tr className="bg-navy-50 text-navy-800" role="row">
                  {[
                    { key: 'drawingId', label: 'Drawing ID' },
                    { key: 'productName', label: 'Product Name' },
                    { key: 'itemName', label: 'Item Name' },
                    { key: 'updatedAt', label: 'Updated At' },
                    { key: 'actions', label: 'Actions' },
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      className={`px-5 py-3 text-sm font-semibold ${
                        key !== 'actions' ? 'cursor-pointer hover:bg-navy-100' : ''
                      } transition-colors whitespace-nowrap border-b border-navy-100`}
                      onClick={() => key !== 'actions' && handleSort(key)}
                      onKeyDown={(e) =>
                        key !== 'actions' &&
                        (e.key === 'Enter' || e.key === ' ') &&
                        (e.preventDefault(), handleSort(key))
                      }
                      tabIndex={key !== 'actions' ? 0 : undefined}
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
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {sortedDrawings.map((drawing) => (
                  <tr
                    key={drawing.srNo}
                    className="hover:bg-navy-50/60 transition-colors"
                    role="row"
                  >
                    <td className="px-5 py-3.5 text-navy-800 font-medium">{drawing.drawingId || 'N/A'}</td>
                    <td className="px-5 py-3.5 text-gray-600">{drawing.productName}</td>
                    <td className="px-5 py-3.5 text-gray-600">{drawing.itemName}</td>
                    <td className="px-5 py-3.5 text-gray-600">
                      {drawing.updatedAt ? formatDate(drawing.updatedAt) : 'N/A'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setViewingDrawing(drawing)}
                          className="flex items-center gap-1.5 text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors"
                          aria-label={`View details for drawing ${drawing.drawingId}`}
                        >
                          <Eye size={15} />
                          View
                        </button>
                        <ActionsDropdown drawing={drawing} onEdit={handleEdit} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalItems > 0 && (
              <div className="flex flex-wrap gap-2 justify-between items-center p-4 bg-navy-50 border-t border-navy-100">
                <div className="text-gray-500 text-sm">
                  Showing {(page * limit) + 1}–{Math.min((page + 1) * limit, totalItems)} of {totalItems} drawings
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

        {showModal && selectedDrawing && (
          <div
            className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-labelledby="edit-drawing-title"
            ref={modalRef}
          >
            <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
                aria-label="Close edit modal"
              >
                <X size={18} />
              </button>
              <h2 id="edit-drawing-title" className="font-display text-xl font-bold text-navy-800 mb-5">
                Edit Drawing #{selectedDrawing.srNo}
              </h2>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">Drawing Link</label>
                  <input
                    type="url"
                    placeholder="Enter drawing link"
                    value={formData.drawingLink}
                    onChange={(e) => setFormData({ ...formData, drawingLink: e.target.value })}
                    className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 placeholder-gray-400"
                    aria-required="true"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-5 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
                  >
                    {uploading ? 'Updating...' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {viewingDrawing && (
          <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => setViewingDrawing(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
              <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
                Drawing #{viewingDrawing.drawingId}
              </h2>
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sr. No.</dt>
                  <dd className="text-navy-800 mt-0.5 break-words">{viewingDrawing.srNo || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Product Name</dt>
                  <dd className="text-navy-800 mt-0.5 break-words">{viewingDrawing.productName || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Item Name</dt>
                  <dd className="text-navy-800 mt-0.5 break-words">{viewingDrawing.itemName || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Product ID</dt>
                  <dd className="text-navy-800 mt-0.5 break-words">{viewingDrawing.productId || 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Drawing Link</dt>
                  <dd className="text-navy-800 mt-0.5 break-words">
                    {viewingDrawing.drawingLink ? (
                      <a
                        href={viewingDrawing.drawingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold-600 hover:text-gold-500 underline transition-colors"
                      >
                        View Drawing
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Updated At</dt>
                  <dd className="text-navy-800 mt-0.5 break-words">
                    {viewingDrawing.updatedAt ? formatDate(viewingDrawing.updatedAt) : 'N/A'}
                  </dd>
                </div>
              </dl>
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setViewingDrawing(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default PartDrawingsRawPage;
