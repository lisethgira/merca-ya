import { useEffect, useState } from 'react';
import { Bell, Heart, Home, Package, Search, ShoppingBag, UserRound, WifiOff } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useOnline } from '../hooks/useOnline';
import PWABadge from '../PWABadge';

function InstallHint() {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(false);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hidden || window.matchMedia('(display-mode: standalone)').matches) return null;
  if (!prompt && !ios) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-600 px-4 py-3 text-sm text-white">
      <p>{ios ? 'En iPhone: Compartir → Agregar a inicio.' : 'Instala MercaYa en tu pantalla de inicio.'}</p>
      <div className="flex gap-2">
        {prompt ? (
          <button
            type="button"
            className="rounded-xl bg-white px-3 py-1.5 font-semibold text-indigo-700"
            onClick={async () => {
              prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }}
          >
            Instalar app
          </button>
        ) : null}
        <button type="button" className="rounded-xl px-3 py-1.5 text-white/80" onClick={() => setHidden(true)}>Ahora no</button>
      </div>
    </div>
  );
}

export default function Shell() {
  const { user, toast } = useAuth();
  const { count } = useCart();
  const online = useOnline();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const [dbNote, setDbNote] = useState('');

  useEffect(() => {
    api('/salud', { auth: false })
      .then((result) => {
        if (result.data.baseDatos === 'not_configured') {
          setDbNote('La base de datos aún no está configurada. El catálogo aparecerá cuando conectes MySQL.');
        } else if (result.data.baseDatos === 'empty_schema') {
          setDbNote('Falta ejecutar docs/mercaya_db.sql en la base de Clever Cloud.');
        } else if (result.data.baseDatos === 'error') {
          setDbNote(result.data.mensaje || 'No se pudo conectar con MySQL.');
        }
      })
      .catch(() => setDbNote('No se pudo contactar el servidor. Revisa que el backend esté encendido.'));
  }, []);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    api('/notificaciones').then((result) => setUnread(result.data.noLeidas)).catch(() => {});
  }, [user]);

  function search(event) {
    event.preventDefault();
    navigate(query.trim() ? `/explorar?q=${encodeURIComponent(query.trim())}` : '/explorar');
  }

  const link = ({ isActive }) => `flex flex-col items-center gap-1 text-xs ${isActive ? 'text-indigo-600' : 'text-slate-500'}`;

  return (
    <div className="min-h-dvh bg-slate-50 text-indigo-950">
      {!online ? (
        <div className="flex items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-sm text-white" role="status">
          <WifiOff className="h-4 w-4" /> Estás sin conexión. Puedes ver lo ya consultado; las compras esperan a que vuelva internet.
        </div>
      ) : null}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="shrink-0" aria-label="Inicio de MercaYa">
            <img src="/mercaya-logo.svg" alt="MercaYa" className="h-10 w-auto" />
          </Link>
          <form onSubmit={search} className="hidden flex-1 md:block">
            <label className="relative block">
              <span className="sr-only">Buscar productos</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar productos" className="w-full rounded-full border border-slate-200 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500" />
            </label>
          </form>
          <Link to="/notificaciones" className="relative rounded-full p-2 hover:bg-slate-100" aria-label="Notificaciones">
            <Bell className="h-5 w-5" />
            {unread > 0 ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-500" /> : null}
          </Link>
          <Link to="/carrito" className="relative rounded-full p-2 hover:bg-slate-100" aria-label="Carrito">
            <ShoppingBag className="h-5 w-5" />
            {count > 0 ? <span className="absolute -right-1 -top-1 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">{count}</span> : null}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 md:pb-10">
        <InstallHint />
        {dbNote ? <p className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{dbNote}</p> : null}
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-2 py-2 md:hidden" aria-label="Principal">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <NavLink to="/" end className={link}><Home className="h-5 w-5" />Inicio</NavLink>
          <NavLink to="/explorar" className={link}><Search className="h-5 w-5" />Explorar</NavLink>
          <NavLink to="/favoritos" className={link}><Heart className="h-5 w-5" />Favoritos</NavLink>
          <NavLink to="/cuenta/pedidos" className={link}><Package className="h-5 w-5" />Pedidos</NavLink>
          <NavLink to="/cuenta" className={link}><UserRound className="h-5 w-5" />Cuenta</NavLink>
        </div>
      </nav>
      {toast ? <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-indigo-950 px-4 py-2 text-sm text-white shadow-lg md:bottom-6" role="status">{toast}</div> : null}
      <PWABadge />
    </div>
  );
}
