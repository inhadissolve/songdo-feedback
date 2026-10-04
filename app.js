// 참석자 화면: 주제 10개, 폰에 자동 저장, 서버 자동 전송. 관리자 화면은 #admin일 때 admin.js를 불러온다.
import { DEFAULT_TOPICS, newDeviceId, snapshot, groupTopics } from './logic.js';

const N = 10;
const KEY = 'inha-feedback:v1';
const TOPICS_KEY = 'inha-feedback:topics';
const $ = (sel) => document.querySelector(sel);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// 저장소가 막힌 브라우저(시크릿 모드 등)에서도 화면과 전송은 동작해야 한다.
const storage = (kind) => {
  try {
    return window[kind];
  } catch {
    return null;
  }
};
export const local = storage('localStorage');
export const session = storage('sessionStorage');

export function read(store, key) {
  try {
    return JSON.parse(store.getItem(key));
  } catch {
    return null;
  }
}

export function write(store, key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// 본문을 문자열로 보내면 text/plain이라 CORS 사전요청이 없다. keepalive는 64KB 제한이 있다.
export async function post(body, keepalive = false) {
  const text = JSON.stringify(body);
  const res = await fetch(window.API_URL, {
    method: 'POST',
    body: text,
    keepalive: keepalive && new Blob([text]).size < 60000,
  });
  return res.json();
}

const validTopics = (list) => Array.isArray(list) && list.length === N && list.every((t, i) => t && t.id === i + 1);
let topics = read(local, TOPICS_KEY);
if (!validTopics(topics)) topics = DEFAULT_TOPICS;

export const getTopicList = () => topics;

export function setTopicList(list) {
  if (!validTopics(list)) return;
  topics = list;
  write(local, TOPICS_KEY, list);
  updateLabels();
}

// 기기 저장값 읽기: 처음 열 때, 그리고 같은 브라우저의 다른 탭이 저장했을 때.
function readSaved() {
  const saved = read(local, KEY) || {};
  return {
    deviceId: typeof saved.deviceId === 'string' ? saved.deviceId : newDeviceId(),
    name: typeof saved.name === 'string' ? saved.name : '',
    answers: Array.from({ length: N }, (_, i) => (typeof saved.answers?.[i] === 'string' ? saved.answers[i] : '')),
    sent: typeof saved.sent === 'string' ? saved.sent : null,
  };
}
const state = readSaved();
const persist = () => write(local, KEY, state);
const sentAnswers = () => (state.sent ? JSON.parse(state.sent).answers : []);
const payload = () => ({
  action: 'feedback', deviceId: state.deviceId, clientTime: Date.now(), name: state.name, answers: state.answers.slice(),
});

function setStatus(i, text, kind = '') {
  const status = $(`#s${i + 1}`);
  status.textContent = text;
  status.dataset.kind = kind;
}

// 지금 칸 내용과 마지막으로 보낸 내용을 비교해 상태 문구를 맞춘다.
function refreshStatus(i) {
  const answer = state.answers[i];
  if (answer === (sentAnswers()[i] ?? '')) setStatus(i, answer.trim() ? '제출됨 ✓' : '', 'ok');
  else setStatus(i, '이 폰에 저장됨');
}

function markChip(i) {
  const t = topics[i];
  const done = state.answers[i].trim() !== '';
  const chip = $(`#c${i + 1}`);
  chip.classList.toggle('done', done);
  chip.setAttribute('aria-label', `${t.id}번 ${t.title}${done ? ', 작성함' : ''}`);
}

function updateLabels() {
  groupTopics(topics).forEach((g, gi) => {
    const heading = $(`#g${gi}`);
    if (heading) heading.textContent = g.group;
  });
  topics.forEach((t, i) => {
    $(`#title-${t.id}`).textContent = t.title;
    $(`#presenter-${t.id}`).textContent = t.presenter;
    markChip(i);
  });
}

function renderParticipant() {
  groupTopics(topics).forEach((g, gi) => {
    const section = el('section', { className: 'group' }, el('h2', { className: 'group-name', id: `g${gi}`, textContent: g.group }));
    for (const t of g.topics) {
      const i = t.id - 1;
      const area = el('textarea', {
        id: `a${t.id}`,
        rows: 6,
        maxLength: 3000,
        placeholder: '느낀 점을 자유롭게 적어 주세요',
        value: state.answers[i],
      });
      area.addEventListener('input', () => {
        state.answers[i] = area.value;
        persist();
        markChip(i);
        refreshStatus(i);
      });
      area.addEventListener('change', () => sync());
      const status = el('p', { className: 'status', id: `s${t.id}` });
      status.setAttribute('aria-live', 'polite');
      section.append(el('div', { className: 'topic', id: `t${t.id}` },
        el('label', { className: 'topic-head', htmlFor: `a${t.id}` },
          el('span', { className: 'topic-num', textContent: String(t.id) }),
          ' ', // 화면 읽기 프로그램이 "3 에덴동산"으로 읽도록
          el('span', { id: `title-${t.id}`, textContent: t.title })),
        el('p', { className: 'presenter' }, '발표 ', el('span', { id: `presenter-${t.id}`, textContent: t.presenter })),
        area,
        status));

      const chip = el('button', { type: 'button', className: 'chip', id: `c${t.id}`, textContent: String(t.id) });
      chip.addEventListener('click', () =>
        $(`#t${t.id}`).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
      $('#chips').append(chip);
    }
    $('#topics').append(section);
  });
  for (let i = 0; i < N; i++) {
    markChip(i);
    refreshStatus(i);
  }
}

// 지난번에 보낸 내용과 다를 때만 10칸 전체를 보낸다. 한 번에 하나씩만 보낸다.
let sending = null;

async function sync(keepalive = false) {
  while (sending) {
    if (keepalive) {
      // 화면이 숨겨지는 중: 앞 전송을 기다리지 말고 지금 내용을 바로 한 번 더 보낸다.
      // 서버는 기기 시각이 가장 늦은 줄을 쓰므로 겹쳐 보내도 안전하다.
      if (snapshot(state.name, state.answers) !== state.sent) post(payload(), true).catch(() => {});
      return false;
    }
    await sending;
  }
  const snap = snapshot(state.name, state.answers);
  if (snap === state.sent) {
    for (let i = 0; i < N; i++) refreshStatus(i); // 보낸 내용으로 되돌린 칸의 문구도 바로잡는다
    return true;
  }
  const body = payload();
  const { answers } = body;
  sending = post(body, keepalive)
    .then((data) => {
      if (!data.ok) throw new Error(data.error);
      state.sent = snap;
      persist();
      answers.forEach((a, i) => {
        if (state.answers[i] === a) setStatus(i, a.trim() ? '제출됨 ✓' : '', 'ok');
      });
      return true;
    })
    .catch(() => {
      const prev = sentAnswers();
      state.answers.forEach((a, i) => {
        if (a !== (prev[i] ?? '')) setStatus(i, '전송 실패, 다시 시도할게요', 'error');
      });
      return false;
    })
    .finally(() => {
      sending = null;
    });
  return sending;
}

function route() {
  const admin = location.hash === '#admin';
  $('#participant').hidden = admin;
  $('#admin').hidden = !admin;
  if (admin) import('./admin.js').then((m) => m.openAdmin());
}

const nameInput = $('#name');
nameInput.value = state.name;
nameInput.addEventListener('input', () => {
  state.name = nameInput.value;
  persist();
});
nameInput.addEventListener('change', () => sync());

$('#submit').addEventListener('click', async () => {
  const msg = $('#submit-msg');
  if (!state.answers.some((a) => a.trim())) {
    msg.textContent = '아직 쓴 피드백이 없어요.';
    return;
  }
  msg.textContent = '보내는 중이에요...';
  msg.textContent = (await sync())
    ? '제출됐어요. 고치면 자동으로 다시 반영돼요.'
    : '보내지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sync(true);
});
window.addEventListener('online', () => sync());

// 같은 브라우저의 다른 탭이 저장하면 이 탭도 그 내용으로 맞춘다(옛 탭이 새 내용을 덮어쓰지 않게).
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || e.newValue === null) return;
  Object.assign(state, readSaved());
  nameInput.value = state.name;
  for (let i = 0; i < N; i++) {
    $(`#a${i + 1}`).value = state.answers[i];
    markChip(i);
    refreshStatus(i);
  }
});
window.addEventListener('hashchange', () => {
  route();
  window.scrollTo(0, 0); // 첫 로딩 때는 브라우저가 이전 스크롤 위치를 되살리게 둔다
});

renderParticipant();
$('#storage-warning').hidden = persist();
route();
fetch(`${window.API_URL}?action=topics`)
  .then((r) => r.json())
  .then((d) => d.ok && setTopicList(d.topics))
  .catch(() => {});
if (state.answers.some((a) => a.trim()) && snapshot(state.name, state.answers) !== state.sent) sync();
