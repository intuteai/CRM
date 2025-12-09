import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  ArrowDownUp, Search, ChevronLeft, ChevronRight, X, RefreshCw,
  Plus, Edit2, XCircle, MoreVertical, Download, Upload, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';

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

// Format Date Helper
const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Weserv Image Proxy Helper
const getWeservUrl = (imageUrl) => {
  if (!imageUrl) return null;
  
  // If it's already a weserv URL, return as-is
  if (imageUrl.includes('images.weserv.nl')) return imageUrl;
  
  // Extract Google Drive file ID if it's a Drive URL
  let directUrl = imageUrl;
  const driveMatch = imageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    directUrl = `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  }
  
  // Proxy through Weserv
  return `https://images.weserv.nl/?url=${encodeURIComponent(directUrl)}&w=1400&h=1000&fit=outside&output=webp&q=90`;
};

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
    location: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [selectedDescription, setSelectedDescription] = useState('');
  const [uploadingId, setUploadingId] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const modalRef = useRef(null);
  const fileInputRef = useRef(null);
  const debouncedSearch = useDebounce(searchInput, 300);

  // ---- Part selector state (for modal) ----
  const [partSearch, setPartSearch] = useState('');
  const [allParts, setAllParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [isPartLoading, setIsPartLoading] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [partsLoaded, setPartsLoaded] = useState(false);
  const partDropdownRef = useRef(null);
  // ----------------------------------------

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
        location: item.location || '',
        imageUrl: item.imageUrl || item.image_url || null,
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

    socket.on('stockUpdate', ({ product_id, stock_quantity, location, image_url, status }) => {
      setStockItems(prev => {
        if (!Array.isArray(prev)) return prev || [];
        if (status === 'Deleted') {
          toast.info(`Product #${product_id} deleted`, { autoClose: 2000 });
          return prev.filter(item => item.productId !== product_id);
        }
        return prev.map(item =>
          item.productId === product_id
            ? { 
                ...item, 
                stockQuantity: Number(stock_quantity), 
                location: location || item.location, 
                imageUrl: image_url || item.imageUrl 
              }
            : item
        );
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
    fetchStock().then(cleanup => { if (!mounted && cleanup) cleanup(); });
    return () => { mounted = false; };
  }, [fetchStock]);

  // Search & Pagination
  useEffect(() => setSearchTerm(debouncedSearch), [debouncedSearch]);
  useEffect(() => setPage(0), [searchTerm]);

  // Modal Focus Trap (focus Product Name, not part search)
  useEffect(() => {
    if (showModal && modalRef.current) {
      // Prefer productName input
      const targetInput =
        modalRef.current.querySelector('input[name="productName"]') ||
        modalRef.current.querySelector('input:not([name="partSearch"])') ||
        modalRef.current.querySelector('input');

      targetInput?.focus();

      const handleTab = (e) => {
        if (e.key !== 'Tab') return;
        const focusable = modalRef.current.querySelectorAll('button, input, textarea');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', handleTab);
      return () => document.removeEventListener('keydown', handleTab);
    }
  }, [showModal]);

  // ---- Parts API + filtering for modal ----
  const loadParts = useCallback(async () => {
    if (partsLoaded || isPartLoading) return;
    try {
      setIsPartLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Authentication token missing.');

      const res = await fetch(`${BASE_URL}/api/parts?limit=500&offset=0`, {
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

  const handlePartSearchChange = (e) => {
    const value = e.target.value;
    setPartSearch(value);
    // Do NOT auto-open here; dropdown only opens on focus
    if (!partsLoaded && !isPartLoading) {
      loadParts();
    }
  };

  const handlePartSelect = (part) => {
    setFormData(prev => ({
      ...prev,
      productName: part.name || '',
      productCode: part.partCode || '',
      description: part.description || '',
    }));
    setFormErrors(prev => ({
      ...prev,
      productName: '',
      productCode: '',
      description: '',
    }));
    setPartSearch(`${part.partCode} — ${part.name}`);
    setShowPartDropdown(false);
  };
  // -----------------------------------------

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
    setPartSearch('');
    setShowPartDropdown(false);
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
    setPartSearch('');
    setShowPartDropdown(false);
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
  }, [formData, modalMode, selectedItem, fetchStock, validateForm]);

  // Upload Photo with Weserv
  const uploadPhoto = useCallback(async (productId, file) => {
    if (!file) return;
    
    console.log('UPLOAD STARTED', { productId, fileName: file.name });
    setUploadingId(productId);
    const toastId = toast.loading(`Uploading ${file.name}...`);
    
    const formDataUpload = new FormData();
    formDataUpload.append('photo', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/stock/${productId}/photo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formDataUpload
      });

      const result = await res.json();
      console.log('Upload response:', result);

      if (!res.ok) {
        throw new Error(result.message || result.error || 'Upload failed');
      }

      const rawImageUrl = result.imageUrl || result.image_url || result.link || null;
      const weservImageUrl = getWeservUrl(rawImageUrl);
      
      setStockItems(prev => prev.map(item =>
        item.productId === productId ? { ...item, imageUrl: weservImageUrl } : item
      ));
      
      toast.update(toastId, { 
        render: 'Image uploaded successfully!', 
        type: 'success', 
        isLoading: false, 
        autoClose: 3000 
      });
    } catch (err) {
      console.error('Upload error:', err);
      toast.update(toastId, { 
        render: `Upload failed: ${err.message}`, 
        type: 'error', 
        isLoading: false, 
        autoClose: 5000 
      });
    } finally {
      setUploadingId(null);
    }
  }, []);

  // Actions Dropdown
  const ActionsDropdown = ({ item }) => {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
      const handleOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    return (
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="p-2 hover:bg-gray-100 rounded-full transition"
        >
          <MoreVertical size={20} />
        </button>
        
        {open && (
          <div className="absolute right-0 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5 z-10">
            <button 
              onClick={() => { handleEdit(item); setOpen(false); }} 
              className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 items-center"
            >
              <Edit2 size={16} className="mr-2" /> Edit
            </button>
            
            <label className="flex w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 items-center cursor-pointer">
              <Upload size={16} className="mr-2" /> Upload Photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    console.log('FILE SELECTED:', file.name);
                    uploadPhoto(item.productId, file);
                  }
                  setOpen(false);
                }}
              />
            </label>
            
            <button 
              onClick={() => { handleDelete(item.productId); setOpen(false); }} 
              className="flex w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 items-center"
            >
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

  if (error && !showModal && !showDescriptionModal) {
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
                      { key: 'location', label: 'Location' },
                      { key: 'stockQuantity', label: 'Stock' },
                      { key: 'qtyRequired', label: 'Req' },
                      { key: 'price', label: 'Price (₹)' },
                      { key: 'productCode', label: 'Code' },
                      { key: 'description', label: 'Desc' },
                      { key: 'createdAt', label: 'Created' },
                      { key: 'actions', label: 'Actions' }
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        className={`py-5 px-3 text-gray-800 font-semibold text-base ${key !== 'actions' ? 'cursor-pointer hover:bg-amber-300' : ''}`}
                        onClick={() => key !== 'actions' && sortData(key)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && key !== 'actions' && sortData(key)}
                        tabIndex={key !== 'actions' ? 0 : -1}
                        aria-sort={sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <div className="flex items-center justify-between">
                          {label}
                          {key !== 'actions' && (
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
                    const weservImageUrl = getWeservUrl(item.imageUrl);
                    
                    return (
                      <tr key={item.productId} className="border-t hover:bg-amber-50">
                        <td className="py-4 px-3 text-gray-600">{item.productId}</td>
                        <td className="py-4 px-3 text-gray-600 font-medium">
                          <div className="flex items-center gap-3">
                            {weservImageUrl ? (
                              <img 
                                src={weservImageUrl} 
                                alt={item.productName} 
                                className="w-10 h-10 rounded-md object-cover border cursor-pointer hover:opacity-80 transition" 
                                onClick={() => {
                                  setSelectedImage({ url: weservImageUrl, name: item.productName });
                                  setShowImageModal(true);
                                }}
                                onError={(e) => {
                                  console.error('Image load failed:', weservImageUrl);
                                  e.target.style.display = 'none';
                                  e.target.nextElementSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            {!weservImageUrl && (
                              <div className="w-10 h-10 rounded-md bg-gray-100 border flex items-center justify-center text-sm text-gray-400">No</div>
                            )}
                            <div>
                              <div className="font-medium">{item.productName}</div>
                              <div className="text-xs text-gray-500">{item.productCode}</div>
                            </div>
                          </div>
                        </td>
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
                        <td className="py-4 px-3 text-gray-600 text-sm">{formatDate(item.createdAt)}</td>
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-2">
                            <ActionsDropdown item={item} />
                            {uploadingId === item.productId && <div className="text-sm text-amber-600 animate-pulse">Uploading...</div>}
                          </div>
                        </td>
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

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50" role="dialog">
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto relative" ref={modalRef}>
              <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700">
                <XCircle size={24} />
              </button>
              <h2 className="text-2xl font-bold text-gray-800 mb-6">
                {modalMode === 'create' ? 'Create Product' : `Edit #${selectedItem?.productId}`}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Part search (optional) */}
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Search Part (optional)</label>
                  <div className="relative" ref={partDropdownRef}>
                    <input
                      name="partSearch"
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
                      className="w-full p-3 pl-9 border rounded-lg focus:ring-2 focus:ring-amber-300"
                    />
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
                    Selecting a part will fill Product Name, Product Code and Description.
                  </p>
                </div>

                <div>
                  <label className="block text-gray-700 font-medium mb-1">Product Name *</label>
                  <input 
                    name="productName"
                    type="text" 
                    value={formData.productName} 
                    onChange={e => setFormData({ ...formData, productName: e.target.value })} 
                    className={`w-full p-3 border rounded-lg ${formErrors.productName ? 'border-red-500' : ''}`} 
                    required 
                  />
                  {formErrors.productName && <p className="text-red-500 text-sm mt-1">{formErrors.productName}</p>}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Product Code *</label>
                  <input 
                    name="productCode"
                    type="text" 
                    value={formData.productCode} 
                    onChange={e => setFormData({ ...formData, productCode: e.target.value })} 
                    className={`w-full p-3 border rounded-lg ${formErrors.productCode ? 'border-red-500' : ''}`} 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Location</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Warehouse A, Shelf 12" 
                    value={formData.location} 
                    onChange={e => setFormData({ ...formData, location: e.target.value })} 
                    className="w-full p-3 border rounded-lg" 
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Price (₹) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    value={formData.price} 
                    onChange={e => setFormData({ ...formData, price: e.target.value })} 
                    className={`w-full p-3 border rounded-lg ${formErrors.price ? 'border-red-500' : ''}`} 
                    required 
                  />
                  {formErrors.price && <p className="text-red-500 text-sm mt-1">{formErrors.price}</p>}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">{modalMode === 'create' ? 'Initial Stock' : 'Stock Quantity'}</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    min="0" 
                    value={formData.stockQuantity} 
                    onChange={e => setFormData({ ...formData, stockQuantity: e.target.value })} 
                    className={`w-full p-3 border rounded-lg ${formErrors.stockQuantity ? 'border-red-500' : ''}`} 
                    required={modalMode === 'create'} 
                  />
                  {formErrors.stockQuantity && <p className="text-red-500 text-sm mt-1">{formErrors.stockQuantity}</p>}
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Qty Required</label>
                  <input 
                    type="number" 
                    min="0" 
                    value={formData.qtyRequired} 
                    onChange={e => setFormData({ ...formData, qtyRequired: e.target.value })} 
                    className="w-full p-3 border rounded-lg" 
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Description</label>
                  <textarea 
                    value={formData.description} 
                    onChange={e => setFormData({ ...formData, description: e.target.value })} 
                    className="w-full p-3 border rounded-lg" 
                    rows="2" 
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold">
                    {modalMode === 'create' ? 'Create' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Description Modal */}
        {showDescriptionModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
              <button onClick={() => setShowDescriptionModal(false)} className="absolute top-4 right-4 hover:text-gray-700">
                <XCircle size={24} />
              </button>
              <h2 className="text-2xl font-bold mb-4">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{selectedDescription || 'None'}</p>
            </div>
          </div>
        )}

        {/* Image Modal */}
        {showImageModal && selectedImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
            onClick={() => setShowImageModal(false)}
          >
            <div className="relative max-w-7xl max-h-full">
              <button 
                onClick={() => setShowImageModal(false)} 
                className="absolute -top-12 right-0 text-white hover:text-gray-300 transition"
              >
                <XCircle size={32} />
              </button>
              <img 
                src={selectedImage.url} 
                alt={selectedImage.name} 
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="text-white text-center mt-4 text-lg font-medium">
                {selectedImage.name}
              </div>
            </div>
          </div>
        )}

        <ToastContainer position="top-right" autoClose={3000} />
      </div>
    </ErrorBoundary>
  );
}

export default StockPage;
