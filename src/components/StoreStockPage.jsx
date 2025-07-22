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

function StoreStockPage() {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'productId', direction: 'desc' });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create', 'edit'
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    productName: '',
    description: '',
    productCode: '',
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
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

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
      refetchData();
      toast.info(`Stock for product #${product_id} updated to ${stock_quantity}`, { autoClose: 2000 });
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
      'Created At (IST)': item.createdAt ? formatDate(item.createdAt) : 'N/A',
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Raw Materials');
    const colWidths = data.reduce((accumulator, row) => {
      Object.keys(row).forEach((key, idx) => {
        const value = String(row[key]).replace(/<[^>]*>/g, '');
        accumulator[idx] = Math.max(accumulator[idx] || 10, value.length + 2);
      });
      return accumulator;
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
    if (sortConfig.key === 'stockQuantity' || sortConfig.key === 'qtyRequired' || sortConfig.key === 'productId') {
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

  const validateForm = useCallback(() => {
    const errors = {};
    if (!formData.productName.trim()) errors.productName = 'Product name is required';
    if (!formData.productCode.trim() || formData.productCode.length !== 10) errors.productCode = 'Product code must be exactly 10 characters';
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
      const url = modalMode === 'create' ? `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/stock` : `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/stock/${selectedItem.productId}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      const stockQuantity = parseFloat(formData.stockQuantity);
      const qtyRequired = parseInt(formData.qtyRequired) || 0;
      const body = {
        productName: formData.productName,
        description: formData.description,
        productCode: formData.productCode,
        stockQuantity: modalMode === 'edit' ? stockQuantity : undefined,
        qtyRequired
      };
      if (modalMode === 'create') body.stockQuantity = stockQuantity >= 0 ? stockQuantity : 0;

      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `${modalMode === 'create' ? 'Create' : 'Update'} failed`);
      }
      await refetchData();
      toast.success(`Product ${modalMode === 'create' ? 'created' : 'updated'}`, { autoClose: 2000 });
      setShowModal(false);
      setFormErrors({});
      setPage(0);
      setSearchInput('');
    } catch (err) {
      toast.error(err.message || 'Operation failed', { autoClose: 3000 });
    }
  }, [formData, modalMode, selectedItem, refetchData, validateForm]);

  const handleCreate = useCallback(() => {
    setModalMode('create');
    setSelectedItem(null);
    setFormData({
      productName: '',
      description: '',
      productCode: '',
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
      stockQuantity: item.stockQuantity || '',
      qtyRequired: item.qtyRequired || ''
    });
    setFormErrors({});
    setShowModal(true);
  }, []);

  useEffect(() => {
    if (showModal) {
      const firstInput = modalRef.current?.querySelector('input');
      if (firstInput) firstInput.focus();

      const handleTabKey = (e) => {
        if (e.key === 'Tab') {
          const focusableElements = modalRef.current?.querySelectorAll('button, input, a, select, textarea');
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

  if (isLoading && !stockItems.length) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center" aria-live="polite">
      <div className="text-gray-600 text-xl animate-pulse">Loading raw materials...</div>
    </div>
  );

  if (error && !showModal && !showDescriptionModal && !showBarcodeModal) return (
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
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Store Raw Material Inventory</h1>
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
            onClick={handleCreate}
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
                    <ActionsDropdown item={item} onEdit={handleEdit} />
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
                  onClick={handleCreate}
                  className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                >
                  <PlusCircle className="mr-2" /> Add Your First Item
                </button>
              )}
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50" role="dialog" aria-labelledby="stock-modal-title">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" ref={modalRef}>
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                aria-label="Close modal"
              >
                <XCircle size={24} />
              </button>
              <h2 id="stock-modal-title" className="text-2xl font-bold text-gray-800 mb-6">
                {modalMode === 'create' ? 'Add New Raw Material' : `Edit Raw Material #${selectedItem?.productId}`}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="productName" className="block text-gray-700 font-medium mb-2">Product Name</label>
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
                  {formErrors.productName && <p id="productName-error" className="text-red-500 text-sm mt-1">{formErrors.productName}</p>}
                </div>
                <div>
                  <label htmlFor="productCode" className="block text-gray-700 font-medium mb-2">Product Code (10 chars)</label>
                  <input
                    id="productCode"
                    type="text"
                    value={formData.productCode}
                    onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                    maxLength={10}
                    className={`w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300 ${formErrors.productCode ? 'border-red-500' : ''}`}
                    required
                    aria-invalid={!!formErrors.productCode}
                    aria-describedby={formErrors.productCode ? 'productCode-error' : undefined}
                  />
                  {formErrors.productCode && <p id="productCode-error" className="text-red-500 text-sm mt-1">{formErrors.productCode}</p>}
                </div>
                <div>
                  <label htmlFor="description" className="block text-gray-700 font-medium mb-2">Description</label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                </div>
                <div>
                  <label htmlFor="stockQuantity" className="block text-gray-700 font-medium mb-2">
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
                  {formErrors.stockQuantity && <p id="stockQuantity-error" className="text-red-500 text-sm mt-1">{formErrors.stockQuantity}</p>}
                </div>
                <div>
                  <label htmlFor="qtyRequired" className="block text-gray-700 font-medium mb-2">Quantity Required</label>
                  <input
                    id="qtyRequired"
                    type="number"
                    min="0"
                    value={formData.qtyRequired}
                    onChange={(e) => setFormData({ ...formData, qtyRequired: e.target.value })}
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

export default StoreStockPage;