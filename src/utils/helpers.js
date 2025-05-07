export const formatDate = (dateString) => {
  if (!dateString) return 'No Date';
  try {
    // Log input for debugging
    console.log('formatDate input:', dateString);

    // Normalize dateString: handle ISO format, milliseconds, and timezone suffixes
    let normalizedString = dateString;
    // Remove milliseconds and timezone (e.g., ".759757" or "+00:00")
    normalizedString = normalizedString.split('.')[0].replace(/Z|(\+\d{2}:\d{2})$/, '');
    // Replace 'T' with space for ISO formats (e.g., "2025-05-07T12:55:19" -> "2025-05-07 12:55:19")
    normalizedString = normalizedString.replace('T', ' ');

    // Try parsing as IST with +05:30
    let date = new Date(`${normalizedString} +05:30`);
    if (isNaN(date.getTime())) {
      // Fallback: try parsing without explicit timezone
      date = new Date(normalizedString);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
    }

    // Format as "M/D/YYYY, h:mm:ss A" in IST
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
    console.error('Date formatting error:', err, 'Input:', dateString);
    return 'Invalid Date Format';
  }
};

export const showNotification = (setNotification, message) => {
  setNotification(message);
  setTimeout(() => setNotification(null), 3000);
};