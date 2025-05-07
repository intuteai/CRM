// src/utils/helpers.js
export const formatDate = (dateString) => {
    if (!dateString) return 'No Date';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (err) {
      console.error('Date formatting error:', err);
      return 'Invalid Date Format';
    }
  };
  
  export const showNotification = (setNotification, message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };