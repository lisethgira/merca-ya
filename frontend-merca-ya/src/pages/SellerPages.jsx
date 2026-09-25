import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { api, media } from '../lib/api';
import { formatCop, formatDate, ORDER_LABELS, PRODUCT_LABELS } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, ErrorNote, Field, Select, TextArea, TextInput } from '../components/ui';

export function SellerLayout() {
  const className = ({ isActive }) => `rounded-full px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-600 text-white' : 'bg-white'}`;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mi tienda</h1>
      <nav className="flex flex-wrap gap-2">
        <NavLink to="/vendedor" end className={className}>Resumen</NavLink>
        <NavLink to="/vendedor/productos" className={className}>Productos</NavLink>
        <NavLink to="/vendedor/ventas" className={className}>Ventas</NavLink>
        <NavLink to="/vendedor/preguntas" className={className}>Preguntas</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}

export function SellerHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  function load(start = desde, end = hasta) {
    const params = new URLSearchParams();
    if (start) params.set('desde', start);
    if (end) params.set('hasta', end);
    api(`/vendedor/resumen?${params}`).then((result) => setData(result.data)).catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, []);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <p>Cargando resumen…</p>;
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <TextInput type="date" value={desde} onChange={(event) => setDesde(event.target.value)} aria-label="Desde" />
        <TextInput type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} aria-label="Hasta" />
        <Button type="submit" variant="ghost">Filtrar</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ingresos" value={formatCop(data.ingresos)} />
        <Stat label="Unidades" value={data.unidades} />
        <Stat label="Pedidos" value={data.pedidos} />
      </div>
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Top de productos</h2>
        {data.top.map((item) => <p key={item.nombre} className="text-sm">{item.nombre} · {item.unidades} und · {formatCop(item.ingresos)}</p>)}
      </section>
      {data.stockBajo.length ? (
        <section className="rounded-3xl bg-orange-50 p-4">
          <h2 className="font-semibold">Stock bajo (3 o menos)</h2>
          {data.stockBajo.map((item) => <p key={item.id} className="text-sm">{item.nombre}: {item.stock}</p>)}
        </section>
      ) : null}
      <p className="text-sm text-slate-500">{data.preguntasSinResponder} preguntas sin responder · {data.ventasPendientes} envíos por gestionar</p>
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="rounded-3xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><strong className="text-xl">{value}</strong></div>;
}

