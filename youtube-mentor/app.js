// Interface e chamadas à YouTube Data API v3. A lógica de currículo fica em mentor.js.

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const KEY_STORAGE = 'ytmentor.apiKey';
const PROGRESS_STORAGE = 'ytmentor.progress';

const $ = (sel) => document.querySelector(sel);

function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento indisponível (modo privado, por exemplo): o app segue funcionando sem persistir.
  }
}

async function apiGet(path, params, apiKey) {
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries({ ...params, key: apiKey }).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || response.status;
    if (reason === 'quotaExceeded') {
      throw new Error('A cota diária da API do YouTube acabou. Tente amanhã ou use outra chave.');
    }
    if (response.status === 400 || response.status === 403) {
      throw new Error(`A chave da API foi recusada (${reason}). Confira se a YouTube Data API v3 está ativa.`);
    }
    throw new Error(`Erro ao falar com o YouTube (${response.status}).`);
  }
  return response.json();
}

// search.list (100 unidades de cota) + videos.list (1 unidade) para ter a duração de cada vídeo.
async function searchVideos(query, apiKey) {
  const search = await apiGet('search', {
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: 10,
    relevanceLanguage: 'pt',
    regionCode: 'BR',
    safeSearch: 'moderate',
    videoEmbeddable: 'true',
  }, apiKey);

  const ids = search.items.map((item) => item.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const details = await apiGet('videos', {
    part: 'contentDetails,statistics',
    id: ids.join(','),
  }, apiKey);

  const byId = new Map(details.items.map((item) => [item.id, item]));
  return search.items
    .map((item) => {
      const detail = byId.get(item.id.videoId);
      if (!detail) return null;
      return {
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || '',
        durationSec: Mentor.parseDuration(detail.contentDetails.duration),
        views: Number(detail.statistics.viewCount || 0),
      };
    })
    .filter(Boolean);
}

async function buildCourse(topic, apiKey, onProgress) {
  const syllabus = Mentor.buildSyllabus(topic);
  const used = new Set();
  const modules = [];

  for (let i = 0; i < syllabus.length; i++) {
    const stage = syllabus[i];
    onProgress(`Buscando "${stage.title}" (${i + 1}/${syllabus.length})…`);
    const videos = await searchVideos(stage.query, apiKey);
    const lessons = Mentor.pickLessons(videos, { limit: 3, exclude: used });
    lessons.forEach((lesson) => used.add(lesson.id));
    modules.push({ ...stage, lessons });
  }

  return { topic, createdAt: new Date().toISOString(), modules };
}

function renderCourse(course, completedIds) {
  const container = $('#course');
  container.replaceChildren();

  const progressBox = document.createElement('div');
  progressBox.className = 'progress';
  progressBox.innerHTML = '<div class="progress-bar"><span></span></div><p class="progress-text"></p>';
  container.append(progressBox);

  const done = new Set(completedIds);

  course.modules.forEach((module, index) => {
    const section = document.createElement('section');
    section.className = 'module';

    const heading = document.createElement('h2');
    heading.textContent = `${index + 1}. ${module.title}`;
    const intro = document.createElement('p');
    intro.className = 'intro';
    intro.textContent = module.intro;
    section.append(heading, intro);

    if (module.lessons.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Nenhuma aula adequada encontrada para esta etapa.';
      section.append(empty);
    }

    module.lessons.forEach((lesson) => {
      const card = document.createElement('article');
      card.className = 'lesson' + (done.has(lesson.id) ? ' done' : '');

      const thumb = document.createElement('img');
      thumb.src = lesson.thumbnail;
      thumb.alt = '';
      thumb.loading = 'lazy';

      const body = document.createElement('div');
      body.className = 'lesson-body';

      const link = document.createElement('a');
      link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(lesson.id)}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = lesson.title;

      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = `${lesson.channel} · ${Mentor.formatDuration(lesson.durationSec)}`;

      const label = document.createElement('label');
      label.className = 'watched';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = done.has(lesson.id);
      checkbox.addEventListener('change', () => {
        toggleWatched(course, lesson.id, checkbox.checked);
        card.classList.toggle('done', checkbox.checked);
        updateProgress(course);
      });
      label.append(checkbox, document.createTextNode(' Assisti'));

      body.append(link, meta, label);
      card.append(thumb, body);
      section.append(card);
    });

    container.append(section);
  });

  updateProgress(course);
}

function progressKey(course) {
  return course.topic.trim().toLowerCase();
}

function getCompleted(course) {
  return storageGet(PROGRESS_STORAGE, {})[progressKey(course)] || [];
}

function toggleWatched(course, lessonId, watched) {
  const all = storageGet(PROGRESS_STORAGE, {});
  const set = new Set(all[progressKey(course)] || []);
  if (watched) set.add(lessonId);
  else set.delete(lessonId);
  all[progressKey(course)] = [...set];
  storageSet(PROGRESS_STORAGE, all);
}

function updateProgress(course) {
  const { total, finished, percent } = Mentor.summarizeProgress(course, getCompleted(course));
  $('.progress-bar span').style.width = `${percent}%`;
  $('.progress-text').textContent = `${finished} de ${total} aulas assistidas (${percent}%)`;
}

function setStatus(message, isError = false) {
  const status = $('#status');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function onSubmit(event) {
  event.preventDefault();
  const topic = $('#topic').value.trim();
  const apiKey = $('#apiKey').value.trim();
  if (!topic) return setStatus('Digite o tema que você quer aprender.', true);
  if (!apiKey) return setStatus('Cole sua chave da YouTube Data API.', true);

  storageSet(KEY_STORAGE, apiKey);
  $('#submit').disabled = true;
  $('#course').replaceChildren();

  try {
    const course = await buildCourse(topic, apiKey, (msg) => setStatus(msg));
    renderCourse(course, getCompleted(course));
    setStatus(`Curso montado: ${course.modules.reduce((n, m) => n + m.lessons.length, 0)} aulas.`);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    $('#submit').disabled = false;
  }
}

function init() {
  $('#apiKey').value = storageGet(KEY_STORAGE, '');
  $('#form').addEventListener('submit', onSubmit);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
