import React, { useState } from 'react';

/**
 * Login de administrador sencillo (sin backend).
 * - Valida credenciales en el cliente.
 * - Al éxito, llama onSuccess() que el padre usa para marcar sesión activa.
 */
const USERNAME = 'TeamCswo';
const PASSWORD = 'purasweas';

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === USERNAME && password === PASSWORD) {
      try {
        localStorage.setItem('adminAuth', 'true');
      } catch {}
      if (onSuccess) onSuccess();
    } else {
      setError('Credenciales incorrectas');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black text-white relative">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/40 via-blue-900/40 to-purple-900/40" />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
        <h1 className="text-2xl font-bold text-center mb-6">Acceso Administrador</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 outline-none focus:border-cyan-400"
              placeholder="Usuario"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Contraseña</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 outline-none pr-10 focus:border-cyan-400"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-2 my-auto px-2 text-xs opacity-80 hover:opacity-100"
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {show ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold py-2 transition"
          >
            Entrar
          </button>
        </form>
        </p>
      </div>
    </div>
  );
}
