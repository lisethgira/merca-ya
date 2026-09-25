# MercaYa

PWA de compra y venta de productos varios. React + Vite + Tailwind en `frontend-merca-ya` y Express + MySQL (Clever Cloud) en `backend-merca-ya`.

## Arranque local

```bash
cd backend-merca-ya
npm install
npm run dev
```

```bash
cd frontend-merca-ya
npm install
npm run dev
```

El frontend queda en http://localhost:5173 y el API en http://localhost:4000/api/v1/salud.

Las credenciales de MySQL viven en `backend-merca-ya/.env` (no se suben a git). El pool usa como máximo 3 conexiones, por debajo del límite de 5 del plan de Clever Cloud.

Usuarios de prueba (contraseña `MercaYa2026*`): `admin@mercaya.com`, `vendedor@mercaya.com`, `cliente@mercaya.com`.
