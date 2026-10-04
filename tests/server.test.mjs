import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './fake-gas.mjs';

const PIN = '123456';
const N = 4;
const blank = () => Array(N).fill('');
const answers = (byIndex) => Object.assign(blank(), byIndex);
const feedback = (deviceId, clientTime, list, name = '') => ({ action: 'feedback', deviceId, clientTime, name, answers: list });
const saveTopics = (titles, presenters, pin = PIN) => ({ action: 'topics', pin, titles, presenters });

test('setup은 조 4개를 채우고, 다시 실행해도 데이터를 지우지 않는다', () => {
  const s = loadServer();
  s.post(feedback('device001', 1, answers({ 0: '좋았어요' })));
  s.setup();
  const res = s.get({ action: 'topics' });
  assert.equal(res.ok, true);
  assert.equal(res.topics.length, N);
  assert.deepEqual(res.topics[0], { id: 1, group: '1조', title: '1조 발표', presenter: '' });
  assert.deepEqual(res.topics[3], { id: 4, group: '4조', title: '4조 발표', presenter: '' });
  assert.equal(s.sheet('feedback').getLastRow(), 2);
});

test('알 수 없는 GET 요청은 invalid', () => {
  assert.deepEqual(loadServer().get({}), { ok: false, error: 'invalid' });
});

test('피드백 한 건은 시트에 한 줄로 쌓인다', () => {
  const s = loadServer();
  assert.deepEqual(s.post(feedback('device001', 100, answers({ 2: '셋째 조' }), '테스터')), { ok: true });
  const row = s.sheet('feedback').rows[1];
  assert.deepEqual(row.slice(1, 4), ['100', 'device001', '테스터']);
  assert.equal(row[4 + 2], '셋째 조');
  assert.equal(row.length, 4 + N);
});

test('경계값: 이름 30자, 칸 3000자까지는 받는다', () => {
  const s = loadServer();
  assert.deepEqual(s.post(feedback('device001', 1, answers({ 0: 'x'.repeat(3000) }), 'y'.repeat(30))), { ok: true });
});

test('잘못된 피드백은 invalid로 거절하고 저장하지 않는다', () => {
  const s = loadServer();
  const good = feedback('device001', 1, blank());
  const bad = [
    { ...good, deviceId: undefined },
    { ...good, deviceId: 'short' },
    { ...good, deviceId: 'Upper-Case1' },
    { ...good, clientTime: '1' },
    { ...good, clientTime: null },
    { ...good, name: 'x'.repeat(31) },
    { ...good, name: undefined },
    { ...good, answers: Array(N - 1).fill('') },
    { ...good, answers: Array(10).fill('') },
    { ...good, answers: answers({ 0: 'x'.repeat(3001) }) },
    { ...good, answers: answers({ 0: 3 }) },
    { action: 'nope' },
    [1, 2],
  ];
  for (const body of bad) {
    assert.deepEqual(s.post(body), { ok: false, error: 'invalid' }, JSON.stringify(body).slice(0, 60));
  }
  assert.deepEqual(s.post('not json'), { ok: false, error: 'invalid' });
  assert.deepEqual(s.post('null'), { ok: false, error: 'invalid' });
  assert.equal(s.sheet('feedback').getLastRow(), 1);
});

test('비밀번호가 없거나 틀리면 관리자 요청은 pin', () => {
  const s = loadServer();
  assert.deepEqual(s.post({ action: 'results', pin: '000000' }), { ok: false, error: 'pin' });
  assert.deepEqual(s.post({ action: 'results' }), { ok: false, error: 'pin' });
  assert.deepEqual(s.post(saveTopics(Array(N).fill('주제'), blank(), 'nope')), { ok: false, error: 'pin' });
  const unset = loadServer({ pin: null });
  assert.deepEqual(unset.post({ action: 'results', pin: '' }), { ok: false, error: 'pin' });
  assert.deepEqual(unset.post({ action: 'results', pin: null }), { ok: false, error: 'pin' });
});

test('결과는 기기마다 기기 시각이 가장 늦은 줄만, 시각 순으로 준다', () => {
  const s = loadServer();
  s.post(feedback('devicea01', 200, answers({ 0: '새 내용' }), '가'));
  s.post(feedback('devicea01', 100, answers({ 0: '옛 내용' }), '가')); // 늦게 도착한 옛 내용
  s.post(feedback('deviceb01', 150, answers({ 1: '다른 사람' })));
  s.post(feedback('deviceb01', 150, answers({ 1: '같은 시각, 나중 줄' })));
  s.post(feedback('devicec01', 300, answers({ 0: '  \n ' }), '공백만'));
  const r = s.post({ action: 'results', pin: PIN });
  assert.equal(r.ok, true);
  assert.equal(r.topics.length, N);
  assert.deepEqual(r.entries.map((e) => [e.name, e.clientTime, e.answers[0], e.answers[1]]), [
    ['', 150, '', '같은 시각, 나중 줄'],
    ['가', 200, '새 내용', ''],
  ]);
});

for (const apostrophe of ['hidden', 'literal']) {
  test(`수식처럼 시작하는 글도 원문 그대로 돌아온다 (시트 저장 방식: ${apostrophe})`, () => {
    const s = loadServer({ apostrophe });
    const tricky = ['=1+1', '-좋았어요', '@발표자', "'따옴표"];
    s.post(feedback('devicea01', 1, tricky, '+이름'));
    const [entry] = s.post({ action: 'results', pin: PIN }).entries;
    assert.deepEqual(entry.answers, tricky);
    assert.equal(entry.name, '+이름');
    assert.deepEqual(s.post(saveTopics(Array(N).fill('=주제'), Array(N).fill('-발표자'))), { ok: true });
    const [first] = s.get({ action: 'topics' }).topics;
    assert.deepEqual([first.title, first.presenter], ['=주제', '-발표자']);
  });
}

test('주제·발표자 저장은 주제 목록에 반영되고, 발표자는 비워도 된다', () => {
  const s = loadServer();
  const titles = ['창조와 진화', '부활', '고난', '666표'];
  const presenters = ['발표자1', '', '발표자3', ''];
  assert.deepEqual(s.post(saveTopics(titles, presenters)), { ok: true });
  const topics = s.get({ action: 'topics' }).topics;
  assert.deepEqual(topics.map((t) => [t.group, t.title, t.presenter]), [
    ['1조', '창조와 진화', '발표자1'],
    ['2조', '부활', ''],
    ['3조', '고난', '발표자3'],
    ['4조', '666표', ''],
  ]);
});

test('잘못된 주제·발표자 목록은 invalid이고 바꾸지 않는다', () => {
  const s = loadServer();
  const titles = Array(N).fill('주제');
  const bad = [
    saveTopics(titles.slice(0, N - 1), blank()),
    saveTopics(titles, Array(N - 1).fill('')),
    saveTopics(['', ...titles.slice(1)], blank()),
    saveTopics(['   ', ...titles.slice(1)], blank()),
    saveTopics(['x'.repeat(41), ...titles.slice(1)], blank()),
    saveTopics(titles, ['x'.repeat(31), ...blank().slice(1)]),
    { action: 'topics', pin: PIN },
  ];
  for (const body of bad) assert.deepEqual(s.post(body), { ok: false, error: 'invalid' }, JSON.stringify(body).slice(0, 60));
  assert.equal(s.get({ action: 'topics' }).topics[0].title, '1조 발표');
});
