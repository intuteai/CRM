import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowDownUp, X, Eye } from 'lucide-react';
import io from 'socket.io-client';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

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
  const { notifySuccess, notifyError, notifyInfo } = useNotify();
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState(null);
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
      notifyInfo(`Customer ${updatedCustomer.name} updated`, { className: 'bg-gold-400/20 border-gold-400/50' });
    });

    return () => socket.disconnect();
  }, [fetchCustomers]);

  const debounceSearch = useCallback(debounce((value) => setSearchTerm(value), 300), []);

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
    notifyInfo('Billing address copied from shipping address', { className: 'bg-gold-400/20 border-gold-400/50' });
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

  if (isLoading && !customers.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-500 text-lg">
          <svg className="animate-spin h-6 w-6 text-gold-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Customers...
        </div>
      </div>
    );
  }
  if (error && !customers.length) return <ConnectionError />;

  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-4 flex-col sm:flex-row">
          <div className="relative flex-grow w-full sm:w-auto">
            <input
              type="text"
              placeholder="Search customers..."
              onChange={handleSearch}
              className="w-full p-3 pl-11 border border-navy-100 rounded-lg bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
            />
            <svg className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button
            onClick={fetchCustomers}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Refreshing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-gold-500 text-navy-900 rounded-lg font-semibold hover:bg-gold-400 transition-colors w-full sm:w-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-x-auto border border-navy-100">
          <table className="w-full text-left border-collapse" ref={tableRef} tabIndex={0}>
            <thead>
              <tr className="bg-navy-50 text-navy-800">
                {[
                  { label: 'Customer Name', key: 'name' },
                  { label: 'Contact Person', key: 'contact_person' },
                  { label: 'Email', key: 'email' },
                  { label: 'Phone', key: 'phone' },
                  { label: 'City', key: 'city' },
                  { label: 'Orders', key: 'orders' },
                  { label: 'Queries', key: 'queries' },
                ].map(({ label, key }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="px-5 py-3 text-sm font-semibold cursor-pointer hover:bg-navy-100 transition-colors whitespace-nowrap border-b border-navy-100"
                  >
                    <div className="flex justify-between items-center">
                      {label}
                      <ArrowDownUp size={15} className={`ml-2 ${sortConfig.key === key ? 'text-gold-500' : 'text-navy-400/50'}`} />
                    </div>
                  </th>
                ))}
                <th className="px-5 py-3 text-sm font-semibold whitespace-nowrap border-b border-navy-100">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {sortedCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-navy-50/60 transition-colors"
                >
                  <td className="px-5 py-3.5 text-navy-800 font-medium">{customer.name || 'N/A'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{customer.contact_person || 'N/A'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{customer.email || 'N/A'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{customer.phone || 'N/A'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{customer.city || 'N/A'}</td>
                  <td className="px-5 py-3.5 text-gray-600 font-semibold">{customer.orders || 0}</td>
                  <td className="px-5 py-3.5 text-gray-600 font-semibold">{customer.queries || 0}</td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setViewingCustomer(customer)}
                      className="flex items-center gap-1.5 text-navy-800 hover:text-navy-600 font-medium text-sm transition-colors"
                      aria-label={`View details for ${customer.name}`}
                    >
                      <Eye size={15} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedCustomers.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              No customers found matching your search.
            </div>
          )}
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
            disabled={page === 0 || isLoading}
            className="px-4 py-2 bg-white border border-navy-100 text-navy-800 rounded-lg font-medium hover:bg-navy-100 disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <span className="text-gray-600 text-sm">
            Page <span className="text-gold-600 font-semibold">{page + 1}</span> of {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setPage((prev) => prev + 1)}
            disabled={(page + 1) * limit >= total || isLoading}
            className="px-4 py-2 bg-white border border-navy-100 text-navy-800 rounded-lg font-medium hover:bg-navy-100 disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
              <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
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
                  <div key={key} className="mb-4 relative">
                    <label className="block text-sm font-semibold text-navy-800 mb-1.5">{label}</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icon} />
                      </svg>
                      <input
                        type={type}
                        value={newCustomer[key]}
                        onChange={(e) => setNewCustomer({ ...newCustomer, [key]: e.target.value })}
                        className="w-full pl-10 pr-3 py-2.5 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 placeholder-gray-400"
                        required={required}
                        placeholder={`Enter ${label.toLowerCase()}`}
                      />
                    </div>
                    {errors[key] && <p className="text-sm text-red-600 mt-1">{errors[key]}</p>}
                  </div>
                ))}
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy Shipping to Billing
                  </button>
                </div>
                <div className="mb-4 relative">
                  <label className="block text-sm font-semibold text-navy-800 mb-1.5">Billing Address</label>
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <input
                      type="text"
                      value={newCustomer.billing_address}
                      onChange={(e) => setNewCustomer({ ...newCustomer, billing_address: e.target.value })}
                      className="w-full pl-10 pr-3 py-2.5 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 placeholder-gray-400"
                      required
                      placeholder="Enter billing address"
                    />
                  </div>
                  {errors.billing_address && <p className="text-sm text-red-600 mt-1">{errors.billing_address}</p>}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Add Customer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {viewingCustomer && (
          <div className="fixed inset-0 bg-navy-900/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => setViewingCustomer(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-navy-800 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
              <h2 className="font-display text-xl font-bold text-navy-800 mb-5">
                {viewingCustomer.name || 'Customer Details'}
              </h2>
              <dl className="space-y-4">
                {[
                  { label: 'Contact Person', value: viewingCustomer.contact_person },
                  { label: 'Email', value: viewingCustomer.email },
                  { label: 'Phone', value: viewingCustomer.phone },
                  { label: 'City', value: viewingCustomer.city },
                  { label: 'GST', value: viewingCustomer.gst },
                  { label: 'Shipping Address', value: viewingCustomer.shipping_address },
                  { label: 'Billing Address', value: viewingCustomer.billing_address },
                  { label: 'Orders', value: viewingCustomer.orders || 0 },
                  { label: 'Queries', value: viewingCustomer.queries || 0 },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
                    <dd className="text-navy-800 mt-0.5 break-words">{value || 'N/A'}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setViewingCustomer(null)}
                  className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default CustomerList;
