import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatDate } from '../utils/helpers'; // Adjust path as needed
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ArrowDownUp, X, RefreshCw, Search, AlertCircle, Plus, Edit2, XCircle, MoreVertical, Download, Upload, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Simple Error Boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-12 text-red-600 text-xl font-medium max-w-4xl mx-auto bg-red-50 rounded-2xl shadow-lg">
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

function StockPage({ socket }) {
  const [stockItems, setStockItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0); 
  const [searchInput, setSearchInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit'
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    productName: '',
    description: '',
    productCode: '',
    price: '',
    stockQuantity: '',
    qtyRequired: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState('');
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProductDescription, setSelectedProductDescription] = useState('');
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Socket Connection Management
  useEffect(() => {
    if (!socket) return;

    const handleReconnect = () => {
      toast.info('Attempting to reconnect...', { autoClose: 2000 });
    };

    socket.on('connect', () => {
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    }); 

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });

    socket.on('disconnect', () => {
      toast.warn('Real-time connection lost', { autoClose: 3000 });
    });

    socket.on('reconnect', () => {
      toast.success('Real-time connection restored!', { autoClose: 2000 });
      fetchStock();
    });

    socket.on('reconnect_attempt', handleReconnect);

    socket.on('stockUpdate', ({ product_id, stock_quantity, status }) => {
      setStockItems(prev => {
        if (!Array.isArray(prev)) return prev || [];
        if (status === 'Deleted') {
          toast.info(`Product #${product_id} deleted`, { autoClose: 2000 });
          return prev.filter(item => item.productId !== product_id);
        }
        const itemIndex = prev.findIndex(item => item.productId === product_id);
        if (itemIndex === -1) {
          fetchStock();
          return prev;
        }
        const updatedItems = [...prev];
        updatedItems[itemIndex] = { ...updatedItems[itemIndex], stockQuantity: stock_quantity };
        toast.info(`Stock for ${updatedItems[itemIndex].productName} updated to ${stock_quantity}`, { autoClose: 2000 });
        return updatedItems;
      });
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('reconnect');
      socket.off('reconnect_attempt');
      socket.off('stockUpdate');
    };
  }, [socket]);

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

  // QR Code Generation
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

  const fetchStock = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const controller = new AbortController();

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${BASE_URL}/api/stock`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch stock data');
      }
      const { data, total } = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid data format');
      }
      setStockItems(data);
      setTotalItems(total || 0);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        toast.error(err.message || 'Network error', { autoClose: 3000 });
        setStockItems([]);
      }
    } finally {
      setIsLoading(false);
    }

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchStock().then(cleanup => {
      if (!mounted) cleanup();
    });
    return () => {
      mounted = false;
    };
  }, [fetchStock]);

  const filteredStock = useMemo(() => {
    if (!Array.isArray(stockItems)) return [];

    const sortedItems = [...stockItems].sort((a, b) => {
      const valueA = a[sortConfig.key] ?? '';
      const valueB = b[sortConfig.key] ?? '';
      if (valueA < valueB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sortedItems.filter(item => {
      const productName = (item.productName || '').toLowerCase();
      const productId = String(item.productId || '');
      const productCode = (item.productCode || '').toLowerCase();
      const searchTermLower = debouncedSearch.toLowerCase();
      return (
        productName.includes(searchTermLower) ||
        productId.includes(searchTermLower) ||
        productCode.includes(searchTermLower)
      );
    });
  }, [stockItems, debouncedSearch, sortConfig]);

  const validateImportRow = useCallback((row, index) => {
    const errors = [];

    if (!row['Product Name'] || !String(row['Product Name']).trim()) {
      errors.push(`Row ${index + 1}: Product Name is required`);
    }
    if (!row['Product Code'] || !String(row['Product Code']).trim()) {
      errors.push(`Row ${index + 1}: Product Code is required`);
    }
    const price = parseFloat(String(row['Price (₹)']).replace(/₹/g, ''));
    if (isNaN(price) || price < 0) {
      errors.push(`Row ${index + 1}: Price must be a positive number`);
    }
    const stockQuantity = parseFloat(row['Stock Quantity']);
    if (isNaN(stockQuantity) || stockQuantity < 0) {
      errors.push(`Row ${index + 1}: Stock Quantity must be a non-negative number`);
    }

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
          if (rowErrors.length > 0) {
            errors.push(...rowErrors);
          } else {
            validRows.push({
              productName: String(row['Product Name'] || '').trim(),
              productCode: String(row['Product Code'] || '').trim(),
              price: parseFloat(String(row['Price (₹)'] || '0').replace(/₹/g, '')),
              stockQuantity: parseFloat(row['Stock Quantity'] || 0),
              qtyRequired: parseInt(row['Qty Required'] || 0),
              description: String(row['Description'] || '').trim() || undefined,
              productId: row['Product ID'] ? parseInt(row['Product ID']) : undefined
            });
          }
        });

        if (errors.length > 0) {
          errors.forEach(error => toast.error(error, { autoClose: 5000 }));
          if (validRows.length === 0) return;
        }

        const token = localStorage.getItem('token');
        let createdCount = 0;
        let updatedCount = 0;
        let failedCount = 0;

        for (const row of validRows) {
          try {
            const { productId, ...body } = row;
            const url = productId ? `${BASE_URL}/api/stock/${productId}` : `${BASE_URL}/api/stock`;
            const method = productId ? 'PUT' : 'POST';

            const response = await fetch(url, {
              method,
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `Failed to ${productId ? 'update' : 'create'} product`);
            }

            const updatedItem = await response.json();
            if (productId) {
              updatedCount++;
              setStockItems(prev => prev.map(item =>
                item.productId === productId ? { ...item, ...body } : item
              ));
            } else {
              createdCount++;
              setStockItems(prev => [{
                ...body,
                productId: updatedItem.productId,
                createdAt: new Date().toISOString()
              }, ...prev]);
            }
          } catch (err) {
            failedCount++;
            toast.error(`Row ${validRows.indexOf(row) + 1}: ${err.message}`, { autoClose: 3000 });
          }
        }

        if (createdCount > 0 || updatedCount > 0) {
          await fetchStock();
          toast.success(
            `Imported successfully: ${createdCount} created, ${updatedCount} updated${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
            { autoClose: 5000 }
          );
        } else if (failedCount > 0) {
          toast.error(`Import failed: ${failedCount} rows could not be processed`, { autoClose: 5000 });
        }
      };

      reader.readAsArrayBuffer(file);
      event.target.value = ''; // Reset file input
    } catch (err) {
      toast.error(`Import failed: ${err.message}`, { autoClose: 3000 });
    }
  }, [fetchStock, validateImportRow]);

  const exportToExcel = useCallback(() => {
    const data = filteredStock.map(item => ({
      'Product ID': item.productId || 'N/A',
      'Product Name': item.productName || 'N/A',
      'Stock Quantity': Number(item.stockQuantity) || 0,
      'Qty Required': Number(item.qtyRequired) || 0,
      'Price (₹)': !isNaN(Number(item.price)) ? `₹${Number(item.price).toFixed(2)}` : 'N/A',
      'Product Code': item.productCode || 'N/A',
      'Created At': item.createdAt ? formatDate(item.createdAt) : 'N/A',
      'Description': item.description || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Raw Materials');

    // Auto-size columns
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
  }, [filteredStock]);

  const sortData = useCallback((key) => {
    setSortConfig(prev => {
      const direction = prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc';
      return { key, direction };
    });
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setSearchInput('');
      searchInputRef.current?.focus();
    }
  }, []);

  const handleCreate = useCallback(() => {
    setModalMode('create');
    setSelectedItem(null);
    setFormData({
      productName: '',
      description: '',
      productCode: '',
      price: '',
      stockQuantity: '',
      qtyRequired: ''
    });
    setFormErrors({});
    setShowModal(true);
  }, []);

  const handleEdit = useCallback((item) => {
    setModalMode('edit');
    setSelectedItem(item);
    setFormData({
      productName: item.productName || '',
      description: item.description || '',
      productCode: item.productCode || '',
      price: item.price || '',
      stockQuantity: item.stockQuantity || '',
      qtyRequired: item.qtyRequired || ''
    });
    setFormErrors({});
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(async (productId) => {
    if (!window.confirm(`Are you sure you want to delete product #${productId}?`)) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${BASE_URL}/api/stock/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete product');
      }
      toast.success(`Product #${productId} deleted`, { autoClose: 2000 });
    } catch (err) {
      toast.error(err.message || 'Delete failed', { autoClose: 3000 });
    }
  }, []);

  const showDescription = useCallback((description) => {
    setSelectedDescription(description);
    setShowDescriptionModal(true);
  }, []);

  const showBarcode = useCallback((productCode, productName, description) => {
    setSelectedBarcode(productCode);
    setSelectedProductName(productName);
    setSelectedProductDescription(description || 'No description available');
    setShowBarcodeModal(true);
  }, []);

  const validateForm = useCallback(() => {
    const errors = {};

    if (!formData.productName.trim()) {
      errors.productName = 'Product name is required';
    }
    if (!formData.productCode.trim()) {
      errors.productCode = 'Product code is required';
    }
    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) {
      errors.price = 'Price must be a positive number';
    }
    const stockQuantity = parseFloat(formData.stockQuantity);
    if ((modalMode === 'create' || modalMode === 'edit') && (isNaN(stockQuantity) || stockQuantity < 0)) {
      errors.stockQuantity = 'Stock quantity must be a non-negative number';
    }

    return errors;
  }, [formData, modalMode]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const formErrors = validateForm();

    if (Object.keys(formErrors).length > 0) {
      setFormErrors(formErrors);
      Object.values(formErrors).forEach(error => toast.error(error, { autoClose: 3000 }));
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const url = modalMode === 'create' ? `${BASE_URL}/api/stock` : `${BASE_URL}/api/stock/${selectedItem.productId}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      const price = parseFloat(formData.price);
      const stockQuantity = parseFloat(formData.stockQuantity);
      const qtyRequired = parseInt(formData.qtyRequired) || 0;
      const body = {
        productName: formData.productName,
        description: formData.description,
        productCode: formData.productCode,
        price,
        stockQuantity: modalMode === 'edit' ? stockQuantity : undefined,
        qtyRequired
      };
      if (modalMode === 'create') {
        body.stockQuantity = stockQuantity >= 0 ? stockQuantity : 0;
      }
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `${modalMode === 'create' ? 'Create' : 'Update'} failed`);
      }
      const updatedItem = await response.json();
      if (modalMode === 'create') {
        setStockItems(prev => [updatedItem, ...prev]);
        toast.success(`Product ${updatedItem.productName} created`, { autoClose: 2000 });
      } else {
        setStockItems(prev => prev.map(item => item.productId === updatedItem.productId ? updatedItem : item));
        toast.success(`Product ${updatedItem.productName} updated`, { autoClose: 2000 });
      }
      setShowModal(false);
      setFormErrors({});
    } catch (err) {
      toast.error(err.message || 'Operation failed', { autoClose: 3000 });
    }
  }, [formData, modalMode, selectedItem]);

  const ActionsDropdown = ({ item, onEdit, onDelete }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-gray-100 rounded-full"
          aria-label={`Actions for product ${item.productName}`}
        >
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            <button
              onClick={() => { onEdit(item); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
            <button
              onClick={() => { onDelete(item.productId); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <XCircle size={16} className="mr-2" /> Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  if (isLoading && !stockItems.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading Stock...</div>
      </div>
    );
  }

  if (error && !showModal && !showDescriptionModal && !showBarcodeModal) {
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
              fetchStock();
            }}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
          Raw Material Inventory
        </h1>
        <div className="max-w-7xl mx-auto">
          <div className="flex mb-8 gap-6 flex-wrap">
            <div className="relative flex-grow">
              <label htmlFor="search-stock" className="sr-only">
                Search Stock
              </label>
              <input
                id="search-stock"
                ref={searchInputRef}
                type="text"
                placeholder="Search by Product ID, Name, or Code..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
              />
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X size={20} />
                </button>
              )}
            </div>
            <button
              onClick={handleCreate}
              className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-300 transition-all duration-300 shadow-md text-lg flex items-center"
              aria-label="Create new product"
            >
              <Plus size={20} className="mr-2" /> Create Product
            </button>
            <button
              onClick={fetchStock}
              className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg flex items-center"
              disabled={isLoading}
              aria-label="Refresh stock"
            >
              <RefreshCw size={20} className="mr-2" /> {isLoading && stockItems.length > 0 ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg flex items-center"
              disabled={isLoading}
              aria-label="Import from Excel"
            >
              <Upload size={20} className="mr-2" /> Import from Excel
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
              className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg flex items-center"
              disabled={isLoading || filteredStock.length === 0}
              aria-label="Export to Excel"
            >
              <Download size={20} className="mr-2" /> Export to Excel
            </button>
          </div>

          {isLoading && stockItems.length > 0 && (
            <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
              Refreshing data...
            </div>
          )}

          {filteredStock.length === 0 && !isLoading ? (
            <div
              className="bg-white p-8 rounded-2xl shadow-lg text-center"
              role="status"
            >
              <Search className="mx-auto mb-4 text-gray-400" size={48} />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No Stock Items Found</h2>
              <p className="text-gray-600 mb-6">
                No products match your search or filters.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
              <table
                className="w-full text-left border-collapse"
                role="grid"
                aria-label="Stock Items table"
                ref={tableRef}
                tabIndex={0}
              >
                <thead>
                  <tr
                    className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50"
                    role="row"
                  >
                    {[
                      { key: 'productId', label: 'Product ID' },
                      { key: 'productName', label: 'Product Name' },
                      { key: 'stockQuantity', label: 'Stock Quantity' },
                      { key: 'qtyRequired', label: 'Qty Required' },
                      { key: 'price', label: 'Price (₹)' },
                      { key: 'productCode', label: 'Product Code' },
                      { key: 'description', label: 'Description' },
                      { key: 'qrcode', label: 'QR Code' },
                      { key: 'createdAt', label: 'Created At' },
                      { key: 'actions', label: 'Actions' }
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        className={`py-5 px-3 text-gray-800 text-base font-semibold ${
                          key !== 'actions' && key !== 'qrcode' ? 'cursor-pointer hover:bg-amber-300' : ''
                        } transition-all duration-200`}
                        onClick={() => key !== 'actions' && key !== 'qrcode' && sortData(key)}
                        onKeyDown={(e) => key !== 'actions' && key !== 'qrcode' && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), sortData(key))}
                        tabIndex={key !== 'actions' && key !== 'qrcode' ? 0 : undefined}
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
                          {key !== 'actions' && key !== 'qrcode' && (
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
                  {filteredStock.map((item) => {
                    const price = Number(item.price);
                    const stockQty = Number(item.stockQuantity);
                    const qtyRequired = Number(item.qtyRequired);
                    const stockClass = stockQty >= qtyRequired ? 'text-green-600' : 'text-red-600';
                    return (
                      <tr
                        key={item.productId}
                        className="border-t hover:bg-amber-50 transition-all duration-200"
                        role="row"
                      >
                        <td className="py-4 px-3 text-gray-600 text-base">{item.productId}</td>
                        <td className="py-4 px-3 text-gray-600 text-base">{item.productName || 'N/A'}</td>
                        <td className={`py-4 px-3 text-base ${stockClass}`}>
                          {stockQty}
                          {stockQty < qtyRequired && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                              Low
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-3 text-gray-600 text-base">{qtyRequired}</td>
                        <td className="py-4 px-3 text-gray-600 text-base">
                          {!isNaN(price) && price !== null ? `₹${price.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="py-4 px-3 text-gray-600 text-base font-mono">{item.productCode || 'N/A'}</td>
                        <td className="py-4 px-3 text-gray-600 text-base">
                          {item.description ? (
                            <button
                              onClick={() => showDescription(item.description)}
                              className="text-amber-600 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                              aria-label={`View description for ${item.productName}`}
                            >
                              <Eye size={16} className="mr-1" aria-hidden="true" /> View
                            </button>
                          ) : '-'}
                        </td>
                        <td className="py-4 px-3 text-gray-600 text-base">
                          <button
                            onClick={() => showBarcode(item.productCode, item.productName, item.description)}
                            className="text-amber-600 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                            aria-label={`View QR code for ${item.productName}`}
                          >
                            <Eye size={16} className="mr-1" aria-hidden="true" /> QR Code
                          </button>
                        </td>
                        <td className="py-4 px-3 text-gray-600 text-base">
                          {item.createdAt ? formatDate(item.createdAt) : 'N/A'}
                        </td>
                        <td className="py-4 px-3 text-gray-600 text-base">
                          <ActionsDropdown
                            item={item}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {totalItems > 0 && (
                <div className="flex justify-between items-center p-4 bg-gray-50">
                  <div className="text-gray-600">
                    Showing {filteredStock.length} of {totalItems} products
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mr-1.5"></div>
                      <span>In Stock</span>
                    </div>
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 mr-1.5"></div>
                      <span>Low Stock</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showModal && (
          <div
            className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
            role="dialog"
            aria-labelledby="stock-modal-title"
          >
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-[500px] relative" ref={modalRef}>
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close modal"
              >
                <XCircle size={24} />
              </button>
              <h2
                id="stock-modal-title"
                className="text-2xl font-bold text-gray-800 mb-6"
              >
                {modalMode === 'create' ? 'Create Product' : `Edit Product #${selectedItem?.productId}`}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="productName">Product Name</label>
                  <input
                    id="productName"
                    type="text"
                    value={formData.productName}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                    className={`w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300 ${formErrors.productName ? 'border-red-500' : ''}`}
                    required
                    aria-invalid={!!formErrors.productName}
                    aria-describedby={formErrors.productName ? 'productName-error' : undefined}
                  />
                  {formErrors.productName && (
                    <p id="productName-error" className="text-red-500 text-sm mt-1">{formErrors.productName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="productCode">Product Code</label>
                  <input
                    id="productCode"
                    type="text"
                    value={formData.productCode}
                    onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                    className={`w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300 ${formErrors.productCode ? 'border-red-500' : ''}`}
                    required
                    aria-invalid={!!formErrors.productCode}
                    aria-describedby={formErrors.productCode ? 'productCode-error' : undefined}
                  />
                  {formErrors.productCode && (
                    <p id="productCode-error" className="text-red-500 text-sm mt-1">{formErrors.productCode}</p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="price">Price (₹)</label>
                  <input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className={`w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300 ${formErrors.price ? 'border-red-500' : ''}`}
                    required
                    aria-invalid={!!formErrors.price}
                    aria-describedby={formErrors.price ? 'price-error' : undefined}
                  />
                  {formErrors.price && (
                    <p id="price-error" className="text-red-500 text-sm mt-1">{formErrors.price}</p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="stockQuantity">
                    {modalMode === 'create' ? 'Initial Stock Quantity' : 'Stock Quantity'}
                  </label>
                  <input
                    id="stockQuantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.stockQuantity}
                    onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                    className={`w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300 ${formErrors.stockQuantity ? 'border-red-500' : ''}`}
                    required={modalMode === 'create'}
                    aria-invalid={!!formErrors.stockQuantity}
                    aria-describedby={formErrors.stockQuantity ? 'stockQuantity-error' : undefined}
                  />
                  {formErrors.stockQuantity && (
                    <p id="stockQuantity-error" className="text-red-500 text-sm mt-1">{formErrors.stockQuantity}</p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="qtyRequired">Quantity Required</label>
                  <input
                    id="qtyRequired"
                    type="number"
                    min="0"
                    value={formData.qtyRequired}
                    onChange={(e) => setFormData({ ...formData, qtyRequired: e.target.value })}
                    className="w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-2" htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div className="flex justify-end gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all duration-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all duration-300 font-semibold"
                  >
                    {modalMode === 'create' ? 'Create' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showDescriptionModal && (
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50"
            role="dialog"
            aria-labelledby="description-modal-title"
          >
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
              <button
                onClick={() => setShowDescriptionModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close description modal"
              >
                <XCircle size={24} aria-hidden="true" />
              </button>
              <h2 id="description-modal-title" className="text-2xl font-bold mb-6">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{selectedDescription || 'No description available'}</p>
            </div>
          </div>
        )}

        {showBarcodeModal && (
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50"
            role="dialog"
            aria-labelledby="qrcode-modal-title"
          >
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
              <button
                onClick={() => setShowBarcodeModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close QR code modal"
              >
                <XCircle size={24} aria-hidden="true" />
              </button>
              <h2 id="qrcode-modal-title" className="text-2xl font-bold mb-4">QR Code for {selectedProductName}</h2>
              <div className="mb-4">
                <p className="text-gray-700"><strong>Product Code:</strong> {selectedBarcode}</p>
                <p className="text-gray-700 whitespace-pre-wrap"><strong>Description:</strong> {selectedProductDescription}</p>
              </div>
              <canvas id="qrcode-canvas" className="w-full max-w-[200px] mx-auto mb-4" aria-label={`QR code for ${selectedProductName}`}></canvas>
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
                <Download className="mr-2" aria-hidden="true" /> Download QR Code
              </button>
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
    </ErrorBoundary>
  );
}

export default StockPage;