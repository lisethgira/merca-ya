import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { media } from '../lib/api';
import { discountPercent, formatCop } from '../lib/format';
import { Badge } from './ui';

export function ProductCard({ product, onFavorite }) {
  const discount = discountPercent(product.precio, product.precioOferta);
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <Link to={`/producto/${product.slug}`} className="relative block aspect-square bg-slate-100">
        {product.imagen ? (
          <img src={media(product.imagen)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm text-slate-400">Sin foto</span>
        )}
        {discount > 0 ? <span className="absolute left-3 top-3"><Badge tone="orange">-{discount}%</Badge></span> : null}
        {product.agotado ? <span className="absolute bottom-3 left-3"><Badge tone="slate">Agotado</Badge></span> : null}
      </Link>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/producto/${product.slug}`} className="line-clamp-2 text-sm font-semibold text-indigo-950">{product.nombre}</Link>
          {onFavorite ? (
            <button type="button" aria-label={product.esFavorito ? 'Quitar de favoritos' : 'Guardar en favoritos'} onClick={() => onFavorite(product)} className="text-orange-500">
              <Heart className={`h-5 w-5 ${product.esFavorito ? 'fill-orange-500' : ''}`} />
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">{product.tienda?.nombre}</p>
        <div className="flex items-baseline gap-2">
          <strong className="text-base text-indigo-950">{formatCop(product.precioFinal)}</strong>
          {discount > 0 ? <span className="text-xs text-slate-400 line-through">{formatCop(product.precio)}</span> : null}
        </div>
      </div>
    </article>
  );
}
