const test = require('node:test');
const assert = require('node:assert/strict');
const Mentor = require('./mentor.js');

test('parseDuration converte duração ISO 8601 do YouTube em segundos', () => {
  assert.equal(Mentor.parseDuration('PT45S'), 45);
  assert.equal(Mentor.parseDuration('PT10M5S'), 605);
  assert.equal(Mentor.parseDuration('PT1H4M10S'), 3850);
  assert.equal(Mentor.parseDuration('P1DT2H'), 93600);
  assert.equal(Mentor.parseDuration('PT0S'), 0);
  assert.equal(Mentor.parseDuration(''), 0);
  assert.equal(Mentor.parseDuration(undefined), 0);
});

test('formatDuration mostra m:ss ou h:mm:ss', () => {
  assert.equal(Mentor.formatDuration(65), '1:05');
  assert.equal(Mentor.formatDuration(605), '10:05');
  assert.equal(Mentor.formatDuration(3850), '1:04:10');
});

test('buildSyllabus cria um módulo por etapa com a consulta do tema', () => {
  const syllabus = Mentor.buildSyllabus('  rebocar uma parede  ');
  assert.equal(syllabus.length, Mentor.STAGES.length);
  assert.ok(syllabus.every((m) => m.query.includes('rebocar uma parede')));
  assert.equal(new Set(syllabus.map((m) => m.id)).size, syllabus.length);
  assert.ok(!syllabus.some((m) => m.query.startsWith(' ')));
});

test('buildSyllabus recusa tema vazio', () => {
  assert.throws(() => Mentor.buildSyllabus('   '), /Informe um tema/);
});

test('pickLessons descarta Shorts e vídeos muito curtos', () => {
  const picked = Mentor.pickLessons([
    { id: 'a', title: 'Passo a passo', durationSec: 59, views: 1e6 },
    { id: 'b', title: 'Passo a passo', durationSec: 179, views: 1e6 },
    { id: 'c', title: 'Passo a passo', durationSec: 600, views: 100 },
  ]);
  assert.deepEqual(picked.map((v) => v.id), ['c']);
});

test('pickLessons prefere aulas de duração de curso e com títulos didáticos', () => {
  const picked = Mentor.pickLessons([
    { id: 'curta-generica', title: 'Reboco', durationSec: 240, views: 5000 },
    { id: 'aula', title: 'Reboco passo a passo completo', durationSec: 900, views: 5000 },
  ], { limit: 2 });
  assert.equal(picked[0].id, 'aula');
});

test('pickLessons penaliza títulos de ruído como shorts e unboxing', () => {
  const picked = Mentor.pickLessons([
    { id: 'ruido', title: 'Unboxing shorts reboco passo a passo', durationSec: 900, views: 1e6 },
    { id: 'limpo', title: 'Reboco passo a passo', durationSec: 900, views: 1000 },
  ], { limit: 1 });
  assert.equal(picked[0].id, 'limpo');
});

test('pickLessons não repete vídeos já usados em outro módulo', () => {
  const videos = [
    { id: 'x', title: 'Aula', durationSec: 600, views: 9e5 },
    { id: 'y', title: 'Aula', durationSec: 600, views: 8e5 },
  ];
  const picked = Mentor.pickLessons(videos, { limit: 2, exclude: new Set(['x']) });
  assert.deepEqual(picked.map((v) => v.id), ['y']);
});

test('pickLessons respeita o limite', () => {
  const videos = Array.from({ length: 6 }, (_, i) => ({
    id: `v${i}`, title: 'Aula', durationSec: 600, views: i,
  }));
  assert.equal(Mentor.pickLessons(videos, { limit: 3 }).length, 3);
});

test('summarizeProgress calcula aulas assistidas e percentual', () => {
  const course = {
    modules: [
      { lessons: [{ id: 'a' }, { id: 'b' }] },
      { lessons: [{ id: 'c' }, { id: 'd' }] },
    ],
  };
  assert.deepEqual(Mentor.summarizeProgress(course, ['a', 'c', 'zzz']), {
    total: 4, finished: 2, percent: 50,
  });
  assert.deepEqual(Mentor.summarizeProgress({ modules: [] }, []), {
    total: 0, finished: 0, percent: 0,
  });
});
