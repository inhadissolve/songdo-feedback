import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TOPICS, newDeviceId, snapshot, groupTopics, feedbackFor, groupCopyText, topicLabel, shareCards, selectedShareCards, publishedSelection } from '../logic.js';
import { loadServer } from './fake-gas.mjs';

test('화면 기본 주제 목록은 서버 setup 목록과 같다', () => {
  assert.deepEqual(loadServer().get({ action: 'topics' }).topics, DEFAULT_TOPICS);
});

test('기기 ID는 서버 검사 규칙을 통과한다', () => {
  for (let i = 0; i < 500; i++) assert.match(newDeviceId(), /^[a-z0-9]{8,40}$/);
});

test('snapshot은 이름과 칸 내용이 같을 때만 같다', () => {
  assert.equal(snapshot('a', ['x', '']), snapshot('a', ['x', '']));
  assert.notEqual(snapshot('a', ['x', '']), snapshot('b', ['x', '']));
  assert.notEqual(snapshot('a', ['x', '']), snapshot('a', ['x ', '']));
});

test('groupTopics는 조 4개에 주제 1개씩, 순서를 지킨다', () => {
  const groups = groupTopics(DEFAULT_TOPICS);
  assert.deepEqual(groups.map((g) => g.group), ['1조', '2조', '3조', '4조']);
  assert.deepEqual(groups.map((g) => g.topics.map((t) => t.id)), [[1], [2], [3], [4]]);
});

test('topicLabel은 발표자가 있을 때만 발표자를 붙인다', () => {
  assert.equal(topicLabel({ id: 1, title: '창조', presenter: '' }), '1. 창조');
  assert.equal(topicLabel({ id: 2, title: '부활', presenter: '발표자' }), '2. 부활 (발표: 발표자)');
});

const entry = (name, byIndex) => ({ name, clientTime: 1, answers: Object.assign(Array(DEFAULT_TOPICS.length).fill(''), byIndex) });

test('feedbackFor는 빈 칸을 빼고, 이름이 없으면 익명, 줄바꿈을 정리한다', () => {
  const entries = [entry('', { 0: '  좋았어요 ' }), entry('민지', { 0: '첫 줄\r\n둘째 줄' }), entry('준호', { 1: '다른 조' })];
  assert.deepEqual(feedbackFor(DEFAULT_TOPICS[0], entries), [
    { name: '익명', text: '좋았어요' },
    { name: '민지', text: '첫 줄\n둘째 줄' },
  ]);
});

test('groupCopyText는 이름 없이 조별 문구를 만든다', () => {
  const [first, second] = groupTopics([{ ...DEFAULT_TOPICS[0], title: '창조', presenter: '발표자' }, ...DEFAULT_TOPICS.slice(1)]);
  const entries = [entry('민지', { 0: '예시가 좋았어요' }), entry('', { 0: '첫 줄\n둘째 줄' })];
  assert.equal(groupCopyText(first, entries), [
    '[1조 피드백]',
    '',
    '1. 창조 (발표: 발표자)',
    '- 예시가 좋았어요',
    '- 첫 줄',
    '  둘째 줄',
  ].join('\n'));
  assert.equal(groupCopyText(second, entries), ['[2조 피드백]', '', '2. 2조 발표', '(피드백 없음)'].join('\n'));
});

test('shareCards는 작성자 이름과 익명, 줄바꿈, 발표자 표기를 반환한다', () => {
  const topics = [{ ...DEFAULT_TOPICS[0], title: '창조', presenter: '발표자' }, ...DEFAULT_TOPICS.slice(1)];
  const entries = [entry('민지', { 0: '  예시가 좋았어요  ' }), entry('', { 0: '첫 줄\r\n둘째 줄' })];
  const cards = shareCards(topics, entries);
  assert.deepEqual(cards[0], {
    group: '1조',
    items: [{ label: '1. 창조 (발표: 발표자)', count: 2, feedbacks: [
      { name: '민지', text: '예시가 좋았어요' }, { name: '익명', text: '첫 줄\n둘째 줄' },
    ] }],
  });
  assert.equal(cards[1].items[0].label, '2. 2조 발표');
});

test('shareCards는 빈 칸을 제외하고 피드백 없는 주제도 count 0으로 남긴다', () => {
  const cards = shareCards(DEFAULT_TOPICS, [entry('작성자', { 0: ' \r\n\t ', 1: '의견' })]);
  assert.deepEqual(cards.slice(0, 2).map((card) => ({ count: card.items[0].count, feedbacks: card.items[0].feedbacks })), [
    { count: 0, feedbacks: [] }, { count: 1, feedbacks: [{ name: '작성자', text: '의견' }] },
  ]);
  assert.ok(shareCards(DEFAULT_TOPICS, []).every((card) => card.items.every((item) => item.count === 0 && item.feedbacks.length === 0)));
});

test('shareCards는 전달받은 조 순서를 유지하며 입력을 바꾸지 않는다', () => {
  const topics = [DEFAULT_TOPICS[3], DEFAULT_TOPICS[1], DEFAULT_TOPICS[0], DEFAULT_TOPICS[2]];
  const entries = [entry('작성자', { 3: '마지막 조 의견' })];
  const before = JSON.stringify({ topics, entries });
  assert.deepEqual(shareCards(topics, entries).map((card) => card.group), ['4조', '2조', '1조', '3조']);
  assert.equal(JSON.stringify({ topics, entries }), before);
  assert.deepEqual(shareCards([], entries), []);
});

test('공유 카드에는 체크한 피드백만 들어가고 선택하지 않은 내용은 빠진다', () => {
  const entries = [entry('민지', { 0: '비공개로 둘 의견', 1: '다른 주제 의견' }), entry('', { 0: '공개할 의견' })];
  const cards = selectedShareCards(DEFAULT_TOPICS, entries, new Set(['1:1']));
  assert.deepEqual(cards[0].items[0].feedbacks, [{ name: '익명', text: '공개할 의견' }]);
  assert.equal(cards[0].items[0].count, 1);
  assert.ok(cards.flatMap(card => card.items).slice(1).every(item => item.count === 0));
  assert.equal(JSON.stringify(cards).includes('비공개로 둘 의견'), false);
  assert.equal(JSON.stringify(cards).includes('다른 주제 의견'), false);
  assert.ok(selectedShareCards(DEFAULT_TOPICS, entries, new Set()).every(card => card.items.every(item => item.count === 0)));
});

test('게시한 선택을 복원하고 새 응답과 같은 내용의 추가 응답은 자동 선택하지 않는다', () => {
  const old = [entry('민지', { 0: '선별 의견' }), entry('', { 0: '같은 의견' }), entry('', { 0: '같은 의견' })];
  const cards = selectedShareCards(DEFAULT_TOPICS, old, new Set(['1:0', '1:1']));
  const published = cards.map(card => ({ card, publishedAt: '2026-10-06T00:00:00.000Z' }));
  const current = [entry('신규', { 0: '새 의견' }), ...old];
  assert.deepEqual([...publishedSelection(DEFAULT_TOPICS, current, published)], ['1:1', '1:2']);
  assert.equal(JSON.stringify(selectedShareCards(DEFAULT_TOPICS, current, publishedSelection(DEFAULT_TOPICS, current, published))).includes('새 의견'), false);
  assert.equal(publishedSelection(DEFAULT_TOPICS, current, []).size, 0);
});
