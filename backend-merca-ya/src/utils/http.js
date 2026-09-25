class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = {
  HttpError,
  badRequest: (message) => new HttpError(400, message),
  unauthorized: (message = 'No autenticado') => new HttpError(401, message),
  forbidden: (message = 'No autorizado') => new HttpError(403, message),
  notFound: (message = 'No encontrado') => new HttpError(404, message),
  conflict: (message) => new HttpError(409, message),
};