export function SellerProducts() {
  const [items, setItems] = useState([]);
  const { showToast } = useAuth();
  function load() { api('/vendedor/productos?limit=48').then((result) => setItems(result.data.items)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex justify-between"><h2 className="text-xl font-semibold">Productos</h2><Link to="/vendedor/productos/nuevo"><Button>Publicar</Button></Link></div>
      {items.map((item) => (
        <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-sm">
          <div>
            <strong>{item.nombre}</strong>
            <p className="text-sm text-slate-500">{formatCop(item.precioFinal)} · stock {item.stock}</p>
            <Badge>{PRODUCT_LABELS[item.estado] || item.estado}</Badge>
            {item.motivoRechazo ? <p className="text-sm text-red-600">{item.motivoRechazo}</p> : null}
          </div>
          <div className="flex gap-2">
            <Link to={`/vendedor/productos/${item.id}`}><Button variant="ghost">Editar</Button></Link>
            {item.estado === 'publicado' ? <Button variant="ghost" onClick={() => api(`/vendedor/productos/${item.id}/estado`, { method: 'PATCH', body: { estado: 'pausado' } }).then(load)}>Pausar</Button> : null}
            {item.estado === 'pausado' ? <Button variant="ghost" onClick={() => api(`/vendedor/productos/${item.id}/estado`, { method: 'PATCH', body: { estado: 'publicado' } }).then(load)}>Reactivar</Button> : null}
            {item.estado === 'rechazado' ? <Button variant="ghost" onClick={() => api(`/vendedor/productos/${item.id}/estado`, { method: 'PATCH', body: { estado: 'pendiente' } }).then(load)}>Reenviar</Button> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useAuth();
  const [categories, setCategories] = useState([]);
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/categorias', { auth: false }).then((result) => setCategories(result.data.filter((item) => item.activa))).catch(() => {});
    if (id) api(`/vendedor/productos/${id}`).then((result) => setProduct(result.data)).catch((err) => setError(err.message));
  }, [id]);

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      nombre: form.get('nombre'),
      descripcion: form.get('descripcion'),
      categoriaId: form.get('categoriaId'),
      precio: form.get('precio'),
      precioOferta: form.get('precioOferta'),
      stock: form.get('stock'),
      sku: form.get('sku'),
      condicion: form.get('condicion'),
    };
    try {
      const result = id
        ? await api(`/vendedor/productos/${id}`, { method: 'PUT', body })
        : await api('/vendedor/productos', { method: 'POST', body });
      const files = form.getAll('imagenes').filter((file) => file && file.size);
      if (files.length) {
        const upload = new FormData();
        files.forEach((file) => upload.append('imagenes', file));
        await api(`/vendedor/productos/${result.data.id}/imagenes`, { method: 'POST', form: upload });
      }
      showToast(id ? 'Producto actualizado' : 'Producto enviado a revisión');
      navigate('/vendedor/productos');
    } catch (err) {
      setError(err.message);
    }
  }

  if (id && !product && !error) return <p>Cargando…</p>;

  return (
    <form className="mx-auto max-w-2xl space-y-3 rounded-3xl bg-white p-5 shadow-sm" onSubmit={submit}>
      <h2 className="text-xl font-bold">{id ? 'Editar producto' : 'Publicar producto'}</h2>
      <p className="text-sm text-slate-500">Queda pendiente hasta que un administrador lo apruebe. Máximo 6 imágenes JPG, PNG o WebP de 2 MB.</p>
      <ErrorNote>{error}</ErrorNote>
      <Field label="Nombre"><TextInput name="nombre" required defaultValue={product?.nombre} /></Field>
      <Field label="Descripción"><TextArea name="descripcion" defaultValue={product?.descripcion} /></Field>
      <Field label="Categoría">
        <Select name="categoriaId" required defaultValue={product?.categoria?.id || ''}>
          <option value="">Selecciona</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Precio"><TextInput name="precio" type="number" min="1" required defaultValue={product?.precio} /></Field>
        <Field label="Precio de oferta"><TextInput name="precioOferta" type="number" min="0" defaultValue={product?.precioOferta || ''} /></Field>
        <Field label="Stock"><TextInput name="stock" type="number" min="0" required defaultValue={product?.stock ?? 1} /></Field>
        <Field label="SKU"><TextInput name="sku" defaultValue={product?.sku || ''} /></Field>
      </div>
      <Field label="Condición">
        <Select name="condicion" defaultValue={product?.condicion || 'nuevo'}>
          <option value="nuevo">Nuevo</option>
          <option value="usado">Usado</option>
          <option value="reacondicionado">Reacondicionado</option>
        </Select>
      </Field>
      <Field label="Imágenes"><input name="imagenes" type="file" accept="image/jpeg,image/png,image/webp" multiple className="text-sm" /></Field>
      <div className="flex gap-2">
        {product?.imagenes?.map((image) => (
          <div key={image.id} className="relative">
            <img src={media(image.url)} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <button type="button" className="text-xs text-red-600" onClick={() => api(`/vendedor/productos/${id}/imagenes/${image.id}`, { method: 'DELETE' }).then(() => api(`/vendedor/productos/${id}`).then((result) => setProduct(result.data)))}>Quitar</button>
            {!image.esPrincipal ? <button type="button" className="block text-xs text-indigo-600" onClick={() => api(`/vendedor/productos/${id}/imagenes/${image.id}/principal`, { method: 'PATCH' }).then(() => api(`/vendedor/productos/${id}`).then((result) => setProduct(result.data)))}>Principal</button> : <span className="text-xs">Principal</span>}
          </div>
        ))}
      </div>
      <Button type="submit">{id ? 'Guardar' : 'Publicar'}</Button>
    </form>
  );
}

export function SellerSales() {
  const [items, setItems] = useState([]);
  const { showToast } = useAuth();
  function load() { api('/vendedor/ventas').then((result) => setItems(result.data)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);

  async function advance(item) {
    const next = { pendiente: 'en_preparacion', en_preparacion: 'enviado', enviado: 'entregado' }[item.estado];
    if (!next) return;
    let guia = item.guia;
    if (next === 'enviado') {
      guia = window.prompt('Número de guía');
      if (!guia) return;
    }
    try {
      await api(`/vendedor/ventas/${item.id}`, { method: 'PATCH', body: { estado: next, guia } });
      load();
    } catch (error) {
      showToast(error.message);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Ventas</h2>
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <strong>{item.nombre}</strong>
              <p className="text-sm text-slate-500">{item.codigo} · {item.nombres} {item.apellidos} · {formatDate(item.createdAt)}</p>
              <p className="text-sm">{item.direccion}</p>
              {item.guia ? <p className="text-sm">Guía {item.guia}</p> : null}
            </div>
            <Badge>{ORDER_LABELS[item.estado] || item.estado}</Badge>
          </div>
          {['pendiente', 'en_preparacion', 'enviado'].includes(item.estado) ? <Button className="mt-3" variant="ghost" onClick={() => advance(item)}>Avanzar estado</Button> : null}
        </article>
      ))}
    </div>
  );
}

export function SellerQuestions() {
  const [items, setItems] = useState([]);
  const { showToast } = useAuth();
  function load() { api('/vendedor/preguntas').then((result) => setItems(result.data)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Preguntas</h2>
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">{item.producto} · {item.nombres}</p>
          <p>{item.pregunta}</p>
          {item.respuesta ? <p className="text-sm text-slate-600">Respuesta: {item.respuesta}</p> : (
            <form className="mt-2 flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              api(`/vendedor/preguntas/${item.id}/responder`, { method: 'POST', body: { respuesta: new FormData(event.currentTarget).get('respuesta') } })
                .then((result) => setItems(result.data))
                .catch((error) => showToast(error.message));
            }}>
              <TextInput name="respuesta" required maxLength={500} placeholder="Tu respuesta" />
              <Button type="submit">Responder</Button>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}
