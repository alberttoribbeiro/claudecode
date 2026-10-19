// Interface: pede o curso ao servidor e mostra as etapas, as aulas e o progresso.
// Nenhuma chave de API passa por aqui; quem busca no YouTube é o servidor (server.js).

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
    // Sem armazenamento (modo privado, por exemplo): o app segue funcionando sem salvar.
  }
}

async function fetchCourse(topic) {
  const response = await fetch('/api/course', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erro ao montar o curso (${response.status}).`);
  return body;
}

const progressKey = (course) => course.topic.trim().toLowerCase();

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
  const keys = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  const done = new Set(getCompleted(course));
  const finished = keys.filter((id) => done.has(id)).length;
  const percent = keys.length === 0 ? 0 : Math.round((finished / keys.length) * 100);
  $('.progress-bar span').style.width = `${percent}%`;
  $('.progress-text').textContent = keys.length === 0
    ? 'Nenhuma aula encontrada.'
    : `${finished} de ${keys.length} aulas assistidas (${percent}%)`;
}

function renderLesson(course, lesson, done) {
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

  body.append(link, meta);

  if (lesson.reason) {
    const why = document.createElement('p');
    why.className = 'reason';
    why.textContent = lesson.reason;
    body.append(why);
  }

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
  body.append(label);

  card.append(thumb, body);
  return card;
}

function renderCourse(course) {
  const container = $('#course');
  container.replaceChildren();

  const progressBox = document.createElement('div');
  progressBox.className = 'progress';
  progressBox.innerHTML = '<div class="progress-bar"><span></span></div><p class="progress-text"></p>';
  container.append(progressBox);

  const done = new Set(getCompleted(course));

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

    module.lessons.forEach((lesson) => section.append(renderLesson(course, lesson, done)));
    container.append(section);
  });

  updateProgress(course);
}

function setStatus(message, isError = false) {
  const status = $('#status');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function onSubmit(event) {
  event.preventDefault();
  const topic = $('#topic').value.trim();
  if (!topic) return setStatus('Digite o tema que você quer aprender.', true);

  $('#submit').disabled = true;
  $('#course').replaceChildren();
  setStatus('Montando seu curso. Isso pode levar um minuto…');

  try {
    const course = await fetchCourse(topic);
    renderCourse(course);
    const total = course.modules.reduce((n, m) => n + m.lessons.length, 0);
    setStatus(`Curso montado: ${course.modules.length} etapas e ${total} aulas.`);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    $('#submit').disabled = false;
  }
}

function init() {
  $('#form').addEventListener('submit', onSubmit);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
