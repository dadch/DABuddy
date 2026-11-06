// Workaround für CVE-2026-111497 («Node2Shell», Switch CERT TI-20261105-001):
// body-parser entpackt Request-Bodies mit Content-Encoding br/gzip/deflate über
// den Node-eigenen zlib-Decoder – unauthentifiziert, vor jeder Route. Browser
// senden Request-Bodies nie komprimiert, deshalb lehnen wir solche Requests
// vor den Body-Parsern mit 415 ab. Nach dem Node-Security-Release vom
// 2026-11-11 (gepatchtes Image) kann die Middleware wieder entfernt werden.

const ALLOWED_ENCODINGS = new Set(['identity']);

function rejectEncodedBodies(req, res, next) {
  const encoding = (req.headers['content-encoding'] || 'identity').trim().toLowerCase();
  if (ALLOWED_ENCODINGS.has(encoding)) return next();
  res.set('Accept-Encoding', 'identity');
  return res.status(415).type('text/plain').send('Unsupported Content-Encoding');
}

module.exports = rejectEncodedBodies;
