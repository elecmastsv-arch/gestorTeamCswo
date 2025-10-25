import React, { useEffect, useState } from 'react';
import App from './App.jsx';
import Login from './components/Login.jsx';

function LogoutButton({ onLogout }) {
  return (
    <button
      onClick={onLogout}
      className="fixed top-3 right-3 z-50 rounded-xl bg-red-500/90 hover:bg-red-400 text-white text-sm px-3 py-2 shadow-lg"
      title="Cerrar sesión de administrador"
    >
      Cerrar sesión
    </button>
  );
}

/**
 * Envoltura que protege toda la app detrás de un login de admin.
 * Persiste estado en localStorage (adminAuth=true).
 */
export default function AdminApp() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    try {
      setAuthed(localStorage.getItem('adminAuth') === 'true');
    } catch {
      setAuthed(false);
    }
  }, []);

  const handleSuccess = () => setAuthed(true);
  const handleLogout = () => {
    try { localStorage.removeItem('adminAuth'); } catch {}
    setAuthed(false);
  };

  if (!authed) return <Login onSuccess={handleSuccess} />;

  return (
    <>
      <LogoutButton onLogout={handleLogout} />
      <App />
    </>
  );
}