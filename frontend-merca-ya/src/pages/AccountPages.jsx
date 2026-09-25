import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../lib/api';
import { DEPARTAMENTOS } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, ErrorNote, Field, Select, TextArea, TextInput } from '../components/ui';

export function Account() {
  const { user, logout, refreshUser, showToast, setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/auth/yo', {
        method: 'PUT',
        body: {
          nombres: form.get('nombres'),
          apellidos: form.get('apellidos'),
          telefono: form.get('telefono'),
          tipoDocumento: form.get('tipoDocumento') || null,
          numeroDocumento: form.get('numeroDocumento'),
        },
      });
      setUser(result.data);
      showToast('Perfil actualizado');
    } catch (err) {
      setError(err.message);
    }
  }

  async function password(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/auth/contrasena', { method: 'PUT', body: { actual: form.get('actual'), nueva: form.get('nueva') } });
      setToken(result.data.accessToken);
      setUser(result.data.user);
      showToast('Contraseña actualizada');
      event.currentTarget.reset();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(event) {
    event.preventDefault();
    if (!window.confirm('¿Eliminar tu cuenta? Esta acción no se puede deshacer.')) return;
    try {
      await api('/auth/yo', { method: 'DELETE', body: { password: new FormData(event.currentTarget).get('password') } });
      setToken('');
      setUser(null);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-2 rounded-3xl bg-white p-4 text-sm shadow-sm">
        <p className="font-semibold">{user.nombres} {user.apellidos}</p>
        <Badge>{user.rol}</Badge>
        <div className="grid gap-2 pt-2">
          <Link to="/cuenta/direcciones">Direcciones</Link>
          <Link to="/cuenta/pedidos">Pedidos</Link>
          <Link to="/favoritos">Favoritos</Link>
          <Link to="/notificaciones">Notificaciones</Link>
          <Link to="/mi-tienda">Mi tienda</Link>
          {user.rol === 'vendedor' ? <Link to="/vendedor">Panel de vendedor</Link> : null}
          {user.rol === 'administrador' ? <Link to="/admin">Panel de administración</Link> : null}
          <button type="button" className="text-left text-red-600" onClick={() => logout().then(() => navigate('/'))}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <form className="space-y-3 rounded-3xl bg-white p-5 shadow-sm" onSubmit={save}>
          <h1 className="text-xl font-bold">Mi cuenta</h1>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombres"><TextInput name="nombres" defaultValue={user.nombres} required /></Field>
            <Field label="Apellidos"><TextInput name="apellidos" defaultValue={user.apellidos} required /></Field>
            <Field label="Teléfono"><TextInput name="telefono" defaultValue={user.telefono || ''} /></Field>
            <Field label="Tipo de documento">
              <Select name="tipoDocumento" defaultValue={user.tipoDocumento || ''}>
                <option value="">Sin documento</option>
                <option>CC</option><option>CE</option><option>TI</option><option>PASAPORTE</option><option>NIT</option>
              </Select>
            </Field>
            <Field label="Número"><TextInput name="numeroDocumento" defaultValue={user.numeroDocumento || ''} /></Field>
          </div>
          <Button type="submit">Guardar</Button>
        </form>
        <form className="space-y-3 rounded-3xl bg-white p-5 shadow-sm" onSubmit={password}>
          <h2 className="font-semibold">Cambiar contraseña</h2>
          <Field label="Actual"><TextInput name="actual" type="password" required /></Field>
          <Field label="Nueva"><TextInput name="nueva" type="password" required /></Field>
          <Button type="submit" variant="ghost">Actualizar</Button>
        </form>
        <form className="space-y-3 rounded-3xl bg-white p-5 shadow-sm" onSubmit={remove}>
          <h2 className="font-semibold">Eliminar cuenta</h2>
          <p className="text-sm text-slate-500">Se anonimizan tus datos personales, según la Ley 1581 de 2012. Los pedidos ya hechos se conservan.</p>
          <Field label="Confirma con tu contraseña"><TextInput name="password" type="password" required /></Field>
          <Button type="submit" variant="danger">Eliminar mi cuenta</Button>
        </form>
        <button type="button" className="text-sm text-indigo-600" onClick={() => refreshUser()}>Recargar perfil</button>
      </div>
    </div>
  );
}

export function Addresses() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const { showToast } = useAuth();

  function load() { api('/direcciones').then((result) => setItems(result.data)).catch((err) => setError(err.message)); }
  useEffect(() => { load(); }, []);

  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api('/direcciones', {
        method: 'POST',
        body: {
          alias: form.get('alias'),
          departamento: form.get('departamento'),
          municipio: form.get('municipio'),
          barrio: form.get('barrio'),
          direccion: form.get('direccion'),
          referencia: form.get('referencia'),
          esPrincipal: form.get('principal') === 'on',
        },
      });
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Direcciones</h1>
        <ErrorNote>{error}</ErrorNote>
        {items.map((item) => (
          <article key={item.id} className="rounded-3xl bg-white p-4 shadow-sm">
            <div className="flex justify-between"><strong>{item.alias}</strong>{item.esPrincipal ? <Badge tone="green">Principal</Badge> : null}</div>
            <p className="text-sm text-slate-600">{item.direccion}, {item.barrio} · {item.municipio}, {item.departamento}</p>
            <div className="mt-2 flex gap-3 text-sm">
              {!item.esPrincipal ? <button type="button" onClick={() => api(`/direcciones/${item.id}/principal`, { method: 'PATCH' }).then(load)}>Hacer principal</button> : null}
              <button type="button" className="text-red-600" onClick={() => api(`/direcciones/${item.id}`, { method: 'DELETE' }).then(load).catch((err) => showToast(err.message))}>Eliminar</button>
            </div>
          </article>
        ))}
      </div>
      <form className="space-y-3 rounded-3xl bg-white p-5 shadow-sm" onSubmit={create}>
        <h2 className="font-semibold">Nueva dirección</h2>
        <Field label="Alias"><TextInput name="alias" placeholder="Casa" /></Field>
        <Field label="Departamento">
          <Select name="departamento" required defaultValue="Antioquia">{DEPARTAMENTOS.map((item) => <option key={item}>{item}</option>)}</Select>
        </Field>
        <Field label="Municipio"><TextInput name="municipio" required /></Field>
        <Field label="Barrio"><TextInput name="barrio" /></Field>
        <Field label="Dirección"><TextInput name="direccion" required /></Field>
        <Field label="Referencia"><TextArea name="referencia" /></Field>
        <label className="flex gap-2 text-sm"><input name="principal" type="checkbox" /> Marcar como principal</label>
        <Button type="submit">Guardar dirección</Button>
      </form>
    </div>
  );
}

