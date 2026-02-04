import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowDownUp, Filter, PlusCircle, Search, ChevronLeft, ChevronRight,
  Edit2, MoreVertical, Package, XCircle, Trash2, Eye, Download, Upload, CheckCircle, Lock
} from 'lucide-react';
import { debounce } from 'lodash';
import { io } from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

/* ========= useFetchInventory ========= */
const useFetchInventory = ({ limit, offset }) => {
  const [inventory, setInventory] = useState([]);
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
      
      const url = `${backendUrl}/api/inventory/available?limit=${limit}&offset=${offset}&force_refresh=true`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Inventory fetch failed: ${response.statusText}`);
      }
      const { data, total } = await response.json();

      if (isMounted) {
        const normalizedData = data.map(item => ({
          ...item,
          price: item.price !== null ? Number(item.price) : 0,
          stock_quantity: item.stock_quantity ?? 0,
          reserved_quantity: item.reserved_quantity ?? 0,
          available_quantity: item.available_quantity ?? 0,
          returnable_qty: item.returnable_qty ?? 0,
          description: item.description || '',
          product_code: item.product_code,
        }));
        setInventory(normalizedData);
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

  return { inventory, totalItems, isLoading, error, refetchData: fetchData };
};

/* ========= Accept Return API helper ========= */
const acceptReturnApi = async (productId, qty) => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Authentication token missing.');
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
  const res = await fetch(`${backendUrl}/api/inventory/${productId}/accept-return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include',
    body: JSON.stringify({ qty })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Accept return failed (${res.status})`);
  }
  return await res.json();
};

/* ========= InventoryPage Component ========= */
function InventoryPage({ userRole }) {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStock, setFilterStock] = useState('All');
  const [showEditForm, setShowEditForm] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'product_id', direction: 'desc' });
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState('');
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [selectedProductName, setSelectedProductName] = useState('');
  const [selectedProductDescription, setSelectedProductDescription] = useState('');
  
  const [showQtyModal, setShowQtyModal] = useState(false);
  const [qtyProduct, setQtyProduct] = useState(null);
  
  // NEW: Reserve/Hold modal state
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveProduct, setReserveProduct] = useState(null);
  
  const tableRef = useRef(null);
  const fileInputRef = useRef(null);

  const { inventory: allInventory, totalItems, isLoading, error, refetchData } =
    useFetchInventory({ limit: 5000, offset: 0 });

  const openQuantityModal = useCallback((item) => {
    setQtyProduct(item);
    setShowQtyModal(true);
  }, []);

  const releaseHold = useCallback(async (holdId, productId) => {
    try {
      const token = localStorage.getItem('token');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

      const response = await fetch(
        `${backendUrl}/api/inventory/hold/${holdId}/release`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to release hold');
      }

      toast.success('Hold released successfully', { autoClose: 2000 });
      await refetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to release hold', { autoClose: 3000 });
    }
  }, [refetchData]);

  const generateQRCode = useCallback(async (productCode, productName, description, elementId) => {
    try {
      const data = JSON.stringify({
        product_code: productCode,
        product_name: productName,
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
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const socket = io(backendUrl, {
      withCredentials: true,
      transports: ['websocket'],
    });
    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    });
    socket.on('stockUpdate', () => {
      refetchData();
      toast.info('Inventory updated in real-time', { autoClose: 1200 });
      if (tableRef.current) tableRef.current.focus();
    });
    return () => socket.disconnect();
  }, [refetchData]);

  useEffect(() => {
    if (showBarcodeModal && selectedBarcode) {
      generateQRCode(selectedBarcode, selectedProductName, selectedProductDescription, 'qrcode-canvas');
    }
  }, [showBarcodeModal, selectedBarcode, selectedProductName, selectedProductDescription, generateQRCode]);

  const debouncedSearch = useCallback(debounce((value) => setSearchTerm(value), 300), []);

  useEffect(() => { setPage(0); }, [searchTerm, filterStock]);

  const handleSearchChange = (e) => {
    const value = e.target.value.toLowerCase();
    setSearchInput(value);
    debouncedSearch(value);
  };

  const sortedInventory = useMemo(() => {
    const sortableInventory = [...allInventory];
    if (sortConfig.key) {
      sortableInventory.sort((a, b) => {
        let aValue = a[sortConfig.key], bValue = b[sortConfig.key];
        if (sortConfig.key === 'product_id' || sortConfig.key === 'price' || sortConfig.key === 'stock_quantity' || sortConfig.key === 'returnable_qty' || sortConfig.key === 'available_quantity') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        } else if (sortConfig.key === 'created_at') {
          aValue = new Date(aValue || 0);
          bValue = new Date(bValue || 0);
        }
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableInventory;
  }, [allInventory, sortConfig]);

  const filteredInventory = useMemo(() => {
    return sortedInventory.filter(item => {
      const matchesSearch =
        item.product_id.toString().includes(searchTerm) ||
        item.product_name.toLowerCase().includes(searchTerm) ||
        (item.product_code || '').toLowerCase().includes(searchTerm);
      const matchesStock =
        filterStock === 'All' ||
        (filterStock === 'In Stock' && item.available_quantity > 0) ||
        (filterStock === 'Out of Stock' && item.available_quantity === 0);
      return matchesSearch && matchesStock;
    });
  }, [sortedInventory, searchTerm, filterStock]);

  const paginatedInventory = useMemo(() => {
    const start = page * itemsPerPage;
    return filteredInventory.slice(start, start + itemsPerPage);
  }, [filteredInventory, page, itemsPerPage]);

  const exportToExcel = useCallback(() => {
    if (filteredInventory.length === 0) {
      toast.warning('No data to export', { autoClose: 2500 });
      return;
    }

    const data = filteredInventory.map(item => ({
      'Product ID': item.product_id,
      'Product Code': item.product_code || 'N/A',
      'Product Name': (item.product_name || '').replace(/<[^>]*>/g, '').trim() || 'N/A',
      'Description': (item.description || 'N/A').replace(/<[^>]*>/g, '').trim(),
      'Stock Quantity': Number(item.stock_quantity ?? 0),
      'Reserved Qty': Number(item.reserved_quantity ?? 0),
      'Available Qty': Number(item.available_quantity ?? 0),
      'Returnable Qty': Number(item.returnable_qty ?? 0),
      'Price (₹)': formatCurrency(Number(item.price ?? 0)),
      'Created At': item.created_at
        ? new Date(item.created_at).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    const colWidths = [];
    const headers = Object.keys(data[0] || {});
    headers.forEach((header, i) => {
      let maxWidth = header.length;
      data.forEach(row => {
        const val = String(row[header] ?? '');
        maxWidth = Math.max(maxWidth, val.length);
      });
      colWidths[i] = { wch: Math.min(Math.max(maxWidth + 3, 12), 60) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Finished Goods');

    const today = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).replace(/ /g, '_');

    const filename = `FG_Inventory_${today}.xlsx`;

    XLSX.writeFile(workbook, filename);
    toast.success(`Exported ${filteredInventory.length} items successfully`, {
      autoClose: 2200,
    });
  }, [filteredInventory]);

  const validateImportRow = useCallback((row, index) => {
    const errors = [];
    if (!row['Product Name'] || !String(row['Product Name']).trim()) {
      errors.push(`Row ${index + 1}: Product Name is required`);
    }
    if (!row['Product Code'] || String(row['Product Code']).trim().length !== 10) {
      errors.push(`Row ${index + 1}: Product Code must be exactly 10 characters`);
    }
    const stockQuantity = parseInt(row['Stock Quantity']);
    if (isNaN(stockQuantity) || !Number.isInteger(Number(row['Stock Quantity']))) {
      errors.push(`Row ${index + 1}: Stock Quantity must be an integer`);
    }
    const price = parseFloat(String(row['Price (₹)'] || '0').replace(/[^0-9.]/g, ''));
    if (isNaN(price) || price < 0) {
      errors.push(`Row ${index + 1}: Price must be a non-negative number`);
    }
    const rq = row['Returnable Qty'] !== undefined ? parseInt(row['Returnable Qty']) : 0;
    if (row['Returnable Qty'] !== undefined && (!Number.isInteger(rq) || rq < 0)) {
      errors.push(`Row ${index + 1}: Returnable Qty must be a non-negative integer`);
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
              product_name: String(row['Product Name'] || '').trim(),
              product_code: String(row['Product Code'] || '').trim(),
              stock_quantity: parseInt(row['Stock Quantity'] || 0),
              price: parseFloat(String(row['Price (₹)'] || '0').replace(/[^0-9.]/g, '')),
              description: String(row['Description'] || '').trim() || undefined,
              returnable_qty: row['Returnable Qty'] !== undefined ? parseInt(row['Returnable Qty']) : 0,
              product_id: row['Product ID'] ? parseInt(row['Product ID']) : undefined,
            });
          }
        });

        if (errors.length > 0) {
          errors.forEach(error => toast.error(error, { autoClose: 5000 }));
        }
        if (!validRows.length) {
          toast.error('No valid rows to import. Check validation errors.', { autoClose: 5000 });
          return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
          toast.error('Authentication token missing. Please log in.', { autoClose: 5000 });
          return;
        }

        let createdCount = 0;
        let updatedCount = 0;
        let failedCount = 0;

        for (const row of validRows) {
          try {
            const { product_id, ...body } = row;
            const url = product_id
              ? `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/inventory/${product_id}`
              : `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/inventory`;
            const method = product_id ? 'PUT' : 'POST';

            const response = await fetch(url, {
              method,
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
              credentials: 'include',
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error(`Row ${validRows.indexOf(row) + 1} failed:`, { status: response.status, errorData });
              throw new Error(errorData.error || `Failed to ${product_id ? 'update' : 'create'} item (Status: ${response.status})`);
            }

            if (product_id) {
              updatedCount++;
            } else {
              createdCount++;
            }
          } catch (err) {
            failedCount++;
            console.error(`Row ${validRows.indexOf(row) + 1} error:`, err);
            toast.error(`Row ${validRows.indexOf(row) + 1}: ${err.message}`, { autoClose: 3000 });
          }
        }

        if (createdCount > 0 || updatedCount > 0) {
          await refetchData();
          setPage(0);
          toast.success(
            `Imported successfully: ${createdCount} created, ${updatedCount} updated${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
            { autoClose: 5000 }
          );
        } else {
          toast.error(`Import failed: ${failedCount} rows could not be processed`, { autoClose: 5000 });
        }
      };

      reader.readAsArrayBuffer(file);
      event.target.value = '';
    } catch (err) {
      console.error('Import error:', err);
      toast.error(`Import failed: ${err.message}`, { autoClose: 3000 });
    }
  }, [validateImportRow, refetchData]);

  const handleCreateItem = useCallback(async ({ product_name, stock_quantity, price, description, product_code, returnable_qty = 0 }) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error("Authentication token missing.");
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ product_name, stock_quantity, price, description, product_code, returnable_qty }),
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create item');
      }
      setPage(0);
      setSearchInput('');
      setFilterStock('All');
      setTimeout(() => refetchData(), 100);
      setShowCreateForm(false);
      toast.success('Item created successfully');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [refetchData]);

  // UPDATED: handleUpdateItem now accepts stock quantities for admin
  const handleUpdateItem = useCallback(async (itemId, formData) => {
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error("Authentication token missing.");
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/inventory/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData),
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update item (Status: ${response.status})`);
      }
      setTimeout(() => refetchData(), 100);
      setShowEditForm(false);
      setSelectedItem(null);
      toast.success('Item updated successfully');
    } catch (err) {
      toast.error(err.message);
      throw err;
    }
  }, [refetchData]);

  const handleDeleteItem = useCallback(async (itemId) => {
    if (!window.confirm("Are you sure you want to delete this item? This action cannot be undone.")) return;
    const token = localStorage.getItem('token');
    try {
      if (!token) throw new Error("Authentication token missing.");
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/inventory/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete item');
      }
      refetchData();
      toast.success('Item deleted successfully');
    } catch (err) {
      toast.error(err.message);
    }
  }, [refetchData]);

  const confirmEdit = useCallback((itemId, formData) => {
    if (window.confirm("Are you sure you want to update this item?")) return handleUpdateItem(itemId, formData);
    return Promise.reject(new Error("Update cancelled."));
  }, [handleUpdateItem]);

  const initiateEdit = useCallback((item) => {
    setSelectedItem(item);
    setShowEditForm(true);
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

  const ActionsDropdown = ({ item, onEdit }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [showAcceptModal, setShowAcceptModal] = useState(false);

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
          className="p-2 hover:bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label={`Actions for item ${item.product_name}`}
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <MoreVertical size={20} />
        </button>
        {isOpen && (
          <div className="absolute right-0 z-10 mt-2 w-56 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
            <button
              onClick={() => { onEdit(item); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>

            <button
              onClick={() => { 
                setReserveProduct(item);
                setShowReserveModal(true);
                setIsOpen(false); 
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 focus:outline-none focus:bg-blue-50"
            >
              <Lock size={16} className="mr-2" /> Reserve Stock
            </button>

            <button
              onClick={() => { setShowAcceptModal(true); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-green-700 hover:bg-green-50 focus:outline-none focus:bg-green-50"
              disabled={item.returnable_qty <= 0}
            >
              <CheckCircle size={16} className="mr-2" /> Accept Return
            </button>

            <button
              onClick={() => { handleDeleteItem(item.product_id); setIsOpen(false); }}
              className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-100 focus:outline-none focus:bg-red-100"
            >
              <Trash2 size={16} className="mr-2" /> Delete
            </button>
          </div>
        )}

        {showAcceptModal && (
          <AcceptReturnModal
            product={item}
            onClose={() => setShowAcceptModal(false)}
            onAccepted={async () => {
              setShowAcceptModal(false);
              await refetchData();
            }}
          />
        )}
      </div>
    );
  };

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  }, []);

  if (userRole !== 'admin') return (
    <div className="min-h-screen flex items-center justify-center text-gray-800 text-2xl" role="alert">
      Access Denied
    </div>
  );

  if (isLoading && !allInventory.length) return (
    <div className="min-h-screen flex items-center justify-center" aria-live="polite">
      <div className="text-gray-600 text-xl animate-pulse">Loading inventory...</div>
    </div>
  );

  if (error && !showEditForm && !showCreateForm) return (
    <div className="min-h-screen flex items-center justify-center text-red-700" role="alert">
      {error}
      <button
        onClick={() => refetchData()}
        className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Products/Finished Goods Stocks</h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-input" className="sr-only">Search inventory</label>
            <input
              id="search-input"
              type="text"
              placeholder="Search by ID, Name, or Code..."
              value={searchInput}
              onChange={handleSearchChange}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" aria-hidden="true" />
          </div>
          <div>
            <label htmlFor="stock-filter" className="sr-only">Filter inventory by stock</label>
            <select
              id="stock-filter"
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
              className="p-4 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
            >
              <option value="All">All Stock</option>
              <option value="In Stock">In Stock (&gt; 0)</option>
              <option value="Out of Stock">Zero Stock (= 0)</option>
            </select>
          </div>
          <button
            onClick={() => refetchData()}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh inventory"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading}
            aria-label="Create new item"
          >
            <PlusCircle className="mr-2" /> Add Item
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center shadow-md"
            disabled={isLoading}
            aria-label="Import from Excel"
          >
            <Upload className="mr-2" /> Import from Excel
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
            disabled={isLoading || filteredInventory.length === 0}
            aria-label="Export to Excel"
          >
            <Download className="mr-2" /> Export to Excel
          </button>
        </div>

        {isLoading && allInventory.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table className="w-full text-left" role="grid" aria-label="Inventory table" ref={tableRef} tabIndex={0}>
            <thead className="bg-amber-100">
              <tr role="row">
                {[
                  { key: 'product_id', label: 'Product ID' },
                  { key: 'product_code', label: 'Product Code' },
                  { key: 'product_name', label: 'Product Name' },
                  { key: 'description', label: 'Description' },
                  { key: 'stock_quantity', label: 'Stock (Physical)' },
                  { key: 'returnable_qty', label: 'Returnable Qty' },
                  { key: 'price', label: 'Price' },
                  { key: 'created_at', label: 'Created At (IST)' },
                  { key: 'qrcode', label: 'QR Code' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => key !== 'actions' && key !== 'qrcode' && handleSort(key)}
                    onKeyDown={(e) =>
                      key !== 'actions' &&
                      key !== 'qrcode' &&
                      (e.key === 'Enter' || e.key === ' ') &&
                      (e.preventDefault(), handleSort(key))
                    }
                    className={`py-5 px-3 ${
                      key !== 'actions' && key !== 'qrcode'
                        ? 'cursor-pointer hover:bg-amber-200 focus:outline-none focus:bg-amber-200'
                        : ''
                    }`}
                    tabIndex={key !== 'actions' && key !== 'qrcode' ? 0 : undefined}
                    aria-sort={sortConfig.key === key ? sortConfig.direction : 'none'}
                    role="columnheader"
                  >
                    <div className="flex items-center">
                      {label}
                      {key !== 'actions' && key !== 'qrcode' && (
                        <ArrowDownUp className="ml-2" size={16} aria-hidden="true" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedInventory.map(item => (
                <tr key={item.product_id} className="border-t hover:bg-amber-50" role="row">
                  <td className="py-4 px-3">{item.product_id}</td>
                  <td className="py-4 px-3">{item.product_code}</td>
                  <td className="py-4 px-3">{item.product_name.replace(/<[^>]*>/g, '')}</td>
                  <td className="py-4 px-3">
                    {item.description ? (
                      <button
                        onClick={() => showDescription(item.description)}
                        className="text-amber-600 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                        aria-label={`View description for ${item.product_name}`}
                      >
                        <Eye size={16} className="mr-1" aria-hidden="true" /> View
                      </button>
                    ) : '-'}
                  </td>
                  <td className="py-4 px-3">
                    <button
                      onClick={() => openQuantityModal(item)}
                      className={`px-3 py-1 rounded-full text-white text-sm hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                        item.stock_quantity > 0
                          ? 'bg-green-600 hover:bg-green-700'
                          : item.stock_quantity === 0
                            ? 'bg-gray-500'
                            : 'bg-red-600'
                      }`}
                      aria-label={`View quantity breakdown for ${item.product_name}`}
                    >
                      {item.stock_quantity}
                    </button>
                    <div className="text-xs text-gray-500 mt-1">
                      Avail: {item.available_quantity ?? item.stock_quantity}
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <span
                      className={`px-3 py-1 rounded-full text-white text-sm ${
                        item.returnable_qty > 0 ? 'bg-indigo-600' : 'bg-gray-400'
                      }`}
                    >
                      {item.returnable_qty}
                    </span>
                  </td>
                  <td className="py-4 px-3">{formatCurrency(item.price)}</td>
                  <td className="py-4 px-3">
                    <div className="flex flex-col">
                      <span>{new Date(item.created_at).toLocaleDateString('en-IN')}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(item.created_at).toLocaleTimeString('en-IN')}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-3">
                    <button
                      onClick={() =>
                        showBarcode(item.product_code, item.product_name, item.description)
                      }
                      className="text-amber-600 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                      aria-label={`View QR code for ${item.product_name}`}
                    >
                      <Eye size={16} className="mr-1" aria-hidden="true" /> QR Code
                    </button>
                  </td>
                  <td className="py-4 px-3">
                    <ActionsDropdown item={item} onEdit={initiateEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {paginatedInventory.length} of {filteredInventory.length} filtered items (Total: {totalItems})
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setPage(p => (p > 0 ? p - 1 : 0))}
                  disabled={page === 0}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * itemsPerPage >= filteredInventory.length}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {filteredInventory.length === 0 && (
            <div className="text-center py-16 flex flex-col items-center justify-center text-gray-500" role="alert">
              <Package size={48} className="mb-4 text-gray-400" />
              <p className="text-lg">No inventory items found.</p>
              {searchTerm || filterStock !== 'All' ? (
                <p className="mt-2">Try adjusting your search or filters.</p>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center"
                >
                  <PlusCircle className="mr-2" aria-hidden="true" /> Add Your First Item
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Item Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="create-form-title">
            <button
              onClick={() => setShowCreateForm(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close create form"
            >
              <XCircle size={24} aria-hidden="true" />
            </button>
            <h2 id="create-form-title" className="text-2xl font-bold mb-6">Add New Item</h2>
            <CreateItemForm onSubmit={handleCreateItem} onClose={() => setShowCreateForm(false)} />
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditForm && selectedItem && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="edit-form-title">
            <button
              onClick={() => setShowEditForm(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close edit form"
            >
              <XCircle size={24} aria-hidden="true" />
            </button>
            <h2 id="edit-form-title" className="text-2xl font-bold mb-6">Edit Item #{selectedItem.product_id}</h2>
            <EditItemForm item={selectedItem} onSubmit={confirmEdit} onClose={() => setShowEditForm(false)} />
          </div>
        </div>
      )}

      {/* Description Modal */}
      {showDescriptionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative" role="dialog" aria-labelledby="description-modal-title">
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

      {/* QR Code Modal */}
      {showBarcodeModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50 overflow-auto">
          <div
            className="bg-white p-6 rounded-2xl shadow-xl w-[90%] max-w-[500px] max-h-[90vh] relative flex flex-col"
            role="dialog"
            aria-labelledby="qrcode-modal-title"
          >
            <button
              onClick={() => setShowBarcodeModal(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close QR code modal"
            >
              <XCircle size={24} aria-hidden="true" />
            </button>

            <h2 id="qrcode-modal-title" className="text-2xl font-bold mb-4">QR Code for {selectedProductName}</h2>

            <div className="flex flex-col max-h-[70vh] overflow-y-auto pr-2">
              <div className="mb-4">
                <p className="text-gray-700"><strong>Product Code:</strong> {selectedBarcode}</p>
                <p className="text-gray-700 whitespace-pre-wrap"><strong>Description:</strong> {selectedProductDescription}</p>
              </div>
              <canvas
                id="qrcode-canvas"
                className="w-full max-w-[200px] mx-auto mb-4"
                aria-label={`QR code for ${selectedProductName}`}
              />
            </div>

            <div className="mt-4">
              <button
                onClick={() => {
                  const canvas = document.getElementById('qrcode-canvas');
                  if (!canvas) return;
                  const link = document.createElement('a');
                  link.href = canvas.toDataURL('image/png');
                  link.download = `qrcode_${selectedBarcode}.png`;
                  link.click();
                  toast.success('QR code downloaded successfully', { autoClose: 2000 });
                }}
                className="w-full p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 flex items-center justify-center"
              >
                <Download className="mr-2" aria-hidden="true" /> Download QR Code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quantity Breakdown Modal */}
      {showQtyModal && qtyProduct && (
        <QuantityBreakdownModal
          product={qtyProduct}
          onClose={() => setShowQtyModal(false)}
          onReleaseHold={releaseHold}
        />
      )}

      {/* NEW: Reserve Stock Modal */}
      {showReserveModal && reserveProduct && (
        <ReserveStockModal
          product={reserveProduct}
          onClose={() => setShowReserveModal(false)}
          onReserved={async () => {
            setShowReserveModal(false);
            await refetchData();
          }}
        />
      )}

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} closeOnClick pauseOnHover draggable />
    </div>
  );
}

/* ========= UPDATED: QuantityBreakdownModal Component - Changed button to link for order navigation ========= */
const QuantityBreakdownModal = ({ product, onClose, onReleaseHold }) => {
  const [holds, setHolds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHolds = async () => {
      try {
        const token = localStorage.getItem('token');
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const res = await fetch(
          `${backendUrl}/api/inventory/${product.product_id}/holds`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: 'include',
          }
        );
        
        if (!res.ok) {
          throw new Error('Failed to fetch holds');
        }
        
        const json = await res.json();
        setHolds(json.data || []);
      } catch (err) {
        console.error('Failed to load holds:', err);
        toast.error('Failed to load reserved stock', { autoClose: 3000 });
      } finally {
        setLoading(false);
      }
    };

    fetchHolds();
  }, [product.product_id]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white w-[90%] max-w-[900px] rounded-xl shadow-xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Close modal"
        >
          <XCircle size={24} />
        </button>

        <h2 className="text-2xl font-bold mb-4 pr-8">
          Quantity Breakdown — {product.product_name}
        </h2>

        {/* SUMMARY STATS */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Stat label="Physical" value={product.stock_quantity} />
          <Stat label="Reserved" value={product.reserved_quantity || 0} highlight />
          <Stat label="Available" value={product.available_quantity || 0} />
          <Stat label="Returnable" value={product.returnable_qty || 0} />
        </div>

        <div className="text-sm text-gray-600 mb-4">
          <strong>Formula:</strong> Available = Physical - Reserved
        </div>

        {/* RESERVED BREAKDOWN */}
        <h3 className="text-lg font-semibold mb-3 text-amber-700 flex items-center">
          <span className="w-2 h-2 bg-amber-600 rounded-full mr-2"></span>
          Reserved / Blocked Stock
        </h3>

        {loading ? (
          <p className="text-gray-500 py-4">Loading holds…</p>
        ) : holds.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-4 text-gray-600 text-center">
            <Package size={32} className="mx-auto mb-2 text-gray-400" />
            <p>No active reservations</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border rounded-lg">
              <thead className="bg-amber-100">
                <tr>
                  <th className="p-3 text-left">Reason</th>
                  <th className="p-3 text-left">Qty</th>
                  <th className="p-3 text-left">For</th>
                  <th className="p-3 text-left">Reference</th>
                  <th className="p-3 text-left">Created</th>
                  <th className="p-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {holds.map(h => (
                  <tr key={h.hold_id} className="border-t hover:bg-amber-50">
                    <td className="p-3">{h.reason}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 bg-amber-200 rounded-full text-sm font-medium">
                        {h.quantity}
                      </span>
                    </td>
                    
                    <td className="p-3">
                      {h.reference_type ? (
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            h.reference_type === 'ORDER'
                              ? 'bg-blue-100 text-blue-800'
                              : h.reference_type === 'QA'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {h.reference_type}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>

                    <td className="p-3 text-sm">
                      {h.reference_value ? (
                        h.reference_type === 'ORDER' ? (
                          <a
                            href={`/orders?orderId=${h.reference_value}`}
                            className="text-blue-600 hover:underline font-medium focus:outline-none focus:ring-2 focus:ring-blue-300 rounded px-1"
                          >
                            #{h.reference_value}
                          </a>
                        ) : (
                          <span className="font-medium">{h.reference_value}</span>
                        )
                      ) : (
                        '-'
                      )}
                    </td>

                    <td className="p-3 text-sm">
                      {new Date(h.created_at).toLocaleDateString('en-IN')}
                      <div className="text-gray-500 text-xs">
                        {new Date(h.created_at).toLocaleTimeString('en-IN')}
                      </div>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => onReleaseHold(h.hold_id, product.product_id)}
                        className="text-red-600 hover:text-red-800 hover:underline focus:outline-none focus:ring-2 focus:ring-red-300 rounded px-2 py-1"
                      >
                        Release
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

/* Helper Component for Stats */
const Stat = ({ label, value, highlight }) => (
  <div className={`p-4 rounded-lg text-center ${highlight ? 'bg-amber-200 border-2 border-amber-400' : 'bg-gray-100'}`}>
    <div className="text-sm text-gray-600 mb-1">{label}</div>
    <div className="text-2xl font-bold">{value ?? 0}</div>
  </div>
);

/* ========= NEW: ReserveStockModal Component ========= */
const ReserveStockModal = ({ product, onClose, onReserved }) => {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [referenceType, setReferenceType] = useState('');
  const [referenceValue, setReferenceValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReserve = async () => {
    if (!reason.trim()) {
      toast.error('Please enter a reason for reservation', { autoClose: 3000 });
      return;
    }

    if (quantity <= 0 || quantity > product.available_quantity) {
      toast.error(`Quantity must be between 1 and ${product.available_quantity}`, { autoClose: 3000 });
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('token');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

      const response = await fetch(
        `${backendUrl}/api/inventory/${product.product_id}/hold`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include',
          body: JSON.stringify({
            quantity: parseInt(quantity),
            reason: reason.trim(),
            reference_type: referenceType || null,
            reference_value: referenceValue || null
          })
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reserve stock');
      }

      toast.success('Stock reserved successfully', { autoClose: 2000 });
      if (onReserved) await onReserved();
    } catch (err) {
      console.error('Reserve stock failed', err);
      toast.error(err.message || 'Failed to reserve stock', { autoClose: 4000 });
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-60">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-[480px] relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Close reserve stock modal"
        >
          <XCircle size={22} />
        </button>
        
        <h3 className="text-xl font-semibold mb-3 flex items-center">
          <Lock size={20} className="mr-2 text-blue-600" />
          Reserve Stock — {product.product_name}
        </h3>
        
        <p className="text-sm text-gray-600 mb-4">
          Available to reserve: <strong className="text-green-600">{product.available_quantity}</strong>
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">Quantity to Reserve</label>
            <input
              type="number"
              min={1}
              max={product.available_quantity}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Reason <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Reserved for order #123"
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Reference Type (optional)</label>
            <select
              value={referenceType}
              onChange={(e) => setReferenceType(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
              disabled={isSubmitting}
            >
              <option value="">-- Select --</option>
              <option value="ORDER">Order</option>
              <option value="QA">Quality Assurance</option>
              <option value="MANUAL">Manual Hold</option>
            </select>
          </div>

          {referenceType && (
            <div>
              <label className="text-sm font-medium block mb-1">Reference Value</label>
              <input
                type="text"
                value={referenceValue}
                onChange={(e) => setReferenceValue(e.target.value)}
                placeholder={referenceType === 'ORDER' ? 'Order ID' : 'Reference value'}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-300"
                disabled={isSubmitting}
              />
            </div>
          )}
        </div>

        <div className="flex space-x-3 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleReserve}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Reserving...' : (
              <>
                <Lock className="mr-2" size={16} />
                Reserve
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ========= CreateItemForm ========= */
const CreateItemForm = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    product_name: '',
    stock_quantity: '0',
    returnable_qty: '0',
    price: 0,
    description: '',
    product_code: '',
  });
  const [errors, setErrors] = useState({
    product_name: '',
    stock_quantity: '',
    returnable_qty: '',
    price: '',
    description: '',
    product_code: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [partSearch, setPartSearch] = useState('');
  const [allParts, setAllParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [isPartLoading, setIsPartLoading] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [partsLoaded, setPartsLoaded] = useState(false);

  const partDropdownRef = useRef(null);

  const validateField = (name, value) => {
    if (name === 'product_name' && !value.trim()) return 'Product name is required';
    if (name === 'price' && value < 0) return 'Price cannot be negative';
    if (name === 'product_code' && value.length !== 10) return 'Product code must be exactly 10 characters';
    if (name === 'returnable_qty' && (value === '' || !Number.isInteger(Number(value)) || Number(value) < 0)) {
      return 'Returnable Qty must be a non-negative integer';
    }
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    let processedValue;
    if (name === 'stock_quantity' || name === 'returnable_qty') {
      processedValue = value;
    } else if (name === 'price') {
      processedValue = parseFloat(value) || 0;
    } else {
      processedValue = value;
    }

    setFormData(prev => ({ ...prev, [name]: processedValue }));
    if (name !== 'stock_quantity') {
      setErrors(prev => ({ ...prev, [name]: validateField(name, processedValue) }));
    }
  };

  const loadParts = useCallback(async () => {
    if (partsLoaded || isPartLoading) return;
    try {
      setIsPartLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing.');

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/parts?limit=500&offset=0`, {
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch parts (${res.status})`);
      }

      const json = await res.json();
      const list = json.data || [];
      setAllParts(list);
      setPartsLoaded(true);
    } catch (err) {
      console.error('Failed to load parts:', err);
      toast.error(err.message || 'Failed to load parts', { autoClose: 3000 });
    } finally {
      setIsPartLoading(false);
    }
  }, [partsLoaded, isPartLoading]);

  useEffect(() => {
    const term = partSearch.toLowerCase().trim();
    if (!term) {
      setFilteredParts(allParts.slice(0, 20));
    } else {
      setFilteredParts(
        allParts
          .filter(p =>
            (p.partCode || '').toLowerCase().includes(term) ||
            (p.name || '').toLowerCase().includes(term) ||
            (p.drawingNo || '').toLowerCase().includes(term)
          )
          .slice(0, 20)
      );
    }
  }, [partSearch, allParts]);

  useEffect(() => {
    if (!showPartDropdown) return;

    const handleClickOutside = (event) => {
      if (partDropdownRef.current && !partDropdownRef.current.contains(event.target)) {
        setShowPartDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPartDropdown]);

  const handlePartSearchChange = async (e) => {
    const value = e.target.value;
    setPartSearch(value);
    setShowPartDropdown(true);
    if (!partsLoaded && !isPartLoading) {
      loadParts();
    }
  };

  const handlePartSelect = (part) => {
    setFormData(prev => ({
      ...prev,
      product_name: part.name || '',
      product_code: part.partCode || '',
      description: part.description || '',
    }));
    setErrors(prev => ({
      ...prev,
      product_name: '',
      product_code: '',
      description: '',
    }));
    setPartSearch(`${part.partCode} — ${part.name}`);
    setShowPartDropdown(false);
  };

  const handleSave = async () => {
    const fieldErrors = {
      product_name: validateField('product_name', formData.product_name),
      stock_quantity: '',
      returnable_qty: validateField('returnable_qty', formData.returnable_qty),
      price: validateField('price', formData.price),
      product_code: validateField('product_code', formData.product_code),
      description: '',
    };

    const sq = formData.stock_quantity.trim();
    if (sq === '') {
      fieldErrors.stock_quantity = 'Stock quantity is required';
    } else if (!Number.isInteger(Number(sq))) {
      fieldErrors.stock_quantity = 'Stock quantity must be an integer (can be negative)';
    }

    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(err => err)) return;

    const parsedQty = parseInt(sq, 10);
    const parsedReturnable = parseInt(formData.returnable_qty || '0', 10);

    try {
      setIsSubmitting(true);
      await onSubmit({
        ...formData,
        stock_quantity: parsedQty,
        returnable_qty: parsedReturnable
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={e => e.preventDefault()}>
      <div>
        <label className="text-gray-700 font-medium">Search Part (optional)</label>
        <div className="relative" ref={partDropdownRef}>
          <input
            type="text"
            value={partSearch}
            onChange={handlePartSearchChange}
            onFocus={() => {
              setShowPartDropdown(true);
              if (!partsLoaded && !isPartLoading) {
                loadParts();
              }
            }}
            placeholder="Type part code or name..."
            className="w-full p-2 pl-8 border rounded-lg focus:ring-2 focus:ring-amber-300"
            disabled={isSubmitting}
          />
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          {showPartDropdown && (
            <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border rounded-lg shadow-lg">
              {isPartLoading && (
                <div className="px-3 py-2 text-sm text-gray-500">Loading parts...</div>
              )}
              {!isPartLoading && filteredParts.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">No parts found.</div>
              )}
              {!isPartLoading && filteredParts.map(part => (
                <button
                  key={part.id}
                  type="button"
                  onClick={() => handlePartSelect(part)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50"
                >
                  <div className="font-medium">{part.partCode} — {part.name}</div>
                  <div className="text-xs text-gray-500">
                    {part.partTypeName}{part.drawingNo ? ` • Drawing: ${part.drawingNo}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Selecting a part will fill Product Code, Product Name and Description.
        </p>
      </div>

      <div>
        <label htmlFor="create-product-name" className="text-gray-700 font-medium">Product Name</label>
        <input
          id="create-product-name"
          type="text"
          name="product_name"
          value={formData.product_name}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_name}
          aria-describedby={errors.product_name ? "create-product-name-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.product_name && <p id="create-product-name-error" className="text-red-600 text-sm mt-1">{errors.product_name}</p>}
      </div>

      <div>
        <label htmlFor="create-product-code" className="text-gray-700 font-medium">Product Code (10 chars)</label>
        <input
          id="create-product-code"
          type="text"
          name="product_code"
          value={formData.product_code}
          onChange={handleChange}
          maxLength={10}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_code}
          aria-describedby={errors.product_code ? "create-product-code-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.product_code && <p id="create-product-code-error" className="text-red-600 text-sm mt-1">{errors.product_code}</p>}
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
        <label htmlFor="create-stock-quantity" className="text-gray-700 font-medium">Stock Quantity (can be negative)</label>
        <input
          id="create-stock-quantity"
          type="number"
          name="stock_quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.stock_quantity}
          aria-describedby={errors.stock_quantity ? "create-stock-quantity-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.stock_quantity && <p id="create-stock-quantity-error" className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>}
      </div>

      <div>
        <label htmlFor="create-returnable-qty" className="text-gray-700 font-medium">Returnable Qty</label>
        <input
          id="create-returnable-qty"
          type="number"
          name="returnable_qty"
          value={formData.returnable_qty}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.returnable_qty}
          aria-describedby={errors.returnable_qty ? "create-returnable-qty-error" : undefined}
          disabled={isSubmitting}
          min={0}
        />
        {errors.returnable_qty && <p id="create-returnable-qty-error" className="text-red-600 text-sm mt-1">{errors.returnable_qty}</p>}
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
          aria-describedby={errors.price ? "create-price-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.price && <p id="create-price-error" className="text-red-600 text-sm mt-1">{errors.price}</p>}
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

/* ========= UPDATED: EditItemForm with Admin Quantity Control ========= */
const EditItemForm = ({ item, onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    product_name: item.product_name,
    price: item.price,
    description: item.description || '',
    product_code: item.product_code,
    stock_quantity: item.stock_quantity ?? 0,
    returnable_qty: item.returnable_qty ?? 0,
  });
  const [errors, setErrors] = useState({
    product_name: '',
    price: '',
    description: '',
    product_code: '',
    stock_quantity: '',
    returnable_qty: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = (name, value) => {
    if (name === 'product_name' && !value.trim()) return 'Product name is required';
    if (name === 'price' && value < 0) return 'Price cannot be negative';
    if (name === 'product_code' && value.length !== 10) return 'Product code must be exactly 10 characters';
    if (name === 'returnable_qty' && (value === '' || !Number.isInteger(Number(value)) || Number(value) < 0)) {
      return 'Returnable Qty must be a non-negative integer';
    }
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    let processedValue;
    if (name === 'stock_quantity' || name === 'returnable_qty') {
      processedValue = value;
    } else if (name === 'price') {
      processedValue = parseFloat(value) || 0;
    } else {
      processedValue = value;
    }

    setFormData(prev => ({ ...prev, [name]: processedValue }));
    if (name !== 'stock_quantity') {
      setErrors(prev => ({ ...prev, [name]: validateField(name, processedValue) }));
    }
  };

  const handleSave = async () => {
    const fieldErrors = {
      product_name: validateField('product_name', formData.product_name),
      price: validateField('price', formData.price),
      product_code: validateField('product_code', formData.product_code),
      description: '',
      stock_quantity: '',
      returnable_qty: validateField('returnable_qty', formData.returnable_qty),
    };

    const sq = formData.stock_quantity.toString().trim();
    if (sq === '') {
      fieldErrors.stock_quantity = 'Stock quantity is required';
    } else if (!Number.isInteger(Number(sq))) {
      fieldErrors.stock_quantity = 'Stock quantity must be an integer';
    }

    setErrors(fieldErrors);
    if (Object.values(fieldErrors).some(err => err)) return;

    const parsedQty = parseInt(sq, 10);
    const parsedReturnable = parseInt(formData.returnable_qty || '0', 10);

    try {
      setIsSubmitting(true);
      await onSubmit(item.product_id, {
        ...formData,
        stock_quantity: parsedQty,
        returnable_qty: parsedReturnable
      });
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
          name="product_name"
          value={formData.product_name}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_name}
          aria-describedby={errors.product_name ? "edit-product-name-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.product_name && <p id="edit-product-name-error" className="text-red-600 text-sm mt-1">{errors.product_name}</p>}
      </div>

      <div>
        <label htmlFor="edit-product-code" className="text-gray-700 font-medium">Product Code (10 chars)</label>
        <input
          id="edit-product-code"
          type="text"
          name="product_code"
          value={formData.product_code}
          onChange={handleChange}
          maxLength={10}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.product_code}
          aria-describedby={errors.product_code ? "edit-product-code-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.product_code && <p id="edit-product-code-error" className="text-red-600 text-sm mt-1">{errors.product_code}</p>}
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
        <label htmlFor="edit-stock-quantity" className="text-gray-700 font-medium">Stock Quantity (Physical)</label>
        <input
          id="edit-stock-quantity"
          type="number"
          name="stock_quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.stock_quantity}
          aria-describedby={errors.stock_quantity ? "edit-stock-quantity-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.stock_quantity && <p id="edit-stock-quantity-error" className="text-red-600 text-sm mt-1">{errors.stock_quantity}</p>}
      </div>

      <div>
        <label htmlFor="edit-returnable-qty" className="text-gray-700 font-medium">Returnable Qty</label>
        <input
          id="edit-returnable-qty"
          type="number"
          name="returnable_qty"
          value={formData.returnable_qty}
          onChange={handleChange}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300"
          aria-invalid={!!errors.returnable_qty}
          aria-describedby={errors.returnable_qty ? "edit-returnable-qty-error" : undefined}
          disabled={isSubmitting}
          min={0}
        />
        {errors.returnable_qty && <p id="edit-returnable-qty-error" className="text-red-600 text-sm mt-1">{errors.returnable_qty}</p>}
      </div>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <strong>Note:</strong> Stock quantities can be edited directly. Changes will be reflected immediately in the system.
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
          aria-describedby={errors.price ? "edit-price-error" : undefined}
          disabled={isSubmitting}
        />
        {errors.price && <p id="edit-price-error" className="text-red-600 text-sm mt-1">{errors.price}</p>}
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
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
};

/* ========= AcceptReturnModal ========= */
const AcceptReturnModal = ({ product, onClose, onAccepted }) => {
  const [qty, setQty] = useState(product.returnable_qty ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    const parsed = parseInt(qty, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error('Please enter a positive integer quantity to accept.', { autoClose: 3000 });
      return;
    }
    if (parsed > (product.returnable_qty ?? 0)) {
      toast.error(`Cannot accept more than ${product.returnable_qty}`, { autoClose: 3000 });
      return;
    }
    try {
      setIsSubmitting(true);
      await acceptReturnApi(product.product_id, parsed);
      toast.success('Return accepted and stock updated', { autoClose: 2000 });
      if (onAccepted) await onAccepted();
    } catch (err) {
      console.error('Accept return failed', err);
      toast.error(err.message || 'Accept return failed', { autoClose: 4000 });
    } finally {
      setIsSubmitting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-60">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-[420px] relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Close accept return modal"
        >
          <XCircle size={22} />
        </button>
        <h3 className="text-xl font-semibold mb-3">Accept Return — {product.product_name}</h3>
        <p className="text-sm text-gray-600 mb-4">Available to accept: <strong>{product.returnable_qty}</strong></p>

        <label className="text-sm font-medium">Quantity to accept</label>
        <input
          type="number"
          min={1}
          max={product.returnable_qty}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-300 mb-3"
        />

        <div className="flex space-x-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Accepting...' : (<><CheckCircle className="mr-2" /> Accept</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;