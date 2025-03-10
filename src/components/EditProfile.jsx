import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

function EditProfile() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false); // New: Loading state

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsLoading(true); // Disable button during request

    // Client-side validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('All fields are required.');
      setIsLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      setIsLoading(false);
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      setIsLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setError('You must be logged in to update your password.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/auth/update-password', { // Full URL
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await response.json();
      if (!response.ok) {
        // Handle structured error response from backend
        throw new Error(data.error || 'Failed to update password.', { cause: data.code });
      }

      setMessage('Password updated successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      // Improved error handling with backend error codes
      const errorCode = err.cause || 'UNKNOWN_ERROR';
      switch (errorCode) {
        case 'AUTH_INVALID_OLD_PASSWORD':
          setError('The old password you entered is incorrect.');
          break;
        case 'AUTH_PASSWORD_TOO_SHORT':
          setError('New password must be at least 6 characters long.');
          break;
        case 'AUTH_NO_TOKEN':
        case 'AUTH_INVALID_TOKEN':
          setError('Your session has expired. Please log in again.');
          break;
        case 'USER_NOT_FOUND':
          setError('User not found. Please contact support.');
          break;
        default:
          setError(err.message || 'An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false); // Re-enable button
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md transform transition-all duration-300 animate-fade-in">
        <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Edit Profile</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <label htmlFor="oldPassword" className="block text-gray-700 font-medium mb-2">
              Old Password
            </label>
            <input
              id="oldPassword"
              type={showOldPassword ? 'text' : 'password'}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
              required
              disabled={isLoading} // Disable during submission
            />
            <button
              type="button"
              onClick={() => setShowOldPassword(!showOldPassword)}
              className="absolute right-3 top-12 text-gray-500"
              disabled={isLoading}
            >
              {showOldPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="relative">
            <label htmlFor="newPassword" className="block text-gray-700 font-medium mb-2">
              New Password
            </label>
            <input
              id="newPassword"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
              required
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-12 text-gray-500"
              disabled={isLoading}
            >
              {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <div className="relative">
            <label htmlFor="confirmPassword" className="block text-gray-700 font-medium mb-2">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-amber-300 focus:outline-none"
              required
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-12 text-gray-500"
              disabled={isLoading}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {message && <p className="text-green-600 text-center">{message}</p>}
          {error && <p className="text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            className={`w-full bg-gradient-to-r from-amber-300 to-amber-400 text-gray-900 font-medium py-3 rounded-lg shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isLoading}
          >
            {isLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default EditProfile;