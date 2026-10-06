// 관리자 화면(#admin). 비밀번호는 서버가 확인하고, 이 탭을 닫을 때까지만 기억한다.
import { el, post, read, write, session, getTopicList, setTopicList, STORE } from './app.js';
import { groupTopics, feedbackFor, groupCopyText, topicLabel, selectedShareCards } from './logic.js';

const PIN_KEY = `${STORE}:pin`;
const $ = (sel) => document.querySelector(sel);
const pageUrl = location.origin + location.pathname;
let lastEntries = [];
let fieldsRendered = false;
let imageModule;
const selected = new Set();

$('#share-url').textContent = pageUrl;
$('#copy-link').addEventListener('click', (e) => copyText(pageUrl, e.currentTarget));
const qr = $('#qr');
qr.addEventListener('load', () => { qr.hidden = false; });
qr.src = 'qr.png';

$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#login-msg');
  msg.textContent = '확인하는 중이에요...';
  const error = await load($('#pin').value.trim());
  msg.textContent = !error ? '' : error === 'pin' ? '비밀번호가 맞지 않아요.' : '불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
});

$('#refresh').addEventListener('click', async () => {
  const msg = $('#results-msg');
  msg.textContent = '불러오는 중이에요...';
  const error = await load(read(session, PIN_KEY));
  if (error && error !== 'pin') msg.textContent = '불러오지 못했어요. 다시 눌러 주세요.';
});

$('#presenters').addEventListener('submit', saveTopics);

$('#share-toggle').addEventListener('click', (e) => {
  const view = $('#share-view');
  view.hidden = !view.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!view.hidden));
  e.currentTarget.textContent = view.hidden ? '공유용 보기' : '공유용 보기 닫기';
  e.currentTarget.disabled = selected.size === 0 && view.hidden;
  if (!view.hidden) renderShareCards();
});
$('#print-all').addEventListener('click', () => window.print());

window.addEventListener('beforeprint', () => {
  if ($('#admin').hidden || $('#admin-body').hidden || $('#share-view').hidden) return;
  // A4 높이 297mm에서 위아래 여백 12mm씩을 뺀다. 긴 조도 한 페이지에 맞춘다.
  const pageHeight = (297 - 24) * 96 / 25.4 - 2;
  for (const card of document.querySelectorAll('.share-card')) {
    // beforeprint는 인쇄 CSS가 적용되기 전에도 실행된다. 측정할 때만 인쇄 폭과 zoom을 적용한다.
    card.style.width = '186mm';
    card.style.zoom = '1';
    card.style.setProperty('--print-scale', '1');
    let scale = 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      const height = card.getBoundingClientRect().height;
      if (height <= pageHeight) break;
      scale *= pageHeight / height * 0.99;
      card.style.zoom = String(scale);
      card.style.setProperty('--print-scale', String(scale));
    }
    card.style.removeProperty('width');
    card.style.removeProperty('zoom');
  }
});
window.addEventListener('afterprint', () => {
  for (const card of document.querySelectorAll('.share-card')) card.style.removeProperty('--print-scale');
});

export async function openAdmin() {
  const pin = read(session, PIN_KEY);
  if (!pin) return showLogin();
  const msg = $('#login-msg');
  msg.textContent = '불러오는 중이에요...'; // 서버 응답(1~2초) 동안 빈 로그인 화면처럼 보이지 않게
  const error = await load(pin);
  msg.textContent = !error ? '' : error === 'pin' ? '비밀번호를 다시 넣어 주세요.' : '불러오지 못했어요. 인터넷 연결을 확인해 주세요.';
}

function showLogin() {
  $('#login').hidden = false;
  $('#admin-body').hidden = true;
}

// 성공하면 null, 실패하면 오류 코드('pin' | 'network' | ...)
async function load(pin) {
  let data;
  try {
    data = await post({ action: 'results', pin });
  } catch {
    return 'network';
  }
  if (!data.ok) {
    if (data.error === 'pin') {
      write(session, PIN_KEY, null);
      showLogin();
    }
    return data.error || 'network';
  }
  write(session, PIN_KEY, pin);
  setTopicList(data.topics);
  $('#login').hidden = true;
  $('#admin-body').hidden = false;
  if (!fieldsRendered) {
    renderTopicFields();
    fieldsRendered = true;
  }
  lastEntries = data.entries;
  selected.clear();
  renderResults();
  return null;
}

// 조마다 주제(필수)와 발표자(선택) 칸.
function renderTopicFields() {
  $('#presenter-fields').replaceChildren(...getTopicList().map((t) =>
    el('div', { className: 'topic-fields' },
      el('p', { className: 'topic-fields-name', textContent: t.group }),
      el('label', { className: 'field' },
        el('span', { className: 'field-label', textContent: '주제' }),
        el('input', { name: `t${t.id}`, value: t.title, maxLength: 40, autocomplete: 'off' })),
      el('label', { className: 'field' },
        el('span', { className: 'field-label', textContent: '발표자 (선택)' }),
        el('input', { name: `p${t.id}`, value: t.presenter, maxLength: 30, autocomplete: 'off' })))));
}

async function saveTopics(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const msg = $('#presenter-msg');
  const topics = getTopicList();
  const titles = topics.map((t) => form.elements[`t${t.id}`].value.trim());
  const presenters = topics.map((t) => form.elements[`p${t.id}`].value.trim());
  if (titles.some((t) => !t)) {
    msg.textContent = '주제를 모두 채워 주세요. 정해지지 않았으면 "1조 발표"처럼 두세요.';
    return;
  }
  msg.textContent = '저장하는 중이에요...';
  let data;
  try {
    data = await post({ action: 'topics', pin: read(session, PIN_KEY), titles, presenters });
  } catch {
    data = { ok: false };
  }
  if (data.ok) {
    setTopicList(topics.map((t, i) => ({ ...t, title: titles[i], presenter: presenters[i] })));
    renderResults();
    msg.textContent = '저장했어요. 참석자 화면은 새로 열면 바뀐 내용이 보여요.';
  } else {
    msg.textContent = data.error === 'pin' ? '비밀번호가 맞지 않아요. 다시 들어와 주세요.' : '저장하지 못했어요. 다시 눌러 주세요.';
  }
}

