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

function PartDrawingsRawPage({ socket: providedSocket }) {
  const [drawings, setDrawings] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const [formData, setFormData] = useState({ drawingLink: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'updatedAt', direction: 'desc' });
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

      const url = `${BASE_URL}/api/part-drawings-raw?limit=${limit}&offset=${page * limit}&force_refresh=true&search=${encodeURIComponent(searchTerm)}`;
      console.log('Fetching raw part drawings from:', url);

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
      console.error('Error fetching raw part drawings:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      toast.error(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [page, limit, searchTerm]);

  useEffect(() => {
    if (!hasFetched.current || searchTerm !== '') {
      fetchDrawings();
      hasFetched.current = true;
    }
  }, [fetchDrawings, page, searchTerm]);

  useEffect(() => {
    const handleConnect = () => {
      console.log('Connected to Socket.IO in PartDrawingsRawPage');
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    };

    const handleConnectError = (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    };

    const handleDrawingsUpdate = ({ type, item, itemId, timestamp }) => {
      setDrawings((prev) => {
        if (!Array.isArray(prev)) return prev || [];

        if (type === 'CREATE') {
          const newDrawing = {
            srNo: item.srNo || null,
            drawingId: item.drawingId || 0,
            productName: item.productName || 'N/A',
            itemName: item.itemName || 'N/A',
            drawingLink: item.drawingLink || '',
            updatedAt: item.updatedAt || timestamp,
            productId: item.productId || null,
          };
          // Only add if on the first page or matches search
          if (page === 0 && (!searchTerm || newDrawing.itemName.toLowerCase().includes(searchTerm.toLowerCase()))) {
            toast.info(`New drawing #${item.srNo} added`, { autoClose: 2000 });
            return [newDrawing, ...prev].slice(0, limit);
          }
          setTotalItems((prev) => prev + 1);
          return prev;
        }

        if (type === 'UPDATE') {
          const drawingIndex = prev.findIndex((drawing) => drawing.srNo === item.srNo);
          if (drawingIndex === -1) return prev;

          const drawingToUpdate = prev[drawingIndex];
          const updatedDrawing = {
            ...drawingToUpdate,
            drawingId: item.drawingId || drawingToUpdate.drawingId,
            productName: item.productName || drawingToUpdate.productName,
            itemName: item.itemName || drawingToUpdate.itemName,
            drawingLink: item.drawingLink || drawingToUpdate.drawingLink,
            updatedAt: item.updatedAt || timestamp,
            productId: item.productId || drawingToUpdate.productId,
          };

          if (
            drawingToUpdate.drawingId === updatedDrawing.drawingId &&
            drawingToUpdate.productName === updatedDrawing.productName &&
            drawingToUpdate.itemName === updatedDrawing.itemName &&
            drawingToUpdate.drawingLink === updatedDrawing.drawingLink &&
            drawingToUpdate.updatedAt === updatedDrawing.updatedAt &&
            drawingToUpdate.productId === updatedDrawing.productId
          ) {
            return prev;
          }

          const updatedDrawings = [...prev];
          updatedDrawings[drawingIndex] = updatedDrawing;
          toast.info(`Drawing #${item.srNo} updated`, { autoClose: 2000 });
          return updatedDrawings;
        }

        if (type === 'DELETE') {
          const drawingIndex = prev.findIndex((drawing) => drawing.srNo === itemId);
          if (drawingIndex === -1) return prev;

          toast.info(`Drawing #${itemId} deleted`, { autoClose: 2000 });
          setTotalItems((prev) => prev - 1);
          return prev.filter((drawing) => drawing.srNo !== itemId);
        }

        return prev;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('partDrawingsRawUpdate', handleDrawingsUpdate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('partDrawingsRawUpdate', handleDrawingsUpdate);
      if (!providedSocket) socket.disconnect();
    };
  }, [socket, providedSocket, page, searchTerm, limit]);

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
          const errorText = await response.text();
          throw new Error(errorText || `Update failed with status: ${response.status}`);
        }

        const updatedDrawing = await response.json();
        setDrawings((prev) =>
          prev.map((d) =>
            d.srNo === updatedDrawing.srNo
              ? {
                  ...d,
                  drawingId: updatedDrawing.drawingId || d.drawingId,
                  productName: updatedDrawing.productName || d.productName,
                  itemName: updatedDrawing.itemName || d.itemName,
                  drawingLink: updatedDrawing.drawingLink || d.drawingLink,
                  updatedAt: updatedDrawing.updatedAt || d.updatedAt,
                  productId: updatedDrawing.productId || d.productId,
                }
              : d
          )
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
    if (page < Math.ceil(totalItems / limit) - 1 && !isLoading) {
      setPage((prev) => prev + 1);
    }
  }, [totalItems, limit, isLoading]);

  const handleRefresh = useCallback(() => {
    setPage(0);
    setSearchTerm('');
    hasFetched.current = false;
    fetchDrawings();
  }, [fetchDrawings]);

  if (isLoading && !drawings.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading Raw Part Drawings...</div>
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
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Raw Part Drawings Yet</h2>
          <p className="text-gray-600 mb-6">
            Your database is empty or no drawings match your search. Try refreshing or adjusting your search.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Raw Part Drawings
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-drawings" className="sr-only">
              Search Raw Part Drawings
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
            aria-label="Refresh raw part drawings"
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
            aria-label="Raw Part Drawings table"
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
              {drawings.map((drawing) => (
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
                Showing {drawings.length} of {totalItems} drawings
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
                  disabled={page >= Math.ceil(totalItems / limit) - 1 || isLoading}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {drawings.length === 0 && (
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

export default PartDrawingsRawPage;