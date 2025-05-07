export const formatDate = (dateString) => {
  if (!dateString) return 'No Date';
  try {
    // Parse the date string as IST by appending +05:30 (e.g., "2025-05-07 12:55:19 +05:30")
    const date = new Date(`${dateString} +05:30`);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    // Format as "M/D/YYYY, h:mm:ss A" in IST (e.g., "5/7/2025, 12:55:19 PM")
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch (err) {
    console.error('Date formatting error:', err);
    return 'Invalid Date Format';
  }
};

export const showNotification = (setNotification, message) => {
  setNotification(message);
  setTimeout(() => setNotification(null), 3000);
};