function unitPrice(precio, precioOferta) {
  const price = Number(precio);
  const offer = precioOferta == null || precioOferta === '' ? null : Number(precioOferta);
  if (offer != null && !Number.isNaN(offer) && offer >= 0 && offer < price) return offer;
  return price;
}

function summarize(items, { envioBase = 8000, envioGratisDesde = 150000 } = {}) {
  let subtotal = 0;
  let descuento = 0;
  for (const item of items) {
    const precio = Number(item.precio);
    const unit = unitPrice(item.precio, item.precio_oferta ?? item.precioOferta);
    const cantidad = Number(item.cantidad);
    subtotal += precio * cantidad;
    descuento += (precio - unit) * cantidad;
  }
  const neto = subtotal - descuento;
  const costoEnvio = neto <= 0 || neto >= envioGratisDesde ? 0 : envioBase;
  return {
    subtotal: roundMoney(subtotal),
    descuento: roundMoney(descuento),
    costoEnvio: roundMoney(costoEnvio),
    total: roundMoney(neto + costoEnvio),
  };
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function orderCode(id, year = new Date().getFullYear()) {
  return `MY-${year}-${String(id).padStart(6, '0')}`;
}

module.exports = { unitPrice, summarize, roundMoney, orderCode };
