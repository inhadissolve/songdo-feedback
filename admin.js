// 관리자 화면(#admin). 비밀번호는 서버가 확인하고, 이 탭을 닫을 때까지만 기억한다.
import { el, post, read, write, session, getTopicList, setTopicList, STORE } from './app.js';
import { groupTopics, feedbackFor, groupCopyText, topicLabel } from './logic.js';

const PIN_KEY = `${STORE}:pin`;
const $ = (sel) => document.querySelector(sel);
const pageUrl = location.origin + location.pathname;
let lastEntries = [];
let fieldsRendered = false;

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
    const copy = el('button', { type: 'button', className: 'btn', textContent: `${g.group} 복사` });
    copy.addEventListener('click', () => copyText(groupCopyText(g, lastEntries), copy));
    const section = el('section', { className: 'result-group' },
      el('div', { className: 'panel-head' }, el('h3', { textContent: g.group }), copy));
    for (const t of g.topics) {
      const items = feedbackFor(t, lastEntries);
      const list = el('ul', { className: 'feedback-list' });
      if (!items.length) list.append(el('li', { className: 'empty', textContent: '아직 피드백이 없어요.' }));
      for (const f of items) {
        list.append(el('li', {},
          el('p', { className: 'feedback-text', textContent: f.text }),
          el('p', { className: 'feedback-name', textContent: f.name })));
      }
      section.append(
        el('h4', { textContent: topicLabel(t) }),
        el('p', { className: 'count', textContent: `피드백 ${items.length}개` }),
        list);
    }
    return section;
  }));
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
