// API da "mesa ao vivo" (função serverless da Vercel).
//
//   POST /api/mesa {action:'create'}                      → { code, secret, now }
//   POST /api/mesa {action:'update', code, secret, state} → { v, now }
//   POST /api/mesa {action:'close',  code, secret}        → { ok }
//   GET  /api/mesa?code=XXXXX&since=V                     → { v, now, state } ou { v, now, unchanged }
//
// O estado fica no Upstash Redis (variáveis KV_REST_API_URL/TOKEN ou UPSTASH_REDIS_REST_URL/TOKEN,
// criadas pela Vercel ao conectar o banco). Só quem criou a mesa (tem o "secret") pode alterá-la.
// Cada mesa expira 24 h depois da última atualização.
// Sem banco configurado e fora da Vercel (teste local com serve.js), usa a memória do processo.

const crypto = require('crypto');

const TTL = 60 * 60 * 24;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const MAX_STATE = 200000;

const key = (code) => `mesa:${code}`;
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const newCode = () => Array.from(crypto.randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

const memory = new Map();
async function store(cmd) {
  const cfg = redisConfig();
  if (cfg) {
    const r = await fetch(cfg.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  }
  if (process.env.VERCEL) {
    const err = new Error('Banco de dados da mesa ao vivo não configurado.');
    err.status = 503;
    throw err;
  }
  // Fallback em memória (só para teste local)
  const [op, k, v, ...opts] = cmd;
  if (op === 'GET') return memory.has(k) ? memory.get(k) : null;
  if (op === 'DEL') return memory.delete(k) ? 1 : 0;
  if (op === 'SET') {
    if (opts.includes('NX') && memory.has(k)) return null;
    memory.set(k, v);
    return 'OK';
  }
  throw new Error('comando não suportado: ' + op);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (typeof req.body !== 'string') {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_STATE * 2) throw Object.assign(new Error('Requisição grande demais.'), { status: 413 });
    }
  }
  try { return raw ? JSON.parse(raw) : {}; } catch (e) {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function loadTable(code) {
  if (!CODE_RE.test(code || '')) throw Object.assign(new Error('Código de mesa inválido.'), { status: 400 });
  const raw = await store(['GET', key(code)]);
  if (!raw) throw Object.assign(new Error('Mesa não encontrada ou encerrada.'), { status: 404 });
  return JSON.parse(raw);
}

function checkSecret(table, secret) {
  const a = Buffer.from(table.h, 'hex');
  const b = Buffer.from(hash(secret), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw Object.assign(new Error('Sem permissão para alterar esta mesa.'), { status: 403 });
  }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const code = String((req.query && req.query.code) || url.searchParams.get('code') || '').toUpperCase();
      const sinceRaw = (req.query && req.query.since) ?? url.searchParams.get('since');
      const since = sinceRaw === null || sinceRaw === undefined || sinceRaw === '' ? NaN : Number(sinceRaw);
      const table = await loadTable(code);
      if (since === table.v) return send(res, 200, { v: table.v, now: Date.now(), unchanged: true });
      return send(res, 200, { v: table.v, now: Date.now(), state: table.state });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (body.action === 'create') {
        for (let i = 0; i < 8; i++) {
          const code = newCode();
          const secret = crypto.randomUUID();
          const ok = await store(['SET', key(code), JSON.stringify({ h: hash(secret), v: 0, state: null }), 'NX', 'EX', TTL]);
          if (ok === 'OK') return send(res, 200, { code, secret, now: Date.now() });
        }
        throw new Error('Não consegui gerar um código livre, tente de novo.');
      }

      const code = String(body.code || '').toUpperCase();
      const table = await loadTable(code);
      checkSecret(table, body.secret);

      if (body.action === 'update') {
        const json = JSON.stringify(body.state ?? null);
        if (json.length > MAX_STATE) return send(res, 413, { error: 'Estado grande demais.' });
        table.v += 1;
        table.state = body.state;
        await store(['SET', key(code), JSON.stringify(table), 'EX', TTL]);
        return send(res, 200, { v: table.v, now: Date.now() });
      }

      if (body.action === 'close') {
        await store(['DEL', key(code)]);
        return send(res, 200, { ok: true, now: Date.now() });
      }

      return send(res, 400, { error: 'Ação inválida.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Método não permitido.' });
  } catch (e) {
    return send(res, e.status || 500, { error: e.message || 'Erro interno.' });
  }
};