export function Notifications() {
  const [data, setData] = useState({ items: [], noLeidas: 0 });
  const { showToast } = useAuth();
  function load() { api('/notificaciones').then((result) => setData(result.data)).catch((error) => showToast(error.message)); }
  useEffect(() => { load(); }, []);

  async function enablePush() {
    const health = await api('/salud', { auth: false });
    if (!health.data.vapidPublicKey) {
      showToast('La bandeja interna ya está activa. El push se enciende al configurar las claves VAPID.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(health.data.vapidPublicKey),
    });
    await api('/push/suscribir', { method: 'POST', body: subscription.toJSON() });
    showToast('Notificaciones push activadas');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Notificaciones</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={enablePush}>Activar push</Button>
          <Button variant="ghost" onClick={() => api('/notificaciones/leer-todas', { method: 'POST' }).then(load)}>Marcar leídas</Button>
        </div>
      </div>
      {data.items.map((item) => (
        <Link key={item.id} to={item.url || '/notificaciones'} onClick={() => api(`/notificaciones/${item.id}/leida`, { method: 'PATCH' })} className={`block rounded-3xl bg-white p-4 shadow-sm ${item.leida ? 'opacity-70' : ''}`}>
          <strong>{item.titulo}</strong>
          <p className="text-sm text-slate-600">{item.mensaje}</p>
        </Link>
      ))}
    </div>
  );
}

export function StoreRequest() {
  const [store, setStore] = useState(undefined);
  const [error, setError] = useState('');
  const { showToast, refreshUser } = useAuth();

  useEffect(() => {
    api('/tiendas/mia').then((result) => setStore(result.data)).catch((err) => {
      if (err.status === 404) setStore(null);
      else setError(err.message);
    });
  }, []);

  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/tiendas', {
        method: 'POST',
        body: {
          nombre: form.get('nombre'),
          descripcion: form.get('descripcion'),
          municipio: form.get('municipio'),
          telefonoContacto: form.get('telefono'),
        },
      });
      setStore(result.data);
      showToast('Solicitud enviada');
    } catch (err) {
      setError(err.message);
    }
  }

  if (store === undefined && !error) return <p>Cargando…</p>;
  if (store) {
    return (
      <div className="space-y-3 rounded-3xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">{store.nombre}</h1>
        <Badge>{store.estado}</Badge>
        {store.motivoEstado ? <p className="text-sm">{store.motivoEstado}</p> : null}
        <p className="text-sm text-slate-600">{store.descripcion}</p>
        {store.estado === 'aprobada' ? <Button onClick={() => refreshUser().then(() => {})}><Link to="/vendedor">Ir a mi panel</Link></Button> : <p className="text-sm">Te avisaremos cuando un administrador revise la solicitud.</p>}
      </div>
    );
  }

  return (
    <form className="mx-auto max-w-lg space-y-3 rounded-3xl bg-white p-6 shadow-sm" onSubmit={create}>
      <h1 className="text-2xl font-bold">Abrir mi tienda</h1>
      <p className="text-sm text-slate-500">Queda pendiente hasta que el administrador la apruebe. Entonces tu rol pasa a vendedor.</p>
      <ErrorNote>{error}</ErrorNote>
      <Field label="Nombre"><TextInput name="nombre" required minLength={3} /></Field>
      <Field label="Descripción"><TextArea name="descripcion" /></Field>
      <Field label="Municipio"><TextInput name="municipio" required /></Field>
      <Field label="Teléfono"><TextInput name="telefono" /></Field>
      <Button type="submit">Enviar solicitud</Button>
    </form>
  );
}

export function Privacy() {
  return (
    <article className="prose max-w-3xl space-y-3 rounded-3xl bg-white p-6 text-sm leading-6 shadow-sm">
      <h1 className="text-2xl font-bold">Política de tratamiento de datos</h1>
      <p>MercaYa trata datos personales conforme a la Ley 1581 de 2012. Pedimos nombre, correo, teléfono, direcciones y, si los aportas, documento de identidad, para crear tu cuenta, entregar pedidos y mantener la seguridad de la plataforma.</p>
      <p>La contraseña se guarda cifrada. No almacenamos números de tarjeta: el pago en línea se delega a una pasarela certificada. Puedes actualizar tus datos desde tu cuenta y solicitar la eliminación, que anonimiza tu perfil.</p>
      <p>El responsable es el operador de MercaYa. Al registrarte aceptas esta política.</p>
    </article>
  );
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}
