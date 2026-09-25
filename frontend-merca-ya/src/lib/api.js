export const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:4000/api/v1');
export const FILE_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, '');

const TOKEN_KEY = 'mercaya_access';

export function media(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${FILE_ORIGIN}${url}`;
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function parse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'No se pudo completar la solicitud');
    error.status = response.status;
    throw error;
  }
  return data;
}

let refreshing = null;

export async function refreshSession() {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refrescar`, { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          setToken('');
          return null;
        }
        const data = await response.json();
        setToken(data.data.accessToken);
        return data.data;
      })
      .catch(() => {
        setToken('');
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export async function api(path, { method = 'GET', body, form, auth = true } = {}) {
  const run = async () => {
    const headers = {};
    const token = getToken();
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    return fetch(`${API_URL}${path}`, { method, headers, body: payload, credentials: 'include' });
  };

  let response = await run();
  if (response.status === 401 && auth && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) response = await run();
  }
  return parse(response);
}
