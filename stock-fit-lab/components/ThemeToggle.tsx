'use client';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);
  return (
    <button
      className="btn"
      aria-label="切換深色模式"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
        try {
          localStorage.setItem('sfl-theme', next ? 'dark' : 'light');
        } catch {}
        window.dispatchEvent(new Event('sfl-theme'));
      }}
    >
      {dark ? '☀️ 淺色' : '🌙 深色'}
    </button>
  );
}
