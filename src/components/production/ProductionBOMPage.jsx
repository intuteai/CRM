import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowDownUp,
  RefreshCw,
  Search,
  Edit2,
  MoreVertical,
  XCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

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

function ActionsDropdown({ bom, onEdit }) {
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
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-gray-100 rounded-full" aria-label={`Actions for BOM ${bom.bomId}`}>
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
}

function ProductionBOMPage({ socket: providedSocket, userRole: propUserRole }) {
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
  const { notifySuccess, notifyError, notifyInfo, notifyWarning } = useNotify();

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
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || `Server responded with status: ${response.status}`);
      }

      const responseData = await response.json();
      const bomsData = responseData.data;
      if (!Array.isArray(bomsData)) {
        throw new Error('Invalid data format: Expected an array in response.data');
      }

      // Normalize BOMs
      const normalizedBoms = bomsData.map((b) => ({
        ...b,
        bomId: b.bomId ?? b.bom_id ?? b.id ?? null,
        productId: b.productId ?? b.product_id ?? null,
        productName: b.productName ?? b.product_name ?? '',
        createdAt: b.createdAt ?? b.created_at ?? b.created_date ?? null,
        updatedAt: b.updatedAt ?? b.updated_at ?? b.updated_date ?? null,
        materials: Array.isArray(b.materials)
          ? b.materials.map((m) => ({
              ...m,
              bomMaterialId: m.bomMaterialId ?? m.bom_material_id ?? m.id ?? null,
              materialId: m.materialId ?? m.product_id ?? m.productId ?? m.material_id ?? null,
              materialName:
                m.materialName ?? m.product_name ?? m.productName ?? m.material_name ?? '',
              quantityPerUnit: m.quantityPerUnit ?? m.quantity_per_unit ?? m.qty ?? '',
            }))
          : [],
      }));

      setBoms(normalizedBoms);
      setTotalItems(responseData.total ?? normalizedBoms.length ?? 0);
    } catch (err) {
      console.error('Error fetching BOMs:', err);
      const errorMessage = err.message || 'Network error. Please try again later.';
      setError(errorMessage);
      notifyError(errorMessage, { autoClose: 3000 });
    } finally {
      setIsLoading(false);
      isFetching.current = false;
    }
  }, [page, limit]);

  const fetchProductsAndMaterials = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const [productResponse, materialResponse] = await Promise.all([
        fetch(`${BASE_URL}/api/inventory?limit=1000`, { headers }),
        fetch(`${BASE_URL}/api/stock?limit=1000`, { headers }),
      ]);

      if (!productResponse.ok) {
        const errorBody = await productResponse.json().catch(() => ({}));
        throw new Error(`Failed to fetch products: ${errorBody.error || productResponse.status}`);
      }
      const productData = await productResponse.json();
      const normalizedProducts = Array.isArray(productData.data || productData)
        ? (productData.data || productData).map((p) => ({
            productId: p.productId ?? p.product_id ?? p.id ?? null,
            productName: p.productName ?? p.product_name ?? p.name ?? 'Unnamed Product',
          }))
        : [];
      setProducts(normalizedProducts);

      if (!materialResponse.ok) {
        const errorBody = await materialResponse.json().catch(() => ({}));
        throw new Error(`Failed to fetch materials: ${errorBody.error || materialResponse.status}`);
      }
      const materialData = await materialResponse.json();
      const normalizedMaterials = Array.isArray(materialData.data || materialData)
        ? (materialData.data || materialData).map((m) => ({
            productId: m.productId ?? m.product_id ?? m.id ?? null,
            productName: m.productName ?? m.product_name ?? m.name ?? 'Unnamed Material',
          }))
        : [];
      setMaterials(normalizedMaterials);

      setIsDataLoaded(true);
    } catch (err) {
      console.error('Error fetching products/materials:', err);
      notifyError(`Failed to load products or materials: ${err.message}`, { autoClose: 3000 });
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
      console.log('Socket connected');
    };

    const handleConnectError = (err) => {
      console.error('Socket connection error:', err);
    };

    const handleBomCreated = (bom) => {
      setBoms((prev) => {
        if (!Array.isArray(prev)) return [bom];
        notifyInfo(`BOM #${bom.bomId} created`, { autoClose: 2000 });
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
        notifyInfo(`BOM #${bom.bomId} updated`, { autoClose: 2000 });
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

    const normalizedSearch = (searchTerm || '').toString().toLowerCase();

    return boms.filter((item) => {
      if (!item) return false;

      const searchFields = [
        String(item.bomId ?? ''),
        String(item.productId ?? ''),
        String(item.productName ?? ''),
        ...((item.materials || []).map((m) => String(m.materialId ?? ''))),
        ...((item.materials || []).map((m) => String(m.materialName ?? ''))),
      ];

      return searchFields.some((field) =>
        (field ?? '').toString().toLowerCase().includes(normalizedSearch)
      );
    });
  }, [boms, searchTerm]);

  const sortedBoms = useMemo(() => {
    if (!filteredBoms.length) return [];

    const sortableBoms = [...filteredBoms];

    return sortableBoms.sort((a, b) => {
      const valueA = a[sortConfig.key] ?? '';
      const valueB = b[sortConfig.key] ?? '';

      const aStr = String(valueA);
      const bStr = String(valueB);

      if (aStr < bStr) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aStr > bStr) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [filteredBoms, sortConfig]);

  const handleCreate = useCallback(() => {
    if (!isDataLoaded) {
      notifyWarning('Still loading products and materials — you can start filling the form.', {
        autoClose: 2000,
      });
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

  const handleEdit = useCallback(
    (bom) => {
      setModalMode('edit');
      setSelectedBom(bom);
      setFormData({
        productId: bom.productId ?? '',
        materials: (bom.materials || []).length
          ? (bom.materials || []).map((m) => ({
              materialId: m.materialId ?? m.materialId ?? '',
              quantityPerUnit: m.quantityPerUnit ?? '',
            }))
          : [{ materialId: '', quantityPerUnit: '' }],
      });
      setProductQuery(products.find((p) => p.productId === bom.productId)?.productName || '');
      setFilteredProducts([]);
      setIsProductDropdownOpen(false);
      setSelectedIndex(-1);
      setMaterialQueries(
        (bom.materials || []).reduce((acc, m, idx) => {
          const matched = materials.find((mat) => mat.productId === m.materialId);
          return { ...acc, [idx]: matched?.productName ?? '' };
        }, {})
      );
      setFilteredMaterials({});
      setIsMaterialDropdownOpen({});
      setSelectedMaterialIndices({});
      setShowModal(true);
    },
    [products, materials]
  );

  const handleAddMaterial = useCallback(() => {
    setFormData((prev) => {
      const newMaterials = [...prev.materials, { materialId: '', quantityPerUnit: '' }];
      // update related states using new index
      const newIndex = newMaterials.length - 1;
      setMaterialQueries((prevQ) => ({ ...prevQ, [newIndex]: '' }));
      setFilteredMaterials((prevF) => ({ ...prevF, [newIndex]: [] }));
      setIsMaterialDropdownOpen((prevO) => ({ ...prevO, [newIndex]: false }));
      setSelectedMaterialIndices((prevS) => ({ ...prevS, [newIndex]: -1 }));
      return { ...prev, materials: newMaterials };
    });
  }, []);

  const handleRemoveMaterial = useCallback((index) => {
    setFormData((prev) => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index),
    }));
    setMaterialQueries((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    setFilteredMaterials((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    setIsMaterialDropdownOpen((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    setSelectedMaterialIndices((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
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
            : `${BASE_URL}/api/bom/${selectedBom?.bomId}`;

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
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(
            errorBody.error || `${modalMode === 'create' ? 'Create' : 'Update'} failed with status: ${response.status}`
          );
        }

        const updatedBom = await response.json();
        if (modalMode === 'create') {
          notifySuccess(`BOM #${updatedBom.bomId} created successfully!`, { autoClose: 2000 });
        } else {
          notifySuccess(`BOM #${updatedBom.bomId} updated successfully!`, { autoClose: 2000 });
        }

        setShowModal(false);
      } catch (err) {
        console.error(`${modalMode === 'create' ? 'Create' : 'Update'} error:`, err);
        notifyError(err.message || `${modalMode === 'create' ? 'Create' : 'Update'} failed`, { autoClose: 3000 });
      } finally {
        setUploading(false);
      }
    },
    [formData, modalMode, selectedBom]
  );

  // Autocomplete handlers
  const handleProductSelect = useCallback((product) => {
    setFormData((prev) => ({ ...prev, productId: product.productId }));
    setProductQuery(product.productName);
    setFilteredProducts([]);
    setIsProductDropdownOpen(false);
    setSelectedIndex(-1);
  }, []);

  const handleProductInputChange = useCallback(
    (e) => {
      const query = e.target.value;
      setProductQuery(query);
      setIsProductDropdownOpen(true);
      setSelectedIndex(-1);

      if (query) {
        const q = query.toString().toLowerCase();
        const filtered = products.filter(
          (p) =>
            (p.productName || '').toString().toLowerCase().includes(q) ||
            String(p.productId || '').toLowerCase().includes(q)
        );
        setFilteredProducts(filtered.length > 0 ? filtered : [{ productId: null, productName: 'No matches found' }]);
      } else {
        setFilteredProducts([]);
      }
    },
    [products]
  );

  const handleProductKeyDown = useCallback(
    (e) => {
      if (!isProductDropdownOpen || filteredProducts.length === 0) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
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
    },
    [isProductDropdownOpen, filteredProducts, selectedIndex, handleProductSelect]
  );

  const handleMaterialSelect = useCallback((index, material) => {
    if (material.productId !== null) {
      setFormData((prev) => {
        const newMaterials = [...prev.materials];
        newMaterials[index] = { ...newMaterials[index], materialId: material.productId };
        return { ...prev, materials: newMaterials };
      });
      setMaterialQueries((prev) => ({ ...prev, [index]: material.productName }));
      setFilteredMaterials((prev) => ({ ...prev, [index]: [] }));
      setIsMaterialDropdownOpen((prev) => ({ ...prev, [index]: false }));
      setSelectedMaterialIndices((prev) => ({ ...prev, [index]: -1 }));
    }
  }, []);

  const handleMaterialInputChange = useCallback(
    (index, e) => {
      const query = e.target.value;
      setMaterialQueries((prev) => ({ ...prev, [index]: query }));
      setIsMaterialDropdownOpen((prev) => ({ ...prev, [index]: true }));
      setSelectedMaterialIndices((prev) => ({ ...prev, [index]: -1 }));

      if (query) {
        const q = query.toString().toLowerCase();
        const filtered = materials.filter(
          (m) =>
            (m.productName || '').toString().toLowerCase().includes(q) ||
            String(m.productId || '').toString().toLowerCase().includes(q)
        );
        setFilteredMaterials((prev) => ({
          ...prev,
          [index]: filtered.length > 0 ? filtered : [{ productId: null, productName: 'No matches found' }],
        }));
      } else {
        setFilteredMaterials((prev) => ({ ...prev, [index]: [] }));
      }
    },
    [materials]
  );

  const handleMaterialKeyDown = useCallback(
    (index, e) => {
      if (!isMaterialDropdownOpen[index] || !filteredMaterials[index]?.length) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedMaterialIndices((prev) => ({
            ...prev,
            [index]: prev[index] > 0 ? prev[index] - 1 : (filteredMaterials[index]?.length || 1) - 1,
          }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedMaterialIndices((prev) => ({
            ...prev,
            [index]:
              prev[index] < (filteredMaterials[index]?.length || 1) - 1 ? prev[index] + 1 : 0,
          }));
          break;
        case 'Enter':
          e.preventDefault();
          if (
            selectedMaterialIndices[index] >= 0 &&
            filteredMaterials[index] &&
            filteredMaterials[index][selectedMaterialIndices[index]].productId !== null
          ) {
            handleMaterialSelect(index, filteredMaterials[index][selectedMaterialIndices[index]]);
          }
          break;
        case 'Escape':
          setIsMaterialDropdownOpen((prev) => ({ ...prev, [index]: false }));
          break;
        default:
          break;
      }
    },
    [isMaterialDropdownOpen, filteredMaterials, selectedMaterialIndices, handleMaterialSelect]
  );

  if (isLoading && !boms.length) {
    return (
      <div className="flex items-center justify-center py-24" aria-live="polite">
        <div className="text-gray-500 text-lg">Loading BOMs...</div>
      </div>
    );
  }

  if (error && !showModal) return <ConnectionError onRetry={fetchBoms} />;

  if (boms.length === 0 && !isLoading && !showModal) {
    return (
      <div className="flex items-center justify-center py-24" role="status">
        <div className="bg-white p-8 rounded-xl shadow-sm border border-navy-100 text-center">
          <RefreshCw className="mx-auto mb-4 text-gray-300" size={40} />
          <h2 className="font-display text-xl font-bold text-navy-800 mb-2">No BOMs Yet</h2>
          <p className="text-gray-500 mb-6">Your database is empty. Create a new BOM to get started!</p>
          <button onClick={handleCreate} className="px-5 py-2.5 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors">
            Create BOM
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div>
        <div className="flex mb-6 gap-4 flex-wrap">
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
              className="w-full p-3 pl-11 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400 bg-white shadow-sm transition-colors"
            />
            <Search size={17} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
          </div>

          <button
            onClick={handleCreate}
            className="px-5 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors flex items-center"
            aria-label="Create new BOM"
          >
            <Plus size={18} className="mr-2" /> Create
          </button>

          <button
            onClick={() => {
              setPage(0);
              hasFetched.current = false;
              fetchBoms();
            }}
            className="px-5 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
            disabled={isLoading}
            aria-label="Refresh BOMs"
          >
            {isLoading && boms.length > 0 ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && boms.length > 0 && (
          <div className="text-gray-500 text-sm mb-4 text-center" aria-live="polite">
            Refreshing data...
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-x-auto">
          <table className="w-full text-left border-collapse" role="grid" aria-label="Bill of Materials table" ref={tableRef} tabIndex={0}>
            <thead>
              <tr className="bg-navy-50" role="row">
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
                    className={`py-3 px-3 text-navy-800 text-sm font-semibold whitespace-nowrap ${key && key !== 'actions' ? 'cursor-pointer hover:bg-navy-100' : ''} transition-colors`}
                    onClick={() => key && key !== 'actions' && handleSort(key)}
                    aria-sort={
                      sortConfig.key === key ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                    scope="col"
                  >
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      {key && key !== 'actions' && (
                        <ArrowDownUp size={15} className={`ml-2 ${sortConfig.key === key ? 'text-gold-500' : 'text-navy-400/50'}`} aria-hidden="true" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sortedBoms.map((bom) => (
                <React.Fragment key={bom.bomId ?? Math.random()}>
                  <tr className="border-t border-navy-100 hover:bg-navy-50/60 transition-colors" role="row">
                    <td className="py-3.5 px-3">
                      <button className="text-gray-400 hover:text-navy-800 transition-colors" onClick={() => toggleRow(bom.bomId)} aria-label={expandedRows.includes(bom.bomId) ? 'Collapse materials' : 'Expand materials'}>
                        {expandedRows.includes(bom.bomId) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </td>
                    <td className="py-3.5 px-3 text-gray-600">{bom.bomId}</td>
                    <td className="py-3.5 px-3 text-gray-600">{bom.productName || 'N/A'}</td>
                    <td className="py-3.5 px-3 text-gray-600">{formatDate(bom.createdAt)}</td>
                    <td className="py-3.5 px-3 text-gray-600">{formatDate(bom.updatedAt)}</td>
                    <td className="py-3.5 px-3 text-gray-600">
                      <ActionsDropdown bom={bom} onEdit={handleEdit} />
                    </td>
                  </tr>

                  {expandedRows.includes(bom.bomId) && (
                    <tr>
                      <td colSpan="6" className="p-0">
                        <table className="w-full bg-navy-50/50">
                          <thead>
                            <tr>
                              <th className="py-2.5 px-3 text-navy-800 text-sm font-semibold text-left">Material ID</th>
                              <th className="py-2.5 px-3 text-navy-800 text-sm font-semibold text-left">Material Name</th>
                              <th className="py-2.5 px-3 text-navy-800 text-sm font-semibold text-left">Quantity Per Unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(bom.materials || []).map((material, idx) => (
                              <tr key={material.bomMaterialId ?? material.materialId ?? idx} className="border-t border-navy-100">
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
            <div className="flex justify-between items-center p-4 bg-navy-50 border-t border-navy-100">
              <div className="text-gray-500 text-sm">Showing {sortedBoms.length} of {totalItems} BOMs</div>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors" aria-label="Previous page">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => page + 1 && setPage((p) => p + 1)} disabled={(page + 1) * limit >= totalItems || isLoading} className="p-2 bg-white border border-navy-100 rounded-lg disabled:opacity-50 hover:bg-navy-100 transition-colors" aria-label="Next page">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          {sortedBoms.length === 0 && (
            <div className="text-center py-12 text-gray-400 flex flex-col items-center" role="alert">
              <Search className="mb-4 text-gray-300" size={40} />
              <p>No BOMs found matching your search.</p>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4" role="dialog" aria-labelledby="bom-modal-title">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-[600px] max-w-full relative max-h-[80vh] overflow-y-auto">
            <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors" aria-label="Close modal">
              <XCircle size={20} />
            </button>
            <h2 id="bom-modal-title" className="font-display text-xl font-bold text-navy-800 mb-5 pr-8">
              {modalMode === 'create' ? 'Create BOM' : `Edit BOM #${selectedBom?.bomId}`}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="product-autocomplete relative">
                <label className="block text-navy-800 text-sm font-semibold mb-1.5">Product</label>
                <input
                  type="text"
                  value={productQuery}
                  onChange={handleProductInputChange}
                  onKeyDown={handleProductKeyDown}
                  onFocus={() => setIsProductDropdownOpen(true)}
                  disabled={!isDataLoaded}
                  placeholder={isDataLoaded ? 'Type to search products...' : 'Loading products...'}
                  className="w-full p-3 border border-navy-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors placeholder-gray-400 disabled:bg-gray-100 disabled:cursor-wait"
                />
                {isProductDropdownOpen && filteredProducts.length > 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-navy-100 overflow-y-auto max-h-48">
                    {filteredProducts.map((product, index) => (
                      <li
                        key={product.productId ?? `no-match-${index}`}
                        onClick={() => product.productId !== null && handleProductSelect(product)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        className={`px-5 py-3 cursor-pointer hover:bg-navy-50 transition-colors flex items-center justify-between ${index === selectedIndex ? 'bg-gold-400/25 text-navy-800 font-semibold' : 'text-gray-800'} ${product.productId === null ? 'cursor-default bg-navy-50 text-gray-500' : ''}`}
                      >
                        <span className="truncate">{product.productName}</span>
                        {product.productId !== null && <Search size={16} className="text-gold-600 opacity-50" />}
                      </li>
                    ))}
                  </ul>
                )}
                {isProductDropdownOpen && filteredProducts.length === 0 && (
                  <ul className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-navy-100">
                    <li className="px-5 py-3 text-gray-500 bg-navy-50 rounded-lg flex items-center justify-center">
                      <span>No matches found</span>
                    </li>
                  </ul>
                )}
              </div>

              <div>
                <label className="block text-navy-800 text-sm font-semibold mb-1.5">Materials</label>
                {formData.materials.map((material, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4">
                    <div className="flex-1 relative min-w-full sm:min-w-0">
                      <input
                        type="text"
                        value={materialQueries[index] || ''}
                        onChange={(e) => handleMaterialInputChange(index, e)}
                        onKeyDown={(e) => handleMaterialKeyDown(index, e)}
                        onFocus={() => setIsMaterialDropdownOpen((prev) => ({ ...prev, [index]: true }))}
                        disabled={!isDataLoaded}
                        placeholder={isDataLoaded ? 'Type to search materials...' : 'Loading materials...'}
                        className="w-full p-3 border border-navy-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors placeholder-gray-400 disabled:bg-gray-100 disabled:cursor-wait"
                      />
                      {isMaterialDropdownOpen[index] && filteredMaterials[index]?.length > 0 && (
                        <ul className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-navy-100 overflow-y-auto max-h-48">
                          {filteredMaterials[index].map((mat, matIndex) => (
                            <li
                              key={mat.productId ?? `no-match-${index}-${matIndex}`}
                              onClick={() => mat.productId !== null && handleMaterialSelect(index, mat)}
                              onMouseEnter={() => setSelectedMaterialIndices((prev) => ({ ...prev, [index]: matIndex }))}
                              className={`px-5 py-3 cursor-pointer hover:bg-navy-50 transition-colors flex items-center justify-between ${matIndex === selectedMaterialIndices[index] ? 'bg-gold-400/25 text-navy-800 font-semibold' : 'text-gray-800'} ${mat.productId === null ? 'cursor-default bg-navy-50 text-gray-500' : ''}`}
                            >
                              <span className="truncate">{mat.productName}</span>
                              {mat.productId !== null && <Search size={16} className="text-gold-600 opacity-50" />}
                            </li>
                          ))}
                        </ul>
                      )}
                      {isMaterialDropdownOpen[index] && (!filteredMaterials[index] || filteredMaterials[index].length === 0) && (
                        <ul className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-navy-100">
                          <li className="px-5 py-3 text-gray-500 bg-navy-50 rounded-lg flex items-center justify-center">
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
                        className="w-full p-3 border border-navy-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                        required
                        min="0.01"
                        step="0.01"
                      />
                    </div>

                    {formData.materials.length > 1 && (
                      <button type="button" onClick={() => handleRemoveMaterial(index)} className="text-red-600 hover:text-red-800" aria-label="Remove material">
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                ))}

                <button type="button" onClick={handleAddMaterial} className="mt-2 flex items-center text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors">
                  <Plus size={16} className="mr-1" /> Add Material
                </button>
              </div>

              <button type="submit" disabled={uploading} className={`w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 ${modalMode === 'create' ? 'bg-gold-500 text-navy-900 hover:bg-gold-400' : 'bg-navy-800 text-white hover:bg-navy-700'}`}>
                {uploading ? (modalMode === 'create' ? 'Creating...' : 'Updating...') : modalMode === 'create' ? 'Create' : 'Update'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default ProductionBOMPage;
