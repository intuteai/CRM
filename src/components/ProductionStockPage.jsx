import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowDownUp, Search, ChevronLeft, ChevronRight, Edit2, MoreVertical, Package,
  XCircle, Eye, Download, Upload, PlusCircle
} from 'lucide-react';
import { debounce } from 'lodash';
import { io } from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
const formatDate = (dateString) => {
  const date = new Date(dateString);
  return `${date.toLocaleDateString('en-IN')} ${date.toLocaleTimeString('en-IN')}`;
};

const useFetchStock = ({ limit, offset }) => {
  const [stockItems, setStockItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    let isMounted = true;
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication token missing. Please log in again.");
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const url = `${backendUrl}/api/stock?limit=${limit}&offset=${offset}&force_refresh=true`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Stock fetch failed: ${response.statusText}`);
      }
      const { data, total } = await response.json();
      if (isMounted) {
        const normalizedData = data.map(item => ({
          ...item,
          price: item.price !== null ? Number(item.price) : 0,
          stockQuantity: item.stockQuantity || 0,
          description: item.description || '',
          productCode: item.productCode,
          productName: item.productName,
          qtyRequired: item.qtyRequired || 0,
          productId: item.productId,
          createdAt: item.createdAt,
        }));
        setStockItems(normalizedData);
        setTotalItems(total || 0);
        setError(null);
      }
    } catch (err) {
      if (isMounted) setError(err.message);
    } finally {
      if (isMounted) setIsLoading(false);
    }
    return () => { isMounted = false; };
  }, [limit, offset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { stockItems, totalItems, isLoading, error, refetchData: fetchData };
};

function ProductionStockPage() {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'productId', direction: 'desc' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState('');
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProductDescription, setSelectedProductDescription] = useState('');
  const tableRef = useRef(null);
  const fileInputRef = useRef(null);

  const { stockItems, totalItems, isLoading, error, refetchData } = useFetchStock({ limit: itemsPerPage, offset: page * itemsPerPage });

  const debouncedSearch = debounce((value) => setSearchTerm(value.toLowerCase()), 300);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const socket = io(backendUrl, { withCredentials: false, transports: ['websocket'] });
    socket.on('connect', () => {
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    });
    socket.on('connect_error', (err) => {
      console.error('Socket error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: false });
    });
    socket.on('stockUpdate', ({ product_id, stock_quantity }) => {
      setStockItems(prev => {
        const itemIndex = prev.findIndex(item => item.productId === product_id);
        if (itemIndex === -1) {
          refetchData();
          return prev;
        }
        const updatedItems = [...prev];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], stockQuantity: stock_quantity };
        toast.info(`Stock for ${updatedItems[itemIndex].productName} updated to ${stock_quantity}`, { autoClose: 2000 });
        return updatedItems;
      });
      if (tableRef.current) tableRef.current.focus();
    });
    return () => socket.disconnect();
  }, [refetchData]);

  const generateQRCode = useCallback(async (productCode, productName, description, elementId) => {
    try {
      const data = JSON.stringify({
        productCode,
        productName,
        description: description || 'No description available',
      });
      await QRCode.toCanvas(document.getElementById(elementId), data, {
        width: 200,
        margin: 2,
        errorCorrectionLevel: 'H',
      });
    } catch (err) {
      console.error('QR code generation failed:', err);
      toast.error('Failed to generate QR code', { autoClose: 3000 });
    }
  }, []);

  useEffect(() => {
    if (showBarcodeModal && selectedBarcode) {
      generateQRCode(selectedBarcode, selectedProductName, selectedProductDescription, 'qrcode-canvas');
    }
  }, [showBarcodeModal, selectedBarcode, selectedProductName, selectedProductDescription, generateQRCode]);

  const validateImportRow = useCallback((row, index) => {
    const errors = [];
    if (!row['Product Name']?.trim()) errors.push(`Row ${index + 1}: Product Name is required`);
    if (!row['Product Code']?.trim() || String(row['Product Code']).trim().length !== 10) {
      errors.push(`Row ${index + 1}: Product Code must be exactly 10 characters`);
    }
    const stockQuantity = parseInt(row['Stock Quantity']);
    if (isNaN(stockQuantity) || stockQuantity < 0 || !Number.isInteger(Number(row['Stock Quantity']))) {
      errors.push(`Row ${index + 1}: Stock Quantity must be a non-negative integer`);
    }
    const price = parseFloat(String(row['Price (₹)'] || '0').replace(/[^0-9.]/g, ''));
    if (isNaN(price) || price < 0) errors.push(`Row ${index + 1}: Price must be a non-negative number`);
    return errors;
  }, []);

  const importFromExcel = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        if (!jsonData.length) {
          toast.error('Excel file is empty', { autoClose: 3000 });
          return;
        }
        const errors = [];
        const validRows = [];
        jsonData.forEach((row, index) => {
          const rowErrors = validateImportRow(row, index);
          if (rowErrors.length) errors.push(...rowErrors);
          else {
            validRows.push({
              productName: String(row['Product Name'] || '').trim(),
              productCode: String(row['Product Code'] || '').trim(),
              stockQuantity: parseInt(row['Stock Quantity'] || 0),
              price: parseFloat(String(row['Price (₹)'] || '0').replace(/[^0-9.]/g, '')),
              description: String(row['Description'] || '').trim() || undefined,
              qtyRequired: parseInt(row['Qty Required'] || 0),
              productId: row['Product ID'] ? parseInt(row['Product ID']) : undefined,
            });
          }
        });
        if (errors.length) {
          errors.forEach(error => toast.error(error, { autoClose: 5000 }));
        }
        if (!validRows.length) {
          toast.error('No valid rows to import.', { autoClose: 5000 });
          return;
        }
        const token = localStorage.getItem('token');
        let createdCount = 0, updatedCount = 0, failedCount = 0;
        for (const row of validRows) {
          try {
            const { productId, ...body } = row;
            const url = productId ? `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/stock/${productId}` : `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/stock`;
            const method = productId ? 'PUT' : 'POST';
            const response = await fetch(url, {
              method,
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              credentials: 'include',
            });
            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `Failed to ${productId ? 'update' : 'create'} product`);
            }
            if (productId) updatedCount++;
            else createdCount++;
          } catch (err) {
            failedCount++;
            toast.error(`Row ${validRows.indexOf(row) + 1}: ${err.message}`, { autoClose: 3000 });
          }
        }
        if (createdCount || updatedCount) {
          await refetchData();
          setPage(0);
          toast.success(`Imported: ${createdCount} created, ${updatedCount} updated${failedCount ? `, ${failedCount} failed` : ''}`, { autoClose: 5000 });
        } else {
          toast.error(`Import failed: ${failedCount} rows could not be processed`, { autoClose: 5000 });
        }
      };
      reader.readAsArrayBuffer(file);
      event.target.value = '';
    } catch (err) {
      toast.error(`Import failed: ${err.message}`, { autoClose: 3000 });
    }
  }, [validateImportRow, refetchData]);

  const exportToExcel = useCallback(() => {
    const data = stockItems.map(item => ({
      'Product ID': item.productId || 'N/A',
      'Product Code': item.productCode || 'N/A',
      'Product Name': item.productName || 'N/A',
      'Description': item.description || 'N/A',
      'Stock Quantity': Number(item.stockQuantity) || 0,
      'Qty Required': Number(item.qtyRequired) || 0,
      'Price (₹)': formatCurrency(Number(item.price)),
      'Created At (IST)': item.createdAt ? formatDate(item.createdAt) : 'N/A',
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Raw Materials');
    const colWidths = data.reduce((acc, row) => {
      Object.keys(row).forEach((key, idx) => {
        const value = String(row[key]).replace(/<[^>]*>/g, '');
        acc[idx] = Math.max(acc[idx] || 10, value.length + 2);
      });
      return acc;
    }, []);
    worksheet['!cols'] = colWidths.map(width => ({ wch: width }));
    XLSX.writeFile(workbook, 'Raw_Material_Inventory.xlsx');
    toast.success('Raw Materials exported to Excel!', { autoClose: 2000 });
  }, [stockItems]);

  const filteredStock = stockItems.filter(item => {
    return (
      item.productId.toString().includes(searchTerm) ||
      item.productName.toLowerCase().includes(searchTerm) ||
      item.productCode.toLowerCase().includes(searchTerm)
    );
  });

  const sortedStock = filteredStock.sort((a, b) => {
    let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
    if (sortConfig.key === 'price' || sortConfig.key === 'stockQuantity' || sortConfig.key === 'qtyRequired' || sortConfig.key === 'productId') {
      aValue = Number(aValue);
      bValue = Number(bValue);
    } else if (sortConfig.key === 'createdAt') {
      aValue = new Date(aValue || 0);
      bValue = new Date(bValue || 0);
    }
    return aValue < bValue ? (sortConfig.direction === 'asc' ? -1 : 1) : aValue > bValue ? (sortConfig.direction === 'asc' ? 1 : -1) : 0;
  });

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    debouncedSearch(value);
  };

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  }, []);

  const showDescription = useCallback((description) => {
    setSelectedDescription(description || 'No description available');
    setShowDescriptionModal(true);
  }, []);

  const showBarcode = useCallback((productCode, productName, description) => {
    setSelectedBarcode(productCode);
    setSelectedProductName(productName);
    setSelectedProductDescription(description || 'No description available');
    setShowBarcodeModal(true);
  }, []);

  const ActionsDropdown = ({ item, onEdit }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label={`Actions for product ${item.productName}`}
        >
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-20 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            <button
              onClick={() => { onEdit(item); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
          </div>
        )}
      </div>
    );
  };

  if (isLoading && !stockItems.length) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center" aria-live="polite">
      <div className="text-gray-600 text-xl animate-pulse">Loading raw materials...</div>
    </div>
  );

  if (error && !showCreateForm && !showEditForm) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center" role="alert">
      <div className="text-red-700 text-lg">{error}</div>
      <button
        onClick={() => refetchData()}
        className="ml-4 p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Production Raw Material Inventory</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-input" className="sr-only">Search raw materials</label>
            <input
              id="search-input"
              type="text"
              placeholder="Search by ID, Name, or Code..."
              value={searchInput}
              onChange={handleSearchChange}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          </div>
          <button
            onClick={() => refetchData()}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-md"
            disabled={isLoading}
            aria-label="Refresh raw materials"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading}
            aria-label="Create new raw material"
          >
            <PlusCircle className="mr-2" size={20} /> Add Item
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading}
            aria-label="Import from Excel"
          >
            <Upload className="mr-2" size={20} /> Import from Excel
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={importFromExcel}
            accept=".xlsx,.xls"
            className="hidden"
            aria-hidden="true"
          />
          <button
            onClick={exportToExcel}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading || !sortedStock.length}
            aria-label="Export to Excel"
          >
            <Download className="mr-2" size={20} /> Export to Excel
          </button>
        </div>

        {isLoading && stockItems.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left min-w-[1200px]" role="grid" ref={tableRef} tabIndex={0}>
            <thead className="bg-amber-100">
              <tr role="row">
                {[
                  { key: 'productId', label: 'Product ID' },
                  { key: 'productCode', label: 'Product Code' },
                  { key: 'productName', label: 'Product Name' },
                  { key: 'description', label: 'Description' },
                  { key: 'stockQuantity', label: 'Stock Quantity' },
                  { key: 'qtyRequired', label: 'Qty Required' },
                  { key: 'price', label: 'Price' },
                  { key: 'createdAt', label: 'Created At (IST)' },
                  { key: 'qrcode', label: 'QR Code' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => key !== 'actions' && key !== 'qrcode' && key !== 'description' && handleSort(key)}
                    onKeyDown={(e) => key !== 'actions' && key !== 'qrcode' && key !== 'description' && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), handleSort(key))}
                    className={`py-5 px-3 text-base font-medium ${key !== 'actions' && key !== 'qrcode' && key !== 'description' ? 'cursor-pointer hover:bg-amber-200' : ''} ${key === 'actions' ? 'sticky right-0 bg-amber-100' : ''}`}
                    style={key === 'actions' ? { minWidth: '100px' } : {}}
                    tabIndex={key !== 'actions' && key !== 'qrcode' && key !== 'description' ? 0 : undefined}
                    aria-sort={sortConfig.key === key ? sortConfig.direction : 'none'}
                  >
                    <div className="flex items-center">
                      {label}
                      {key !== 'actions' && key !== 'qrcode' && key !== 'description' && <ArrowDownUp className="ml-2" size={16} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStock.map(item => (
                <tr key={item.productId} className="border-t hover:bg-amber-50" role="row">
                  <td className="py-4 px-3 text-base text-gray-700">{item.productId}</td>
                  <td className="py-4 px-3 text-base text-gray-700">{item.productCode}</td>
                  <td className="py-4 px-3 text-base text-gray-700">{item.productName}</td>
                  <td className="py-4 px-3 text-base">
                    {item.description ? (
                      <button
                        onClick={() => showDescription(item.description)}
                        className="text-amber-600 hover:text-amber-800 flex items-center"
                        aria-label={`View description for ${item.productName}`}
                      >
                        <Eye size={16} className="mr-1" /> View
                      </button>
                    ) : '-'}
                  </td>
                  <td className="py-4 px-3 text-base">
                    <span className={`px-3 py-1 rounded-full text-white text-sm ${item.stockQuantity > 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                      {item.stockQuantity}
                    </span>
                  </td>
                  <td className="py-4 px-3 text-base text-gray-700">{item.qtyRequired}</td>
                  <td className="py-4 px-3 text-base text-gray-700">{formatCurrency(item.price)}</td>
                  <td className="py-4 px-3 text-base text-gray-700">
                    <div className="flex flex-col">
                      <span>{new Date(item.createdAt).toLocaleDateString('en-IN')}</span>
                      <span className="text-sm text-gray-500">{new Date(item.createdAt).toLocaleTimeString('en-IN')}</span>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-base">
                    <button
                      onClick={() => showBarcode(item.productCode, item.productName, item.description)}
                      className="text-amber-600 hover:text-amber-800 flex items-center"
                      aria-label={`View QR code for ${item.productName}`}
                    >
                      <Eye size={16} className="mr-1" /> QR Code
                    </button>
                  </td>
                  <td className="py-4 px-3 text-base sticky right-0 bg-white">
                    <ActionsDropdown item={item} onEdit={(item) => { setSelectedItem(item); setShowEditForm(true); }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600 text-base">Showing {sortedStock.length} of {totalItems} raw materials</div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage(p => p > 0 ? p - 1 : 0)}
                  disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * itemsPerPage >= totalItems}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {sortedStock.length === 0 && (
            <div className="text-center py-16 flex flex-col items-center justify-center text-gray-500" role="alert">
              <Package size={48} className="mb-4 text-gray-400" />
              <p className="text-lg">No raw materials found.</p>
              {searchTerm ? (
                <p className="mt-2">Try adjusting your search.</p>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                >
                  <PlusCircle className="mr-2" /> Add Your First Item
                </button>
              )}
            </div>
          )}
        </div>

        {showCreateForm && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="create-form-title">
              <button
                onClick={() => setShowCreateForm(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close create form"
              >
                <XCircle size={24} />
              </button>
              <h2 id="create-form-title" className="text-2xl font-bold text-gray-800 mb-6">Add New Raw Material</h2>
              <CreateItemForm
                onSubmit={async (data) => {
                  const token = localStorage.getItem('token');
                  const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/stock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(data),
                    credentials: 'include',
                  });
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to create item');
                  }
                  setPage(0);
                  setSearchInput('');
                  setShowCreateForm(false);
                  refetchData();
                  toast.success('Item created successfully');
                }}
                onClose={() => setShowCreateForm(false)}
              />
            </div>
          </div>
        )}

        {showEditForm && selectedItem && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="edit-form-title">
              <button
                onClick={() => setShowEditForm(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close edit form"
              >
                <XCircle size={24} />
              </button>
              <h2 id="edit-form-title" className="text-2xl font-bold text-gray-800 mb-6">Edit Raw Material #{selectedItem.productId}</h2>
              <EditItemForm
                item={selectedItem}
                onSubmit={async (itemId, data) => {
                  if (!window.confirm("Are you sure you want to update this item?")) throw new Error("Update cancelled.");
                  const token = localStorage.getItem('token');
                  const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/stock/${itemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(data),
                    credentials: 'include',
                  });
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to update item');
                  }
                  refetchData();
                  setShowEditForm(false);
                  setSelectedItem(null);
                  toast.success('Item updated successfully');
                }}
                onClose={() => setShowEditForm(false)}
              />
            </div>
          </div>
        )}

        {showDescriptionModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="description-modal-title">
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close description modal"
              >
                <XCircle size={24} />
              </button>
              <h2 id="description-modal-title" className="text-2xl font-bold text-gray-800 mb-6">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{selectedDescription}</p>
            </div>
          </div>
        )}

        {showBarcodeModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="qrcode-modal-title">
              <button
                onClick={() => setShowBarcodeModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close QR code modal"
              >
                <XCircle size={24} />
              </button>
              <h2 id="qrcode-modal-title" className="text-2xl font-bold text-gray-800 mb-4">QR Code for {selectedProductName}</h2>
              <div className="mb-4">
                <p className="text-gray-700"><strong>Product Code:</strong> {selectedBarcode}</p>
                <p className="text-gray-700 whitespace-pre-wrap"><strong>Description:</strong> {selectedProductDescription}</p>
              </div>
              <canvas id="qrcode-canvas" className="w-full max-w-[200px] mx-auto mb-4" />
              <button
                onClick={() => {
                  const canvas = document.getElementById('qrcode-canvas');
                  const link = document.createElement('a');
                  link.href = canvas.toDataURL('image/png');
                  link.download = `qrcode_${selectedBarcode}.png`;
                  link.click();
                  toast.success('QR code downloaded successfully', { autoClose: 2000 });
                }}
                className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
              >
                <Download className="mr-2" /> Download QR Code
              </button>
            </div>
          </div>
        )}

        <ToastContainer position="top-right" autoClose={3000} />
      </div>
    </div>
  );
}

