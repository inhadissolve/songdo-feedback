import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULT_TOPICS, groupTopics } from '../logic.js';

test('조별 공개 파일에는 해당 조의 선별 피드백만 있고 원본 전체 응답과 기기 정보는 없다', () => {
  assert.equal(existsSync(new URL('../feedback.json', import.meta.url)), false);
  const groups = groupTopics(DEFAULT_TOPICS);
  for (const [index, group] of groups.entries()) {
    const data = JSON.parse(readFileSync(new URL(`../published-feedback/group-${index + 1}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(data).sort(), ['card', 'publishedAt']);
    if (data.publishedAt !== null) assert.ok(Number.isFinite(Date.parse(data.publishedAt)));
    const card = data.card;
    assert.equal(card.group, group.group);
    assert.equal(card.items.length, group.topics.length);
    assert.deepEqual(Object.keys(card).sort(), ['group', 'items']);
    for (const item of card.items) {
      assert.deepEqual(Object.keys(item).sort(), ['count', 'feedbacks', 'label']);
      assert.equal(typeof item.label, 'string');
      assert.equal(item.count, item.feedbacks.length);
      if (data.publishedAt === null) assert.equal(item.count, 0);
      for (const feedback of item.feedbacks) {
        assert.deepEqual(Object.keys(feedback).sort(), ['name', 'text']);
        assert.equal(typeof feedback.name, 'string');
        assert.ok(feedback.name.trim());
        assert.equal(typeof feedback.text, 'string');
        assert.ok(feedback.text.trim());
      }
    }
  }
});
