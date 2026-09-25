function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}

function likeTerm(value) {
  return `%${String(value).replace(/[\\%_]/g, '\\$&')}%`;
}

module.exports = { slugify, likeTerm };