const CreateItemForm = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    productName: '',
    stockQuantity: 0,
    price: 0,
    description: '',
    productCode: '',
    qtyRequired: 0,
  });
  const [errors, setErrors] = useState({
    productName: '',
    stockQuantity: '',
    price: '',
    description: '',
    productCode: '',
    qtyRequired: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name, value) => {
    if (name === 'productName' && !value.trim()) return 'Product name is required';
    if ((name === 'stockQuantity' || name === 'price' || name === 'qtyRequired') && value < 0) {
      return `${name === 'stockQuantity' ? 'Quantity' : name === 'price' ? 'Price' : 'Qty Required'} cannot be negative`;
    }
    if (name === 'productCode' && value.length !== 10) return 'Product code must be exactly 10 characters';
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue = name === 'stockQuantity' || name === 'qtyRequired' ? parseInt(value) || 0 : name === 'price' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [name]: processedValue }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, processedValue) }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      productName: validateField('productName', formData.productName),
      stockQuantity: validateField('stockQuantity', formData.stockQuantity),
      price: validateField('price', formData.price),
      productCode: validateField('productCode', formData.productCode),
      qtyRequired: validateField('qtyRequired', formData.qtyRequired),
      description: '',
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(err => err)) return;
    try {
      setIsSubmitting(true);
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div>
        <label htmlFor="create-product-name" className="text-gray-700 font-medium">Product Name</label>
        <input
          id="create-product-name"
          type="text"
          name="productName"
          value={formData.productName}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.productName}
          disabled={isSubmitting}
        />
        {errors.productName && <p className="text-red-600 text-sm mt-1">{errors.productName}</p>}
      </div>
      <div>
        <label htmlFor="create-product-code" className="text-gray-700 font-medium">Product Code (10 chars)</label>
        <input
          id="create-product-code"
          type="text"
          name="productCode"
          value={formData.productCode}
          onChange={handleChange}
          maxLength={10}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.productCode}
          disabled={isSubmitting}
        />
        {errors.productCode && <p className="text-red-600 text-sm mt-1">{errors.productCode}</p>}
      </div>
      <div>
        <label htmlFor="create-description" className="text-gray-700 font-medium">Description</label>
        <textarea
          id="create-description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="create-stock-quantity" className="text-gray-700 font-medium">Stock Quantity</label>
        <input
          id="create-stock-quantity"
          type="number"
          name="stockQuantity"
          value={formData.stockQuantity}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.stockQuantity}
          disabled={isSubmitting}
        />
        {errors.stockQuantity && <p className="text-red-600 text-sm mt-1">{errors.stockQuantity}</p>}
      </div>
      <div>
        <label htmlFor="create-qty-required" className="text-gray-700 font-medium">Quantity Required</label>
        <input
          id="create-qty-required"
          type="number"
          name="qtyRequired"
          value={formData.qtyRequired}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.qtyRequired}
          disabled={isSubmitting}
        />
        {errors.qtyRequired && <p className="text-red-600 text-sm mt-1">{errors.qtyRequired}</p>}
      </div>
      <div>
        <label htmlFor="create-price" className="text-gray-700 font-medium">Price (₹)</label>
        <input
          id="create-price"
          type="number"
          name="price"
          value={formData.price}
          onChange={handleChange}
          min="0"
          step="0.01"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.price}
          disabled={isSubmitting}
        />
        {errors.price && <p className="text-red-600 text-sm mt-1">{errors.price}</p>}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </form>
  );
};

