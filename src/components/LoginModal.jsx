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
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-[500px] transform transition-all hover:shadow-2xl duration-300">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Intute.ai Logo" className="h-20 w-auto" />
        </div>
        {error && <p className="text-red-500 text-lg mb-6 text-center">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-gray-50 transition-all duration-200"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 text-lg bg-gray-50 transition-all duration-200"
            required
          />
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 text-lg font-semibold p-4 rounded-lg hover:from-amber-500 hover:to-amber-600 transition-all duration-300 shadow-md"
          >
            Login
          </button>
        </form>
        <button
          onClick={() => setShowLogin(false)}
          className="mt-4 w-full text-gray-600 hover:text-gray-800 text-lg transition-colors duration-200"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default LoginModal;