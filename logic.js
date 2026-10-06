// 화면과 무관한 계산. 브라우저(app.js, admin.js)와 node 테스트가 함께 쓴다.

// 서버 Code.gs의 TOPICS와 같아야 한다(테스트가 확인한다).
export const DEFAULT_TOPICS = [
  { id: 1, group: '1조', title: '1조 발표', presenter: '' },
  { id: 2, group: '2조', title: '2조 발표', presenter: '' },
  { id: 3, group: '3조', title: '3조 발표', presenter: '' },
  { id: 4, group: '4조', title: '4조 발표', presenter: '' },
];

// 서버 검사 규칙 /^[a-z0-9]{8,40}$/ 를 만족한다.
export const newDeviceId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// 마지막으로 보낸 내용과 비교하는 데 쓴다.
export const snapshot = (name, answers) => JSON.stringify({ name, answers });

// 이어지는 같은 조끼리 묶는다: [{ group, topics: [...] }]
export function groupTopics(topics) {
  const groups = [];
  for (const t of topics) {
    const last = groups[groups.length - 1];
    if (last && last.group === t.group) last.topics.push(t);
    else groups.push({ group: t.group, topics: [t] });
  }
  return groups;
}

// "1. 주제 (발표: 이름)". 발표자가 비어 있으면 괄호를 붙이지 않는다.
export const topicLabel = (t) => `${t.id}. ${t.title}${t.presenter ? ` (발표: ${t.presenter})` : ''}`;

// 한 주제의 피드백 목록. 빈 칸은 빼고, 이름이 없으면 '익명'.
export function feedbackFor(topic, entries) {
  return entries
    .map((e) => ({
      name: (e.name || '').trim() || '익명',
      text: (e.answers[topic.id - 1] || '').replace(/\r\n?/g, '\n').trim(),
    }))
    .filter((f) => f.text);
}

// 조별 복사 문구. 작성자 이름은 넣지 않는다.
export function groupCopyText(group, entries) {
  const lines = [`[${group.group} 피드백]`];
  for (const t of group.topics) {
    lines.push('', topicLabel(t));
    const items = feedbackFor(t, entries);
    if (!items.length) lines.push('(피드백 없음)');
    for (const f of items) lines.push(`- ${f.text.split('\n').join('\n  ')}`);
  }
  return lines.join('\n');
}

// 공유 카드에는 작성자 이름을 넣지 않는다.
export function shareCards(topics, entries) {
  return groupTopics(topics).map(({ group, topics: list }) => ({
    group,
    items: list.map((t) => {
      const texts = feedbackFor(t, entries).map((f) => f.text);
      return { label: topicLabel(t), count: texts.length, texts };
    }),
  }));
}
