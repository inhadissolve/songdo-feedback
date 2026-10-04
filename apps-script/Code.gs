// 송도지구 발표 피드백 서버.
// 구글 시트 > 확장 프로그램 > Apps Script에 붙여넣고, README의 순서대로 배포한다.

// [id, 조, 주제, 발표자]. 주제와 발표자는 관리자 화면에서 바꾼다. 다른 모임용으로 복사할 때는 이 목록만 바꾼다.
const TOPICS = [
  ['1', '1조', '1조 발표', ''],
  ['2', '2조', '2조 발표', ''],
  ['3', '3조', '3조 발표', ''],
  ['4', '4조', '4조 발표', ''],
];
const N = TOPICS.length;

// 처음 한 번 실행한다. 다시 실행해도 이미 있는 데이터는 지우지 않는다.
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const topics = ss.getSheetByName('topics') || ss.insertSheet('topics');
  topics.getRange('A:D').setNumberFormat('@'); // 일반 텍스트: 숫자·날짜 자동 변환 막기
  if (topics.getLastRow() < 2) {
    topics.getRange(1, 1, 1, 4).setValues([['id', 'group', 'title', 'presenter']]);
    topics.getRange(2, 1, N, 4).setValues(TOPICS);
  }
  const feedback = ss.getSheetByName('feedback') || ss.insertSheet('feedback');
  feedback.getRange('A:' + String.fromCharCode(64 + 4 + N)).setNumberFormat('@'); // 4열 + 주제 수(N ≤ 22)
  if (feedback.getLastRow() < 1) {
    const header = ['receivedAt', 'clientTime', 'deviceId', 'name'];
    for (let i = 1; i <= N; i++) header.push('t' + i);
    feedback.getRange(1, 1, 1, header.length).setValues([header]);
  }
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  return json_(action === 'topics' ? { ok: true, topics: readTopics_() } : { ok: false, error: 'invalid' });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'invalid' });
  }
  return json_(handle_(req));
}

function handle_(req) {
  if (!req || typeof req !== 'object') return { ok: false, error: 'invalid' };
  if (req.action === 'feedback') return saveFeedback_(req);
  if (req.action === 'topics') return checkPin_(req.pin) || saveTopics_(req.titles, req.presenters);
  if (req.action === 'results') return checkPin_(req.pin) || { ok: true, topics: readTopics_(), entries: latestEntries_() };
  return { ok: false, error: 'invalid' };
}

// 맞으면 null, 틀리면 1초 쉬고 오류 응답(마구 대입하기 어렵게).
function checkPin_(pin) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (real && pin === real) return null;
  Utilities.sleep(1000);
  return { ok: false, error: 'pin' };
}

function isText_(v, max) {
  return typeof v === 'string' && v.length <= max;
}

function isList_(list, max) {
  return Array.isArray(list) && list.length === N && list.every((v) => isText_(v, max));
}

function saveFeedback_(r) {
  const valid =
    typeof r.deviceId === 'string' && /^[a-z0-9]{8,40}$/.test(r.deviceId) &&
    typeof r.clientTime === 'number' && isFinite(r.clientTime) &&
    isText_(r.name, 30) && isList_(r.answers, 3000);
  if (!valid) return { ok: false, error: 'invalid' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    sheet_('feedback').appendRow(
      [new Date().toISOString(), String(r.clientTime), r.deviceId, esc_(r.name)].concat(r.answers.map(esc_)));
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

// 주제는 필수(40자), 발표자는 비워도 된다(30자).
function saveTopics_(titles, presenters) {
  if (!isList_(titles, 40) || !isList_(presenters, 30) || titles.some((t) => !t.trim())) {
    return { ok: false, error: 'invalid' };
  }
  sheet_('topics').getRange(2, 3, N, 2).setValues(titles.map((t, i) => [esc_(t), esc_(presenters[i])]));
  return { ok: true };
}

function readTopics_() {
  return sheet_('topics').getRange(2, 1, N, 4).getValues().map((r) => ({
    id: Number(r[0]), group: unesc_(r[1]), title: unesc_(r[2]), presenter: unesc_(r[3]),
  }));
}

function latestEntries_() {
  const sh = sheet_('feedback');
  const count = sh.getLastRow() - 1;
  return count > 0 ? pickLatest_(sh.getRange(2, 1, count, 4 + N).getValues()) : [];
}

// 기기마다 기기 시각이 가장 늦은 줄 하나. 같으면 나중 줄. 다 빈 항목은 뺀다.
function pickLatest_(rows) {
  const byDevice = new Map();
  rows.forEach((r) => {
    const clientTime = Number(r[1]);
    const prev = byDevice.get(r[2]);
    if (!prev || clientTime >= prev.clientTime) {
      byDevice.set(r[2], { name: unesc_(r[3]), clientTime, answers: r.slice(4, 4 + N).map(unesc_) });
    }
  });
  return Array.from(byDevice.values())
    .filter((e) => e.answers.some((a) => a.trim()))
    .sort((a, b) => a.clientTime - b.clientTime);
}

// 시트가 수식으로 읽지 않도록 앞에 ' 를 붙이고, 읽을 때 뗀다.
function esc_(s) {
  return /^[=+\-@']/.test(s) ? "'" + s : s;
}

function unesc_(v) {
  const s = String(v);
  return /^'[=+\-@']/.test(s) ? s.slice(1) : s;
}

function sheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
