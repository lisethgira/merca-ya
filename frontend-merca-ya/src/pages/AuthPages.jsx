import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button, ErrorNote, Field, TextInput } from '../components/ui';

function destination(user, from) {
  if (from && from !== '/ingresar') return from;
  if (user.rol === 'administrador') return '/admin';
  if (user.rol === 'vendedor') return '/vendedor';
  return '/';
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const user = await login(form.get('email'), form.get('password'));
      navigate(destination(user, location.state?.from?.pathname || location.state?.from));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthCard title="Ingresar" text="Accede con tu correo y contraseña.">
      <form className="space-y-4" onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <Field label="Correo"><TextInput name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Contraseña"><TextInput name="password" type="password" required autoComplete="current-password" /></Field>
        <Button type="submit" className="w-full">Entrar</Button>
      </form>
      <p className="text-sm text-slate-500">¿No tienes cuenta? <Link className="font-semibold text-indigo-600" to="/registro">Regístrate</Link></p>
      <Link className="text-sm font-semibold text-indigo-600" to="/recuperar">Olvidé mi contraseña</Link>
    </AuthCard>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await register({
        nombres: form.get('nombres'),
        apellidos: form.get('apellidos'),
        email: form.get('email'),
        telefono: form.get('telefono'),
        password: form.get('password'),
        aceptaPolitica: form.get('politica') === 'on',
      });
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AuthCard title="Crear cuenta" text="Te registras como cliente. Luego puedes abrir tu tienda.">
      <form className="space-y-4" onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombres"><TextInput name="nombres" required minLength={2} /></Field>
          <Field label="Apellidos"><TextInput name="apellidos" required minLength={2} /></Field>
        </div>
        <Field label="Correo"><TextInput name="email" type="email" required /></Field>
        <Field label="Teléfono"><TextInput name="telefono" /></Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres, una mayúscula, un número y un símbolo.">
          <TextInput name="password" type="password" required minLength={8} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input name="politica" type="checkbox" required className="mt-1" />
          <span>Acepto la <Link to="/privacidad" className="font-semibold text-indigo-600">política de tratamiento de datos</Link>.</span>
        </label>
        <Button type="submit" className="w-full">Crear cuenta</Button>
      </form>
    </AuthCard>
  );
}

export function Forgot() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    try {
      const result = await api('/auth/recuperar', { method: 'POST', auth: false, body: { email: new FormData(event.currentTarget).get('email') } });
      setMessage(result.message);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <AuthCard title="Recuperar contraseña" text="Te enviaremos un enlace que vence en 30 minutos.">
      <form className="space-y-4" onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
        <Field label="Correo"><TextInput name="email" type="email" required /></Field>
        <Button type="submit" className="w-full">Enviar enlace</Button>
      </form>
    </AuthCard>
  );
}

export function Reset() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault();
    try {
      const result = await api('/auth/restablecer', {
        method: 'POST',
        auth: false,
        body: { token: params.get('token'), password: new FormData(event.currentTarget).get('password') },
      });
      setMessage(result.message);
      window.setTimeout(() => navigate('/ingresar'), 1200);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <AuthCard title="Nueva contraseña" text="El enlace solo puede usarse una vez.">
      <form className="space-y-4" onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        <Field label="Nueva contraseña" hint="Mínimo 8 caracteres, una mayúscula, un número y un símbolo.">
          <TextInput name="password" type="password" required />
        </Field>
        <Button type="submit" className="w-full">Guardar</Button>
      </form>
    </AuthCard>
  );
}

function AuthCard({ title, text, children }) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-[2rem] bg-white p-6 shadow-sm">
      <img src="/mercaya-logo.svg" alt="" className="h-10" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-slate-500">{text}</p>
      {children}
    </div>
  );
}
