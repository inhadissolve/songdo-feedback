import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TOPICS, newDeviceId, snapshot, groupTopics, feedbackFor, groupCopyText, topicLabel } from '../logic.js';
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
