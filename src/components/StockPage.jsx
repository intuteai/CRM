import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatDate } from '../utils/helpers';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  ArrowDownUp, Search, ChevronLeft, ChevronRight, X, RefreshCw,
  AlertCircle, Plus, Edit2, XCircle, MoreVertical, Download, Upload, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// Error Boundary
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
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function StockPage({ socket }) {
  const [stockItems, setStockItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    productName: '',
    description: '',
    productCode: '',
    price: '',
    stockQuantity: '',
    qtyRequired: '',
    location: '' // NEW
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

  // Fetch Stock
  const fetchStock = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const controller = new AbortController();

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication token missing. Please log in again.");

      const response = await fetch(`${BASE_URL}/api/stock?limit=5000&offset=0`, {
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
      if (!Array.isArray(data)) throw new Error('Invalid data format');

      const normalizedData = data.map(item => ({
        ...item,
        price: item.price !== null ? Number(item.price) : 0,
        stockQuantity: item.stockQuantity !== null ? Number(item.stockQuantity) : 0,
        qtyRequired: item.qtyRequired !== null ? Number(item.qtyRequired) : 0,
        description: item.description || '',
        productCode: item.productCode || '',
        productName: item.productName || '',
        productId: item.productId,
        createdAt: item.createdAt || null,
        location: item.location || '' // NEW
      }));

      setStockItems(normalizedData);
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

  // Socket Updates
  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => toast.success('Connected to real-time updates!', { autoClose: 2000 }));
    socket.on('connect_error', () => toast.error('Failed to connect to real-time updates.', { autoClose: 3000 }));
    socket.on('disconnect', () => toast.warn('Real-time connection lost', { autoClose: 3000 }));
    socket.on('reconnect', () => { toast.success('Reconnected!', { autoClose: 2000 }); fetchStock(); });

    socket.on('stockUpdate', ({ product_id, stock_quantity, location, status }) => {
      setStockItems(prev => {
        if (!Array.isArray(prev)) return prev || [];
        if (status === 'Deleted') {
          toast.info(`Product #${product_id} deleted`, { autoClose: 2000 });
          return prev.filter(item => item.productId !== product_id);
        }
        const index = prev.findIndex(item => item.productId === product_id);
        if (index === -1) {
          fetchStock();
          return prev;
        }
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          stockQuantity: Number(stock_quantity),
          location: location ?? updated[index].location
        };
        toast.info(`Updated: ${updated[index].productName} → ${stock_quantity} @ ${updated[index].location || 'N/A'}`, { autoClose: 2000 });
        return updated;
      });
      if (tableRef.current) tableRef.current.focus();
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('reconnect');
      socket.off('stockUpdate');
    };
  }, [socket, fetchStock]);

  // Initial Load
  useEffect(() => {
    let mounted = true;
    fetchStock().then(cleanup => { if (!mounted) cleanup(); });
    return () => { mounted = false; };
  }, [fetchStock]);

  // Search & Pagination
  useEffect(() => setSearchTerm(debouncedSearch), [debouncedSearch]);
  useEffect(() => setPage(0), [searchTerm]);

  // Modal Focus Trap
  useEffect(() => {
    if (showModal && modalRef.current) {
      const firstInput = modalRef.current.querySelector('input');
      firstInput?.focus();

      const handleTab = (e) => {
        if (e.key !== 'Tab') return;
        const focusable = modalRef.current.querySelectorAll('button, input, textarea');
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      };
      document.addEventListener('keydown', handleTab);
      return () => document.removeEventListener('keydown', handleTab);
    }
  }, [showModal]);

  // QR Code
  const generateQRCode = useCallback(async (productCode, productName, description, location, elementId) => {
    try {
      const data = JSON.stringify({ productCode, productName, description: description || 'N/A', location: location || 'N/A' });
      await QRCode.toCanvas(document.getElementById(elementId), data, { width: 200, margin: 2, errorCorrectionLevel: 'H' });
    } catch (err) {
      toast.error('QR code generation failed', { autoClose: 3000 });
    }
  }, []);

  useEffect(() => {
    if (showBarcodeModal && selectedBarcode) {
      const item = stockItems.find(i => i.productCode === selectedBarcode);
      generateQRCode(selectedBarcode, selectedProductName, selectedProductDescription, item?.location, 'qrcode-canvas');
    }
  }, [showBarcodeModal, selectedBarcode, selectedProductName, selectedProductDescription, stockItems, generateQRCode]);

  // Sorting & Filtering
  const sortedStock = useMemo(() => {
    const items = [...stockItems];
    if (sortConfig.key) {
      items.sort((a, b) => {
        let aVal = a[sortConfig.key] ?? '';
        let bVal = b[sortConfig.key] ?? '';
        if (['price', 'stockQuantity', 'qtyRequired'].includes(sortConfig.key)) {
          aVal = Number(aVal); bVal = Number(bVal);
        } else if (sortConfig.key === 'createdAt') {
          aVal = new Date(aVal || 0); bVal = new Date(bVal || 0);
        }
        return (aVal < bVal ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
      });
    }
    return items;
  }, [stockItems, sortConfig]);

  const filteredStock = useMemo(() => {
    return sortedStock.filter(item => {
      const terms = [item.productId, item.productName, item.productCode, item.location].map(s => String(s || '').toLowerCase());
      return terms.some(t => t.includes(searchTerm.toLowerCase()));
    });
  }, [sortedStock, searchTerm]);

  const paginatedStock = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredStock.slice(start, start + itemsPerPage);
  }, [filteredStock, page, itemsPerPage]);

  // Import Validation
  const validateImportRow = useCallback((row, index) => {
    const errors = [];
    if (!row['Product Name']?.trim()) errors.push(`Row ${index + 1}: Product Name required`);
    if (!row['Product Code']?.trim()) errors.push(`Row ${index + 1}: Product Code required`);
    const price = parseFloat(String(row['Price (₹)'] || '').replace(/₹/g, ''));
    if (isNaN(price) || price < 0) errors.push(`Row ${index + 1}: Invalid price`);
    const stock = parseFloat(row['Stock Quantity'] || 0);
    if (isNaN(stock) || stock < 0) errors.push(`Row ${index + 1}: Invalid stock`);
    return errors;
  }, []);

  // Import Excel
  const importFromExcel = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet);

        if (!json.length) throw new Error('Empty file');

        const errors = [], valid = [];
        json.forEach((row, i) => {
          const err = validateImportRow(row, i);
          if (err.length) errors.push(...err);
          else {
            valid.push({
              productName: String(row['Product Name'] || '').trim(),
              productCode: String(row['Product Code'] || '').trim(),
              price: parseFloat(String(row['Price (₹)'] || '0').replace(/₹/g, '')),
              stockQuantity: parseFloat(row['Stock Quantity'] || 0),
              qtyRequired: parseInt(row['Qty Required'] || 0),
              description: String(row['Description'] || '').trim() || undefined,
              location: String(row['Location'] || '').trim() || undefined,
              productId: row['Product ID'] ? parseInt(row['Product ID']) : undefined
            });
          }
        });

        if (errors.length) errors.forEach(e => toast.error(e, { autoClose: 5000 }));
        if (!valid.length) return;

        const token = localStorage.getItem('token');
        let created = 0, updated = 0, failed = 0;

        for (const row of valid) {
          try {
            const { productId, ...body } = row;
            const url = productId ? `${BASE_URL}/api/stock/${productId}` : `${BASE_URL}/api/stock`;
            const method = productId ? 'PUT' : 'POST';

            const res = await fetch(url, {
              method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });

            if (!res.ok) throw new Error((await res.json()).error || 'Failed');
            productId ? updated++ : created++;
          } catch {
            failed++;
          }
        }

        await fetchStock();
        setPage(0);
        toast.success(`Success: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ''}`, { autoClose: 5000 });
      } catch (err) {
        toast.error(`Import failed: ${err.message}`, { autoClose: 3000 });
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  }, [fetchStock, validateImportRow]);

  // Export Excel
  const exportToExcel = useCallback(() => {
    const data = filteredStock.map(item => ({
      'Product ID': item.productId,
      'Product Name': item.productName,
      'Product Code': item.productCode,
      'Location': item.location || 'N/A',
      'Stock Quantity': Number(item.stockQuantity),
      'Qty Required': Number(item.qtyRequired),
      'Price (₹)': `₹${Number(item.price).toFixed(2)}`,
      'Description': item.description || 'N/A',
      'Created At': item.createdAt ? formatDate(item.createdAt) : 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Raw Materials');
    XLSX.writeFile(wb, 'Raw_Material_Inventory.xlsx');
    toast.success('Exported to Excel!', { autoClose: 2000 });
  }, [filteredStock]);

  // Sorting
  const sortData = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  // Modal Handlers
  const handleCreate = useCallback(() => {
    setModalMode('create');
    setSelectedItem(null);
    setFormData({
      productName: '', description: '', productCode: '', price: '', stockQuantity: '', qtyRequired: '', location: ''
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
      qtyRequired: item.qtyRequired || '',
      location: item.location || ''
    });
    setFormErrors({});
    setShowModal(true);
  }, []);

  const handleDelete = useCallback(async (productId) => {
    if (!confirm(`Delete product #${productId}?`)) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/stock/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchStock();
      toast.success(`Product #${productId} deleted`);
    } catch (err) {
      toast.error(err.message);
    }
  }, [fetchStock]);

  const showDescription = useCallback((desc) => {
    setSelectedDescription(desc);
    setShowDescriptionModal(true);
  }, []);

  const showBarcode = useCallback((code, name, desc) => {
    setSelectedBarcode(code);
    setSelectedProductName(name);
    setSelectedProductDescription(desc);
    setShowBarcodeModal(true);
  }, []);

  // Form Validation
  const validateForm = useCallback(() => {
    const errors = {};
    if (!formData.productName.trim()) errors.productName = 'Required';
    if (!formData.productCode.trim()) errors.productCode = 'Required';
    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) errors.price = 'Must be ≥ 0';
    const stock = parseFloat(formData.stockQuantity);
    if ((modalMode === 'create' || modalMode === 'edit') && (isNaN(stock) || stock < 0)) {
      errors.stockQuantity = 'Must be ≥ 0';
    }
    return errors;
  }, [formData, modalMode]);

  // Submit
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length) {
      setFormErrors(errors);
      Object.values(errors).forEach(e => toast.error(e));
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const isCreate = modalMode === 'create';
      const url = isCreate ? `${BASE_URL}/api/stock` : `${BASE_URL}/api/stock/${selectedItem.productId}`;
      const body = {
        productName: formData.productName,
        description: formData.description || undefined,
        productCode: formData.productCode,
        price: parseFloat(formData.price),
        stockQuantity: isCreate ? parseFloat(formData.stockQuantity) : undefined,
        qtyRequired: parseInt(formData.qtyRequired) || 0,
        location: formData.location || undefined
      };

      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error((await res.json()).error);
      await fetchStock();
      setShowModal(false);
      setPage(0);
      toast.success(isCreate ? 'Product created!' : 'Product updated!');
    } catch (err) {
      toast.error(err.message);
    }
  }, [formData, modalMode, selectedItem, fetchStock]);

  // Actions Dropdown
  const ActionsDropdown = ({ item, onEdit, onDelete }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      const handle = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
      document.addEventListener('mousedown', handle);
      return () => document.removeEventListener('mousedown', handle);
    }, []);
    return (
      <div ref={ref} className="relative">
        <button onClick={() => setOpen(!open)} className="p-2 hover:bg-gray-100 rounded-full">
          <MoreVertical size={20} />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5 z-10">
            <button onClick={() => { onEdit(item); setOpen(false); }} className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 items-center">
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
            <button onClick={() => { onDelete(item.productId); setOpen(false); }} className="flex w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 items-center">
              <XCircle size={16} className="mr-2" /> Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render
  if (isLoading && !stockItems.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">Loading Stock...</div>
      </div>
    );
  }

  if (error && !showModal && !showDescriptionModal && !showBarcodeModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg text-center">
          <p className="mb-4">{error}</p>
          <button onClick={() => { setError(null); fetchStock(); }} className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Raw Material Inventory</h1>
        <div className="max-w-7xl mx-auto">
          {/* Toolbar */}
          <div className="flex mb-8 gap-4 flex-wrap">
            <div className="relative flex-grow">
              <input
                id="search-stock"
                ref={searchInputRef}
                type="text"
                placeholder="Search by ID, Name, Code, or Location..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (setSearchInput(''), setSearchTerm(''))}
                className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearchTerm(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              )}
            </div>
            <button onClick={handleCreate} className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center shadow-md">
              <Plus size={20} className="mr-2" /> Create Product
            </button>
            <button onClick={fetchStock} disabled={isLoading} className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 flex items-center shadow-md">
              <RefreshCw size={20} className="mr-2" /> {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md">
              <Upload size={20} className="mr-2" /> Import Excel
            </button>
            <input type="file" ref={fileInputRef} onChange={importFromExcel} accept=".xlsx,.xls" className="hidden" />
            <button onClick={exportToExcel} disabled={!filteredStock.length} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md">
              <Download size={20} className="mr-2" /> Export Excel
            </button>
          </div>

          {/* Table */}
          {filteredStock.length === 0 && !isLoading ? (
            <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
              <Search className="mx-auto mb-4 text-gray-400" size={48} />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">No Items Found</h2>
              <p className="text-gray-600 mb-6">{searchTerm ? 'Try adjusting your search.' : 'Start by creating a product!'}</p>
              {!searchTerm && <button onClick={handleCreate} className="p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto"><Plus className="mr-2" /> Create First Product</button>}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
              <table className="w-full text-left border-collapse" ref={tableRef} tabIndex={0}>
                <thead>
                  <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50">
                    {[
                      { key: 'productId', label: 'ID' },
                      { key: 'productName', label: 'Name' },
                      { key: 'location', label: 'Location' }, // NEW
                      { key: 'stockQuantity', label: 'Stock' },
                      { key: 'qtyRequired', label: 'Req' },
                      { key: 'price', label: 'Price (₹)' },
                      { key: 'productCode', label: 'Code' },
                      { key: 'description', label: 'Desc' },
                      { key: 'qrcode', label: 'QR' },
                      { key: 'createdAt', label: 'Created' },
                      { key: 'actions', label: 'Actions' }
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        className={`py-5 px-3 text-gray-800 font-semibold text-base ${key !== 'actions' && key !== 'qrcode' ? 'cursor-pointer hover:bg-amber-300' : ''}`}
                        onClick={() => key !== 'actions' && key !== 'qrcode' && sortData(key)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && key !== 'actions' && key !== 'qrcode' && sortData(key)}
                        tabIndex={key !== 'actions' && key !== 'qrcode' ? 0 : -1}
                        aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center justify-between">
                          {label}
                          {key !== 'actions' && key !== 'qrcode' && (
                            <ArrowDownUp size={16} className={`ml-2 text-gray-600 ${sortConfig.key === key ? 'text-gray-900' : 'opacity-50'}`} />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedStock.map(item => {
                    const stockClass = item.stockQuantity >= item.qtyRequired ? 'text-green-600' : 'text-red-600';
                    return (
                      <tr key={item.productId} className="border-t hover:bg-amber-50">
                        <td className="py-4 px-3 text-gray-600">{item.productId}</td>
                        <td className="py-4 px-3 text-gray-600 font-medium">{item.productName}</td>
                        <td className="py-4 px-3 text-gray-600">{item.location || <span className="text-gray-400 italic">Not set</span>}</td>
                        <td className={`py-4 px-3 font-medium ${stockClass}`}>
                          {item.stockQuantity}
                          {item.stockQuantity < item.qtyRequired && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">Low</span>
                          )}
                        </td>
                        <td className="py-4 px-3 text-gray-600">{item.qtyRequired}</td>
                        <td className="py-4 px-3 text-gray-600">₹{Number(item.price).toFixed(2)}</td>
                        <td className="py-4 px-3 text-gray-600 font-mono">{item.productCode}</td>
                        <td className="py-4 px-3">
                          {item.description ? (
                            <button onClick={() => showDescription(item.description)} className="text-amber-600 hover:text-amber-800 flex items-center">
                              <Eye size={16} className="mr-1" /> View
                            </button>
                          ) : '-'}
                        </td>
                        <td className="py-4 px-3">
                          <button onClick={() => showBarcode(item.productCode, item.productName, item.description)} className="text-amber-600 hover:text-amber-800 flex items-center">
                            <Eye size={16} className="mr-1" /> QR
                          </button>
                        </td>
                        <td className="py-4 px-3 text-gray-600 text-sm">{formatDate(item.createdAt)}</td>
                        <td className="py-4 px-3"><ActionsDropdown item={item} onEdit={handleEdit} onDelete={handleDelete} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex justify-between items-center p-4 bg-gray-50">
                <div className="text-gray-600">
                  Showing {paginatedStock.length} of {filteredStock.length} (Total: {totalItems})
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-green-500 mr-1.5"></div> In Stock</div>
                    <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-red-500 mr-1.5"></div> Low</div>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100">
                      <ChevronLeft size={20} />
                    </button>
                    <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * itemsPerPage >= filteredStock.length} className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100">
                      <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50" role="dialog">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-[520px]" ref={modalRef}>
              <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-gray-500"><XCircle size={24} /></button>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                {modalMode === 'create' ? 'Create Product' : `Edit #${selectedItem?.productId}`}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Product Name *</label>
                  <input type="text" value={formData.productName} onChange={e => setFormData({ ...formData, productName: e.target.value })} className={`w-full p-3 border rounded-lg ${formErrors.productName ? 'border-red-500' : ''}`} required />
                  {formErrors.productName && <p className="text-red-500 text-sm mt-1">{formErrors.productName}</p>}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Product Code *</label>
                  <input type="text" value={formData.productCode} onChange={e => setFormData({ ...formData, productCode: e.target.value })} className={`w-full p-3 border rounded-lg ${formErrors.productCode ? 'border-red-500' : ''}`} required />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Location</label>
                  <input type="text" placeholder="e.g., Warehouse A, Shelf 12" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} className="w-full p-3 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Price (₹) *</label>
                  <input type="number" step="0.01" min="0" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} className={`w-full p-3 border rounded-lg ${formErrors.price ? 'border-red-500' : ''}`} required />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">{modalMode === 'create' ? 'Initial Stock' : 'Stock Quantity'}</label>
                  <input type="number" step="0.01" min="0" value={formData.stockQuantity} onChange={e => setFormData({ ...formData, stockQuantity: e.target.value })} className={`w-full p-3 border rounded-lg ${formErrors.stockQuantity ? 'border-red-500' : ''}`} required={modalMode === 'create'} />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Qty Required</label>
                  <input type="number" min="0" value={formData.qtyRequired} onChange={e => setFormData({ ...formData, qtyRequired: e.target.value })} className="w-full p-3 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Description</label>
                  <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-3 border rounded-lg" rows="2" />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancel</button>
                  <button type="submit" className="px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold">
                    {modalMode === 'create' ? 'Create' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Description & QR Modals */}
        {showDescriptionModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
              <button onClick={() => setShowDescriptionModal(false)} className="absolute top-4 right-4"><XCircle size={24} /></button>
              <h2 className="text-2xl font-bold mb-4">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{selectedDescription || 'None'}</p>
            </div>
          </div>
        )}

        {showBarcodeModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
              <button onClick={() => setShowBarcodeModal(false)} className="absolute top-4 right-4"><XCircle size={24} /></button>
              <h2 className="text-2xl font-bold mb-4">QR Code: {selectedProductName}</h2>
              <div className="space-y-2 text-sm text-gray-700 mb-4">
                <p><strong>Code:</strong> {selectedBarcode}</p>
                <p><strong>Location:</strong> {stockItems.find(i => i.productCode === selectedBarcode)?.location || 'Not set'}</p>
              </div>
              <canvas id="qrcode-canvas" className="w-full max-w-[200px] mx-auto mb-4"></canvas>
              <button onClick={() => {
                const canvas = document.getElementById('qrcode-canvas');
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = `QR_${selectedBarcode}.png`;
                a.click();
                toast.success('QR downloaded!');
              }} className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto">
                <Download className="mr-2" /> Download
              </button>
            </div>
          </div>
        )}

        <ToastContainer position="top-right" autoClose={3000} />
      </div>
    </ErrorBoundary>
  );
}

export default StockPage;