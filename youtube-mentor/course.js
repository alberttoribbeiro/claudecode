// Monta um curso para qualquer tema: planeja as etapas, busca no YouTube e escolhe as aulas.
// Recebe `fetchImpl` e as chaves por parâmetro, para poder ser testado sem rede.

const Mentor = require('./mentor.js');

const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-5-5';
const MAX_STAGES = 7;

// Extrai o primeiro bloco JSON da resposta do modelo, mesmo que venha cercado de texto.
function parseJsonFromText(text, open) {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(open === '[' ? ']' : '}');
  if (start === -1 || end === -1) throw new Error('Resposta do modelo sem JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

async function askClaude(prompt, { apiKey, fetchImpl, claudeUrl = CLAUDE_URL, model = CLAUDE_MODEL }) {
  const response = await fetchImpl(claudeUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Erro na API da Claude (${response.status}).`);
  const body = await response.json();
  return body.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
}

// Pede ao modelo as etapas de aprendizado do tema, com termos de busca de quem é da área.
async function planStages(topic, options) {
  if (!options.anthropicKey) return Mentor.buildSyllabus(topic);

  const prompt = [
    `Você é um especialista experiente que ensina "${topic}" do zero a um iniciante.`,
    `Monte um curso em até ${MAX_STAGES} etapas, na ordem em que a pessoa deve aprender.`,
    'Para cada etapa, escreva um termo de busca em português que encontre aulas dela no YouTube.',
    'Use o vocabulário real da área (nomes de ferramentas e técnicas), não termos genéricos.',
    'Responda somente com um JSON array, sem texto fora dele, no formato:',
    '[{"title": "...", "intro": "uma frase explicando por que esta etapa importa", "query": "termos de busca"}]',
  ].join('\n');

  const text = await askClaude(prompt, options);
  const stages = parseJsonFromText(text, '[')
    .filter((s) => s && typeof s.title === 'string' && typeof s.query === 'string')
    .slice(0, MAX_STAGES);
  if (stages.length === 0) throw new Error('O modelo não devolveu etapas válidas.');

  return stages.map((s, i) => ({
    id: `etapa-${i + 1}`,
    title: s.title.trim(),
    intro: typeof s.intro === 'string' ? s.intro.trim() : '',
    query: `${s.query.trim()} ${topic}`.trim(),
  }));
}

async function youtubeGet(path, params, { youtubeKey, fetchImpl, youtubeBase = YOUTUBE_BASE }) {
  const url = new URL(`${youtubeBase}/${path}`);
  Object.entries({ ...params, key: youtubeKey }).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetchImpl(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || response.status;
    if (reason === 'quotaExceeded') throw new Error('A cota diária do YouTube acabou.');
    throw new Error(`Erro na API do YouTube (${reason}).`);
  }
  return response.json();
}

// search.list (100 unidades) + videos.list (1 unidade) para ter duração e audiência.
async function searchVideos(query, options) {
  const search = await youtubeGet('search', {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: 10,
    relevanceLanguage: 'pt',
    regionCode: 'BR',
    safeSearch: 'moderate',
    videoEmbeddable: 'true',
  }, options);

  const ids = search.items.map((item) => item.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const details = await youtubeGet('videos', {
    part: 'contentDetails,statistics,snippet',
    id: ids.join(','),
  }, options);

  return details.items
    .map((item) => ({
      id: item.id,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      description: (item.snippet.description || '').slice(0, 300),
      thumbnail: item.snippet.thumbnails?.medium?.url || '',
      durationSec: Mentor.parseDuration(item.contentDetails.duration),
      views: Number(item.statistics.viewCount || 0),
    }));
}

// Com a chave da Claude, o modelo escolhe as aulas e explica cada escolha.
// Sem ela, vale o ranking local de mentor.js.
async function chooseLessons(stage, candidates, used, options) {
  const available = candidates.filter((v) => v.durationSec >= 180 && !used.has(v.id));
  if (!options.anthropicKey || available.length === 0) {
    return Mentor.pickLessons(candidates, { limit: 3, exclude: used }).map((v) => ({ ...v, reason: '' }));
  }

  const list = available.map((v) => (
    `- id: ${v.id} | ${Mentor.formatDuration(v.durationSec)} | ${v.channel} | ${v.title}\n  ${v.description.replace(/\s+/g, ' ')}`
  )).join('\n');

  const prompt = [
    `Etapa do curso: "${stage.title}". Objetivo: ${stage.intro}`,
    'Escolha até 3 aulas desta lista que ensinam esta etapa de forma clara para um iniciante.',
    'Prefira aulas completas (não Shorts nem trechos), didáticas e atuais. Não repita aulas.',
    'Responda somente com JSON no formato: [{"id": "...", "reason": "uma frase dizendo por que vale assistir"}]',
    '',
    list,
  ].join('\n');

  const text = await askClaude(prompt, options);
  const picks = parseJsonFromText(text, '[');
  const byId = new Map(available.map((v) => [v.id, v]));
  const chosen = picks
    .filter((p) => byId.has(p.id) && !used.has(p.id))
    .slice(0, 3)
    .map((p) => ({ ...byId.get(p.id), reason: String(p.reason || '') }));

  return chosen.length > 0
    ? chosen
    : Mentor.pickLessons(candidates, { limit: 3, exclude: used }).map((v) => ({ ...v, reason: '' }));
}

async function buildCourse(topic, options) {
  const cleanTopic = String(topic || '').trim();
  if (!cleanTopic) throw new Error('Informe um tema para montar o curso.');
  if (!options.youtubeKey) throw new Error('Falta a chave da YouTube Data API no servidor.');

  const stages = await planStages(cleanTopic, options);
  const used = new Set();
  const modules = [];

  for (const stage of stages) {
    const candidates = await searchVideos(stage.query, options);
    const lessons = await chooseLessons(stage, candidates, used, options);
    lessons.forEach((lesson) => used.add(lesson.id));
    modules.push({ ...stage, lessons });
  }

  return { topic: cleanTopic, createdAt: new Date().toISOString(), modules };
}

module.exports = { buildCourse, planStages, chooseLessons, parseJsonFromText };