const EditItemForm = ({ item, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    productName: item.productName,
    stockQuantity: item.stockQuantity,
    price: item.price,
    description: item.description || '',
    productCode: item.productCode,
    qtyRequired: item.qtyRequired,
  });
  const [errors, setErrors] = useState({
    productName: '',
    stockQuantity: '',
    price: '',
    description: '',
    productCode: '',
    qtyRequired: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name, value) => {
    if (name === 'productName' && !value.trim()) return 'Product name is required';
    if ((name === 'stockQuantity' || name === 'price' || name === 'qtyRequired') && value < 0) {
      return `${name === 'stockQuantity' ? 'Quantity' : name === 'price' ? 'Price' : 'Qty Required'} cannot be negative`;
    }
    if (name === 'productCode' && value.length !== 10) return 'Product code must be exactly 10 characters';
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const processedValue = name === 'stockQuantity' || name === 'qtyRequired' ? parseInt(value) || 0 : name === 'price' ? parseFloat(value) || 0 : value;
    setFormData(prev => ({ ...prev, [name]: processedValue }));
    setErrors(prev => ({ ...prev, [name]: validateField(name, processedValue) }));
  };

  const handleSave = async () => {
    const fieldErrors = {
      productName: validateField('productName', formData.productName),
      stockQuantity: validateField('stockQuantity', formData.stockQuantity),
      price: validateField('price', formData.price),
      productCode: validateField('productCode', formData.productCode),
      qtyRequired: validateField('qtyRequired', formData.qtyRequired),
      description: '',
    };
    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(err => err)) return;
    try {
      setIsSubmitting(true);
      await onSubmit(item.productId, formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <div>
        <label htmlFor="edit-product-name" className="text-gray-700 font-medium">Product Name</label>
        <input
          id="edit-product-name"
          type="text"
          name="productName"
          value={formData.productName}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.productName}
          disabled={isSubmitting}
        />
        {errors.productName && <p className="text-red-600 text-sm mt-1">{errors.productName}</p>}
      </div>
      <div>
        <label htmlFor="edit-product-code" className="text-gray-700 font-medium">Product Code (10 chars)</label>
        <input
          id="edit-product-code"
          type="text"
          name="productCode"
          value={formData.productCode}
          onChange={handleChange}
          maxLength={10}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.productCode}
          disabled={isSubmitting}
        />
        {errors.productCode && <p className="text-red-600 text-sm mt-1">{errors.productCode}</p>}
      </div>
      <div>
        <label htmlFor="edit-description" className="text-gray-700 font-medium">Description</label>
        <textarea
          id="edit-description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <label htmlFor="edit-stock-qty" className="text-gray-700 font-medium">Stock Quantity</label>
        <input
          id="edit-stock-qty"
          type="number"
          name="stockQuantity"
          value={formData.stockQuantity}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid Peri={!!errors.stockQuantity}
          disabled={isSubmitting}
        />
        {errors.stockQuantity && <p className="text-red-600 text-sm mt-1">{errors.stockQuantity}</p>}
      </div>
      <div>
        <label htmlFor="edit-qty-required" className="text-gray-700 font-medium">Quantity Required</label>
        <input
          id="edit-qty-required"
          type="number"
          name="qtyRequired"
          value={formData.qtyRequired}
          onChange={handleChange}
          min="0"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.qtyRequired}
          disabled={isSubmitting}
        />
        {errors.qtyRequired && <p className="text-red-600 text-sm mt-1">{errors.qtyRequired}</p>}
      </div>
      <div>
        <label htmlFor="edit-price" className="text-gray-700 font-medium">Price (₹)</label>
        <input
          id="edit-price"
          type="number"
          name="price"
          value={formData.price}
          onChange={handleChange}
          min="0"
          step="0.01"
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.price}
          disabled={isSubmitting}
        />
        {errors.price && <p className="text-red-600 text-sm">{errors.price}</p>}
      </div>
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  
  );
};

export default ProductionStockPage;