import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadServer } from './fake-gas.mjs';

const PIN = '123456';
function publish(server, group, feedbacks, pin = PIN) {
  const topics = server.get({ action: 'topics' }).topics;
  const names = [...new Set(topics.map(topic => topic.group))];
  const items = topics.filter(topic => topic.group === names[group - 1]).map((_, index) => ({ feedbacks: index === 0 ? feedbacks : [] }));
  return server.post({ action: 'publish', pin, group, items });
}
const publicGet = (server, group) => server.get({ action: 'published', group: String(group) });

test('공개 조회는 인증 없이 선별본만 반환하고 잘못된 조는 거절한다', () => {
  const server = loadServer();
  const data = publicGet(server, 1);
  assert.equal(data.ok, true);
  assert.equal(data.publishedAt, null);
  assert.ok(data.card.items.every(item => item.count === 0));
  for (const group of [0, -1, 99, 1.5, '1/../../feedback', '']) assert.deepEqual(publicGet(server, group), { ok: false, error: 'invalid' });
  assert.equal(server.sheet('published'), undefined);
  assert.deepEqual(publish(server, 1, [{ name: '선별', text: '의견' }], 'wrong'), { ok: false, error: 'pin' });
  assert.equal(server.sheet('published'), undefined);
});

test('공개 게시는 원본 주제와 응답을 보존하고 선택한 복사본만 저장한다', () => {
  const server = loadServer();
  const size = server.get({ action: 'topics' }).topics.length;
  server.post({ action: 'feedback', deviceId: 'original01', clientTime: 1, name: '원본 작성자', answers: ['원본 의견', ...Array(size - 1).fill('')] });
  const original = JSON.stringify({ topics: server.sheet('topics').rows, feedback: server.sheet('feedback').rows });
  const saved = publish(server, 1, [{ name: '  작성자  ', text: '선별 첫 줄\r\n둘째 줄', deviceId: 'private', clientTime: 123 }]);
  assert.equal(saved.ok, true);
  const firstTopic = server.get({ action: 'topics' }).topics[0];
  assert.equal(saved.card.items[0].label, `${firstTopic.id}. ${firstTopic.title}${firstTopic.presenter ? ` (발표: ${firstTopic.presenter})` : ''}`);
  assert.ok(Number.isFinite(Date.parse(saved.publishedAt)));
  assert.equal(JSON.stringify({ topics: server.sheet('topics').rows, feedback: server.sheet('feedback').rows }), original);
  assert.deepEqual(publicGet(server, 1), saved);
  assert.deepEqual(saved.card.items[0].feedbacks, [{ name: '작성자', text: '선별 첫 줄\n둘째 줄' }]);
  assert.equal(saved.card.items[0].count, 1);
  assert.deepEqual(Object.keys(saved).sort(), ['card', 'ok', 'publishedAt']);
  assert.equal(JSON.stringify(saved).includes('deviceId'), false);
  assert.equal(JSON.stringify(saved).includes('clientTime'), false);
  const results = server.post({ action: 'results', pin: PIN });
  assert.deepEqual(results.published[0], saved);
  assert.equal(results.entries[0].answers[0], '원본 의견');
  server.post({ action: 'feedback', deviceId: 'newdevice1', clientTime: 2, name: '새 응답', answers: ['자동 공개 금지', ...Array(size - 1).fill('')] });
  assert.deepEqual(publicGet(server, 1), saved);
  server.setup();
  assert.deepEqual(publicGet(server, 1), saved);
});

test('조별 재게시와 전체 선택 해제는 다른 조의 공개본과 원본을 바꾸지 않는다', () => {
  const server = loadServer();
  const originals = JSON.stringify({ topics: server.sheet('topics').rows, feedback: server.sheet('feedback').rows });
  publish(server, 1, [{ name: '가', text: '첫 의견' }, { name: '나', text: '다음 의견' }]);
  const other = publish(server, 2, [{ name: '다', text: '다른 조' }]);
  const updated = publish(server, 1, [{ name: '', text: '바꾼 의견' }]);
  assert.equal(updated.card.items[0].count, 1);
  assert.deepEqual(updated.card.items[0].feedbacks, [{ name: '익명', text: '바꾼 의견' }]);
  assert.deepEqual(publicGet(server, 1), updated);
  assert.deepEqual(publicGet(server, 2), other);
  const empty = publish(server, 1, []);
  assert.ok(empty.card.items.every(item => item.count === 0));
  assert.deepEqual(publicGet(server, 1), empty);
  assert.deepEqual(publicGet(server, 2), other);
  assert.equal(JSON.stringify({ topics: server.sheet('topics').rows, feedback: server.sheet('feedback').rows }), originals);
});

test('게시 데이터 검증 실패는 기존 공개본을 보존한다', () => {
  const server = loadServer();
  const original = publish(server, 1, [{ name: '가', text: '의견' }]);
  for (const feedbacks of [[{ name: '가', text: '  ' }], [{ name: '가', text: 'x'.repeat(3001) }], [{ name: 'x'.repeat(31), text: '의견' }], [{ name: null, text: '의견' }], [null]]) {
    assert.deepEqual(publish(server, 1, feedbacks), { ok: false, error: 'invalid' });
    assert.deepEqual(publicGet(server, 1), original);
  }
  assert.deepEqual(server.post({ action: 'publish', pin: PIN, group: '1', items: [] }), { ok: false, error: 'invalid' });
  assert.deepEqual(server.post({ action: 'publish', pin: PIN, group: 1, items: [] }), { ok: false, error: 'invalid' });
});

test('긴 공개본도 피드백별 셀에 나눠 저장하고 수식처럼 시작하는 글을 보존한다', () => {
  const server = loadServer();
  const feedbacks = Array.from({ length: 1001 }, (_, i) => ({ name: '=이름', text: i === 0 ? '=1+1\n@의견' : 'x'.repeat(3000) }));
  const data = publish(server, 1, feedbacks);
  assert.equal(data.ok, true);
  assert.deepEqual(publicGet(server, 1), data);
  assert.ok(server.sheet('published').rows.every(row => row.every(cell => typeof cell !== 'string' || cell.length < 50000)));
  assert.ok(server.sheet('published').getMaxRows() > 1000);
});
