const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCourse } = require('./course.js');

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

// Simula a YouTube Data API: cada consulta devolve 3 vídeos com ids próprios.
function fakeYouTube(queriesSeen = []) {
  return async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/search')) {
      const q = u.searchParams.get('q');
      queriesSeen.push(q);
      const id = (n) => `${q.replace(/\W/g, '').slice(0, 4)}${n}`.padEnd(11, 'x').slice(0, 11);
      return jsonResponse({
        items: [1, 2, 3].map((n) => ({ id: { videoId: id(n) } })),
      });
    }
    if (u.pathname.endsWith('/videos')) {
      const ids = u.searchParams.get('id').split(',');
      return jsonResponse({
        items: ids.map((vid, i) => ({
          id: vid,
          snippet: {
            title: `Aula ${vid} passo a passo`,
            channelTitle: 'Canal teste',
            description: 'Descrição da aula',
            thumbnails: { medium: { url: `https://i.example/${vid}.jpg` } },
          },
          contentDetails: { duration: `PT${10 + i}M` },
          statistics: { viewCount: String(1000 * (i + 1)) },
        })),
      });
    }
    throw new Error(`URL inesperada: ${url}`);
  };
}

test('sem chave da Claude, usa o currículo local e o ranking de mentor.js', async () => {
  const queries = [];
  const course = await buildCourse('fazer bolo de cenoura', {
    youtubeKey: 'yt',
    anthropicKey: undefined,
    fetchImpl: fakeYouTube(queries),
  });

  assert.equal(course.topic, 'fazer bolo de cenoura');
  assert.equal(course.modules.length, 6);
  assert.ok(queries.every((q) => q.includes('fazer bolo de cenoura')));
  const ids = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  assert.equal(new Set(ids).size, ids.length, 'nenhuma aula deve se repetir entre etapas');
  assert.ok(course.modules.every((m) => m.lessons.every((l) => l.reason === '')));
});

test('com chave da Claude, as etapas e o motivo de cada aula vêm do modelo', async () => {
  const queries = [];
  const claudeCalls = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('api.anthropic.com')) {
      claudeCalls.push(JSON.parse(init.body));
      const isPlan = claudeCalls.length === 1;
      const text = isPlan
        ? JSON.stringify([
          { title: 'Teste de aderência', intro: 'Garante que a base segura o reboco.', query: 'teste de aderência reboco' },
          { title: 'Chapisco', intro: 'Cria a ponte entre a base e o emboço.', query: 'chapisco como aplicar' },
        ])
        : JSON.stringify([{ id: 'x', reason: 'não existe nesta lista' }]);
      return jsonResponse({ content: [{ type: 'text', text: `Aqui está:\n${text}` }] });
    }
    return fakeYouTube(queries)(url, init);
  };

  const course = await buildCourse('rebocar parede', {
    youtubeKey: 'yt',
    anthropicKey: 'ck',
    fetchImpl,
  });

  assert.equal(course.modules.length, 2);
  assert.equal(course.modules[0].title, 'Teste de aderência');
  assert.ok(queries[0].startsWith('teste de aderência reboco'), 'consulta do modelo deve ser usada');
  assert.ok(course.modules.every((m) => m.lessons.length > 0));
  assert.equal(claudeCalls[0].model, 'claude-sonnet-5-5');
  assert.equal(claudeCalls[0].messages[0].role, 'user');
});

test('se o modelo devolver uma aula fora da lista, cai no ranking local', async () => {
  const fetchImpl = async (url, init) => {
    if (String(url).includes('api.anthropic.com')) {
      const body = JSON.parse(init.body);
      const isPlan = body.messages[0].content.includes('Monte um curso');
      const text = isPlan
        ? '[{"title":"Etapa","intro":"i","query":"q"}]'
        : '[{"id":"inventado","reason":"x"}]';
      return jsonResponse({ content: [{ type: 'text', text }] });
    }
    return fakeYouTube()(url, init);
  };

  const course = await buildCourse('tema', { youtubeKey: 'yt', anthropicKey: 'ck', fetchImpl });
  const lessons = course.modules[0].lessons;
  assert.ok(lessons.length > 0);
  assert.ok(lessons.every((l) => l.id !== 'inventado'));
});

test('resposta do modelo sem JSON gera erro claro', async () => {
  const fetchImpl = async (url, init) => {
    if (String(url).includes('api.anthropic.com')) {
      return jsonResponse({ content: [{ type: 'text', text: 'Desculpe, não consigo.' }] });
    }
    return fakeYouTube()(url, init);
  };
  await assert.rejects(
    buildCourse('tema', { youtubeKey: 'yt', anthropicKey: 'ck', fetchImpl }),
    /sem JSON/,
  );
});

test('cota esgotada do YouTube aparece como mensagem em português', async () => {
  const fetchImpl = async () => jsonResponse(
    { error: { errors: [{ reason: 'quotaExceeded' }] } },
    403,
  );
  await assert.rejects(
    buildCourse('tema', { youtubeKey: 'yt', fetchImpl }),
    /cota diária do YouTube acabou/,
  );
});

test('tema vazio e chave ausente são recusados antes de qualquer chamada', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse({}); };
  await assert.rejects(buildCourse('   ', { youtubeKey: 'yt', fetchImpl }), /Informe um tema/);
  await assert.rejects(buildCourse('tema', { fetchImpl }), /YouTube Data API/);
  assert.equal(calls, 0);
});
