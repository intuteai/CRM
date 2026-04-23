const API_BASE_URL = `${import.meta.env.VITE_BACKEND_URL}/api`;

export async function askChatbot(endpoint, message) {
  if (!endpoint) {
    throw new Error('This module is not connected yet.');
  }

  const token = localStorage.getItem('token');

  const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ message }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.response || data?.error || 'Request failed');
  }

  return data;
}
