import { useEffect, useState } from 'react';

// Live IST clock string, updated every second. Extracted from Navbar so
// AppShell's TopHeader can show the same clock without duplicating it.
export function useClock() {
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return currentTime;
}
