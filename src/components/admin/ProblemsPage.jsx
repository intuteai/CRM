import React, { useState, useEffect } from 'react';
import useProblems from '../../hooks/useProblems';
import { formatDate } from '../../utils/helpers';
import { RefreshCw, Search, AlertCircle, CheckCircle, XCircle, Filter } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import ConnectionError from '../pages/ConnectionError.jsx';

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function ProblemsPage({ socket }) {
  const { problems, isLoading, error, fetchProblems } = useProblems(socket);
  const [problemData, setProblemData] = useState({ product_id: '', problem_description: '' });
  const [solutionData, setSolutionData] = useState({ problem_id: '', solution_description: '', is_successful: false });
  const [products, setProducts] = useState([]);
  const [isSubmittingProblem, setIsSubmittingProblem] = useState(false);
  const [isSubmittingSolution, setIsSubmittingSolution] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(null);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredProblems, setFilteredProblems] = useState([]);
  const { notifySuccess, notifyError, notifyInfo } = useNotify();
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'solved', 'unsolved'

  // Fetch products for problem form
  useEffect(() => {
    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        const token = localStorage.getItem('token');
        console.log('Fetching products with token:', token ? 'Present' : 'Missing');
        const res = await fetch(`${BASE_URL}/api/inventory`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        console.log('Inventory response status:', res.status);
        const data = await res.json();
        console.log('Inventory response data:', JSON.stringify(data, null, 2));
        if (res.ok) {
          const productArray = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : null;
          if (productArray) {
            setProducts(productArray);
            setProductsError(null);
          } else {
            throw new Error('Invalid response format: Expected an array or object with data array');
          }
        } else {
          throw new Error(data.error || 'Failed to fetch products');
        }
      } catch (err) {
        console.error('Product fetch error:', err);
        setProductsError(err.message || 'Failed to fetch products');
        notifyError(err.message || 'Failed to fetch products');
      } finally {
        setProductsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  // Filter problems based on search query and active filter
  useEffect(() => {
    if (!problems) return;

    let result = [...problems];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(problem =>
        problem.product_name.toLowerCase().includes(query) ||
        problem.problem_description.toLowerCase().includes(query) ||
        problem.solutions?.some(solution =>
          solution.solution_description.toLowerCase().includes(query)
        )
      );
    }

    // Apply status filter
    if (activeFilter === 'solved') {
      result = result.filter(problem =>
        problem.solutions?.some(solution => solution.is_successful)
      );
    } else if (activeFilter === 'unsolved') {
      result = result.filter(problem =>
        !problem.solutions ||
        !problem.solutions.some(solution => solution.is_successful)
      );
    }

    setFilteredProblems(result);
  }, [problems, searchQuery, activeFilter]);

  const handleProblemSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingProblem(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/problems`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_id: parseInt(problemData.product_id),
          problem_description: problemData.problem_description.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        notifySuccess('Problem reported successfully');
        setProblemData({ product_id: '', problem_description: '' });
        // Force refresh to ensure latest data
        await fetchProblems();
      } else {
        throw new Error(data.error || 'Failed to report problem');
      }
    } catch (err) {
      console.error('Problem submission error:', err);
      notifyError(err.message || 'Failed to report problem');
    } finally {
      setIsSubmittingProblem(false);
    }
  };

  const handleSolutionSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingSolution(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/problems/${solutionData.problem_id}/solutions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          solution_description: solutionData.solution_description.trim(),
          is_successful: solutionData.is_successful,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        notifySuccess('Solution added successfully');
        setSolutionData({ problem_id: '', solution_description: '', is_successful: false });
        // Force refresh to ensure latest data
        await fetchProblems();
      } else {
        throw new Error(data.error || 'Failed to add solution');
      }
    } catch (err) {
      console.error('Solution submission error:', err);
      notifyError(err.message || 'Failed to add solution');
    } finally {
      setIsSubmittingSolution(false);
    }
  };

  const handleRefresh = () => {
    fetchProblems();
    notifyInfo('Refreshed problems list');
  };

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
  };

  if (isLoading && !problems.length) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-gray-500 text-lg">
          <svg className="animate-spin h-6 w-6 text-gold-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading Problems...
        </div>
      </div>
    );
  }

  if (error) return <ConnectionError onRetry={handleRefresh} />;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-700 transition-colors disabled:opacity-50"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Problem Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form
          onSubmit={handleProblemSubmit}
          className="p-6 bg-white rounded-xl shadow-sm border border-navy-100 h-full"
        >
          <h2 className="font-display text-lg font-semibold text-navy-800 mb-4 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 text-gold-500" />
            Report New Problem
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="product_id" className="block text-gray-700 font-medium mb-1">
                Product
              </label>
              {productsLoading ? (
                <div className="w-full p-3 border border-navy-100 rounded-lg bg-gray-100 text-gray-600">
                  Loading products...
                </div>
              ) : productsError ? (
                <div className="w-full p-3 border border-red-200 rounded-lg bg-red-50 text-red-600">
                  {productsError}
                </div>
              ) : (
                <div className="relative">
                  <select
                    id="product_id"
                    value={problemData.product_id}
                    onChange={(e) => {
                      console.log('Selected product_id:', e.target.value);
                      setProblemData({ ...problemData, product_id: e.target.value });
                    }}
                    required
                    disabled={isSubmittingProblem || products.length === 0}
                    className="w-full pl-4 p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed appearance-none"
                  >
                    <option value="">Select Product</option>
                    {products.length === 0 ? (
                      <option disabled>No products available</option>
                    ) : (
                      products.map((product) => (
                        <option key={product.product_id} value={product.product_id}>
                          {product.product_name}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="problem_description" className="block text-gray-700 font-medium mb-1">
                Problem Description
              </label>
              <textarea
                id="problem_description"
                value={problemData.problem_description}
                onChange={(e) => setProblemData({ ...problemData, problem_description: e.target.value })}
                required
                disabled={isSubmittingProblem}
                rows={4}
                className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Describe the problem..."
              />
            </div>
          </div>
          <div className="mt-6">
            <button
              type="submit"
              disabled={isSubmittingProblem || products.length === 0}
              className="w-full bg-gold-500 text-navy-900 p-3 rounded-lg font-semibold hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmittingProblem ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Reporting...
                </>
              ) : (
                'Report Problem'
              )}
            </button>
          </div>
        </form>

        {/* Solution Form */}
        <form
          onSubmit={handleSolutionSubmit}
          className="p-6 bg-white rounded-xl shadow-sm border border-navy-100 h-full"
        >
          <h2 className="font-display text-lg font-semibold text-navy-800 mb-4 flex items-center">
            <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
            Add Solution
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="problem_id" className="block text-gray-700 font-medium mb-1">
                Problem
              </label>
              <div className="relative">
                <select
                  id="problem_id"
                  value={solutionData.problem_id}
                  onChange={(e) => setSolutionData({ ...solutionData, problem_id: e.target.value })}
                  required
                  disabled={isSubmittingSolution || problems.length === 0}
                  className="w-full pl-4 p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed appearance-none"
                >
                  <option value="">Select Problem</option>
                  {problems.map((problem) => (
                    <option key={problem.id} value={problem.id}>
                      #{problem.id} - {problem.product_name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="solution_description" className="block text-gray-700 font-medium mb-1">
                Solution Description
              </label>
              <textarea
                id="solution_description"
                value={solutionData.solution_description}
                onChange={(e) => setSolutionData({ ...solutionData, solution_description: e.target.value })}
                required
                disabled={isSubmittingSolution}
                rows={4}
                className="w-full p-3 border border-navy-100 rounded-lg bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Describe the solution..."
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_successful"
                checked={solutionData.is_successful}
                onChange={(e) => setSolutionData({ ...solutionData, is_successful: e.target.checked })}
                disabled={isSubmittingSolution}
                className="h-5 w-5 text-gold-500 focus:ring-gold-400 border-navy-100 rounded disabled:cursor-not-allowed"
              />
              <label htmlFor="is_successful" className="ml-2 text-gray-700 font-medium">
                Solution was successful
              </label>
            </div>
          </div>
          <div className="mt-6">
            <button
              type="submit"
              disabled={isSubmittingSolution}
              className="w-full bg-gold-500 text-navy-900 p-3 rounded-lg font-semibold hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmittingSolution ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Solution'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Problems Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-navy-100">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
          <h2 className="font-display text-lg font-semibold text-navy-800 mb-4 lg:mb-0 flex items-center">
            <Filter className="w-5 h-5 mr-2 text-gold-500" />
            Reported Problems
          </h2>

          <div className="flex flex-col lg:flex-row space-y-3 lg:space-y-0 lg:space-x-4">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                className="pl-10 p-2.5 w-full lg:w-64 border border-navy-100 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gold-400 transition-colors"
                placeholder="Search problems..."
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap gap-2 lg:gap-0 lg:space-x-2">
              <button
                onClick={() => handleFilterChange('all')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-gold-500 text-navy-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => handleFilterChange('solved')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  activeFilter === 'solved'
                    ? 'bg-gold-500 text-navy-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Solved
              </button>
              <button
                onClick={() => handleFilterChange('unsolved')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  activeFilter === 'unsolved'
                    ? 'bg-gold-500 text-navy-900'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Unsolved
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-navy-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-navy-50">
                <th className="px-5 py-3 text-sm font-semibold text-navy-800 border-b border-navy-100 whitespace-nowrap">S.No</th>
                <th className="px-5 py-3 text-sm font-semibold text-navy-800 border-b border-navy-100 whitespace-nowrap">Product Name</th>
                <th className="px-5 py-3 text-sm font-semibold text-navy-800 border-b border-navy-100 whitespace-nowrap">Problem Faced</th>
                <th className="px-5 py-3 text-sm font-semibold text-navy-800 border-b border-navy-100 whitespace-nowrap">Created At</th>
                <th className="px-5 py-3 text-sm font-semibold text-navy-800 border-b border-navy-100 whitespace-nowrap">Status</th>
                <th className="px-5 py-3 text-sm font-semibold text-navy-800 border-b border-navy-100 whitespace-nowrap">Solutions Attempted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {filteredProblems.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="p-6 text-center text-gray-500"
                  >
                    {searchQuery
                      ? "No problems match your search criteria"
                      : "No problems reported"}
                  </td>
                </tr>
              ) : (
                filteredProblems.map((problem, index) => {
                  const hasSolution = problem.solutions?.length > 0;
                  const isSuccessful = hasSolution && problem.solutions.some(s => s.is_successful);

                  return (
                    <tr key={problem.id} className="hover:bg-navy-50/60 transition-colors">
                      <td className="px-5 py-3.5 text-gray-600">{index + 1}</td>
                      <td className="px-5 py-3.5 font-medium text-navy-800 min-w-[140px] lg:min-w-0">{problem.product_name}</td>
                      <td className="px-5 py-3.5 text-gray-600 min-w-[200px] lg:min-w-0">{problem.problem_description}</td>
                      <td className="px-5 py-3.5 text-gray-600">{formatDate(problem.created_at)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          isSuccessful
                            ? 'bg-green-100 text-green-700'
                            : hasSolution
                              ? 'bg-gold-400/25 text-gold-600'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {isSuccessful
                            ? 'Solved'
                            : hasSolution
                              ? 'In Progress'
                              : 'Unsolved'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 min-w-[240px] lg:min-w-0">
                        {hasSolution ? (
                          <div className="space-y-2">
                            {problem.solutions.map((solution) => (
                              <div
                                key={solution.solution_id}
                                className="flex items-start p-2 rounded-lg border border-navy-100"
                              >
                                {solution.is_successful ? (
                                  <CheckCircle className="w-5 h-5 mr-2 text-green-500 flex-shrink-0 mt-1" />
                                ) : (
                                  <XCircle className="w-5 h-5 mr-2 text-red-500 flex-shrink-0 mt-1" />
                                )}
                                <div>
                                  <span className="text-gray-700">{solution.solution_description}</span>
                                  {solution.attempted_at ? (
                                    <span className="block text-gray-500 text-sm">
                                      Attempted: {formatDate(solution.attempted_at)}
                                    </span>
                                  ) : (
                                    <span className="block text-gray-500 text-sm italic">
                                      No timestamp available
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="italic text-gray-500">No solutions yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Results counter */}
        <div className="text-right mt-3 text-gray-500 text-sm">
          Showing {filteredProblems.length} of {problems.length} problems
        </div>
      </div>
    </div>
  );
}

export default ProblemsPage;
