// Servidor local: entrega a página e monta cursos em /api/course.
// As chaves ficam em variáveis de ambiente, nunca no navegador:
//   YOUTUBE_API_KEY (obrigatória) e ANTHROPIC_API_KEY (opcional, ativa o mentor com IA).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { buildCourse } = require('./course.js');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const MAX_BODY = 4096;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript' };
const PUBLIC_FILES = new Set(['/', '/index.html', '/app.js', '/mentor.js', '/styles.css']);

const cache = new Map(); // tema normalizado -> curso, para não gastar cota ao repetir um tema

const options = () => ({
  youtubeKey: process.env.YOUTUBE_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  fetchImpl: fetch,
});

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  const isRaw = typeof body === 'string' || Buffer.isBuffer(body);
  res.end(isRaw ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Pedido grande demais.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

async function handleCourse(req, res) {
  let topic;
  try {
    ({ topic } = await readJson(req));
  } catch (err) {
    return send(res, 400, { error: err.message });
  }

  const key = String(topic || '').trim().toLowerCase();
  if (!key) return send(res, 400, { error: 'Informe um tema para montar o curso.' });
  if (key.length > 120) return send(res, 400, { error: 'Tema muito longo. Use até 120 caracteres.' });

  if (cache.has(key)) return send(res, 200, cache.get(key));

  try {
    const course = await buildCourse(topic, options());
    cache.set(key, course);
    send(res, 200, course);
  } catch (err) {
    send(res, 502, { error: err.message });
  }
}

function serveStatic(req, res) {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  if (!PUBLIC_FILES.has(urlPath)) return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');

  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/course') return handleCourse(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 405, { error: 'Método não permitido.' });
});

if (require.main === module) {
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('Defina YOUTUBE_API_KEY antes de iniciar.');
    process.exit(1);
  }
  server.listen(PORT, () => {
    const ai = process.env.ANTHROPIC_API_KEY ? 'com mentor de IA' : 'sem mentor de IA (ranking local)';
    console.log(`Mentor rodando em http://localhost:${PORT} ${ai}`);
  });
}

module.exports = server;
