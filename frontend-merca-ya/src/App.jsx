import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import Shell from './components/Shell'
import { Explore, Home, ProductPage, StorePage } from './pages/MarketPages'
import { Forgot, Login, Register, Reset } from './pages/AuthPages'
import { CartPage, Checkout, Favorites, OrderDetail, Orders } from './pages/ShopPages'
import { Account, Addresses, Notifications, Privacy, StoreRequest } from './pages/AccountPages'
import { ProductForm, SellerHome, SellerLayout, SellerProducts, SellerQuestions, SellerSales } from './pages/SellerPages'
import { AdminCategories, AdminHome, AdminLayout, AdminOrders, AdminProducts, AdminReports, AdminStores, AdminUsers } from './pages/AdminPages'

function Protected({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <p className="py-10 text-center text-sm text-slate-500">Cargando…</p>
  if (!user) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="explorar" element={<Explore />} />
        <Route path="producto/:slug" element={<ProductPage />} />
        <Route path="tienda/:slug" element={<StorePage />} />
        <Route path="ingresar" element={<Login />} />
        <Route path="registro" element={<Register />} />
        <Route path="recuperar" element={<Forgot />} />
        <Route path="restablecer" element={<Reset />} />
        <Route path="privacidad" element={<Privacy />} />
        <Route path="carrito" element={<Protected><CartPage /></Protected>} />
        <Route path="checkout" element={<Protected><Checkout /></Protected>} />
        <Route path="favoritos" element={<Protected><Favorites /></Protected>} />
        <Route path="cuenta" element={<Protected><Account /></Protected>} />
        <Route path="cuenta/direcciones" element={<Protected><Addresses /></Protected>} />
        <Route path="cuenta/pedidos" element={<Protected><Orders /></Protected>} />
        <Route path="cuenta/pedidos/:codigo" element={<Protected><OrderDetail /></Protected>} />
        <Route path="notificaciones" element={<Protected><Notifications /></Protected>} />
        <Route path="mi-tienda" element={<Protected><StoreRequest /></Protected>} />
        <Route path="vendedor" element={<Protected roles={['vendedor']}><SellerLayout /></Protected>}>
          <Route index element={<SellerHome />} />
          <Route path="productos" element={<SellerProducts />} />
          <Route path="productos/nuevo" element={<ProductForm />} />
          <Route path="productos/:id" element={<ProductForm />} />
          <Route path="ventas" element={<SellerSales />} />
          <Route path="preguntas" element={<SellerQuestions />} />
        </Route>
        <Route path="admin" element={<Protected roles={['administrador']}><AdminLayout /></Protected>}>
          <Route index element={<AdminHome />} />
          <Route path="usuarios" element={<AdminUsers />} />
          <Route path="tiendas" element={<AdminStores />} />
          <Route path="categorias" element={<AdminCategories />} />
          <Route path="productos" element={<AdminProducts />} />
          <Route path="reportes" element={<AdminReports />} />
          <Route path="pedidos" element={<AdminOrders />} />
        </Route>
        <Route path="*" element={<p className="py-16 text-center">No encontramos esa página.</p>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
