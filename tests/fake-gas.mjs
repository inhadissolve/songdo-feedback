// 테스트용 가짜 Apps Script 환경. Code.gs를 그대로 불러와 메모리 시트 위에서 실행한다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

// 시트 저장 흉내. hidden: 앞의 ' 를 숨김(구글 시트 기본), literal: 그대로 둠.
// 수식처럼 시작하는 글이 이스케이프 없이 오면 '#ERROR!'로 바꿔 테스트가 잡게 한다.
function cellStore(apostrophe) {
  return (v) => {
    if (typeof v !== 'string') return v;
    if (v.startsWith("'")) return apostrophe === 'hidden' ? v.slice(1) : v;
    return /^[=+\-@]/.test(v) ? '#ERROR!' : v;
  };
}

function makeSheet(store) {
  const rows = [];
  let maxRows = 1000;
  const range = (row, col, numRows, numCols) => ({
    setNumberFormat() {
      return this;
    },
    getValues: () =>
      Array.from({ length: numRows }, (_, i) =>
        Array.from({ length: numCols }, (_, j) => rows[row - 1 + i]?.[col - 1 + j] ?? '')),
    setValues(values) {
      values.forEach((r, i) =>
        r.forEach((v, j) => {
          rows[row - 1 + i] ??= [];
          rows[row - 1 + i][col - 1 + j] = store(v);
        }));
      return this;
    },
  });
  return {
    rows,
    getLastRow: () => rows.length,
    getMaxRows: () => maxRows,
    insertRowsAfter(row, count) { maxRows += count; return this; },
    appendRow(values) {
      rows.push(Array.from(values, store)); // vm 쪽 배열을 바깥 배열로 복사
      return this;
    },
    getRange: (a, b, c = 1, d = 1) => (typeof a === 'string' ? range(1, 1, 0, 0) : range(a, b, c, d)),
  };
}

export function loadServer({ pin = '123456', apostrophe = 'hidden' } = {}) {
  const store = cellStore(apostrophe);
  const sheets = new Map();
  const ss = {
    getSheetByName: (name) => sheets.get(name) ?? null,
    insertSheet: (name) => {
      const sheet = makeSheet(store);
      sheets.set(name, sheet);
      return sheet;
    },
  };
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'ADMIN_PIN' ? pin : null) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { sleep() {} },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  });
  vm.runInContext(CODE, ctx, { filename: 'Code.gs' });
  ctx.setup();
  return {
    sheet: (name) => sheets.get(name),
    setup: () => ctx.setup(),
    get: (params) => JSON.parse(ctx.doGet({ parameter: params }).text),
    post: (body) =>
      JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text),
  };
}
