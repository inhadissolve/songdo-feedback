import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TOPICS, newDeviceId, snapshot, groupTopics, feedbackFor, groupCopyText } from '../logic.js';
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

test('groupTopics는 조 5개에 주제 2개씩, 순서를 지킨다', () => {
  const groups = groupTopics(DEFAULT_TOPICS);
  assert.deepEqual(groups.map((g) => g.group), ['형제1조', '형제2조', '형제3조', '자매1조', '자매2조']);
  assert.deepEqual(groups.map((g) => g.topics.map((t) => t.id)), [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
});

const entry = (name, byIndex) => ({ name, clientTime: 1, answers: Object.assign(Array(10).fill(''), byIndex) });

test('feedbackFor는 빈 칸을 빼고, 이름이 없으면 익명, 줄바꿈을 정리한다', () => {
  const entries = [entry('', { 0: '  좋았어요 ' }), entry('민지', { 0: '첫 줄\r\n둘째 줄' }), entry('준호', { 1: '다른 주제' })];
  assert.deepEqual(feedbackFor(DEFAULT_TOPICS[0], entries), [
    { name: '익명', text: '좋았어요' },
    { name: '민지', text: '첫 줄\n둘째 줄' },
  ]);
});

test('groupCopyText는 이름 없이 조별 문구를 만든다', () => {
  const [first] = groupTopics(DEFAULT_TOPICS);
  const entries = [entry('민지', { 0: '예시가 좋았어요' }), entry('', { 0: '첫 줄\n둘째 줄' })];
  assert.equal(groupCopyText(first, entries), [
    '[형제1조 피드백]',
    '',
    '1. 파스칼의 내기 (발표: 형제1)',
    '- 예시가 좋았어요',
    '- 첫 줄',
    '  둘째 줄',
    '',
    '2. 홍해의 기적 (발표: 형제2)',
    '(피드백 없음)',
  ].join('\n'));
});
