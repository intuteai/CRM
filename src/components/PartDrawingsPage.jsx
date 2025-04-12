import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate as importedFormatDate } from '../utils/helpers';
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

function PartDrawingsPage({ socket: providedSocket }) {
  const [drawings, setDrawings] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const [formData, setFormData] = useState({ drawingLink: '' }); // Removed updatedAt
  const [sortConfig, setSortConfig] = useState({ key: 'drawingId', direction: 'desc' });
  const [page, setPage] = useState(0);
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

  const fetchDrawings = useCallback(async () => {
    if (isFetching.current) return;
    
    isFetching.current = true;
    setIsLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing.');
      
      const url = `${BASE_URL}/api/part-drawings?limit=${limit}&offset=${page * limit}&force_refresh=true`;
      console.log('Fetching part drawings from:', url);
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status: ${response.status}`);
      }

      const responseData = await response.json();
      console.log('Fetched response:', responseData);
      
      if (!Array.isArray(responseData)) {
        throw new Error('Invalid data format: Expected an array');
      }
      
      const normalizedData = responseData.map((item) => ({
        srNo: item.srNo || null,
        drawingId: item.drawingId || 0,
        productName: item.productName || 'N/A',
        itemName: item.itemName || 'N/A',
        drawingLink: item.drawingLink || '',
        updatedAt: item.updatedAt || '',
        productId: item.productId || null,
      }));
      
      setDrawings(normalizedData);
      setTotalItems((prev) => Math.max(prev, (page + 1) * limit));
    } catch (err) {
      console.error('Error fetching part drawings:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      toast.error(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [page, limit]);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchDrawings();
      hasFetched.current = true;
    }

    if (!socket) {
      console.warn('Socket not provided to PartDrawingsPage');
      return;
    }

    const handleConnect = () => {
      console.log('Connected to Socket.IO in PartDrawingsPage');
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    };

    const handleConnectError = (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    };

    const handleDrawingsUpdate = ({ srNo, drawingId, productName, itemName, drawingLink, updatedAt, productId, status }) => {
      setDrawings((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        if (status === 'Deleted') {
          toast.info(`Drawing #${srNo} deleted`, { autoClose: 2000 });
          return prev.filter((drawing) => drawing.srNo !== srNo);
        }

        const drawingIndex = prev.findIndex((drawing) => drawing.srNo === srNo);
        if (drawingIndex === -1) return prev;

        const drawingToUpdate = prev[drawingIndex];
        if (
          drawingToUpdate.drawingId === drawingId &&
          drawingToUpdate.productName === productName &&
          drawingToUpdate.itemName === itemName &&
          drawingToUpdate.drawingLink === drawingLink &&
          drawingToUpdate.updatedAt === updatedAt &&
          drawingToUpdate.productId === productId
        ) {
          return prev;
        }

        const updatedDrawings = [...prev];
        updatedDrawings[drawingIndex] = {
          ...drawingToUpdate,
          drawingId,
          productName,
          itemName,
          drawingLink,
          updatedAt,
          productId,
        };

        toast.info(`Drawing #${srNo} updated`, { autoClose: 2000 });
        return updatedDrawings;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('partDrawingsUpdate', handleDrawingsUpdate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('partDrawingsUpdate', handleDrawingsUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchDrawings, socket, providedSocket]);

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

  const filteredDrawings = useMemo(() => {
    if (!Array.isArray(drawings)) return [];

    return drawings.filter((item) => {
      if (!item) return false;

      const searchFields = [
        String(item.srNo || ''),
        String(item.drawingId || ''),
        String(item.productName || ''),
        String(item.itemName || ''),
        String(item.productId || ''),
      ];

      return searchFields.some((field) =>
        field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [drawings, searchTerm]);

  const sortedDrawings = useMemo(() => {
    if (!filteredDrawings.length) return [];

    const sortableDrawings = [...filteredDrawings];

    return sortableDrawings.sort((a, b) => {
      let aValue = a[sortConfig.key] ?? '';
      let bValue = b[sortConfig.key] ?? '';

      if (sortConfig.key === 'drawingId' || sortConfig.key === 'srNo' || sortConfig.key === 'productId') {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else if (sortConfig.key === 'updatedAt') {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      } else {
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredDrawings, sortConfig]);

  const handleEdit = useCallback((drawing) => {
    setSelectedDrawing(drawing);
    setFormData({ drawingLink: drawing.drawingLink || '' }); // Removed updatedAt
    setShowModal(true);
  }, []);

  const handleUpdate = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedDrawing) return;
      setUploading(true);

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BASE_URL}/api/part-drawings/${selectedDrawing.srNo}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            drawing_link: formData.drawingLink.trim(),
            product_id: selectedDrawing.productId,
            // updated_at is omitted, letting the backend set it
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Update failed with status: ${response.status}`);
        }

        const updatedDrawing = await response.json();
        setDrawings((prev) =>
          prev.map((d) => (d.srNo === updatedDrawing.srNo ? updatedDrawing : d))
        );
        setShowModal(false);
        toast.success(`Drawing #${updatedDrawing.srNo} updated successfully!`, {
          autoClose: 2000,
        });
      } catch (err) {
        console.error('Update error:', err);
        toast.error(err.message || 'Update failed', { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [selectedDrawing, formData]
  );

  const ActionsDropdown = useCallback(
    ({ drawing, onEdit }) => {
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
            aria-label={`Actions for drawing ${drawing.srNo}`}
          >
            <MoreVertical size={20} />
          </button>
          {isOpen && (
            <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
              <button
                onClick={() => {
                  onEdit(drawing);
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
    if (page > 0) {
      setPage((prev) => prev - 1);
    }
  }, [page]);

  const handleNextPage = useCallback(() => {
    if (drawings.length === limit && !isLoading) {
      setPage((prev) => prev + 1);
    }
  }, [drawings, limit, isLoading]);

  const handleRefresh = useCallback(() => {
    setPage(0);
    hasFetched.current = false;
    fetchDrawings();
  }, [fetchDrawings]);

  if (isLoading && !drawings.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading Part Drawings...</div>
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
              setPage(0);
              fetchDrawings();
            }}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (drawings.length === 0 && !isLoading) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="status"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Part Drawings Yet</h2>
          <p className="text-gray-600 mb-6">
            Your database is empty. Drawings will appear here once created!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Finished Goods Drawings
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-drawings" className="sr-only">
              Search Part Drawings
            </label>
            <input
              id="search-drawings"
              ref={searchInputRef}
              type="text"
              placeholder="Search by Sr. No., Drawing ID, Product Name, Item Name, or Product ID..."
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
            aria-label="Refresh part drawings"
          >
            {isLoading && drawings.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && drawings.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="Part Drawings table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50" role="row">
                {[
                  { key: 'srNo', label: 'Sr. No.' },
                  { key: 'drawingId', label: 'Drawing ID' },
                  { key: 'productName', label: 'Product Name' },
                  { key: 'itemName', label: 'Item Name' },
                  { key: 'productId', label: 'Product ID' },
                  { key: 'drawingLink', label: 'Drawing Link' },
                  { key: 'updatedAt', label: 'Updated At' },
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
              {sortedDrawings.map((drawing) => (
                <tr
                  key={drawing.srNo}
                  className="border-t hover:bg-amber-50 transition-all duration-200"
                  role="row"
                >
                  <td className="py-4 px-3 text-gray-600 text-base">{drawing.srNo || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{drawing.drawingId || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{drawing.productName}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{drawing.itemName}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">{drawing.productId || 'N/A'}</td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {drawing.drawingLink ? (
                      <a
                        href={drawing.drawingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                        aria-label={`View drawing for ${drawing.productName}`}
                      >
                        View Drawing
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    {drawing.updatedAt ? formatDate(drawing.updatedAt) : 'N/A'}
                  </td>
                  <td className="py-4 px-3 text-gray-600 text-base">
                    <ActionsDropdown drawing={drawing} onEdit={handleEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {sortedDrawings.length} of {totalItems} drawings
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
                  disabled={drawings.length < limit || isLoading}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {sortedDrawings.length === 0 && (
            <div
              className="text-center py-12 text-gray-500 flex flex-col items-center"
              role="alert"
            >
              <Search className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">No drawings found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && selectedDrawing && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
          role="dialog"
          aria-labelledby="edit-drawing-title"
        >
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-[500px] relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close edit modal"
            >
              <XCircle size={24} />
            </button>
            <h2 id="edit-drawing-title" className="text-2xl font-bold text-gray-800 mb-6">
              Edit Drawing #{selectedDrawing.srNo}
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-2">Drawing Link</label>
                <input
                  type="url"
                  placeholder="Enter drawing link"
                  value={formData.drawingLink}
                  onChange={(e) => setFormData({ ...formData, drawingLink: e.target.value })}
                  className="w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-required="true"
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

export default PartDrawingsPage;