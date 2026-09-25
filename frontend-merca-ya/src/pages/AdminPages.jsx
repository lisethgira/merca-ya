import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api, API_URL, getToken } from '../lib/api';
import { formatCop, formatDate, ORDER_LABELS, PRODUCT_LABELS } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, ErrorNote, Field, TextArea, TextInput } from '../components/ui';

const linkClass = ({ isActive }) => `rounded-full px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-950 text-white' : 'bg-white'}`;

export function AdminLayout() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Administración</h1>
      <nav className="flex flex-wrap gap-2">
        <NavLink to="/admin" end className={linkClass}>Indicadores</NavLink>
        <NavLink to="/admin/usuarios" className={linkClass}>Usuarios</NavLink>
        <NavLink to="/admin/tiendas" className={linkClass}>Tiendas</NavLink>
        <NavLink to="/admin/categorias" className={linkClass}>Categorías</NavLink>
        <NavLink to="/admin/productos" className={linkClass}>Productos</NavLink>
        <NavLink to="/admin/reportes" className={linkClass}>Reportes</NavLink>
        <NavLink to="/admin/pedidos" className={linkClass}>Pedidos</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export function AdminHome() {
  const [data, setData] = useState(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [error, setError] = useState('');
  function load(start = desde, end = hasta) {
    const params = new URLSearchParams();
    if (start) params.set('desde', start);
    if (end) params.set('hasta', end);
    api(`/admin/indicadores?${params}`).then((result) => setData(result.data)).catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, []);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <p>Cargando indicadores…</p>;
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <TextInput type="date" aria-label="Desde" value={desde} onChange={(event) => setDesde(event.target.value)} />
        <TextInput type="date" aria-label="Hasta" value={hasta} onChange={(event) => setHasta(event.target.value)} />
        <Button type="submit" variant="ghost">Filtrar</Button>
        <a className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold" href={`${API_URL}/admin/ventas.csv?desde=${desde}&hasta=${hasta}`} onClick={(event) => downloadCsv(event, desde, hasta)}>Exportar CSV</a>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Ventas" value={formatCop(data.ventas)} />
        <Card label="Pedidos" value={data.pedidos} />
        <Card label="Usuarios nuevos" value={data.usuariosNuevos} />
        <Card label="Tiendas pendientes" value={data.tiendasPendientes} />
        <Card label="Productos pendientes" value={data.productosPendientes} />
        <Card label="Reportes abiertos" value={data.reportesAbiertos} />
      </div>
      <div className="rounded-3xl bg-white p-4 shadow-sm">
        {data.pedidosPorEstado.map((item) => <p key={item.estado} className="text-sm">{ORDER_LABELS[item.estado] || item.estado}: {item.total}</p>)}
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return <div className="rounded-3xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><strong className="text-xl">{value}</strong></div>;
}

async function downloadCsv(event, desde, hasta) {
  event.preventDefault();
  const response = await fetch(`${API_URL}/admin/ventas.csv?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'ventas-mercaya.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AdminUsers() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [rol, setRol] = useState('');
  const [estado, setEstado] = useState('');
  const { showToast } = useAuth();
  function load() {
    const params = new URLSearchParams({ q, rol, estado });
    api(`/admin/usuarios?${params}`).then((result) => setItems(result.data)).catch((error) => showToast(error.message));
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <TextInput placeholder="Correo o nombre" value={q} onChange={(event) => setQ(event.target.value)} />
        <select className="rounded-xl border px-3" value={rol} onChange={(event) => setRol(event.target.value)}><option value="">Rol</option><option value="administrador">Administrador</option><option value="vendedor">Vendedor</option><option value="cliente">Cliente</option></select>
        <select className="rounded-xl border px-3" value={estado} onChange={(event) => setEstado(event.target.value)}><option value="">Estado</option><option value="activo">Activo</option><option value="inactivo">Inactivo</option><option value="bloqueado">Bloqueado</option></select>
        <Button type="submit" variant="ghost">Buscar</Button>
      </form>
      <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="p-3">Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="p-3"><strong>{item.nombres} {item.apellidos}</strong><p className="text-slate-500">{item.email}</p></td>
                <td>{item.rol}</td>
                <td>{item.estado}</td>
                <td className="space-x-2 p-3">
                  {item.estado !== 'bloqueado' ? <button type="button" className="text-red-600" onClick={() => api(`/admin/usuarios/${item.id}`, { method: 'PATCH', body: { estado: 'bloqueado' } }).then((result) => setItems(result.data)).catch((error) => showToast(error.message))}>Bloquear</button> : <button type="button" onClick={() => api(`/admin/usuarios/${item.id}`, { method: 'PATCH', body: { estado: 'activo' } }).then((result) => setItems(result.data))}>Activar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminStores() {
  const [items, setItems] = useState([]);
  const { showToast } = useAuth();
  function load() { api('/admin/tiendas').then((result) => setItems(result.data)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);
  async function decide(id, estado) {
    let motivo = '';
    if (estado !== 'aprobada') {
      motivo = window.prompt('Motivo');
      if (!motivo) return;
    }
    try {
      await api(`/admin/tiendas/${id}`, { method: 'PATCH', body: { estado, motivo } });
      load();
    } catch (error) {
      showToast(error.message);
    }
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <strong>{item.nombre}</strong>
              <p className="text-sm text-slate-500">{item.dueno} · {item.email} · {item.municipio}</p>
              <p className="text-sm">{item.descripcion}</p>
            </div>
            <Badge>{item.estado}</Badge>
          </div>
          <div className="mt-3 flex gap-2">
            {item.estado !== 'aprobada' ? <Button onClick={() => decide(item.id, 'aprobada')}>Aprobar</Button> : null}
            <Button variant="ghost" onClick={() => decide(item.id, 'rechazada')}>Rechazar</Button>
            <Button variant="danger" onClick={() => decide(item.id, 'suspendida')}>Suspender</Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminCategories() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  function load() { api('/categorias', { auth: false }).then((result) => setItems(result.data)).catch((err) => setError(err.message)); }
  useEffect(() => { load(); }, []);
  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/categorias', { method: 'POST', body: { nombre: form.get('nombre'), icono: form.get('icono'), padreId: form.get('padreId') || null, descripcion: form.get('descripcion') } });
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-2">
        <ErrorNote>{error}</ErrorNote>
        {items.map((item) => (
          <article key={item.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
            <span>{item.padreId ? '— ' : ''}{item.nombre} <span className="text-xs text-slate-400">{item.slug}</span></span>
            <div className="flex gap-2 text-sm">
              <button type="button" onClick={() => api(`/categorias/${item.id}`, { method: 'PUT', body: { nombre: item.nombre, icono: item.icono, padreId: item.padreId, descripcion: item.descripcion || '', activa: !item.activa } }).then(load)}>{item.activa ? 'Desactivar' : 'Activar'}</button>
              <button type="button" className="text-red-600" onClick={() => api(`/categorias/${item.id}`, { method: 'DELETE' }).then(load).catch((err) => setError(err.message))}>Eliminar</button>
            </div>
          </article>
        ))}
      </div>
      <form className="h-fit space-y-3 rounded-3xl bg-white p-4 shadow-sm" onSubmit={create}>
        <h2 className="font-semibold">Nueva categoría</h2>
        <Field label="Nombre"><TextInput name="nombre" required /></Field>
        <Field label="Ícono"><TextInput name="icono" placeholder="laptop, home, shirt..." /></Field>
        <Field label="Padre">
          <select name="padreId" className="w-full rounded-xl border px-3 py-2 text-sm">
            <option value="">Ninguno</option>
            {items.filter((item) => !item.padreId).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select>
        </Field>
        <TextArea name="descripcion" placeholder="Descripción" />
        <Button type="submit">Crear</Button>
      </form>
    </div>
  );
}

export function AdminProducts() {
  const [items, setItems] = useState([]);
  const { showToast } = useAuth();
  function load() { api('/admin/productos?estado=pendiente').then((result) => setItems(result.data.items)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);
  async function moderate(id, estado) {
    let motivo = '';
    if (estado === 'rechazado') {
      motivo = window.prompt('Motivo del rechazo');
      if (!motivo) return;
    }
    try {
      await api(`/admin/productos/${id}`, { method: 'PATCH', body: { estado, motivo } });
      load();
    } catch (error) {
      showToast(error.message);
    }
  }
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Publicaciones pendientes</h2>
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
          <Link to={`/producto/${item.slug}`} className="font-semibold">{item.nombre}</Link>
          <p className="text-sm text-slate-500">{item.tienda?.nombre} · {formatCop(item.precio)} · {PRODUCT_LABELS[item.estado]}</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => moderate(item.id, 'publicado')}>Aprobar</Button>
            <Button variant="danger" onClick={() => moderate(item.id, 'rechazado')}>Rechazar</Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminReports() {
  const [items, setItems] = useState([]);
  const { showToast } = useAuth();
  function load() { api('/admin/reportes').then((result) => setItems(result.data)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);
  async function resolve(id, estado, pausarProducto = false) {
    const resolucion = window.prompt('Resolución') || '';
    try {
      const result = await api(`/admin/reportes/${id}`, { method: 'PATCH', body: { estado, resolucion, pausarProducto } });
      setItems(result.data);
    } catch (error) {
      showToast(error.message);
    }
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex justify-between"><strong>{item.producto}</strong><Badge>{item.estado}</Badge></div>
          <p className="text-sm">{item.motivo} · {item.reportante} · {formatDate(item.createdAt)}</p>
          <p className="text-sm text-slate-600">{item.descripcion}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => resolve(item.id, 'en_revision')}>En revisión</Button>
            <Button variant="danger" onClick={() => resolve(item.id, 'resuelto', true)}>Pausar producto</Button>
            <Button onClick={() => resolve(item.id, 'resuelto')}>Resolver</Button>
            <Button variant="ghost" onClick={() => resolve(item.id, 'descartado')}>Descartar</Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminOrders() {
  const [items, setItems] = useState([]);
  const [estado, setEstado] = useState('');
  const { showToast } = useAuth();
  function load(next = estado) {
    api(`/admin/pedidos?estado=${next}`).then((result) => setItems(result.data)).catch((error) => showToast(error.message));
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-3">
      <select className="rounded-xl border px-3 py-2" value={estado} onChange={(event) => { setEstado(event.target.value); load(event.target.value); }}>
        <option value="">Todos</option>
        {Object.entries(ORDER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b"><th className="p-3">Código</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Estado</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.codigo} className="border-b">
                <td className="p-3">{item.codigo}<p className="text-xs text-slate-400">{formatDate(item.createdAt)}</p></td>
                <td>{item.nombres} {item.apellidos}<p className="text-xs">{item.email}</p></td>
                <td>{formatCop(item.total)}</td>
                <td>{item.metodo} · {item.estadoPago}</td>
                <td>{ORDER_LABELS[item.estado] || item.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
