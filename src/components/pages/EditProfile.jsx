import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';

function EditProfile() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { notifySuccess, notifyError } = useNotify();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    // Client-side validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      notifyError('All fields are required.', { autoClose: 3000 });
      setIsLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      notifyError('New password and confirmation do not match.', { autoClose: 3000 });
      setIsLoading(false);
      return;
    }
    if (newPassword.length < 6) {
      notifyError('New password must be at least 6 characters long.', { autoClose: 3000 });
      setIsLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      notifyError('You must be logged in to update your password.', { autoClose: 3000 });
      setIsLoading(false);
      return;
    }

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/auth/update-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password.', { cause: data.code });
      }

      notifySuccess('Password updated successfully!', { autoClose: 3000 });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const errorCode = err.cause || 'UNKNOWN_ERROR';
      switch (errorCode) {
        case 'AUTH_INVALID_OLD_PASSWORD':
          notifyError('The old password you entered is incorrect.', { autoClose: 3000 });
          break;
        case 'AUTH_PASSWORD_TOO_SHORT':
          notifyError('New password must be at least 6 characters long.', { autoClose: 3000 });
          break;
        case 'AUTH_NO_TOKEN':
        case 'AUTH_INVALID_TOKEN':
          notifyError('Your session has expired. Please log in again.', { autoClose: 3000 });
          break;
        case 'USER_NOT_FOUND':
          notifyError('User not found. Please contact support.', { autoClose: 3000 });
          break;
        default:
          notifyError(err.message || 'An unexpected error occurred.', { autoClose: 3000 });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-gray-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md transform transition-all duration-300 animate-fade-in">
        <h2 className="text-3xl font-bold text-gray-800 mb-8 text-center tracking-tight">Edit Profile</h2>
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
              className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50 shadow-sm transition-all duration-200 disabled:bg-gray-200"
              required
              disabled={isLoading}
              aria-label="Enter your old password"
            />
            <button
              type="button"
              onClick={() => setShowOldPassword(!showOldPassword)}
              className="absolute right-3 top-11 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300 rounded-full p-1 disabled:opacity-50"
              disabled={isLoading}
              aria-label={showOldPassword ? 'Hide old password' : 'Show old password'}
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
              className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50 shadow-sm transition-all duration-200 disabled:bg-gray-200"
              required
              disabled={isLoading}
              aria-label="Enter your new password"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-11 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300 rounded-full p-1 disabled:opacity-50"
              disabled={isLoading}
              aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
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
              className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50 shadow-sm transition-all duration-200 disabled:bg-gray-200"
              required
              disabled={isLoading}
              aria-label="Confirm your new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-11 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300 rounded-full p-1 disabled:opacity-50"
              disabled={isLoading}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <button
            type="submit"
            className={`w-full bg-gradient-to-r from-amber-400 to-amber-500 text-gray-900 font-semibold py-3 rounded-lg shadow-md hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 transition-all duration-300 transform hover:-translate-y-1 ${
              isLoading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            disabled={isLoading}
            aria-label="Update password"
          >
            {isLoading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default EditProfile;