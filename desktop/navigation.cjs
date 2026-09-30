const APP_ORIGIN = 'https://www.mapmethod.ru';
function navigationTarget(value) {
  try {
    const url = new URL(value);
    if (url.origin === APP_ORIGIN && url.protocol === 'https:') return 'app';
    if (['https:', 'http:'].includes(url.protocol)) return 'external';
  } catch { /* Reject malformed links. */ }
  return 'blocked';
}
module.exports = { APP_ORIGIN, navigationTarget };
