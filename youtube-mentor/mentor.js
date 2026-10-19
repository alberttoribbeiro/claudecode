// Lógica pura do mentor: monta o currículo, interpreta duração e ranqueia vídeos.
// Não faz chamadas de rede — isso fica em app.js — para ser testável com Node.

const Mentor = (() => {
  // Etapas de um curso completo. Cada uma vira um módulo com sua própria busca.
  const STAGES = [
    {
      id: 'visao-geral',
      title: 'Visão geral e materiais',
      intro: 'Antes de começar, entenda o que é preciso e quais materiais e ferramentas usar.',
      query: (topic) => `${topic} materiais e ferramentas necessárias`,
    },
    {
      id: 'preparacao',
      title: 'Preparação do local',
      intro: 'Uma boa execução começa na preparação: base, proteção e medições.',
      query: (topic) => `${topic} preparação passo a passo`,
    },
    {
      id: 'execucao',
      title: 'Execução passo a passo',
      intro: 'O núcleo do processo, na ordem certa.',
      query: (topic) => `${topic} passo a passo completo`,
    },
    {
      id: 'tecnicas',
      title: 'Técnicas e detalhes profissionais',
      intro: 'Os truques que separam um resultado amador de um resultado profissional.',
      query: (topic) => `${topic} dicas e técnicas profissionais`,
    },
    {
      id: 'erros',
      title: 'Erros comuns e como evitar',
      intro: 'Aprender com os erros dos outros economiza tempo e material.',
      query: (topic) => `${topic} erros comuns como evitar`,
    },
    {
      id: 'acabamento',
      title: 'Acabamento e resultado final',
      intro: 'A última milha: acabamento, limpeza e checagem do resultado.',
      query: (topic) => `${topic} acabamento final`,
    },
  ];

  const MIN_SECONDS = 180; // ignora Shorts e vídeos muito curtos
  const IDEAL_MIN_SECONDS = 300; // a partir de 5 min o conteúdo costuma ser aprofundado
  const IDEAL_MAX_SECONDS = 1800; // até 30 min é aula; acima disso pode ser palestra longa
  const QUALITY_WORDS = ['passo a passo', 'completo', 'tutorial', 'como fazer', 'iniciante', 'aula'];
  const NOISE_WORDS = ['shorts', 'react', 'reagindo', 'unboxing', 'sorteio', 'vlog'];

  // Converte duração ISO 8601 do YouTube (ex.: PT1H4M10S) em segundos.
  function parseDuration(iso) {
    const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
    if (!match) return 0;
    const [, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
    return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }

  function formatDuration(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function buildSyllabus(topic) {
    const clean = String(topic || '').trim();
    if (!clean) throw new Error('Informe um tema para montar o curso.');
    return STAGES.map((stage) => ({
      id: stage.id,
      title: stage.title,
      intro: stage.intro,
      query: stage.query(clean),
    }));
  }

  // Pontuação simples: prefere vídeos de duração de aula, com boa audiência
  // e títulos que indicam didática. Vídeos muito curtos são descartados antes.
  function scoreVideo(video) {
    const title = video.title.toLowerCase();
    let score = Math.log10((video.views || 0) + 10) * 10;

    if (video.durationSec >= IDEAL_MIN_SECONDS && video.durationSec <= IDEAL_MAX_SECONDS) {
      score += 15;
    }
    score += QUALITY_WORDS.filter((w) => title.includes(w)).length * 5;
    score -= NOISE_WORDS.filter((w) => title.includes(w)).length * 20;

    return score;
  }

  // Filtra vídeos inadequados, ranqueia e devolve os melhores `limit`.
  // `exclude` é um Set de ids já usados em outros módulos, para não repetir aulas.
  function pickLessons(videos, { limit = 3, exclude = new Set() } = {}) {
    return videos
      .filter((v) => v.durationSec >= MIN_SECONDS)
      .filter((v) => !exclude.has(v.id))
      .map((v) => ({ ...v, score: scoreVideo(v) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  function summarizeProgress(course, completedIds) {
    const done = new Set(completedIds);
    const total = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);
    const finished = course.modules.reduce(
      (sum, m) => sum + m.lessons.filter((l) => done.has(l.id)).length,
      0,
    );
    return { total, finished, percent: total === 0 ? 0 : Math.round((finished / total) * 100) };
  }

  return {
    STAGES,
    parseDuration,
    formatDuration,
    buildSyllabus,
    scoreVideo,
    pickLessons,
    summarizeProgress,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Mentor;
}
