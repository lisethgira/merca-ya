/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [], total: 0, subtotal: 0, descuento: 0, costoEnvio: 0 });

  const refresh = useCallback(async () => {
    if (!user) {
      setCart({ items: [], total: 0, subtotal: 0, descuento: 0, costoEnvio: 0 });
      return null;
    }
    const result = await api('/carrito');
    setCart(result.data);
    return result.data;
  }, [user]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const count = cart.items?.reduce((sum, item) => sum + Number(item.cantidad), 0) || 0;

  return (
    <CartContext.Provider value={{ cart, count, refresh, setCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart debe usarse dentro de CartProvider');
  return value;
}
