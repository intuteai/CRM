import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowDownUp, X } from 'lucide-react';
import io from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/customers`;

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

class ErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    return this.state.hasError ? (
      <div className="text-red-600 text-center py-4">Something went wrong.</div>
    ) : (
      this.props.children
    );
  }
}

function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    contact_person: '',
    city: '',
    phone: '',
    gst: '',
    shipping_address: '',
    billing_address: '',
  });
  const [errors, setErrors] = useState({});
  const limit = 10;
  const tableRef = useRef(null);

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL}?limit=${limit}&offset=${page * limit}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setCustomers(data.data || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchCustomers();
    const socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => console.error('Socket connection error:', err));
    socket.on('customerUpdate', (updatedCustomer) => {
      setCustomers((prev) => {
        const exists = prev.some((c) => c.id === updatedCustomer.id);
        if (exists) return prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c));
        if (prev.length < limit) return [...prev, updatedCustomer];
        return prev;
      });
      notifyInfo(`Customer ${updatedCustomer.name} updated`, { className: 'bg-amber-100 border-amber-300' });
    });

    return () => socket.disconnect();
  }, [fetchCustomers]);

  const debounceSearch = useCallback(debounce((value) => setSearchTerm(value), 300), []);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();

  const handleSearch = (e) => debounceSearch(e.target.value);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;
    const gstRegex = /^[0-9A-Z]{15}$/i;

    if (!newCustomer.name || newCustomer.name.length < 3)
      newErrors.name = 'Customer name must be at least 3 characters';
    if (!newCustomer.contact_person || newCustomer.contact_person.length < 3)
      newErrors.contact_person = 'Contact person is required';
    if (!newCustomer.city) newErrors.city = 'City is required';
    if (!phoneRegex.test(newCustomer.phone))
      newErrors.phone = 'Phone must be a valid 10-digit number';
    if (!emailRegex.test(newCustomer.email))
      newErrors.email = 'Enter a valid email address';
    if (newCustomer.gst && !gstRegex.test(newCustomer.gst))
      newErrors.gst = 'GST must be a 15-character alphanumeric code';
    if (!newCustomer.shipping_address)
      newErrors.shipping_address = 'Shipping address is required';
    if (!newCustomer.billing_address)
      newErrors.billing_address = 'Billing address is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setNewCustomer({
      name: '',
      email: '',
      contact_person: '',
      city: '',
      phone: '',
      gst: '',
      shipping_address: '',
      billing_address: '',
    });
    setErrors({});
  };

  const handleCopyAddress = () => {
    setNewCustomer((prev) => ({
      ...prev,
      billing_address: prev.shipping_address,
    }));
    notifyInfo('Billing address copied from shipping address', { className: 'bg-amber-100 border-amber-300' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      notifyError('Please fix the form errors');
      return;
    }
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(newCustomer),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create customer');
      notifySuccess('Customer added successfully!');
      setIsModalOpen(false);
      resetForm();
      fetchCustomers();
    } catch (err) {
      console.error('Error creating customer:', err);
      notifyError(`Error: ${err.message}`);
    }
  };

  const filteredCustomers = customers.filter((customer) =>
    ['name', 'email', 'contact_person', 'city', 'phone', 'gst', 'shipping_address', 'billing_address', 'orders', 'queries']
      .some((key) => String(customer[key] || '').toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const sortedCustomers = React.useMemo(() => {
    const sortableCustomers = [...filteredCustomers];
    if (sortConfig.key) {
      sortableCustomers.sort((a, b) => {
        let aValue = a[sortConfig.key] ?? '';
        let bValue = b[sortConfig.key] ?? '';
        if (sortConfig.key === 'orders' || sortConfig.key === 'queries') {
          aValue = Number(aValue);
          bValue = Number(bValue);
        } else {
          aValue = String(aValue).toLowerCase();
          bValue = String(bValue).toLowerCase();
        }
        return sortConfig.direction === 'ascending' ? aValue - bValue || aValue.localeCompare(bValue) : bValue - aValue || bValue.localeCompare(aValue);
      });
    }
    return sortableCustomers;
  }, [filteredCustomers, sortConfig]);

  if (isLoading && !customers.length) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-600 text-xl">
        <svg className="animate-spin h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading Customers...
      </div>
    </div>
  );
  if (error && !customers.length) return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center">
      <div className="text-red-600 text-xl font-medium bg-red-100 px-6 py-3 rounded-lg shadow">{error}</div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-6 md:p-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-12 text-center tracking-tight drop-shadow-md animate-fade-in">
          Customers
        </h1>
        
        <div className="max-w-[95vw] mx-auto">
          <div className="flex items-center gap-4 flex-col sm:flex-row mb-10">
            <div className="relative flex-grow w-full sm:w-auto group">
              <input
                type="text"
                placeholder="Search customers..."
                onChange={handleSearch}
                className="w-full p-4 pl-12 border border-gray-200 rounded-xl bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg transition-all duration-300 group-hover:shadow-lg group-hover:border-amber-300"
              />
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            <button
              onClick={fetchCustomers}
              className="group relative px-6 py-3 bg-amber-400 text-gray-900 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              disabled={isLoading}
            >
              <span className="relative z-10 flex items-center gap-2">
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 group-hover:animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </>
                )}
              </span>
              <span className="absolute inset-0 bg-amber-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
            </button>
            
            <button
              onClick={() => setIsModalOpen(true)}
              className="group relative px-6 py-3 bg-green-500 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                <svg className="w-5 h-5 group-hover:animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Customer
              </span>
              <span className="absolute inset-0 bg-green-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-right"></span>
            </button>
          </div>

          <div className="bg-gradient-to-br from-white to-amber-50 rounded-3xl shadow-2xl overflow-x-auto border border-amber-100 animate-table-pop">
            <table className="w-full text-left border-collapse" ref={tableRef} tabIndex={0}>
              <thead>
                <tr className="bg-gradient-to-r from-amber-300 via-amber-200 to-amber-100 text-gray-800">
                  {[
                    { label: 'Customer Name', key: 'name' },
                    { label: 'Email', key: 'email' },
                    { label: 'Contact Person', key: 'contact_person' },
                    { label: 'City', key: 'city' },
                    { label: 'Phone', key: 'phone' },
                    { label: 'GST', key: 'gst' },
                    { label: 'Shipping Address', key: 'shipping_address' },
                    { label: 'Billing Address', key: 'billing_address' },
                    { label: 'Orders', key: 'orders' },
                    { label: 'Queries', key: 'queries' },
                  ].map(({ label, key }) => (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="px-6 md:px-8 py-4 text-lg font-bold cursor-pointer hover:bg-amber-400 transition-all duration-300 whitespace-nowrap border-b border-amber-200 shadow-sm"
                    >
                      <div className="flex justify-between items-center">
                        {label}
                        <ArrowDownUp size={18} className={`ml-2 text-gray-700 ${sortConfig.key === key ? 'text-amber-600 animate-pulse' : 'opacity-60'} hover:text-amber-800 transition-colors duration-200`} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {sortedCustomers.map((customer, index) => (
                  <tr 
                    key={customer.id} 
                    className="bg-white hover:bg-amber-50 transition-all duration-300 hover:shadow-md transform hover:-translate-y-1"
                    style={{ animation: `tableRowFade 0.4s ease-in ${index * 0.05}s both` }}
                  >
                    <td className="px-6 md:px-8 py-4 text-gray-700 font-semibold">{customer.name || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{customer.email || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{customer.contact_person || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{customer.city || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{customer.phone || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{customer.gst || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{customer.shipping_address || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600">{customer.billing_address || 'N/A'}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600 font-semibold">{customer.orders || 0}</td>
                    <td className="px-6 md:px-8 py-4 text-gray-600 font-semibold">{customer.queries || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedCustomers.length === 0 && (
              <div className="text-center py-12 text-gray-500 text-lg font-medium animate-pulse bg-amber-50 rounded-b-3xl">
                No customers found matching your search.
              </div>
            )}
          </div>

          <div className="flex justify-between mt-6 items-center">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={page === 0 || isLoading}
              className="px-5 py-2 bg-amber-400 text-gray-900 rounded-full font-semibold shadow-md hover:bg-amber-500 hover:shadow-lg disabled:opacity-50 transition-all duration-300"
            >
              Previous
            </button>
            <span className="text-gray-700 font-medium text-lg">
              Page <span className="text-amber-600">{page + 1}</span> of {Math.ceil(total / limit)}
            </span>
            <button
              onClick={() => setPage((prev) => prev + 1)}
              disabled={(page + 1) * limit >= total || isLoading}
              className="px-5 py-2 bg-amber-400 text-gray-900 rounded-full font-semibold shadow-md hover:bg-amber-500 hover:shadow-lg disabled:opacity-50 transition-all duration-300"
            >
              Next
            </button>
          </div>

          {isModalOpen && (
            <div className="fixed inset-0 z-50 bg-gray-800 bg-opacity-60 flex items-center justify-center transition-opacity duration-500">
              <div className="bg-gradient-to-br from-white to-amber-50 p-8 rounded-3xl shadow-2xl w-full max-w-md transform transition-all duration-300 animate-form-pop max-h-[90vh] overflow-y-auto relative">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-300 shadow-md hover:shadow-lg transform hover:rotate-90"
                >
                  <X size={20} />
                </button>
                <h2 className="text-3xl font-extrabold text-gray-800 mb-6 text-center bg-gradient-to-r from-amber-400 to-green-500 bg-clip-text text-transparent">
                  Add New Customer
                </h2>
                <form onSubmit={handleSubmit}>
                  {[
                    { label: 'Customer Name', key: 'name', required: true, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                    { label: 'Email', key: 'email', type: 'email', required: true, icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' },
                    { label: 'Contact Person', key: 'contact_person', required: true, icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                    { label: 'City', key: 'city', required: true, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                    { label: 'Phone', key: 'phone', required: true, icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
                    { label: 'GST (Optional)', key: 'gst', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                    { label: 'Shipping Address', key: 'shipping_address', required: true, icon: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4' },
                  ].map(({ label, key, type = 'text', required, icon }) => (
                    <div key={key} className="mb-5 relative group">
                      <label className="block text-gray-700 font-semibold mb-2 text-lg tracking-wide">{label}</label>
                      <div className="relative">
                        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-amber-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                        </svg>
                        <input
                          type={type}
                          value={newCustomer[key]}
                          onChange={(e) => setNewCustomer({ ...newCustomer, [key]: e.target.value })}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 placeholder-gray-400"
                          required={required}
                          placeholder={`Enter ${label.toLowerCase()}`}
                        />
                      </div>
                      {errors[key] && <p className="text-sm text-red-500 mt-1 animate-fade-in font-medium">{errors[key]}</p>}
                    </div>
                  ))}
                  <div className="mb-5">
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="relative w-full px-5 py-3 bg-amber-300 text-gray-800 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group transform hover:scale-105"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 animate-pulse group-hover:animate-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy Shipping to Billing
                      </span>
                      <span className="absolute inset-0 bg-amber-400 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center"></span>
                    </button>
                  </div>
                  <div className="mb-5 relative group">
                    <label className="block text-gray-700 font-semibold mb-2 text-lg tracking-wide">Billing Address</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-amber-400 group-hover:text-amber-500 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <input
                        type="text"
                        value={newCustomer.billing_address}
                        onChange={(e) => setNewCustomer({ ...newCustomer, billing_address: e.target.value })}
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-4 focus:ring-amber-200 focus:border-amber-400 shadow-md hover:shadow-lg transition-all duration-300 placeholder-gray-400"
                        required
                        placeholder="Enter billing address"
                      />
                    </div>
                    {errors.billing_address && <p className="text-sm text-red-500 mt-1 animate-fade-in font-medium">{errors.billing_address}</p>}
                  </div>
                  <div className="flex justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="relative px-6 py-3 bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group hover:from-gray-400 hover:to-gray-500 transform hover:scale-105"
                    >
                      <span className="relative z-10">Cancel</span>
                    </button>
                    <button
                      type="submit"
                      className="relative px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group hover:from-green-600 hover:to-green-700 transform hover:scale-105"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Add Customer
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
</div>
    </ErrorBoundary>
  );
}

export default CustomerList;