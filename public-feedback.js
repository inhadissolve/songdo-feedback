// 관리자가 게시한 공개본만 읽는다. 참석자 화면이나 관리자 인증을 실행하지 않는다.
const $ = (selector) => document.querySelector(selector);
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

async function loadFeedback() {
  const msg = $('#public-msg');
  msg.hidden = false;
  msg.textContent = '피드백을 불러오는 중이에요...';
  $('#public-retry').hidden = true;
  const group = new URLSearchParams(location.search).get('group');
  if (!/^[1-9]$/.test(group || '') || Number(group) > Number(document.body.dataset.groupCount)) {
    msg.textContent = '공유받은 조별 링크로 들어와 주세요.';
    return;
  }
  try {
    const url = new URL(window.API_URL, location.href);
    url.searchParams.set('action', 'published');
    url.searchParams.set('group', group);
    url.searchParams.set('t', Date.now());
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('공개 피드백 조회 실패');
    const data = await response.json();
    if (!data.ok) throw new Error('공개 피드백 조회 실패');
    document.title = `${data.card.group} 공개 피드백`;
    if (!data.publishedAt) {
      $('#public-cards').replaceChildren();
      $('#published-at').textContent = data.card.group;
      msg.textContent = '관리자가 공개할 피드백을 준비하고 있어요.';
      return;
    }
    const card = el('article', { className: 'share-card public-card', id: `group-${group}` },
      el('h2', { textContent: `${data.card.group} 피드백` }));
    for (const { label, count, feedbacks } of data.card.items) {
      const list = el('ul', { className: 'feedback-list' });
      if (!count) list.append(el('li', { className: 'empty', textContent: '공개된 피드백이 없어요.' }));
      for (const { name, text } of feedbacks) list.append(el('li', {},
        el('p', { className: 'feedback-text', textContent: text }),
        el('p', { className: 'feedback-name', textContent: name })));
      card.append(el('section', { className: 'share-topic' },
        el('h3', { textContent: label }),
        el('p', { className: 'count', textContent: `피드백 ${count}개` }), list));
    }
    const publishedAt = new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
    }).format(new Date(data.publishedAt));
    $('#published-at').textContent = `${publishedAt} 기준 피드백`;
    $('#public-cards').replaceChildren(card);
    msg.hidden = true;
  } catch {
    msg.textContent = '피드백을 불러오지 못했어요. 다시 눌러 주세요.';
    $('#public-retry').hidden = false;
  }
}

$('#public-retry').addEventListener('click', loadFeedback);
loadFeedback();
