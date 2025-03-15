import React, { useState } from 'react';
import logo from '../assets/intute-ai_logo.jpeg';

function LoginModal({ setShowLogin, onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      console.log('VITE_BACKEND_URL in LoginModal:', import.meta.env.VITE_BACKEND_URL); // Debug log
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        onSubmit(data.role, data.name || email.split('@')[0], data.token);
        setShowLogin(false);
      } else {
        if (res.status === 429) {
          setError('Too many login attempts. Please wait and try again.');
        } else {
          setError(data.error || 'Login failed');
        }
      }
    } catch (err) {
      setError('Network error - please check if the server is running');
      console.error('Login error:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 px-4 sm:px-0">
      <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 w-full max-w-md sm:max-w-lg transform transition-all hover:shadow-2xl duration-300">
        <div className="flex justify-center mb-4 sm:mb-6">
          <img src={logo} alt="Intute.ai Logo" className="h-14 sm:h-20 w-auto" />
        </div>
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 mb-4 sm:mb-6">
            <p className="text-red-500 text-sm sm:text-base text-center">{error}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          <div>
            <label htmlFor="email" className="block text-gray-700 text-sm sm:text-base font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full p-2 sm:p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-sm sm:text-base bg-gray-50 transition-all duration-200"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-gray-700 text-sm sm:text-base font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full p-2 sm:p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-sm sm:text-base bg-gray-50 transition-all duration-200"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 text-sm sm:text-base font-semibold p-2 sm:p-3 rounded-lg hover:from-amber-500 hover:to-amber-600 transition-all duration-300 shadow-md"
          >
            Login
          </button>
        </form>
        <div className="mt-4 sm:mt-6 flex justify-end">
          <button
            onClick={() => setShowLogin(false)}
            className="text-gray-600 hover:text-gray-800 text-sm sm:text-base transition-colors duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginModal;