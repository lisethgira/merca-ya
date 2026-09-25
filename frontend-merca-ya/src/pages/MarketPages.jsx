import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bike, BookOpen, Headphones, Home as HomeIcon, Laptop, Monitor, Package, Search, Share2, Shirt, Smartphone, UtensilsCrossed } from 'lucide-react';
import { api, media } from '../lib/api';
import { discountPercent, formatCop, formatDate } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useOnline } from '../hooks/useOnline';
import { ProductCard } from '../components/ProductCard';
import { Badge, Button, Empty, ErrorNote, Stars, TextArea, TextInput } from '../components/ui';

const ICONS = {
  laptop: Laptop, home: HomeIcon, shirt: Shirt, bike: Bike, book: BookOpen, package: Package,
  smartphone: Smartphone, monitor: Monitor, headphones: Headphones, utensils: UtensilsCrossed,
};

function Icon({ name }) {
  const Glyph = ICONS[name] || Package;
  return <Glyph className="h-5 w-5" aria-hidden="true" />;
}

async function toggleFavorite(product, user, navigate, showToast, reload) {
  if (!user) {
    navigate('/ingresar');
    return;
  }
  if (product.esFavorito) await api(`/favoritos/${product.id}`, { method: 'DELETE' });
  else await api(`/favoritos/${product.id}`, { method: 'POST' });
  showToast(product.esFavorito ? 'Quitado de favoritos' : 'Guardado en favoritos');
  reload();
}

export function Home() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user, showToast } = useAuth();

  function load() {
    Promise.all([api('/categorias', { auth: false }), api('/productos?orden=recientes&limit=8', { auth: Boolean(user) })])
      .then(([cats, items]) => {
        setCategories(cats.data.filter((item) => item.activa && !item.padreId));
        setProducts(items.data.items);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [user]);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-8 text-white md:px-10">
        <p className="text-sm font-medium text-indigo-100">Compra y vende, ya</p>
        <h1 className="mt-2 max-w-xl text-3xl font-bold leading-tight md:text-4xl">Productos varios, tiendas locales y envíos a tu municipio.</h1>
        <form className="mt-6 flex gap-2" onSubmit={(event) => { event.preventDefault(); navigate(query.trim() ? `/explorar?q=${encodeURIComponent(query.trim())}` : '/explorar'); }}>
          <label className="relative flex-1">
            <span className="sr-only">Buscar</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="¿Qué estás buscando?" className="w-full rounded-full py-2.5 pl-9 pr-4 text-sm text-indigo-950 outline-none" />
          </label>
          <Button type="submit" variant="accent">Buscar</Button>
        </form>
      </section>
      <ErrorNote>{error}</ErrorNote>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Categorías</h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {categories.map((category) => (
            <Link key={category.id} to={`/explorar?categoria=${category.slug}`} className="flex min-w-28 flex-col items-center gap-2 rounded-2xl bg-white px-4 py-3 text-center text-sm font-medium shadow-sm">
              <span className="rounded-full bg-indigo-50 p-2 text-indigo-600"><Icon name={category.icono} /></span>
              {category.nombre}
            </Link>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recién publicados</h2>
          <Link to="/explorar" className="text-sm font-semibold text-indigo-600">Ver todo</Link>
        </div>
        {products.length ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onFavorite={(item) => toggleFavorite(item, user, navigate, showToast, load).catch((err) => showToast(err.message))} />
            ))}
          </div>
        ) : <Empty title="Aún no hay productos publicados" text="Cuando una tienda aprobada publique, aparecerán aquí." />}
      </section>
    </div>
  );
}

export function Explore() {
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState({ items: [], total: 0, page: 1, limit: 12 });
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const { user, showToast } = useAuth();
  const navigate = useNavigate();
  const query = params.toString();

  function load() {
    api(`/productos?${query}`, { auth: Boolean(user) })
      .then((response) => setResult(response.data))
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, [query, user]);
  useEffect(() => { api('/categorias', { auth: false }).then((response) => setCategories(response.data.filter((item) => item.activa))).catch(() => {}); }, []);

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  const pages = Math.ceil(result.total / (result.limit || 12));

  return (
    <div className="grid gap-6 md:grid-cols-[240px_1fr]">
      <aside className="space-y-3 rounded-3xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold">Explorar</h1>
        <TextInput aria-label="Buscar" defaultValue={params.get('q') || ''} placeholder="Nombre o descripción" onKeyDown={(event) => { if (event.key === 'Enter') update('q', event.currentTarget.value); }} />
        <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={params.get('categoria') || ''} onChange={(event) => update('categoria', event.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((category) => <option key={category.id} value={category.slug}>{category.padreId ? `— ${category.nombre}` : category.nombre}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <TextInput aria-label="Precio mínimo" placeholder="Mínimo" defaultValue={params.get('precioMin') || ''} onBlur={(event) => update('precioMin', event.target.value)} />
          <TextInput aria-label="Precio máximo" placeholder="Máximo" defaultValue={params.get('precioMax') || ''} onBlur={(event) => update('precioMax', event.target.value)} />
        </div>
        <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={params.get('condicion') || ''} onChange={(event) => update('condicion', event.target.value)}>
          <option value="">Cualquier condición</option>
          <option value="nuevo">Nuevo</option>
          <option value="usado">Usado</option>
          <option value="reacondicionado">Reacondicionado</option>
        </select>
        <TextInput aria-label="Municipio" placeholder="Municipio" defaultValue={params.get('municipio') || ''} onBlur={(event) => update('municipio', event.target.value)} />
        <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={params.get('orden') || 'recientes'} onChange={(event) => update('orden', event.target.value)}>
          <option value="recientes">Más recientes</option>
          <option value="relevancia">Relevancia</option>
          <option value="precio_asc">Menor precio</option>
          <option value="precio_desc">Mayor precio</option>
          <option value="calificacion">Mejor calificados</option>
        </select>
      </aside>
      <section className="space-y-4">
        <p className="text-sm text-slate-500">{result.total} productos</p>
        <ErrorNote>{error}</ErrorNote>
        {result.items.length ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {result.items.map((product) => (
              <ProductCard key={product.id} product={product} onFavorite={(item) => toggleFavorite(item, user, navigate, showToast, load).catch((err) => showToast(err.message))} />
            ))}
          </div>
        ) : <Empty title="Sin resultados" text="Prueba con otra palabra o quita algún filtro." />}
        {pages > 1 ? (
          <div className="flex justify-center gap-2">
            {Array.from({ length: pages }, (_, index) => index + 1).slice(0, 8).map((page) => (
              <button key={page} type="button" className={`h-9 w-9 rounded-full text-sm ${Number(params.get('page') || 1) === page ? 'bg-indigo-600 text-white' : 'bg-white'}`} onClick={() => update('page', String(page))}>{page}</button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [photo, setPhoto] = useState(0);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [reason, setReason] = useState('fraude');
  const { user, showToast } = useAuth();
  const { refresh } = useCart();
  const online = useOnline();
  const navigate = useNavigate();

  function load() {
    api(`/productos/${slug}`, { auth: Boolean(user) })
      .then((response) => setProduct(response.data))
      .catch((err) => setError(err.message));
  }
  useEffect(() => { load(); }, [slug, user]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!product) return <p>Cargando producto…</p>;
  const discount = discountPercent(product.precio, product.precioOferta);
  const image = product.imagenes?.[photo]?.url || product.imagen;

  async function add() {
    if (!user) return navigate('/ingresar', { state: { from: `/producto/${slug}` } });
    await api('/carrito/items', { method: 'POST', body: { productoId: product.id, cantidad: 1 } });
    await refresh();
    showToast('Agregado al carrito');
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <div className="aspect-square overflow-hidden rounded-[2rem] bg-white">
          {image ? <img src={media(image)} alt={product.nombre} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400">Sin foto</div>}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {product.imagenes?.map((item, index) => (
            <button key={item.id} type="button" onClick={() => setPhoto(index)} className={`h-16 w-16 overflow-hidden rounded-xl border ${index === photo ? 'border-indigo-600' : 'border-transparent'}`}>
              <img src={media(item.url)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{product.condicion} · {product.categoria?.nombre}</p>
        <h1 className="text-3xl font-bold">{product.nombre}</h1>
        <Stars value={product.calificacion} />
        <div className="flex items-end gap-3">
          <strong className="text-3xl">{formatCop(product.precioFinal)}</strong>
          {discount > 0 ? <span className="text-slate-400 line-through">{formatCop(product.precio)}</span> : null}
          {discount > 0 ? <Badge tone="orange">-{discount}%</Badge> : null}
        </div>
        <p>{product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}</p>
        <p className="text-sm leading-6 text-slate-600">{product.descripcion}</p>
        <Link to={`/tienda/${product.tienda?.slug}`} className="block rounded-2xl bg-white p-4 shadow-sm">
          <strong>{product.tienda?.nombre}</strong>
          <p className="text-sm text-slate-500">{product.tienda?.municipio}</p>
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" disabled={!online || product.stock <= 0 || product.estado !== 'publicado'} onClick={() => add().catch((err) => showToast(err.message))}>
            {product.stock <= 0 ? 'Agotado' : 'Agregar al carrito'}
          </Button>
          <Button variant="ghost" onClick={() => toggleFavorite(product, user, navigate, showToast, load).catch((err) => showToast(err.message))}>
            {product.esFavorito ? 'En favoritos' : 'Favorito'}
          </Button>
          <Button variant="ghost" onClick={async () => {
            const url = window.location.href;
            if (navigator.share) await navigator.share({ title: product.nombre, url });
            else { await navigator.clipboard.writeText(url); showToast('Enlace copiado'); }
          }}><Share2 className="h-4 w-4" /> Compartir</Button>
        </div>
        {!online ? <p className="text-sm text-slate-500">La compra se habilita cuando vuelva la conexión.</p> : null}

        <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Preguntas</h2>
          {product.preguntas?.length ? product.preguntas.map((item) => (
            <article key={item.id}>
              <p className="text-sm"><strong>{item.nombres}:</strong> {item.pregunta}</p>
              {item.respuesta ? <p className="text-sm text-slate-600">Respuesta: {item.respuesta}</p> : <p className="text-xs text-slate-400">Sin respuesta</p>}
            </article>
          )) : <p className="text-sm text-slate-500">Sé la primera persona en preguntar.</p>}
          {user ? (
            <form className="flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              api(`/productos/${product.id}/preguntas`, { method: 'POST', body: { pregunta: question } })
                .then(() => { setQuestion(''); showToast('Pregunta publicada'); load(); })
                .catch((err) => showToast(err.message));
            }}>
              <TextInput value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="Escribe tu pregunta" />
              <Button type="submit" disabled={!online}>Enviar</Button>
            </form>
          ) : <Link to="/ingresar" className="text-sm font-semibold text-indigo-600">Ingresa para preguntar</Link>}
        </section>

        <section className="space-y-3 rounded-3xl bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Reseñas</h2>
          {product.resenas?.length ? product.resenas.map((review) => (
            <article key={review.id}>
              <Stars value={review.calificacion} />
              <p className="text-sm">{review.comentario}</p>
              <p className="text-xs text-slate-400">{review.nombres} · {formatDate(review.createdAt)}</p>
            </article>
          )) : <p className="text-sm text-slate-500">Todavía no hay reseñas.</p>}
        </section>

        {user ? (
          <form className="space-y-2 rounded-3xl bg-white p-4 shadow-sm" onSubmit={(event) => {
            event.preventDefault();
            const descripcion = new FormData(event.currentTarget).get('descripcion');
            api('/reportes', { method: 'POST', body: { productoId: product.id, motivo: reason, descripcion } })
              .then((response) => showToast(response.message))
              .catch((err) => showToast(err.message));
          }}>
            <h2 className="font-semibold">Reportar publicación</h2>
            <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="fraude">Fraude</option>
              <option value="prohibido">Producto prohibido</option>
              <option value="contenido_inapropiado">Contenido inapropiado</option>
              <option value="informacion_falsa">Información falsa</option>
              <option value="otro">Otro</option>
            </select>
            <TextArea name="descripcion" maxLength={500} placeholder="Cuéntanos qué ocurre (opcional)" />
            <Button type="submit" variant="ghost">Enviar reporte</Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export function StorePage() {
  const { slug } = useParams();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/tiendas/${slug}`, { auth: false })
      .then((response) => setStore(response.data))
      .catch((err) => setError(err.message));
    api(`/productos?tienda=${slug}`, { auth: false })
      .then((response) => setProducts(response.data.items))
      .catch(() => {});
  }, [slug]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!store) return <p>Cargando tienda…</p>;
  return (
    <div className="space-y-6">
      <header className="rounded-[2rem] bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">{store.nombre}</h1>
        <p className="text-sm text-slate-500">{store.municipio} · <Stars value={store.calificacion} /></p>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">{store.descripcion}</p>
      </header>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </div>
  );
}
