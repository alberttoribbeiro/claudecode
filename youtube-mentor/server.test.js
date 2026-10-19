const test = require('node:test');
const assert = require('node:assert/strict');
const server = require('./server.js');

let base;

test.before(() => new Promise((resolve) => {
  server.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

test.after(() => new Promise((resolve) => server.close(resolve)));

test('entrega a página e o script, e recusa arquivos fora da lista', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Mentor do YouTube/);

  const script = await fetch(`${base}/app.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);

  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
});

test('recusa tema vazio e tema muito longo sem chamar as APIs', async () => {
  const empty = await fetch(`${base}/api/course`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: '  ' }),
  });
  assert.equal(empty.status, 400);

  const long = await fetch(`${base}/api/course`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic: 'x'.repeat(200) }),
  });
  assert.equal(long.status, 400);
  assert.match((await long.json()).error, /muito longo/);
});

test('rejeita JSON inválido e método não suportado', async () => {
  const bad = await fetch(`${base}/api/course`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{nao-e-json',
  });
  assert.equal(bad.status, 400);

  const put = await fetch(`${base}/api/course`, { method: 'PUT' });
  assert.equal(put.status, 405);
});
