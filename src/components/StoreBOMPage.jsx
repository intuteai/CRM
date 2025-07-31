import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ArrowDownUp, RefreshCw, Search, Edit2, MoreVertical, XCircle, Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const userRole = localStorage.getItem('role');

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

function StoreBOMPage({ socket: providedSocket, userRole: propUserRole }) {
  const [boms, setBoms] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedBom, setSelectedBom] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    materials: [{ materialId: '', quantityPerUnit: '' }],
  });
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: 'bomId', direction: 'desc' });
  const [page, setPage] = useState(0);
  const [limit] = useState(10);
  const [expandedRows, setExpandedRows] = useState([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const tableRef = useRef(null);
  const searchInputRef = useRef(null);
  const hasFetched = useRef(false);
  const isFetching = useRef(false);

  // Autocomplete state
  const [productQuery, setProductQuery] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Material autocomplete state
  const [materialQueries, setMaterialQueries] = useState({});
  const [filteredMaterials, setFilteredMaterials] = useState({});
  const [isMaterialDropdownOpen, setIsMaterialDropdownOpen] = useState({});
  const [selectedMaterialIndices, setSelectedMaterialIndices] = useState({});

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

  const fetchBoms = useCallback(async () => {
    if (isFetching.current) return;
    isFetching.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const url = `${BASE_URL}/api/bom?limit=${limit}&offset=${page * limit}&force_refresh=true`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Server responded with status: ${response.status}`);
      }

      const responseData = await response.json();
      const bomsData = responseData.data;
      if (!Array.isArray(bomsData)) {
        throw new Error('Invalid data format: Expected an array in response.data');
      }

      setBoms(bomsData);
      setTotalItems(responseData.total || bomsData.length || 0);
    } catch (err) {
      console.error('Error fetching BOMs:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      toast.error(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [page, limit]);

  const fetchProductsAndMaterials = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');

      const productResponse = await fetch(`${BASE_URL}/api/inventory?limit=1000`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!productResponse.ok) {
        const errorText = await productResponse.text();
        throw new Error(`Failed to fetch products: ${errorText || productResponse.status}`);
      }
      const productData = await productResponse.json();
      console.log('Raw product data from /api/inventory:', productData); // Debug log
      const normalizedProducts = Array.isArray(productData.data || productData)
        ? (productData.data || productData).map(p => ({
            productId: p.productId || p.product_id,
            productName: p.productName || p.product_name || 'Unnamed Product'
          }))
        : [];
      console.log('Normalized products:', normalizedProducts); // Debug log
      setProducts(normalizedProducts);

      const materialResponse = await fetch(`${BASE_URL}/api/stock?limit=1000`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!materialResponse.ok) {
        const errorText = await materialResponse.text();
        throw new Error(`Failed to fetch materials: ${errorText || materialResponse.status}`);
      }
      const materialData = await materialResponse.json();
      console.log('Raw material data from /api/stock:', materialData); // Debug log
      const normalizedMaterials = Array.isArray(materialData.data || materialData)
        ? (materialData.data || materialData).map(m => ({
            productId: m.productId || m.product_id,
            productName: m.productName || m.product_name || 'Unnamed Material'
          }))
        : [];
      console.log('Normalized materials:', normalizedMaterials); // Debug log
      setMaterials(normalizedMaterials);

      setIsDataLoaded(true);
    } catch (err) {
      console.error('Error fetching products/materials:', err);
      toast.error(`Failed to load products or materials: ${err.message}`, { autoClose: 3000 });
      setIsDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasFetched.current) {
      fetchBoms();
      fetchProductsAndMaterials();
      hasFetched.current = true;
    }

    const handleConnect = () => {
      console.log('Connected to Socket.IO in StoreBOMPage');
      toast.success('Connected to real-time updates!', { autoClose: 2000 });
    };

    const handleConnectError = (err) => {
      console.error('Socket connection error:', err);
      toast.error('Failed to connect to real-time updates.', { autoClose: 3000 });
    };

    const handleBomCreated = (bom) => {
      setBoms((prev) => {
        if (!Array.isArray(prev)) return [bom];
        toast.info(`BOM #${bom.bomId} created`, { autoClose: 2000 });
        return [bom, ...prev];
      });
    };

    const handleBomUpdated = (bom) => {
      setBoms((prev) => {
        if (!Array.isArray(prev)) return prev || [];
        const index = prev.findIndex((item) => item.bomId === bom.bomId);
        if (index === -1) return prev;
        const updatedBoms = [...prev];
        updatedBoms[index] = bom;
        toast.info(`BOM #${bom.bomId} updated`, { autoClose: 2000 });
        return updatedBoms;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('bom:created', handleBomCreated);
    socket.on('bom:updated', handleBomUpdated);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('bom:created', handleBomCreated);
      socket.off('bom:updated', handleBomUpdated);
      if (!providedSocket) socket.disconnect();
    };
  }, [fetchBoms, fetchProductsAndMaterials, socket, providedSocket]);

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

  const toggleRow = useCallback((bomId) => {
    setExpandedRows((prev) =>
      prev.includes(bomId) ? prev.filter((id) => id !== bomId) : [...prev, bomId]
    );
  }, []);

  const filteredBoms = useMemo(() => {
    if (!Array.isArray(boms)) return [];

    return boms.filter((item) => {
      if (!item) return false;

      const searchFields = [
        String(item.bomId || ''),
        String(item.productId || ''),
        item.productName || '',
        ...(item.materials || []).map((m) => String(m.materialId || '')),
        ...(item.materials || []).map((m) => m.materialName || ''),
      ];

      return searchFields.some((field) =>
        field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [boms, searchTerm]);

  const sortedBoms = useMemo(() => {
    if (!filteredBoms.length) return [];

    const sortableBoms = [...filteredBoms];

    return sortableBoms.sort((a, b) => {
      const valueA = a[sortConfig.key] ?? '';
      const valueB = b[sortConfig.key] ?? '';

      if (valueA < valueB) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (valueA > valueB) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredBoms, sortConfig]);

  const handleCreate = useCallback(() => {
    if (!isDataLoaded) {
      toast.warn('Please wait, loading products and materials...', { autoClose: 2000 });
      return;
    }
    setModalMode('create');
    setSelectedBom(null);
    setFormData({
      productId: '',
      materials: [{ materialId: '', quantityPerUnit: '' }],
    });
    setProductQuery('');
    setFilteredProducts([]);
    setIsProductDropdownOpen(false);
    setSelectedIndex(-1);
    setMaterialQueries({});
    setFilteredMaterials({});
    setIsMaterialDropdownOpen({});
    setSelectedMaterialIndices({});
    setShowModal(true);
  }, [isDataLoaded]);

  const handleEdit = useCallback((bom) => {
    setModalMode('edit');
    setSelectedBom(bom);
    setFormData({
      productId: bom.productId || '',
      materials: bom.materials.map((m) => ({
        materialId: m.materialId || '',
        quantityPerUnit: m.quantityPerUnit || '',
      })),
    });
    setProductQuery(products.find(p => p.productId === bom.productId)?.productName || '');
    setFilteredProducts([]);
    setIsProductDropdownOpen(false);
    setSelectedIndex(-1);
    setMaterialQueries(
      bom.materials.reduce((acc, m, idx) => ({
        ...acc,
        [idx]: materials.find(mat => mat.productId === m.materialId)?.productName || ''
      }), {})
    );
    setFilteredMaterials({});
    setIsMaterialDropdownOpen({});
    setSelectedMaterialIndices({});
    setShowModal(true);
  }, [products, materials]);

  const handleAddMaterial = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      materials: [...prev.materials, { materialId: '', quantityPerUnit: '' }],
    }));
    setMaterialQueries(prev => ({ ...prev, [prev.materials.length]: '' }));
    setFilteredMaterials(prev => ({ ...prev, [prev.materials.length]: [] }));
    setIsMaterialDropdownOpen(prev => ({ ...prev, [prev.materials.length]: false }));
    setSelectedMaterialIndices(prev => ({ ...prev, [prev.materials.length]: -1 }));
  }, []);

  const handleRemoveMaterial = useCallback((index) => {
    setFormData((prev) => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index),
    }));
    setMaterialQueries(prev => {
      const newQueries = { ...prev };
      delete newQueries[index];
      return newQueries;
    });
    setFilteredMaterials(prev => {
      const newMaterials = { ...prev };
      delete newMaterials[index];
      return newMaterials;
    });
    setIsMaterialDropdownOpen(prev => {
      const newOpen = { ...prev };
      delete newOpen[index];
      return newOpen;
    });
    setSelectedMaterialIndices(prev => {
      const newIndices = { ...prev };
      delete newIndices[index];
      return newIndices;
    });
  }, []);

  const handleMaterialChange = useCallback((index, field, value) => {
    setFormData((prev) => {
      const newMaterials = [...prev.materials];
      newMaterials[index] = { ...newMaterials[index], [field]: value };
      return { ...prev, materials: newMaterials };
    });
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setUploading(true);

      try {
        const token = localStorage.getItem('token');
        const method = modalMode === 'create' ? 'POST' : 'PUT';
        const url =
          modalMode === 'create'
            ? `${BASE_URL}/api/bom`
            : `${BASE_URL}/api/bom/${selectedBom.bomId}`;

        const body = {
          productId: parseInt(formData.productId),
          materials: formData.materials.map((m) => ({
            materialId: parseInt(m.materialId),
            quantityPerUnit: parseFloat(m.quantityPerUnit),
          })),
        };

        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `${modalMode === 'create' ? 'Create' : 'Update'} failed with status: ${response.status}`);
        }

        const updatedBom = await response.json();
        if (modalMode === 'create') {
          toast.success(`BOM #${updatedBom.bomId} created successfully!`, { autoClose: 2000 });
        } else {
          toast.success(`BOM #${updatedBom.bomId} updated successfully!`, { autoClose: 2000 });
        }

        setShowModal(false);
      } catch (err) {
        console.error(`${modalMode === 'create' ? 'Create' : 'Update'} error:`, err);
        toast.error(err.message || `${modalMode === 'create' ? 'Create' : 'Update'} failed`, { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [formData, modalMode, selectedBom]
  );

  const ActionsDropdown = useCallback(
    ({ bom, onEdit }) => {
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
            aria-label={`Actions for BOM ${bom.bomId}`}
          >
            <MoreVertical size={20} />
          </button>
          {isOpen && (
            <div className="absolute right-0 z-10 mt-2 w-48 bg-white shadow-lg rounded-lg ring-1 ring-black ring-opacity-5">
              <button
                onClick={() => {
                  onEdit(bom);
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
    if (page > 0) setPage((prev) => prev - 1);
  }, [page]);

  const handleNextPage = useCallback(() => {
    if ((page + 1) * limit < totalItems) {
      setPage((prev) => prev + 1);
    }
  }, [page, limit, totalItems]);

  const handleRefresh = useCallback(() => {
    setPage(0);
    hasFetched.current = false;
    fetchBoms();
  }, [fetchBoms]);

  // Autocomplete handlers
  const handleProductSelect = useCallback((product) => {
    setFormData(prev => ({ ...prev, productId: product.productId }));
    setProductQuery(product.productName);
    setFilteredProducts([]);
    setIsProductDropdownOpen(false);
    setSelectedIndex(-1);
  }, []);

  const handleProductInputChange = useCallback((e) => {
    const query = e.target.value;
    setProductQuery(query);
    setIsProductDropdownOpen(true);
    setSelectedIndex(-1);

    if (query) {
      const filtered = products.filter(p =>
        p.productName.toLowerCase().includes(query.toLowerCase()) ||
        String(p.productId).includes(query.toLowerCase())
      );
      setFilteredProducts(filtered.length > 0 ? filtered : [{ productId: null, productName: 'No matches found' }]);
    } else {
      setFilteredProducts([]);
    }
  }, [products]);

  const handleProductKeyDown = useCallback((e) => {
    if (!isProductDropdownOpen || filteredProducts.length === 0) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && filteredProducts[selectedIndex].productId !== null) {
          handleProductSelect(filteredProducts[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsProductDropdownOpen(false);
        break;
      default:
        break;
    }
  }, [isProductDropdownOpen, filteredProducts, selectedIndex, handleProductSelect]);

  const handleMaterialSelect = useCallback((index, material) => {
    if (material.productId !== null) {
      setFormData(prev => {
        const newMaterials = [...prev.materials];
        newMaterials[index] = { ...newMaterials[index], materialId: material.productId };
        return { ...prev, materials: newMaterials };
      });
      setMaterialQueries(prev => ({ ...prev, [index]: material.productName }));
      setFilteredMaterials(prev => ({ ...prev, [index]: [] }));
      setIsMaterialDropdownOpen(prev => ({ ...prev, [index]: false }));
      setSelectedMaterialIndices(prev => ({ ...prev, [index]: -1 }));
    }
  }, []);

  const handleMaterialInputChange = useCallback((index, e) => {
    const query = e.target.value;
    setMaterialQueries(prev => ({ ...prev, [index]: query }));
    setIsMaterialDropdownOpen(prev => ({ ...prev, [index]: true }));
    setSelectedMaterialIndices(prev => ({ ...prev, [index]: -1 }));

    if (query) {
      const filtered = materials.filter(m =>
        (m.productName?.toLowerCase() || '').includes(query.toLowerCase()) ||
        (m.product_name?.toLowerCase() || '').includes(query.toLowerCase()) ||
        String(m.productId).includes(query.toLowerCase()) ||
        String(m.product_id).includes(query.toLowerCase())
      );
      console.log(`Filtering materials for query "${query}":`, filtered); // Debug log
      setFilteredMaterials(prev => ({
        ...prev,
        [index]: filtered.length > 0 ? filtered : [{ productId: null, productName: 'No matches found' }]
      }));
    } else {
      setFilteredMaterials(prev => ({ ...prev, [index]: [] }));
    }
  }, [materials]);

  const handleMaterialKeyDown = useCallback((index, e) => {
    if (!isMaterialDropdownOpen[index] || !filteredMaterials[index]?.length) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setSelectedMaterialIndices(prev => ({
          ...prev,
          [index]: prev[index] > 0 ? prev[index] - 1 : (filteredMaterials[index]?.length || 0) - 1
        }));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedMaterialIndices(prev => ({
          ...prev,
          [index]: prev[index] < (filteredMaterials[index]?.length || 0) - 1 ? prev[index] + 1 : 0
        }));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedMaterialIndices[index] >= 0 && filteredMaterials[index] && filteredMaterials[index][selectedMaterialIndices[index]].productId !== null) {
          handleMaterialSelect(index, filteredMaterials[index][selectedMaterialIndices[index]]);
        }
        break;
      case 'Escape':
        setIsMaterialDropdownOpen(prev => ({ ...prev, [index]: false }));
        break;
      default:
        break;
    }
  }, [isMaterialDropdownOpen, filteredMaterials, selectedMaterialIndices, handleMaterialSelect]);

  if (isLoading && !boms.length) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        aria-live="polite"
      >
        <div className="text-gray-600 text-xl animate-pulse">Loading BOMs...</div>
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
              setPage(0);
              hasFetched.current = false;
              fetchBoms();
            }}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (boms.length === 0 && !isLoading) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center"
        role="status"
      >
        <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-400" size={48} />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No BOMs Yet</h2>
          <p className="text-gray-600 mb-6">
            Your database is empty. Create a new BOM to get started!
          </p>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300"
            disabled={!isDataLoaded}
          >
            Create BOM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8">
      <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">
        Store Bill of Materials
      </h1>
      <div className="max-w-7xl mx-auto">
        <div className="flex mb-8 gap-6 flex-wrap">
          <div className="relative flex-grow">
            <label htmlFor="search-boms" className="sr-only">
              Search BOMs
            </label>
            <input
              id="search-boms"
              ref={searchInputRef}
              type="text"
              placeholder="Search by ID, Product, or Material..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full p-4 pl-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>
          <button
            onClick={handleCreate}
            className="p-4 bg-amber-500 text-white rounded-lg hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg flex items-center"
            aria-label="Create new BOM"
            disabled={!isDataLoaded}
          >
            <Plus size={20} className="mr-2" /> Create
          </button>
          <button
            onClick={handleRefresh}
            className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
            disabled={isLoading}
            aria-label="Refresh BOMs"
          >
            {isLoading && boms.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && boms.length > 0 && (
          <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
          <table
            className="w-full text-left border-collapse"
            role="grid"
            aria-label="Bill of Materials table"
            ref={tableRef}
            tabIndex={0}
          >
            <thead>
              <tr
                className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50"
                role="row"
              >
                {[
                  { key: '', label: '' },
                  { key: 'bomId', label: 'BOM ID' },
                  { key: 'productName', label: 'Product' },
                  { key: 'createdAt', label: 'Created At' },
                  { key: 'updatedAt', label: 'Updated At' },
                  { key: 'actions', label: 'Actions' },
                ].map(({ key, label }) => (
                  <th
                    key={key || label}
                    className={`py-5 px-3 text-gray-800 text-base font-semibold ${key && key !== 'actions' ? 'cursor-pointer hover:bg-amber-300' : ''
                      } transition-all duration-200`}
                    onClick={() => key && key !== 'actions' && handleSort(key)}
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
                      {key && key !== 'actions' && (
                        <ArrowDownUp
                          size={16}
                          className={`ml-2 text-gray-600 ${sortConfig.key === key ? 'text-gray-900' : 'opacity-50'
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
              {sortedBoms.map((bom) => (
                <React.Fragment key={bom.bomId}>
                  <tr
                    className="border-t hover:bg-amber-50 transition-all duration-200"
                    role="row"
                  >
                    <td className="py-4 px-3">
                      <button
                        onClick={() => toggleRow(bom.bomId)}
                        aria-label={expandedRows.includes(bom.bomId) ? 'Collapse materials' : 'Expand materials'}
                      >
                        {expandedRows.includes(bom.bomId) ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-3 text-gray-600 text-base">{bom.bomId}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">{bom.productName || 'N/A'}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">{formatDate(bom.createdAt)}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">{formatDate(bom.updatedAt)}</td>
                    <td className="py-4 px-3 text-gray-600 text-base">
                      <ActionsDropdown bom={bom} onEdit={handleEdit} />
                    </td>
                  </tr>
                  {expandedRows.includes(bom.bomId) && (
                    <tr>
                      <td colSpan="6" className="p-0">
                        <table className="w-full bg-gray-50">
                          <thead>
                            <tr>
                              <th className="py-3 px-3 text-gray-700 text-sm font-semibold">Material ID</th>
                              <th className="py-3 px-3 text-gray-700 text-sm font-semibold">Material Name</th>
                              <th className="py-3 px-3 text-gray-700 text-sm font-semibold">Quantity Per Unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bom.materials.map((material) => (
                              <tr key={material.bomMaterialId} className="border-t">
                                <td className="py-3 px-3 text-gray-600 text-sm">{material.materialId}</td>
                                <td className="py-3 px-3 text-gray-600 text-sm">{material.materialName || 'N/A'}</td>
                                <td className="py-3 px-3 text-gray-600 text-sm">{material.quantityPerUnit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {totalItems > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50">
              <div className="text-gray-600">
                Showing {sortedBoms.length} of {totalItems} BOMs
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
                  disabled={(page + 1) * limit >= totalItems || isLoading}
                  className="p-2 bg-white border rounded-lg disabled:opacity-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {sortedBoms.length === 0 && (
            <div
              className="text-center py-12 text-gray-500 flex flex-col items-center"
              role="alert"
            >
              <Search className="mb-4 text-gray-400" size={48} />
              <p className="text-lg">No BOMs found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50"
          role="dialog"
          aria-labelledby="bom-modal-title"
        >
          <div className="bg-white p-8 rounded-2xl shadow-2xl w-[600px] relative max-h-[80vh] overflow-y-auto">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
              aria-label="Close modal"
            >
              <XCircle size={24} />
            </button>
            <h2
              id="bom-modal-title"
              className="text-2xl font-bold text-gray-800 mb-6"
            >
              {modalMode === 'create' ? 'Create BOM' : `Edit BOM #${selectedBom?.bomId}`}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="product-autocomplete relative">
                <label className="block text-gray-700 font-semibold mb-2">Product</label>
                <input
                  type="text"
                  value={productQuery}
                  onChange={handleProductInputChange}
                  onKeyDown={handleProductKeyDown}
                  onFocus={() => setIsProductDropdownOpen(true)}
                  placeholder="Type to search products..."
                  className="w-full p-3 border border-gray-200 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 placeholder-gray-400 font-medium"
                />
                {isProductDropdownOpen && filteredProducts.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-gradient-to-b from-white to-amber-50 rounded-lg shadow-xl border border-amber-100 overflow-y-auto max-h-48 transform transition-all duration-300 ease-in-out">
                    {filteredProducts.map((product, index) => (
                      <li
                        key={product.productId || `no-match-${index}`}
                        onClick={() => product.productId !== null && handleProductSelect(product)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`px-5 py-3 cursor-pointer hover:bg-amber-100 transition-colors duration-300 flex items-center justify-between ${
                          index === selectedIndex ? 'bg-amber-200 text-amber-900 font-semibold' : 'text-gray-800'
                        } ${product.productId === null ? 'cursor-default bg-amber-50 text-gray-500' : ''}`}
                      >
                        <span className="truncate">{product.productName}</span>
                        {product.productId !== null && <Search size={16} className="text-amber-500 opacity-50" />}
                      </li>
                    ))}
                  </ul>
                )}
                {isProductDropdownOpen && filteredProducts.length === 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-gradient-to-b from-white to-amber-50 rounded-lg shadow-xl border border-amber-100">
                    <li className="px-5 py-3 text-gray-500 bg-amber-50 rounded-lg flex items-center justify-center">
                      <span>No matches found</span>
                    </li>
                  </ul>
                )}
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-2">Materials</label>
                {formData.materials.map((material, index) => (
                  <div key={index} className="flex items-center space-x-4 mb-4">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={materialQueries[index] || ''}
                        onChange={(e) => handleMaterialInputChange(index, e)}
                        onKeyDown={(e) => handleMaterialKeyDown(index, e)}
                        onFocus={() => setIsMaterialDropdownOpen(prev => ({ ...prev, [index]: true }))}
                        placeholder="Type to search materials..."
                        className="w-full p-3 border border-gray-200 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all duration-300 placeholder-gray-400 font-medium"
                      />
                      {isMaterialDropdownOpen[index] && filteredMaterials[index]?.length > 0 && (
                        <ul className="absolute z-10 w-full mt-1 bg-gradient-to-b from-white to-amber-50 rounded-lg shadow-xl border border-amber-100 overflow-y-auto max-h-48 transform transition-all duration-300 ease-in-out">
                          {filteredMaterials[index].map((material, matIndex) => (
                            <li
                              key={material.productId || `no-match-${index}-${matIndex}`}
                              onClick={() => material.productId !== null && handleMaterialSelect(index, material)}
                              onMouseEnter={() => setSelectedMaterialIndices(prev => ({ ...prev, [index]: matIndex }))}
                              className={`px-5 py-3 cursor-pointer hover:bg-amber-100 transition-colors duration-300 flex items-center justify-between ${
                                matIndex === selectedMaterialIndices[index] ? 'bg-amber-200 text-amber-900 font-semibold' : 'text-gray-800'
                              } ${material.productId === null ? 'cursor-default bg-amber-50 text-gray-500' : ''}`}
                            >
                              <span className="truncate">{material.productName}</span>
                              {material.productId !== null && <Search size={16} className="text-amber-500 opacity-50" />}
                            </li>
                          ))}
                        </ul>
                      )}
                      {isMaterialDropdownOpen[index] && (!filteredMaterials[index] || filteredMaterials[index].length === 0) && (
                        <ul className="absolute z-10 w-full mt-1 bg-gradient-to-b from-white to-amber-50 rounded-lg shadow-xl border border-amber-100">
                          <li className="px-5 py-3 text-gray-500 bg-amber-50 rounded-lg flex items-center justify-center">
                            <span>No matches found</span>
                          </li>
                        </ul>
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="number"
                        placeholder="Quantity Per Unit"
                        value={material.quantityPerUnit}
                        onChange={(e) => handleMaterialChange(index, 'quantityPerUnit', e.target.value)}
                        className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
                        required
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                    {formData.materials.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(index)}
                        className="text-red-600 hover:text-red-800"
                        aria-label="Remove material"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="mt-2 flex items-center text-amber-600 hover:text-amber-800"
                >
                  <Plus size={16} className="mr-1" /> Add Material
                </button>
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600 transition-all duration-300 font-semibold"
              >
                {uploading ? (modalMode === 'create' ? 'Creating...' : 'Updating...') : (modalMode === 'create' ? 'Create' : 'Update')}
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

export default StoreBOMPage;