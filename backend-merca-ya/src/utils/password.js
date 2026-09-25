const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;
const PASSWORD_MESSAGE = 'La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo';

function isStrongPassword(password) {
  return PASSWORD_PATTERN.test(password || '');
}

module.exports = { PASSWORD_PATTERN, PASSWORD_MESSAGE, isStrongPassword };
