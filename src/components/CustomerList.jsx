import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowDownUp } from 'lucide-react';
import io from 'socket.io-client';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Simple debounce utility
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Error Boundary Component
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
  const limit = 10;
  const tableRef = useRef(null);

  const fetchCustomers = useCallback(() => {
    setIsLoading(true);
    fetch(`/api/customers?limit=${limit}&offset=${page * limit}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        console.log('Fetched Customers:', data); // Log API response for debugging
        setCustomers(data.data || []);
        setTotal(data.total || 0);
        setError(null);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Fetch error:', err);
        setError('Failed to load customers');
        setCustomers([]);
        setIsLoading(false);
      });
  }, [page]);

  useEffect(() => {
    fetchCustomers();

    const socket = io('http://localhost:5000');
    socket.on('connect', () => console.log('Connected to Socket.IO'));
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setError('Failed to connect to real-time updates.');
    });
    socket.on('customerUpdate', (updatedCustomer) => {
      console.log('Socket Update:', updatedCustomer); // Log real-time update for debugging
      setCustomers(prev => {
        const exists = prev.some(c => c.id === updatedCustomer.id);
        if (exists) {
          return prev.map(c => (c.id === updatedCustomer.id ? updatedCustomer : c));
        } else {
          return [...prev, updatedCustomer];
        }
      });
      toast.info(`Customer ${updatedCustomer.name} updated in real-time`, { autoClose: 3000 });
      if (tableRef.current) tableRef.current.focus();
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

  const filteredCustomers = customers.filter(customer => {
    return (
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(customer.orders).includes(searchTerm.toLowerCase()) ||
      String(customer.queries).includes(searchTerm.toLowerCase())
    );
  });

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
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableCustomers;
  }, [filteredCustomers, sortConfig]);

  if (isLoading && !customers.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" aria-live="polite">
        <div className="text-gray-600 text-xl animate-pulse">Loading customers...</div>
      </div>
    );
  }

  if (error && !customers.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 p-8 flex items-center justify-center" role="alert">
        <div className="bg-red-100 border border-red-400 text-red-700 px-6 py-4 rounded-lg shadow-md text-lg flex items-center">
          {error}
          <button
            onClick={fetchCustomers}
            className="ml-4 px-4 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-amber-300"
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
        <h1 className="text-4xl font-bold text-gray-800 mb-10 text-center tracking-tight">Customers</h1>
        <div className="max-w-6xl mx-auto">
          <div className="flex mb-8 gap-6 flex-wrap">
            <div className="relative flex-grow">
              <label htmlFor="search-customers" className="sr-only">Search Customers</label>
              <input
                id="search-customers"
                type="text"
                placeholder="Search by Name, Email, Orders, or Queries..."
                onChange={handleSearch}
                className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-white shadow-md transition-all duration-300"
              />
            </div>
            <button
              onClick={fetchCustomers}
              className="p-4 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 shadow-md text-lg"
              disabled={isLoading}
              aria-label="Refresh customers"
            >
              {isLoading && customers.length > 0 ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {isLoading && customers.length > 0 && (
            <div className="text-gray-600 text-lg mb-4 text-center" aria-live="polite">
              Refreshing data...
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-lg overflow-x-auto">
            <table
              className="w-full text-left border-collapse"
              role="grid"
              aria-label="Customers table"
              ref={tableRef}
              tabIndex={0}
            >
              <thead>
                <tr className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-50" role="row">
                  {[
                    { label: 'Customer Name', key: 'name' },
                    { label: 'Email', key: 'email' },
                    { label: 'Orders', key: 'orders' },
                    { label: 'Queries', key: 'queries' },
                  ].map((header) => (
                    <th
                      key={header.key}
                      className="px-6 py-4 text-gray-800 text-lg font-semibold cursor-pointer hover:bg-amber-300 transition-all duration-200"
                      onClick={() => handleSort(header.key)}
                      aria-sort={
                        sortConfig.key === header.key
                          ? sortConfig.direction === 'ascending'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      scope="col"
                    >
                      <div className="flex items-center justify-between">
                        <span>{header.label}</span>
                        <ArrowDownUp
                          size={16}
                          className={`ml-2 text-gray-600 ${
                            sortConfig.key === header.key ? 'text-gray-900' : 'opacity-50'
                          }`}
                          aria-hidden="true"
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-amber-50 transition-all duration-200"
                    role="row"
                  >
                    <td className="px-6 py-4 text-gray-600 text-lg">{customer.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-gray-600 text-lg">{customer.email || 'N/A'}</td>
                    <td className="px-6 py-4 text-gray-600 text-lg">
                      {Number(customer.orders) || 0}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-lg">
                      {Number(customer.queries) || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedCustomers.length === 0 && (
              <div className="text-center py-12 text-gray-500 text-xl" role="alert">
                No customers found matching your search.
              </div>
            )}
          </div>

          <div className="flex justify-between mt-4">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              disabled={page === 0 || isLoading}
              className="px-4 py-2 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-all duration-300"
            >
              Previous
            </button>
            <span className="text-gray-600">
              Page {page + 1} of {Math.ceil(total / limit)}
            </span>
            <button
              onClick={() => setPage((prev) => prev + 1)}
              disabled={(page + 1) * limit >= total || isLoading}
              className="px-4 py-2 bg-amber-400 text-gray-900 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-all duration-300"
            >
              Next
            </button>
          </div>
        </div>

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

export default CustomerList;