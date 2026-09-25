function bogotaDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dateRange(desde, hasta) {
  const today = bogotaDay();
  const start = isDate(desde) ? desde : `${today.slice(0, 8)}01`;
  const end = isDate(hasta) ? hasta : today;
  return { start: `${start} 00:00:00`, end: `${end} 23:59:59` };
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

module.exports = { bogotaDay, dateRange, isDate };
