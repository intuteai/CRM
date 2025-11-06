import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ArrowDownUp, Search, ChevronLeft, ChevronRight, Edit2, MoreVertical,
  XCircle, Eye, Download, Upload, PlusCircle, Package
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

const useFetchStock = () => {
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

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const url = `${backendUrl}/api/stock?limit=5000&offset=0&force_refresh=true`;

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
          stockQuantity: item.stockQuantity ?? 0,
          qtyRequired: item.qtyRequired ?? 0,
          description: item.description || '',
          productCode: item.productCode || '',
          productName: item.productName || '',
          productId: item.productId,
          createdAt: item.createdAt,
          location: item.location || '' // NEW
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
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { stockItems, totalItems, isLoading, error, refetchData: fetchData };
};

function StoreStockPage() {
  const [page, setPage] = useState(0);
  const [itemsPerPage] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({
    productName: '',
    description: '',
    productCode: '',
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
  const [selectedProductLocation, setSelectedProductLocation] = useState(''); // NEW

  const tableRef = useRef(null);
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);
  const searchInputRef = useRef(null);

  const { stockItems, totalItems, isLoading, error, refetchData } = useFetchStock();

  const debouncedSearch = useCallback(debounce((value) => setSearchTerm(value.toLowerCase()), 300), []);

  useEffect(() => {
    debouncedSearch(searchInput);
    return () => debouncedSearch.cancel();
  }, [searchInput, debouncedSearch]);

  useEffect(() => setPage(0), [searchTerm]);

  // Socket Connection
  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    const socket = io(backendUrl, { withCredentials: true, transports: ['websocket'] });

    socket.on('connect', () => toast.success('Connected to real-time updates!', { autoClose: 2000 }));
    socket.on('connect_error', () => toast.error('Failed to connect to real-time updates.', { autoClose: 3000 }));

    socket.on('stockUpdate', ({ product_id, stock_quantity, location }) => {
      setStockItems(prev => {
        const index = prev.findIndex(item => item.productId === product_id);
        if (index === -1) {
          refetchData();
          return prev;
        }
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          stockQuantity: Number(stock_quantity),
          location: location ?? updated[index].location
        };
        toast.info(`${updated[index].productName} → ${stock_quantity} @ ${updated[index].location || 'N/A'}`, { autoClose: 2000 });
        return updated;
      });
      tableRef.current?.focus();
    });

    return () => socket.disconnect();
  }, [refetchData]);

  // QR Code
  const generateQRCode = useCallback(async (productCode, productName, description, location, elementId) => {
    try {
      const data = JSON.stringify({
        productCode,
        productName,
        description: description || 'No description',
        location: location || 'Not set'
      });
      await QRCode.toCanvas(document.getElementById(elementId), data, {
        width: 200, margin: 2, errorCorrectionLevel: 'H'
      });
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
        if (['stockQuantity', 'qtyRequired', 'productId'].includes(sortConfig.key)) {
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
      const terms = [
        item.productId, item.productName, item.productCode, item.location
      ].map(s => String(s || '').toLowerCase());
      return terms.some(t => t.includes(searchTerm));
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
    if (!row['Product Code']?.trim() || String(row['Product Code']).trim().length !== 10) {
      errors.push(`Row ${index + 1}: Product Code must be 10 characters`);
    }
    const stock = parseInt(row['Stock Quantity']);
    if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      errors.push(`Row ${index + 1}: Stock Quantity must be non-negative integer`);
    }
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
              stockQuantity: parseInt(row['Stock Quantity'] || 0),
              description: String(row['Description'] || '').trim() || undefined,
              qtyRequired: parseInt(row['Qty Required'] || 0),
              location: String(row['Location'] || '').trim() || undefined,
              productId: row['Product ID'] ? parseInt(row['Product ID']) : undefined
            });
          }
        });

        if (errors.length) errors.forEach(e => toast.error(e));
        if (!valid.length) return;

        const token = localStorage.getItem('token');
        let created = 0, updated = 0, failed = 0;

        for (const row of valid) {
          try {
            const { productId, ...body } = row;
            const url = productId
              ? `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/stock/${productId}`
              : `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/stock`;
            const method = productId ? 'PUT' : 'POST';

            let payload = { ...body, price: 0.01 };
            if (productId) {
              const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/stock?limit=1&productId=${productId}`, {
                headers: { 'Authorization': `Bearer ${token}` }, credentials: 'include'
              });
              if (res.ok) {
                const { data } = await res.json();
                if (data[0]?.price) payload.price = data[0].price;
              }
            }

            const res = await fetch(url, {
              method, headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(payload), credentials: 'include'
            });

            if (!res.ok) throw new Error((await res.json()).error);
            productId ? updated++ : created++;
          } catch {
            failed++;
          }
        }

        await refetchData();
        setPage(0);
        toast.success(`Imported: ${created} created, ${updated} updated${failed ? `, ${failed} failed` : ''}`);
      } catch (err) {
        toast.error(`Import failed: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  }, [validateImportRow, refetchData]);

  // Export Excel
  const exportToExcel = useCallback(() => {
    const data = filteredStock.map(item => ({
      'Product ID': item.productId,
      'Product Code': item.productCode,
      'Product Name': item.productName,
      'Location': item.location || 'N/A',
      'Description': item.description || 'N/A',
      'Stock Quantity': item.stockQuantity,
      'Qty Required': item.qtyRequired,
      'Created At (IST)': item.createdAt ? formatDate(item.createdAt) : 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Raw Materials');
    XLSX.writeFile(wb, 'Raw_Material_Inventory.xlsx');
    toast.success('Exported to Excel!');
  }, [filteredStock]);

  // Handlers
  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  }, []);

  const showDescription = useCallback((desc) => {
    setSelectedDescription(desc || 'No description');
    setShowDescriptionModal(true);
  }, []);

  const showBarcode = useCallback((code, name, desc, location) => {
    setSelectedBarcode(code);
    setSelectedProductName(name);
    setSelectedProductDescription(desc);
    setSelectedProductLocation(location || 'Not set');
    setShowBarcodeModal(true);
  }, []);

  const ActionsDropdown = ({ item, onEdit }) => {
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
          </div>
        )}
      </div>
    );
  };

  const validateForm = useCallback(() => {
    const errors = {};
    if (!formData.productName.trim()) errors.productName = 'Required';
    if (!formData.productCode || formData.productCode.length !== 10) errors.productCode = 'Must be 10 characters';
    const stock = parseInt(formData.stockQuantity);
    if ((modalMode === 'create' || modalMode === 'edit') && (isNaN(stock) || stock < 0)) {
      errors.stockQuantity = 'Must be non-negative integer';
    }
    return errors;
  }, [formData, modalMode]);

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
      const url = isCreate
        ? `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/stock`
        : `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/stock/${selectedItem.productId}`;

      const body = {
        productName: formData.productName,
        description: formData.description || undefined,
        productCode: formData.productCode,
        stockQuantity: isCreate ? parseInt(formData.stockQuantity) : undefined,
        qtyRequired: parseInt(formData.qtyRequired) || 0,
        location: formData.location || undefined,
        price: isCreate ? 0.01 : selectedItem.price
      };

      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include'
      });

      if (!res.ok) throw new Error((await res.json()).error);
      await refetchData();
      setShowModal(false);
      setPage(0);
      toast.success(isCreate ? 'Item created!' : 'Item updated!');
    } catch (err) {
      toast.error(err.message);
    }
  }, [formData, modalMode, selectedItem, refetchData]);

  const handleCreate = useCallback(() => {
    setModalMode('create');
    setSelectedItem(null);
    setFormData({
      productName: '', description: '', productCode: '', stockQuantity: '', qtyRequired: '', location: ''
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
      qtyRequired: item.qtyRequired || '',
      location: item.location || ''
    });
    setFormErrors({});
    setShowModal(true);
  }, []);

  // Focus Trap
  useEffect(() => {
    if (showModal && modalRef.current) {
      const first = modalRef.current.querySelector('input');
      first?.focus();
      const handle = (e) => {
        if (e.key !== 'Tab') return;
        const focusable = modalRef.current.querySelectorAll('button, input, textarea');
        const firstEl = focusable[0], lastEl = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault(); lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault(); firstEl.focus();
        }
      };
      document.addEventListener('keydown', handle);
      return () => document.removeEventListener('keydown', handle);
    }
  }, [showModal]);

  // Render
  if (isLoading && !stockItems.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center">
        <div className="text-gray-600 text-xl animate-pulse">Loading raw materials...</div>
      </div>
    );
  }

  if (error && !showModal && !showDescriptionModal && !showBarcodeModal) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center">
        <div className="text-red-700 text-lg text-center">
          <p>{error}</p>
          <button onClick={refetchData} className="mt-4 p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center">Store Raw Material Inventory</h1>
      <div className="max-w-7xl mx-auto">

        {/* Toolbar */}
        <div className="flex mb-8 gap-4 flex-wrap">
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search by ID, Name, Code, or Location..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setSearchInput(''), setSearchTerm(''))}
              ref={searchInputRef}
              className="w-full p-4 pl-12 border rounded-lg focus:ring-2 focus:ring-amber-300 shadow-md"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearchTerm(''); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            )}
          </div>
          <button onClick={refetchData} disabled={isLoading} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md">
            Refresh
          </button>
          <button onClick={handleCreate} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md">
            <PlusCircle className="mr-2" size={20} /> Add Item
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md">
            <Upload className="mr-2" size={20} /> Import
          </button>
          <input type="file" ref={fileInputRef} onChange={importFromExcel} accept=".xlsx,.xls" className="hidden" />
          <button onClick={exportToExcel} disabled={!filteredStock.length} className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center shadow-md">
            <Download className="mr-2" size={20} /> Export
          </button>
        </div>

        {/* Table */}
        {filteredStock.length === 0 && !isLoading ? (
          <div className="bg-white p-16 rounded-2xl shadow-lg text-center">
            <Package size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="text-lg text-gray-600">No items found.</p>
            {!searchTerm && (
              <button onClick={handleCreate} className="mt-4 p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto">
                <PlusCircle className="mr-2" /> Add First Item
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
            <table className="w-full text-left min-w-[1200px]" ref={tableRef} tabIndex={0}>
              <thead className="bg-amber-100">
                <tr>
                  {[
                    { key: 'productId', label: 'ID' },
                    { key: 'productCode', label: 'Code' },
                    { key: 'productName', label: 'Name' },
                    { key: 'location', label: 'Location' }, // NEW
                    { key: 'description', label: 'Desc' },
                    { key: 'stockQuantity', label: 'Stock' },
                    { key: 'qtyRequired', label: 'Req' },
                    { key: 'createdAt', label: 'Created' },
                    { key: 'qrcode', label: 'QR' },
                    { key: 'actions', label: 'Actions' }
                  ].map(({ key, label }) => (
                    <th
                      key={key}
                      onClick={() => key !== 'actions' && key !== 'qrcode' && handleSort(key)}
                      className={`py-5 px-3 text-base font-medium ${key !== 'actions' && key !== 'qrcode' ? 'cursor-pointer hover:bg-amber-200' : ''}`}
                      tabIndex={key !== 'actions' && key !== 'qrcode' ? 0 : -1}
                    >
                      <div className="flex items-center">
                        {label}
                        {key !== 'actions' && key !== 'qrcode' && <ArrowDownUp className="ml-2" size={16} />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedStock.map(item => {
                  const isLow = item.stockQuantity < item.qtyRequired;
                  return (
                    <tr key={item.productId} className="border-t hover:bg-amber-50">
                      <td className="py-4 px-3 text-gray-700">{item.productId}</td>
                      <td className="py-4 px-3 text-gray-700 font-mono">{item.productCode}</td>
                      <td className="py-4 px-3 text-gray-700 font-medium">{item.productName}</td>
                      <td className="py-4 px-3 text-gray-700">{item.location || <span className="italic text-gray-400">Not set</span>}</td>
                      <td className="py-4 px-3">
                        {item.description ? (
                          <button onClick={() => showDescription(item.description)} className="text-amber-600 hover:text-amber-800 flex items-center">
                            <Eye size={16} className="mr-1" /> View
                          </button>
                        ) : '-'}
                      </td>
                      <td className="py-4 px-3">
                        <span className={`px-3 py-1 rounded-full text-white text-sm ${isLow ? 'bg-red-500' : 'bg-green-500'}`}>
                          {item.stockQuantity}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-gray-700">{item.qtyRequired}</td>
                      <td className="py-4 px-3 text-sm text-gray-600">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="py-4 px-3">
                        <button onClick={() => showBarcode(item.productCode, item.productName, item.description, item.location)} className="text-amber-600 hover:text-amber-800 flex items-center">
                          <Eye size={16} className="mr-1" /> QR
                        </button>
                      </td>
                      <td className="py-4 px-3 sticky right-0 bg-white">
                        <ActionsDropdown item={item} onEdit={handleEdit} />
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
                <div className="flex gap-4">
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

      {/* Modals */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[520px]" ref={modalRef}>
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4"><XCircle size={24} /></button>
            <h2 className="text-2xl font-bold mb-6">{modalMode === 'create' ? 'Add Item' : `Edit #${selectedItem?.productId}`}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Product Name *</label>
                <input type="text" value={formData.productName} onChange={e => setFormData({ ...formData, productName: e.target.value })} className={`w-full p-3 border rounded-lg ${formErrors.productName ? 'border-red-500' : ''}`} required />
              </div>
              <div>
                <label className="block font-medium mb-1">Product Code (10 chars) *</label>
                <input type="text" maxLength={10} value={formData.productCode} onChange={e => setFormData({ ...formData, productCode: e.target.value })} className={`w-full p-3 border rounded-lg ${formErrors.productCode ? 'border-red-500' : ''}`} required />
              </div>
              <div>
                <label className="block font-medium mb-1">Location</label>
                <input type="text" placeholder="e.g., Shelf A-12" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} className="w-full p-3 border rounded-lg" />
              </div>
              <div>
                <label className="block font-medium mb-1">{modalMode === 'create' ? 'Initial Stock' : 'Stock Quantity'}</label>
                <input type="number" min="0" step="1" value={formData.stockQuantity} onChange={e => setFormData({ ...formData, stockQuantity: e.target.value })} className={`w-full p-3 border rounded-lg ${formErrors.stockQuantity ? 'border-red-500' : ''}`} required={modalMode === 'create'} />
              </div>
              <div>
                <label className="block font-medium mb-1">Qty Required</label>
                <input type="number" min="0" step="1" value={formData.qtyRequired} onChange={e => setFormData({ ...formData, qtyRequired: e.target.value })} className="w-full p-3 border rounded-lg" />
              </div>
              <div>
                <label className="block font-medium mb-1">Description</label>
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

      {showDescriptionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
            <button onClick={() => setShowDescriptionModal(false)} className="absolute top-4 right-4"><XCircle size={24} /></button>
            <h2 className="text-2xl font-bold mb-4">Description</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{selectedDescription}</p>
          </div>
        </div>
      )}

      {showBarcodeModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-[500px] relative">
            <button onClick={() => setShowBarcodeModal(false)} className="absolute top-4 right-4"><XCircle size={24} /></button>
            <h2 className="text-2xl font-bold mb-4">QR: {selectedProductName}</h2>
            <div className="space-y-1 text-sm text-gray-700 mb-4">
              <p><strong>Code:</strong> {selectedBarcode}</p>
              <p><strong>Location:</strong> {selectedProductLocation}</p>
            </div>
            <canvas id="qrcode-canvas" className="w-full max-w-[200px] mx-auto mb-4"></canvas>
            <button onClick={() => {
              const canvas = document.getElementById('qrcode-canvas');
              const a = document.createElement('a');
              a.href = canvas.toDataURL('image/png');
              a.download = `QR_${selectedBarcode}.png`;
              a.click();
              toast.success('Downloaded!');
            }} className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center mx-auto">
              <Download className="mr-2" /> Download
            </button>
          </div>
        </div>
      )}

      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default StoreStockPage;