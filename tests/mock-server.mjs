// 로컬 확인용 서버: 정적 파일 + Code.gs(가짜 Apps Script 환경). 실행: node tests/mock-server.mjs
// /__fail?on=1 이면 피드백 전송을 실패시킨다(전송 실패 화면 확인용). /__fail?on=0 으로 되돌린다.
// /__delay?ms=3000 이면 피드백 응답을 늦춘다(Apps Script의 1~3초 응답 흉내). /__delay?ms=0 으로 되돌린다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServer } from './fake-gas.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};
const gas = loadServer({ pin: '123456' });
let failing = false;
let delayMs = 0;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, type, body) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  if (url.pathname === '/__fail') {
    failing = url.searchParams.get('on') === '1';
    return send(200, TYPES['.json'], JSON.stringify({ failing }));
  }
  if (url.pathname === '/__delay') {
    delayMs = Number(url.searchParams.get('ms')) || 0;
    return send(200, TYPES['.json'], JSON.stringify({ delayMs }));
  }
  if (url.pathname === '/config.js') return send(200, TYPES['.js'], "window.API_URL = '/api';");
  if (url.pathname === '/api') {
    if (req.method === 'GET') return send(200, TYPES['.json'], JSON.stringify(gas.get(Object.fromEntries(url.searchParams))));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (failing) return send(503, 'text/plain; charset=utf-8', 'failing');
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return send(200, TYPES['.json'], JSON.stringify(gas.post(Buffer.concat(chunks).toString('utf8'))));
  }
  let file;
  try {
    file = normalize(join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  } catch {
    return send(400, 'text/plain; charset=utf-8', 'bad request');
  }
  if (!file.startsWith(ROOT)) return send(403, 'text/plain; charset=utf-8', 'forbidden');
  try {
    send(200, TYPES[extname(file)] || 'application/octet-stream', await readFile(file));
  } catch {
    send(404, 'text/plain; charset=utf-8', 'not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`http://localhost:${PORT}  (관리자 비밀번호 123456)`));
