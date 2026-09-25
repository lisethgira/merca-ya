import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, media } from '../lib/api';
import { formatCop, formatDate, ORDER_LABELS } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useOnline } from '../hooks/useOnline';
import { Badge, Button, Empty, ErrorNote, Field, Stars, TextArea, TextInput } from '../components/ui';

export function CartPage() {
  const { cart, refresh } = useCart();
  const { showToast } = useAuth();
  const online = useOnline();

  async function change(id, cantidad) {
    try {
      await api(`/carrito/items/${id}`, { method: 'PATCH', body: { cantidad } });
      await refresh();
    } catch (error) {
      showToast(error.message);
    }
  }

  if (!cart.items?.length) return <Empty title="Tu carrito está vacío" text="Explora el catálogo y agrega lo que necesites." />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Carrito</h1>
        {cart.items.map((item) => (
          <article key={item.id} className="flex gap-3 rounded-3xl bg-white p-3 shadow-sm">
            <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-100">
              {item.imagen ? <img src={media(item.imagen)} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="flex-1">
              <Link to={`/producto/${item.slug}`} className="font-semibold">{item.nombre}</Link>
              <p className="text-sm text-slate-500">{item.tienda} · {formatCop(item.precioOferta || item.precio)}</p>
              {!item.disponible ? <Badge tone="red">No disponible</Badge> : null}
              <div className="mt-2 flex items-center gap-2">
                <TextInput className="w-20" type="number" min="1" max={item.stock} value={item.cantidad} onChange={(event) => change(item.id, Number(event.target.value))} />
                <button type="button" className="text-sm text-red-600" onClick={() => api(`/carrito/items/${item.id}`, { method: 'DELETE' }).then(refresh)}>Quitar</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <aside className="h-fit space-y-3 rounded-3xl bg-white p-4 shadow-sm">
        <Row label="Subtotal" value={formatCop(cart.subtotal)} />
        <Row label="Descuento" value={formatCop(cart.descuento)} />
        <Row label="Envío" value={cart.costoEnvio ? formatCop(cart.costoEnvio) : 'Gratis'} />
        <Row label="Total" value={formatCop(cart.total)} strong />
        <p className="text-xs text-slate-500">Envío gratis desde $150.000.</p>
        <Link to="/checkout"><Button className="w-full" variant="accent" disabled={!online}>Continuar compra</Button></Link>
      </aside>
    </div>
  );
}

export function Checkout() {
  const { cart, refresh } = useCart();
  const online = useOnline();
  const [addresses, setAddresses] = useState([]);
  const [direccionId, setDireccionId] = useState('');
  const [metodo, setMetodo] = useState('contraentrega');
  const [telefono, setTelefono] = useState('');
  const [mode, setMode] = useState('demo');
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/direcciones').then((result) => {
      setAddresses(result.data);
      const main = result.data.find((item) => item.esPrincipal) || result.data[0];
      if (main) setDireccionId(String(main.id));
    }).catch((err) => setError(err.message));
    api('/salud', { auth: false }).then((result) => setMode(result.data.modoPago)).catch(() => {});
    api('/auth/yo').then((result) => setTelefono(result.data.telefono || '')).catch(() => {});
  }, []);

  async function confirm(event) {
    event.preventDefault();
    if (!online) return;
    try {
      const result = await api('/pedidos', {
        method: 'POST',
        body: { direccionId, metodo, telefono, notas: new FormData(event.currentTarget).get('notas') },
      });
      setDone(result.data);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-[2rem] bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-bold">Pedido {done.codigo}</h1>
        <p>Total {formatCop(done.total)}. Estado: {ORDER_LABELS[done.estado] || done.estado}.</p>
        {done.modoPago === 'demo' && done.metodo !== 'contraentrega' ? <p className="text-sm text-slate-500">Pago en línea aprobado en modo demostración, sin guardar datos de tarjeta.</p> : null}
        <Link to={`/cuenta/pedidos/${done.codigo}`}><Button>Ver pedido</Button></Link>
      </div>
    );
  }

  return (
    <form className="mx-auto grid max-w-3xl gap-4" onSubmit={confirm}>
      <h1 className="text-2xl font-bold">Confirmar compra</h1>
      <ErrorNote>{error}</ErrorNote>
      <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">1. Dirección</h2>
        {addresses.length ? addresses.map((address) => (
          <label key={address.id} className="flex gap-2 text-sm">
            <input type="radio" name="direccion" checked={direccionId === String(address.id)} onChange={() => setDireccionId(String(address.id))} />
            <span><strong>{address.alias}.</strong> {address.direccion}, {address.municipio}</span>
          </label>
        )) : <Link to="/cuenta/direcciones" className="text-sm font-semibold text-indigo-600">Agrega una dirección</Link>}
        <Field label="Teléfono de contacto"><TextInput value={telefono} onChange={(event) => setTelefono(event.target.value)} required /></Field>
      </section>
      <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">2. Pago</h2>
        {['contraentrega', 'tarjeta', 'pse', 'nequi', 'daviplata', 'transferencia'].map((item) => (
          <label key={item} className="flex items-center gap-2 text-sm capitalize">
            <input type="radio" name="metodo" checked={metodo === item} onChange={() => setMetodo(item)} /> {item}
          </label>
        ))}
        {mode === 'demo' ? <p className="text-xs text-slate-500">Los pagos en línea se aprueban en demostración hasta conectar Wompi. No pedimos datos de tarjeta.</p> : null}
        <Field label="Notas"><TextArea name="notas" /></Field>
      </section>
      <section className="space-y-2 rounded-3xl bg-indigo-950 p-4 text-white">
        <h2 className="font-semibold">3. Resumen</h2>
        <p>{cart.items?.length || 0} productos · {formatCop(cart.total)}</p>
        <Button type="submit" variant="accent" disabled={!online || !direccionId}>Confirmar pedido</Button>
      </section>
    </form>
  );
}