function renderResults() {
  $('#results-msg').textContent = `응답한 사람 ${lastEntries.length}명`;
  $('#results').replaceChildren(...groupTopics(getTopicList()).map((g) => {
    const copy = el('button', { type: 'button', className: 'btn', textContent: `${g.group} 원본 복사` });
    copy.addEventListener('click', () => copyText(groupCopyText(g, lastEntries), copy));
    const section = el('section', { className: 'result-group' },
      el('div', { className: 'panel-head' }, el('h3', { textContent: g.group }), copy));
    for (const t of g.topics) {
      const items = feedbackFor(t, lastEntries);
      const list = el('ul', { className: 'feedback-list' });
      if (!items.length) list.append(el('li', { className: 'empty', textContent: '아직 피드백이 없어요.' }));
      for (const [index, f] of items.entries()) {
        const key = `${t.id}:${index}`;
        const checkbox = el('input', { type: 'checkbox', checked: selected.has(key) });
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(key);
          else selected.delete(key);
          $('#selected-count').textContent = `선택한 피드백 ${selected.size}개`;
          $('#share-toggle').disabled = selected.size === 0 && $('#share-view').hidden;
          if (!$('#share-view').hidden) renderShareCards();
        });
        list.append(el('li', {},
          el('p', { className: 'feedback-text', textContent: f.text }),
          el('p', { className: 'feedback-name', textContent: f.name }),
          el('label', { className: 'feedback-select' }, checkbox,
            el('span', { textContent: '공개 피드백에 포함' }))));
      }
      section.append(
        el('h4', { textContent: topicLabel(t) }),
        el('p', { className: 'count', textContent: `피드백 ${items.length}개` }),
        list);
    }
    return section;
  }));
  $('#selected-count').textContent = `선택한 피드백 ${selected.size}개`;
  $('#share-toggle').disabled = selected.size === 0 && $('#share-view').hidden;
  if (!$('#share-view').hidden) renderShareCards();
}

function renderShareCards() {
  $('#print-all').disabled = selected.size === 0;
  $('#share-cards').replaceChildren(...selectedShareCards(getTopicList(), lastEntries, selected).map(({ group, items }, index) => {
    const card = el('article', { className: 'share-card' }, el('h3', { textContent: `${group} 피드백` }));
    for (const { label, count, feedbacks } of items) {
      const list = el('ul', { className: 'feedback-list' });
      if (!count) list.append(el('li', { className: 'empty', textContent: '선택한 피드백이 없어요.' }));
      for (const { name, text } of feedbacks) list.append(el('li', {},
        el('p', { className: 'feedback-text', textContent: text }),
        el('p', { className: 'feedback-name', textContent: name })));
      card.append(el('section', { className: 'share-topic' },
        el('h4', { textContent: label }),
        el('p', { className: 'count', textContent: `피드백 ${count}개` }), list));
    }
    const empty = !items.some(item => item.count);
    const button = el('button', { type: 'button', className: 'btn', disabled: empty, textContent: '이미지로 저장' });
    const exportButton = el('button', { type: 'button', className: 'btn', disabled: empty, textContent: '선택한 피드백 파일 저장' });
    const copyLink = el('button', { type: 'button', className: 'btn', textContent: '조별 공개 링크 복사' });
    const msg = el('p', { className: 'form-msg', ariaLive: 'polite' });
    button.addEventListener('click', () => saveImage(card, group, button, msg));
    exportButton.addEventListener('click', () => {
      try {
        const data = { publishedAt: new Date().toISOString(), card: { group, items } };
        downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), `${group} 공개 피드백.json`);
        msg.textContent = '';
      } catch {
        msg.textContent = '피드백 파일을 저장하지 못했어요. 다시 눌러 주세요.';
      }
    });
    const publicUrl = new URL(`feedback.html?group=${index + 1}`, pageUrl).href;
    copyLink.addEventListener('click', () => copyText(publicUrl, copyLink));
    return el('div', { className: 'share-card-block' }, card,
      el('div', { className: 'share-card-actions' }, button, exportButton, copyLink, msg));
  }));
}

async function saveImage(card, group, button, msg) {
  button.disabled = true;
  button.textContent = '만드는 중이에요...';
  msg.textContent = '';
  try {
    imageModule ??= import('https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/+esm').catch((error) => {
      imageModule = null;
      throw error;
    });
    const { toBlob } = await imageModule;
    const blob = await toBlob(card, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      skipFonts: true, // 공유 카드는 시스템 글꼴을 써서 외부 웹폰트 다운로드가 필요 없다.
    });
    if (!blob) throw new Error('PNG 생성 실패');
    downloadBlob(blob, `${group} 피드백.png`);
  } catch {
    msg.textContent = '이미지를 만들지 못했어요. 화면을 캡처해 주세요.';
  } finally {
    button.disabled = false;
    button.textContent = '이미지로 저장';
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// 카톡 안 브라우저처럼 clipboard API가 막힌 곳은 execCommand로 대신한다.
async function copyText(text, button) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const area = el('textarea', { value: text, readOnly: true });
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(area);
    area.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
  }
  button.dataset.label ??= button.textContent;
  button.textContent = ok ? '복사했어요' : '복사하지 못했어요';
  setTimeout(() => {
    button.textContent = button.dataset.label;
  }, 1500);
}