export function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api('/pedidos').then((result) => setOrders(result.data)).catch((err) => setError(err.message)); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mis pedidos</h1>
      <ErrorNote>{error}</ErrorNote>
      {orders.length ? orders.map((order) => (
        <Link key={order.codigo} to={`/cuenta/pedidos/${order.codigo}`} className="block rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <strong>{order.codigo}</strong>
            <Badge>{ORDER_LABELS[order.estado] || order.estado}</Badge>
          </div>
          <p className="text-sm text-slate-500">{formatDate(order.createdAt)} · {formatCop(order.total)}</p>
        </Link>
      )) : <Empty title="Sin pedidos" text="Cuando compres, el seguimiento aparecerá aquí." />}
    </div>
  );
}

export function OrderDetail() {
  const { codigo } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const { showToast } = useAuth();

  function load() {
    api(`/pedidos/${codigo}`).then((result) => setOrder(result.data)).catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, [codigo]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!order) return <p>Cargando pedido…</p>;
  const canCancel = !order.items.some((item) => ['enviado', 'entregado'].includes(item.estado)) && order.estado !== 'cancelado';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{order.codigo}</h1>
      <Badge>{ORDER_LABELS[order.estado] || order.estado}</Badge>
      <p className="text-sm text-slate-500">{order.direccionEnvio} · {order.telefono}</p>
      {order.items.map((item) => (
        <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="flex justify-between gap-3">
            <div>
              <strong>{item.nombre}</strong>
              <p className="text-sm text-slate-500">{item.tienda} · x{item.cantidad}</p>
              {item.guia ? <p className="text-sm">Guía: {item.guia}</p> : null}
            </div>
            <Badge tone="slate">{ORDER_LABELS[item.estado] || item.estado}</Badge>
          </div>
          {item.estado === 'entregado' ? <ReviewForm detallePedidoId={item.id} onDone={() => showToast('Reseña publicada')} /> : null}
        </article>
      ))}
      <p className="text-lg font-bold">Total {formatCop(order.total)}</p>
      {canCancel ? <Button variant="danger" onClick={() => api(`/pedidos/${codigo}/cancelar`, { method: 'POST' }).then(load).catch((err) => showToast(err.message))}>Cancelar pedido</Button> : null}
    </div>
  );
}

function ReviewForm({ detallePedidoId, onDone }) {
  const [score, setScore] = useState(5);
  return (
    <form className="mt-3 space-y-2" onSubmit={(event) => {
      event.preventDefault();
      api('/resenas', { method: 'POST', body: { detallePedidoId, calificacion: score, comentario: new FormData(event.currentTarget).get('comentario') } })
        .then(onDone)
        .catch((error) => onDone(error.message));
    }}>
      <Field label="Califica tu compra">
        <input type="range" min="1" max="5" value={score} onChange={(event) => setScore(Number(event.target.value))} />
      </Field>
      <Stars value={score} />
      <TextArea name="comentario" maxLength={500} placeholder="¿Cómo te fue?" />
      <Button type="submit" variant="ghost">Publicar reseña</Button>
    </form>
  );
}

export function Favorites() {
  const [items, setItems] = useState([]);
  const { showToast } = useAuth();
  function load() { api('/favoritos').then((result) => setItems(result.data)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Favoritos</h1>
      {items.length ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-3xl bg-white p-3 shadow-sm">
              <Link to={`/producto/${item.slug}`}>
                {item.imagen ? <img src={media(item.imagen)} alt="" className="aspect-square w-full rounded-2xl object-cover" /> : <div className="aspect-square rounded-2xl bg-slate-100" />}
                <strong className="mt-2 block text-sm">{item.nombre}</strong>
              </Link>
              <p className="text-sm">{formatCop(item.precioFinal)}</p>
              {item.agotado ? <Badge tone="slate">Agotado</Badge> : null}
              <button type="button" className="mt-2 text-sm text-red-600" onClick={() => api(`/favoritos/${item.id}`, { method: 'DELETE' }).then(load)}>Quitar</button>
            </article>
          ))}
        </div>
      ) : <Empty title="No tienes favoritos" text="Marca el corazón en un producto para verlo después." />}
    </div>
  );
}

function Row({ label, value, strong }) {
  return <p className={`flex justify-between text-sm ${strong ? 'text-base font-bold' : ''}`}><span>{label}</span><span>{value}</span></p>;
}
