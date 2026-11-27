'use strict';

/* =========================================================
   Poker Blind Timer — estado, timer, blinds, jogadores,
   premiação, histórico e backup.
   Tudo salvo no localStorage do navegador.
   ========================================================= */

const STORAGE_KEY = 'pokerBlindTimer.v1';
const CURRENCIES = ['R$', 'USD'];
const $ = (s) => document.querySelector(s);

// Mesa ao vivo: { mode: null } | { mode: 'host', code, secret } | { mode: 'viewer', code }
const SYNC_KEY = 'pokerBlindTimer.sync';
let sync = (() => {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || { mode: null }; } catch (e) { return { mode: null }; }
})();
let clockOffset = 0; // relógio do servidor − relógio deste aparelho (ms)

function defaultLevels() {
  const raw = [
    [100, 200], [100, 300], [200, 400], [200, 600], [300, 600],
    [300, 900], 'break', [500, 1000], [500, 1500], [1000, 2000], [1000, 3000],
    [2000, 4000], [2000, 6000], [3000, 6000], [4000, 8000], [5000, 10000],
  ];
  return raw.map((l) =>
    l === 'break'
      ? { isBreak: true, sb: 0, bb: 0, ante: 0, min: 10 }
      : { isBreak: false, sb: l[0], bb: l[1], ante: 0, min: 15 }
  );
}

function defaultSettings() {
  return {
    currency: 'R$',
    buyin: 10, rebuy: 5, addon: 5,
    chipsBuyin: 15000, chipsRebuy: 15000, chipsAddon: 10000,
    rebuyUntil: 6, maxRebuys: 0, maxAddons: 1,
    houseFee: 0,
    payouts: [50, 30, 20],
    pixKey: 'ce188bd1-fc70-4057-a5d4-e3e5129e06b2',
  };
}

function defaultState() {
  return {
    settings: defaultSettings(),
    prefs: { sound: true, shotClock: false, shotSecs: 30, notify: false },
    levels: defaultLevels(),
    timer: { level: 0, running: false, endAt: null, remainingMs: 15 * 60000 },
    players: [],
    outSeq: 0,
    dealer: null, // jogador sorteado para começar no botão: { id, name }
    savedStructures: [],
    history: [],
  };
}

let state = load();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.levels && saved.levels.length) {
      const d = defaultState();
      const s = {
        ...d, ...saved,
        settings: { ...d.settings, ...saved.settings },
        prefs: { ...d.prefs, ...saved.prefs },
        timer: { ...d.timer, ...saved.timer },
      };
      if (!CURRENCIES.includes(s.settings.currency)) s.settings.currency = 'R$';
      if (!Array.isArray(s.settings.payouts) || !s.settings.payouts.length) s.settings.payouts = [100];
      if (!Array.isArray(s.savedStructures)) s.savedStructures = [];
      if (!Array.isArray(s.history)) s.history = [];
      delete s.chipSet; // dados da calculadora de fichas (removida)
      delete s.chipCalc;
      return s;
    }
  } catch (e) { /* ignora estado corrompido */ }
  return defaultState();
}

function save() {
  if (sync.mode === 'viewer') {
    // Acompanhando outra mesa: não sobrescreve o torneio deste aparelho, só as preferências.
    try {
      const local = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      local.prefs = state.prefs;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
    } catch (e) { /* ignora */ }
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (sync.mode === 'host') schedulePush();
}

/* ---------------- Utilidades ---------------- */
const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const int = (v) => Math.floor(num(v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtNum = (n) => Number(n).toLocaleString(LOCALE());
const fmtMoneyC = (n, cur) =>
  `${cur} ${Number(n).toLocaleString(LOCALE(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtMoney = (n) => fmtMoneyC(n, state.settings.currency);
const fmtTime = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

/* ---------------- Confirmação / aviso (no lugar de confirm/alert do navegador) ---------------- */
function ask(text, { okText = tr('Confirmar'), cancel = true, cancelText = tr('Cancelar') } = {}) {
  return new Promise((resolve) => {
    const modal = $('#modal');
    $('#modalText').textContent = text;
    $('#modalOk').textContent = okText;
    $('#modalCancel').textContent = cancelText;
    $('#modalCancel').hidden = !cancel;
    modal.hidden = false;
    $('#modalOk').focus();
    const close = (result) => {
      modal.hidden = true;
      $('#modalOk').onclick = $('#modalCancel').onclick = modal.onclick = null;
      resolve(result);
    };
    $('#modalOk').onclick = () => close(true);
    $('#modalCancel').onclick = () => close(false);
    modal.onclick = (e) => { if (e.target === modal) close(false); };
  });
}
const notify = (text) => ask(text, { okText: 'OK', cancel: false });

/* ---------------- Abas ---------------- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'blinds') renderLevels();
  if (name === 'history') renderHistory();
}
document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

/* ---------------- Som / vibração ---------------- */
let audioCtx = null;
function unlockAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('pointerdown', unlockAudio);

function beep(times = 1, freq = 880, dur = 0.18) {
  if (!state.prefs.sound) return;
  if (navigator.vibrate) navigator.vibrate(times > 1 ? [300, 150, 300, 150, 300] : 200);
  if (!audioCtx) return;
  for (let i = 0; i < times; i++) {
    const t0 = audioCtx.currentTime + i * (dur + 0.12);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}

/* ---------------- Manter tela ligada ---------------- */
let wakeLock = null;
async function setWakeLock(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* não suportado ou negado */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (state.timer.running || isTv()) setWakeLock(true);
    tick();
  }
});

/* ---------------- Níveis: utilidades ---------------- */
const T = () => state.timer;
const levelMs = (i) => Math.max(1, num(state.levels[i]?.min || 1)) * 60000;
const remaining = () => (T().running ? T().endAt - Date.now() : T().remainingMs);
// Número do nível "jogável" (intervalos não contam). Num intervalo, devolve o nível anterior.
const levelNumberAt = (i) => state.levels.slice(0, i + 1).filter((l) => !l.isBreak).length;

function levelName(i) {
  const lv = state.levels[i];
  if (!lv) return '';
  return lv.isBreak ? tr('Intervalo') : tr('Nível {n}', { n: levelNumberAt(i) });
}
// Nome do nível sempre em português, para guardar nos dados (é traduzido na hora de mostrar)
function levelNamePt(i) {
  const lv = state.levels[i];
  if (!lv) return '';
  return lv.isBreak ? 'Intervalo' : `Nível ${levelNumberAt(i)}`;
}

// Tempo de torneio já jogado (soma dos níveis passados + o que já correu do atual; pausas não contam)
function elapsedMs() {
  let ms = 0;
  for (let i = 0; i < T().level; i++) ms += levelMs(i);
  return ms + levelMs(T().level) - Math.max(0, remaining());
}

// Quanto falta até o próximo intervalo (null se não houver mais intervalos)
function nextBreakMs() {
  let ms = Math.max(0, remaining());
  for (let k = T().level + 1; k < state.levels.length; k++) {
    if (state.levels[k].isBreak) return ms;
    ms += levelMs(k);
  }
  return null;
}

/* ---------------- Regras de rebuy / add-on ---------------- */
function rebuyOpen() {
  const until = state.settings.rebuyUntil;
  return !until || levelNumberAt(T().level) <= until;
}
// Intervalo em que o add-on é liberado: o primeiro intervalo depois do fim do rebuy
function addonBreakIndex() {
  const until = state.settings.rebuyUntil;
  return state.levels.findIndex((l, i) => l.isBreak && levelNumberAt(i) >= until);
}
const addonEnabled = () => state.settings.addon > 0 || state.settings.chipsAddon > 0;

/* ---------------- Timer ---------------- */
let warnedLevel = -1;
let seenLevel = null; // último nível visto, para notificar quando mudar

function clampLevel() {
  if (T().level > state.levels.length - 1) {
    T().level = Math.max(0, state.levels.length - 1);
    T().remainingMs = levelMs(T().level);
    if (T().running) T().endAt = Date.now() + T().remainingMs;
  }
}

function start() {
  if (remaining() <= 0) T().remainingMs = levelMs(T().level);
  T().endAt = Date.now() + T().remainingMs;
  T().running = true;
  setWakeLock(true);
  save(); renderTimer();
}

function pause() {
  T().remainingMs = Math.max(0, remaining());
  T().running = false;
  T().endAt = null;
  setWakeLock(false);
  save(); renderTimer();
}

function goTo(i) {
  T().level = Math.min(Math.max(0, i), state.levels.length - 1);
  T().remainingMs = levelMs(T().level);
  if (T().running) T().endAt = Date.now() + T().remainingMs;
  warnedLevel = -1;
  save(); renderTimer(); renderLevels(); renderPlayers();
}

function tick() {
  const t = T();
  if (t.running) {
    let rem = remaining();
    // Aviso de 1 minuto
    if (rem <= 60000 && rem > 0 && warnedLevel !== t.level && levelMs(t.level) > 60000) {
      warnedLevel = t.level;
      beep(1, 660);
      if (document.visibilityState !== 'visible') {
        const nx = state.levels[t.level + 1];
        if (nx) sendNotification(tr('⏳ Falta 1 minuto'), tr('Depois: {x}', { x: levelDesc(t.level + 1) }));
      }
    }
    if (rem <= 0) {
      let changed = false;
      // Avança níveis (inclusive se o app ficou em segundo plano)
      while (rem <= 0 && t.level < state.levels.length - 1) {
        t.level++;
        t.endAt += levelMs(t.level);
        rem = t.endAt - Date.now();
        changed = true;
      }
      if (rem <= 0) {
        // Fim da estrutura
        t.running = false; t.endAt = null; t.remainingMs = 0;
        setWakeLock(false);
      }
      if (changed) {
        beep(3, 1000);
        renderLevels(); renderPlayers();
      }
      save();
    }
  }
  // Mudou de nível (aqui ou, na mesa ao vivo, no celular que transmite): avisa se o app está em segundo plano
  if (seenLevel !== null && t.level > seenLevel && document.visibilityState !== 'visible') {
    sendNotification(tr('🔔 {level} começou', { level: levelName(t.level) }), levelDesc(t.level));
  }
  seenLevel = t.level;
  renderTimer();
  tickShot();
}

// Descrição curta de um nível, para as notificações
function levelDesc(i) {
  const lv = state.levels[i];
  if (!lv) return '';
  if (lv.isBreak) return tr('☕ Intervalo de {min} min', { min: lv.min });
  return `Blinds ${fmtNum(lv.sb)} / ${fmtNum(lv.bb)}${lv.ante ? ` · ante ${fmtNum(lv.ante)}` : ''}`;
}

function renderTimer() {
  const t = T();
  const lv = state.levels[t.level];
  const rem = remaining();
  const total = levelMs(t.level);

  setText($('#levelLabel'), levelName(t.level));
  setText($('#clock'), fmtTime(rem));
  $('#clock').classList.toggle('warning', rem <= 60000 && rem > 0 && t.running);
  $('#clock').classList.toggle('paused', !t.running);
  $('#progressBar').style.width = `${Math.min(100, Math.max(0, (1 - rem / total) * 100))}%`;

  if (lv.isBreak) {
    $('#blindsNow').style.visibility = 'hidden';
    setText($('#anteNow'), tr('☕ Pausa'));
  } else {
    $('#blindsNow').style.visibility = 'visible';
    setText($('#sbNow'), fmtNum(lv.sb));
    setText($('#bbNow'), fmtNum(lv.bb));
    setText($('#anteNow'), lv.ante ? `Ante ${fmtNum(lv.ante)}` : '');
  }

  const nx = state.levels[t.level + 1];
  setText($('#nextLevel'), !nx
    ? tr('Último nível')
    : nx.isBreak
      ? tr('Próximo: Intervalo ({min} min)', { min: nx.min })
      : `${tr('Próximo:')} ${fmtNum(nx.sb)} / ${fmtNum(nx.bb)}${nx.ante ? ` (ante ${fmtNum(nx.ante)})` : ''}`);

  // Próximo intervalo + tempo de torneio
  const nb = lv.isBreak ? null : nextBreakMs();
  const parts = [];
  if (nb !== null) parts.push(tr('☕ Intervalo em {time}', { time: fmtTime(nb) }));
  parts.push(tr('⏱ Torneio {time}', { time: fmtTime(elapsedMs()) }));
  setText($('#infoLine'), parts.join('   ·   '));

  // Situação do rebuy / add-on
  const badge = $('#rebuyStatus');
  let status = '';
  let cls = '';
  if (t.level === addonBreakIndex() && addonEnabled()) { status = tr('➕ Hora do add-on!'); cls = 'addon'; }
  else if (state.settings.rebuyUntil) {
    if (rebuyOpen()) { status = tr('🔁 Rebuy aberto até o nível {n}', { n: state.settings.rebuyUntil }); cls = 'open'; }
    else { status = tr('🔒 Rebuy encerrado'); cls = 'closed'; }
  }
  badge.hidden = !status;
  setText(badge, status);
  badge.className = `status-badge ${cls}`;

  const dealerOn = !!state.dealer && t.level === 0;
  $('#dealerBadge').hidden = !dealerOn;
  if (dealerOn) setText($('#dealerBadge'), tr('🔘 Começa no botão: {name}', { name: state.dealer.name }));

  setText($('#playBtn'), t.running ? tr('⏸ Pausar') : (rem < total && rem > 0 ? tr('▶ Continuar') : tr('▶ Iniciar')));
  $('#playBtn').classList.toggle('primary', !t.running);

  const title = `${fmtTime(rem)} · ${lv.isBreak ? tr('Intervalo') : `${fmtNum(lv.sb)}/${fmtNum(lv.bb)}`}`;
  if (document.title !== title) document.title = title;
  renderAvgStack();
}

$('#playBtn').addEventListener('click', () => (T().running ? pause() : start()));
$('#nextBtn').addEventListener('click', () => goTo(T().level + 1));
$('#prevBtn').addEventListener('click', () => goTo(T().level - 1));
$('#resetLevelBtn').addEventListener('click', () => goTo(T().level));

/* ---------------- Som / tela cheia ---------------- */
function renderToggles() {
  $('#soundBtn').textContent = tr(state.prefs.sound ? '🔊 Som' : '🔇 Som');
  $('#soundBtn').classList.toggle('off', !state.prefs.sound);
  $('#fullscreenBtn').hidden = !fsSupported();
  $('#fullscreenBtn').textContent = tr(fsElement() ? '⛶ Sair da tela cheia' : '⛶ Tela cheia');
  const notifOn = !!state.prefs.notify && notifPermission() === 'granted';
  $('#notifyBtn').textContent = tr(notifOn ? '🔔 Avisos' : '🔕 Avisos');
  $('#notifyBtn').classList.toggle('off', !notifOn);
  const tv = isTv();
  document.documentElement.classList.toggle('tv', tv);
  document.documentElement.classList.toggle('fs', !!fsElement() || tv);
  $('#tvBar').hidden = !tv;
  $('#tvFsBtn').hidden = !fsSupported();
  $('#tvFsBtn').textContent = tr(fsElement() ? '⛶ Sair da tela cheia' : '⛶ Tela cheia');
}

/* ---------------- Avisos por notificação ----------------
   Avisa 1 minuto antes de o blind subir e quando o nível muda, se o app estiver em segundo plano
   (outro app aberto ou tela apagada). Depende do celular deixar o app rodando em segundo plano. */
const notifPermission = () => ('Notification' in window ? Notification.permission : 'unsupported');

async function sendNotification(title, body) {
  if (!state.prefs.notify || notifPermission() !== 'granted') return;
  const opts = {
    body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: 'sushis-poker-blind', renotify: true, vibrate: [300, 120, 300],
  };
  try {
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(title, opts); return; }
  } catch (e) { /* tenta do jeito simples abaixo */ }
  try { new Notification(title, opts); } catch (e) { /* não suportado */ }
}

async function toggleNotify() {
  if (state.prefs.notify && notifPermission() === 'granted') {
    state.prefs.notify = false;
    save(); renderToggles();
    return;
  }
  if (notifPermission() === 'unsupported') {
    return notify(tr('Este navegador não mostra notificações. No iPhone, primeiro adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e ligue os avisos abrindo o app por lá.'));
  }
  let perm = notifPermission();
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return notify(tr('As notificações estão bloqueadas para este site. Libere nas configurações do navegador (permissões do site → Notificações) e toque em "Avisos" de novo.'));
  }
  state.prefs.notify = true;
  save(); renderToggles();
  sendNotification(tr('🔔 Avisos ligados'), tr('Você será avisado 1 minuto antes de o blind subir e quando o nível mudar.'));
}
$('#notifyBtn').addEventListener('click', toggleNotify);
$('#soundBtn').addEventListener('click', () => {
  state.prefs.sound = !state.prefs.sound;
  save(); renderToggles();
  if (state.prefs.sound) beep(1);
});

const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function toggleFullscreen() {
  const el = document.documentElement;
  if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    showTab('timer');
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) Promise.resolve(req.call(el)).catch(() => {});
  }
}
$('#fullscreenBtn').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', renderToggles);
document.addEventListener('webkitfullscreenchange', renderToggles);

// Atalhos de teclado (desktop): espaço = play/pause, setas = níveis, F = tela cheia
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (!$('#modal').hidden) return;
  if (!$('#tab-timer').classList.contains('active')) return;
  if (sync.mode === 'viewer' && e.code !== 'KeyF') return;
  if (e.code === 'Space') { e.preventDefault(); $('#playBtn').click(); }
  if (e.code === 'ArrowRight') goTo(T().level + 1);
  if (e.code === 'ArrowLeft') goTo(T().level - 1);
  if (e.code === 'KeyF') toggleFullscreen();
});

/* ---------------- Estrutura de blinds ---------------- */
function renderLevels() {
  const body = $('#levelsBody');
  let n = 0;
  body.innerHTML = state.levels.map((lv, i) => {
    const cur = i === T().level ? ' current' : '';
    if (lv.isBreak) {
      return `<tr class="break-row${cur}" data-i="${i}">
        <td>☕</td>
        <td colspan="3" class="break-label">${tr('Intervalo')}</td>
        <td><input type="number" min="1" data-f="min" value="${lv.min}" inputmode="numeric"></td>
        <td><button class="btn icon" data-del="${i}" title="${tr('Remover')}">✕</button></td>
      </tr>`;
    }
    n++;
    return `<tr class="${cur}" data-i="${i}">
      <td>${n}</td>
      <td><input type="number" min="0" data-f="sb" value="${lv.sb}" inputmode="numeric"></td>
      <td><input type="number" min="0" data-f="bb" value="${lv.bb}" inputmode="numeric"></td>
      <td><input type="number" min="0" data-f="ante" value="${lv.ante}" inputmode="numeric"></td>
      <td><input type="number" min="1" data-f="min" value="${lv.min}" inputmode="numeric"></td>
      <td><button class="btn icon" data-del="${i}" title="${tr('Remover')}">✕</button></td>
    </tr>`;
  }).join('');
}

$('#levelsBody').addEventListener('change', (e) => {
  const input = e.target.closest('input[data-f]');
  if (!input) return;
  const i = +input.closest('tr').dataset.i;
  const f = input.dataset.f;
  let v = num(input.value);
  if (f === 'min') v = Math.max(1, v);
  // Nível atual ainda não começou? Então a nova duração vale para o timer também
  const notStarted = i === T().level && !T().running && T().remainingMs === levelMs(i);
  state.levels[i][f] = v;
  // Se o small ficou maior que o big, sugere big = 2x small
  if (f === 'sb' && state.levels[i].bb < v) state.levels[i].bb = v * 2;
  if (f === 'min' && notStarted) T().remainingMs = levelMs(i);
  save(); renderLevels(); renderTimer();
});

$('#levelsBody').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (!del) return;
  if (state.levels.length <= 1) return notify(tr('A estrutura precisa ter pelo menos um nível.'));
  const i = +del.dataset.del;
  state.levels.splice(i, 1);
  if (i < T().level) T().level--;
  clampLevel();
  save(); renderLevels(); renderTimer(); renderPlayers();
});

$('#addLevelBtn').addEventListener('click', () => {
  const last = [...state.levels].reverse().find((l) => !l.isBreak);
  const sb = last ? last.bb : 25;
  state.levels.push({ isBreak: false, sb, bb: sb * 2, ante: last ? last.ante : 0, min: num($('#defaultMin').value) || 15 });
  save(); renderLevels(); renderTimer();
});

$('#addBreakBtn').addEventListener('click', () => {
  state.levels.push({ isBreak: true, sb: 0, bb: 0, ante: 0, min: 10 });
  save(); renderLevels(); renderTimer();
});

$('#applyMinBtn').addEventListener('click', () => {
  const m = Math.max(1, num($('#defaultMin').value));
  state.levels.forEach((l) => { if (!l.isBreak) l.min = m; });
  if (!T().running && !state.levels[T().level].isBreak) T().remainingMs = levelMs(T().level);
  save(); renderLevels(); renderTimer();
});

function useLevels(levels) {
  state.levels = JSON.parse(JSON.stringify(levels));
  state.timer = { level: 0, running: false, endAt: null, remainingMs: levelMs(0) };
  warnedLevel = -1;
  setWakeLock(false);
  save(); renderLevels(); renderTimer(); renderPlayers();
}

$('#resetLevelsBtn').addEventListener('click', async () => {
  if (!await ask(tr('Restaurar a estrutura de blinds padrão? O timer volta para o nível 1.'))) return;
  useLevels(defaultLevels());
});

/* ---------------- Estruturas salvas ---------------- */
function renderStructures() {
  const list = state.savedStructures;
  $('#structuresList').innerHTML = list.length
    ? list.map((s) => {
      const n = s.levels.filter((l) => !l.isBreak).length;
      const b = s.levels.length - n;
      return `<div class="simple-item">
        <div><b>${escapeHtml(s.name)}</b><div class="muted">${tr('{n} níveis', { n })}${b ? ` · ${tr(b > 1 ? '{b} intervalos' : '{b} intervalo', { b })}` : ''}</div></div>
        <div class="pactions">
          <button class="btn small" data-load="${s.id}">${tr('Usar')}</button>
          <button class="btn icon small" data-sdel="${s.id}" title="${tr('Apagar')}">🗑</button>
        </div>
      </div>`;
    }).join('')
    : `<p class="empty">${tr('Nenhuma estrutura salva.')}</p>`;
}

$('#saveStructureForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#structureName').value.trim();
  if (!name) return;
  const existing = state.savedStructures.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!await ask(tr('Já existe uma estrutura chamada "{name}". Substituir?', { name: existing.name }))) return;
    existing.levels = JSON.parse(JSON.stringify(state.levels));
  } else {
    state.savedStructures.push({ id: uid(), name, levels: JSON.parse(JSON.stringify(state.levels)) });
  }
  $('#structureName').value = '';
  save(); renderStructures();
});

$('#structuresList').addEventListener('click', async (e) => {
  const load = e.target.closest('[data-load]');
  const del = e.target.closest('[data-sdel]');
  if (load) {
    const s = state.savedStructures.find((x) => x.id === load.dataset.load);
    if (s && await ask(tr('Usar a estrutura "{name}"? A estrutura atual será substituída e o timer volta para o nível 1.', { name: s.name }))) useLevels(s.levels);
  }
  if (del) {
    const s = state.savedStructures.find((x) => x.id === del.dataset.sdel);
    if (s && await ask(tr('Apagar a estrutura "{name}"?', { name: s.name }))) {
      state.savedStructures = state.savedStructures.filter((x) => x !== s);
      save(); renderStructures();
    }
  }
});

/* ---------------- Valores e regras ---------------- */
const settingInputs = {
  currency: '#currency', buyin: '#valBuyin', rebuy: '#valRebuy', addon: '#valAddon',
  chipsBuyin: '#chipsBuyin', chipsRebuy: '#chipsRebuy', chipsAddon: '#chipsAddon',
  rebuyUntil: '#rebuyUntil', maxRebuys: '#maxRebuys', maxAddons: '#maxAddons',
  houseFee: '#houseFee',
};
const intSettings = ['rebuyUntil', 'maxRebuys', 'maxAddons'];

function fillSettings() {
  for (const [key, sel] of Object.entries(settingInputs)) $(sel).value = state.settings[key];
  renderPayouts();
}

for (const [key, sel] of Object.entries(settingInputs)) {
  const el = $(sel);
  el.addEventListener('input', () => {
    let v;
    if (key === 'currency') v = el.value;
    else if (intSettings.includes(key)) v = int(el.value);
    else v = num(el.value);
    if (key === 'houseFee') v = Math.min(100, v);
    state.settings[key] = v;
    save(); renderPlayers(); renderTimer();
  });
}

$('#resetSettingsBtn').addEventListener('click', async () => {
  if (!await ask(tr('Voltar moeda, valores, fichas, regras e premiação para o padrão? Os jogadores continuam, mas o pote é recalculado com os novos valores.'))) return;
  state.settings = defaultSettings();
  fillSettings();
  save(); renderPlayers(); renderTimer();
});

/* ---------------- Premiação ---------------- */
const prizePool = (t = totals()) => t.pot * (1 - Math.min(100, state.settings.houseFee) / 100);
const prizeFor = (place, pool) => (pool * (state.settings.payouts[place - 1] || 0)) / 100;

function renderPayouts() {
  $('#payoutsList').innerHTML = state.settings.payouts.map((pct, i) => `
    <div class="payout-row">
      <span class="place">${ord(i + 1)}</span>
      <input type="number" min="0" max="100" step="0.5" data-pi="${i}" value="${pct}" inputmode="decimal">
      <span class="muted">%</span>
      <span class="amount" data-pa="${i}"></span>
    </div>`).join('');
  updatePrizeAmounts();
}

function updatePrizeAmounts(t = totals()) {
  const pool = prizePool(t);
  const s = state.settings;
  s.payouts.forEach((_, i) => {
    const el = document.querySelector(`[data-pa="${i}"]`);
    if (el) el.textContent = fmtMoney(prizeFor(i + 1, pool));
  });
  const fee = t.pot - pool;
  $('#prizePoolInfo').innerHTML = `${tr('Valor para prêmios:')} <b>${fmtMoney(pool)}</b>${fee > 0 ? ` <span class="muted">${tr('(taxa da casa: {fee})', { fee: fmtMoney(fee) })}</span>` : ''}`;
  const sum = Math.round(s.payouts.reduce((a, b) => a + b, 0) * 100) / 100;
  const el = $('#payoutSum');
  el.textContent = sum === 100 ? tr('Total: 100% ✔') : tr('Total: {sum}% — precisa somar 100%', { sum: fmtNum(sum) });
  el.classList.toggle('bad', sum !== 100);
}

$('#payoutsList').addEventListener('input', (e) => {
  const input = e.target.closest('[data-pi]');
  if (!input) return;
  state.settings.payouts[+input.dataset.pi] = Math.min(100, num(input.value));
  save(); renderPlayers();
});
$('#addPlaceBtn').addEventListener('click', () => {
  state.settings.payouts.push(0);
  save(); renderPayouts(); renderPlayers();
});
$('#removePlaceBtn').addEventListener('click', () => {
  if (state.settings.payouts.length <= 1) return;
  state.settings.payouts.pop();
  save(); renderPayouts(); renderPlayers();
});

/* ---------------- Jogadores ---------------- */
const playerTotal = (p) =>
  p.buyins * state.settings.buyin + p.rebuys * state.settings.rebuy + p.addons * state.settings.addon;

function totals() {
  const s = state.settings;
  const t = { buyins: 0, rebuys: 0, addons: 0, alive: 0 };
  state.players.forEach((p) => {
    t.buyins += p.buyins; t.rebuys += p.rebuys; t.addons += p.addons;
    if (!p.out) t.alive++;
  });
  t.pot = t.buyins * s.buyin + t.rebuys * s.rebuy + t.addons * s.addon;
  t.chips = t.buyins * s.chipsBuyin + t.rebuys * s.chipsRebuy + t.addons * s.chipsAddon;
  return t;
}

// Posição de cada jogador eliminado (o último a cair fica com a melhor posição).
// Se sobrar só um jogador, ele é o 1º.
function placings() {
  const alive = state.players.filter((p) => !p.out);
  const out = state.players.filter((p) => p.out).sort((a, b) => (b.outOrder || 0) - (a.outOrder || 0));
  const map = new Map();
  out.forEach((p, i) => map.set(p.id, alive.length + i + 1));
  if (alive.length === 1 && state.players.length > 1) map.set(alive[0].id, 1);
  return map;
}

// Stack médio e quantos big blinds ele representa (no intervalo, usa o BB do próximo nível)
function renderAvgStack(t = totals()) {
  const el = $('#avgStack');
  if (!t.alive || !t.chips) { setText(el, '–'); return; }
  const avg = Math.round(t.chips / t.alive);
  const lv = state.levels.slice(T().level).find((l) => !l.isBreak && l.bb > 0);
  const bbs = lv ? `<span class="bbs">${fmtNum(Math.round((avg / lv.bb) * 10) / 10)} BB</span>` : '';
  const html = fmtNum(avg) + bbs;
  if (el.innerHTML !== html) el.innerHTML = html;
}

function counter(p, field, label, canInc = true) {
  return `<div class="counter">
    <span class="clbl">${label}</span>
    <button class="btn icon small" data-act="dec" data-f="${field}" data-id="${p.id}">−</button>
    <span class="cval">${p[field]}</span>
    <button class="btn icon small" data-act="inc" data-f="${field}" data-id="${p.id}"${canInc ? '' : ' disabled'}>+</button>
  </div>`;
}

function renderPlayers() {
  const s = state.settings;
  const t = totals();
  const pool = prizePool(t);
  const places = placings();
  const open = rebuyOpen();

  // Vivos primeiro (ordem de cadastro), depois eliminados pela posição
  const sorted = [...state.players].sort((a, b) => {
    if (a.out !== b.out) return a.out ? 1 : -1;
    return a.out ? places.get(a.id) - places.get(b.id) : 0;
  });

  $('#playersList').innerHTML = sorted.map((p) => {
    const place = places.get(p.id);
    const prize = place ? prizeFor(place, pool) : 0;
    const canRebuy = open && (!s.maxRebuys || p.rebuys < s.maxRebuys);
    const canAddon = !p.out && (!s.maxAddons || p.addons < s.maxAddons);
    let info = '';
    if (p.out) info = `<div class="pplace">${tr('{place} lugar', { place: ord(place) })}${p.outLevel ? ` · ${escapeHtml(trLevel(p.outLevel))}` : ''}${prize ? ` · 🏆 ${fmtMoney(prize)}` : ''}</div>`;
    else if (place === 1) info = `<div class="pplace win">${tr('🏆 Campeão')} · ${fmtMoney(prize)}</div>`;
    return `
    <div class="player${p.out ? ' out' : ''}">
      <div>
        <div class="pname">${escapeHtml(p.name)}</div>
        <div class="ptotal">${tr('Pagou {v}', { v: fmtMoney(playerTotal(p)) })}</div>
        ${info}
      </div>
      <div class="pactions">
        <button class="btn small" data-act="out" data-id="${p.id}">${tr(p.out ? 'Voltar' : 'Eliminar')}</button>
        <button class="btn icon small" data-act="del" data-id="${p.id}" title="${tr('Remover')}">🗑</button>
      </div>
      <div class="counters">
        ${counter(p, 'buyins', 'Buy-in')}
        ${counter(p, 'rebuys', 'Rebuy', canRebuy)}
        ${counter(p, 'addons', 'Add-on', canAddon)}
      </div>
    </div>`;
  }).join('');
  $('#playersEmpty').style.display = state.players.length ? 'none' : 'block';

  $('#potTotal').textContent = fmtMoney(t.pot);
  $('#potBreakdown').innerHTML = `
    <span>Buy-ins: <b>${t.buyins}</b> (${fmtMoney(t.buyins * s.buyin)})</span>
    <span>Rebuys: <b>${t.rebuys}</b> (${fmtMoney(t.rebuys * s.rebuy)})</span>
    <span>Add-ons: <b>${t.addons}</b> (${fmtMoney(t.addons * s.addon)})</span>
    <span>${tr('Fichas em jogo:')} <b>${fmtNum(t.chips)}</b></span>`;

  updatePrizeAmounts(t);
  renderResults(places, pool);

  // Resumo na tela do timer
  $('#potTimer').textContent = fmtMoney(t.pot);
  $('#playersTimer').textContent = `${t.alive} / ${state.players.length}`;
  renderAvgStack(t);
  renderPotRanking(t);
  renderDealer();
}

/* ---------------- Sorteio de quem começa no botão ---------------- */
function renderDealer() {
  const alive = state.players.filter((p) => !p.out);
  $('#dealerDraw').hidden = state.players.length < 2;
  $('#drawDealerBtn').textContent = tr(state.dealer ? '🎲 Sortear de novo' : '🎲 Sortear quem começa no botão');
  $('#drawDealerBtn').disabled = alive.length < 2;
  $('#dealerResult').innerHTML = state.dealer
    ? `${tr('🔘 Começa no botão:')} <b>${escapeHtml(state.dealer.name)}</b>`
    : '';
}

// Número aleatório justo (crypto) entre 0 e n-1
function randomIndex(n) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n;
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

let drawing = false;
async function drawDealer() {
  if (drawing) return;
  const alive = state.players.filter((p) => !p.out);
  if (alive.length < 2) return notify(tr('Cadastre pelo menos 2 jogadores para sortear.'));
  const winner = alive[randomIndex(alive.length)];

  // Animação: os nomes vão passando cada vez mais devagar até parar no sorteado
  drawing = true;
  const modal = $('#drawModal');
  const nameEl = $('#drawName');
  $('#drawOk').hidden = true;
  nameEl.classList.remove('done');
  modal.hidden = false;
  const steps = 18 + randomIndex(alive.length);
  let i = randomIndex(alive.length);
  for (let k = 0; k < steps; k++) {
    nameEl.textContent = alive[i % alive.length].name;
    i++;
    if (state.prefs.sound) beep(1, 520, 0.03);
    await new Promise((r) => setTimeout(r, 50 + k * k * 0.9));
  }
  nameEl.textContent = winner.name;
  nameEl.classList.add('done');
  if (state.prefs.sound) beep(2, 1000);

  state.dealer = { id: winner.id, name: winner.name };
  save(); renderDealer(); renderTimer();
  drawing = false;
  $('#drawOk').hidden = false;
  $('#drawOk').focus();
}
$('#drawDealerBtn').addEventListener('click', drawDealer);
$('#drawOk').addEventListener('click', () => { $('#drawModal').hidden = true; });

// Tabela da tela do timer: o que cada jogador colocou no pote, de quem colocou mais para quem colocou menos.
// Empate no valor = mesma posição (ex.: 1º, 1º, 3º).
function renderPotRanking(t = totals()) {
  const card = $('#potRankingCard');
  card.hidden = !state.players.length;
  if (!state.players.length) return;
  const rows = state.players
    .map((p) => ({ p, total: playerTotal(p) }))
    .sort((a, b) => b.total - a.total || a.p.name.localeCompare(b.p.name, LOCALE()));
  let pos = 0;
  $('#potRankingBody').innerHTML = rows.map(({ p, total }, i) => {
    if (i === 0 || total !== rows[i - 1].total) pos = i + 1;
    const rank = ord(pos);
    return `<tr class="${p.out ? 'out' : ''}">
      <td class="c rank">${rank}</td>
      <td class="pname-cell">${escapeHtml(p.name)}${p.out ? ` <span class="muted">${tr('(fora)')}</span>` : ''}</td>
      <td class="c">${p.buyins}</td>
      <td class="c">${p.rebuys}</td>
      <td class="c">${p.addons}</td>
      <td class="r money">${fmtMoney(total)}</td>
    </tr>`;
  }).join('');
  $('#potRankingFoot').innerHTML = `<tr>
    <td></td>
    <td>Total</td>
    <td class="c">${t.buyins}</td>
    <td class="c">${t.rebuys}</td>
    <td class="c">${t.addons}</td>
    <td class="r money">${fmtMoney(t.pot)}</td>
  </tr>`;
}

function renderResults(places, pool) {
  const card = $('#resultsCard');
  const anyOut = state.players.some((p) => p.out);
  card.hidden = !anyOut;
  if (!anyOut) return;
  const alive = state.players.filter((p) => !p.out);
  const rows = state.players
    .filter((p) => places.has(p.id))
    .sort((a, b) => places.get(a.id) - places.get(b.id))
    .map((p) => {
      const place = places.get(p.id);
      const prize = prizeFor(place, pool);
      return `<div class="result-row${prize ? ' paid' : ''}">
        <span class="place">${place === 1 ? '🏆' : ord(place)}</span>
        <span class="rname">${escapeHtml(p.name)}${p.outLevel ? ` <span class="muted">· ${escapeHtml(trLevel(p.outLevel))}</span>` : ''}</span>
        <span class="amount">${prize ? fmtMoney(prize) : ''}</span>
      </div>`;
    });
  const inPlay = alive.length > 1
    ? `<div class="result-row inplay"><span class="place">—</span><span class="rname">${tr('Em jogo:')} ${alive.map((p) => escapeHtml(p.name)).join(', ')}</span><span></span></div>`
    : '';
  $('#resultsList').innerHTML = inPlay + rows.join('');
}

$('#addPlayerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#playerName').value.trim();
  if (!name) return;
  state.players.push({ id: uid(), name, buyins: 1, rebuys: 0, addons: 0, out: false });
  $('#playerName').value = '';
  $('#playerName').focus();
  save(); renderPlayers();
});

function setOut(p, out) {
  p.out = out;
  if (out) {
    state.outSeq = (state.outSeq || 0) + 1;
    p.outOrder = state.outSeq;
    p.outLevel = levelNamePt(T().level);
  } else {
    delete p.outOrder;
    delete p.outLevel;
  }
}

$('#playersList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.disabled) return;
  const p = state.players.find((x) => x.id === btn.dataset.id);
  if (!p) return;
  const { act, f } = btn.dataset;
  const aliveBefore = state.players.filter((x) => !x.out).length;
  if (act === 'inc') p[f]++;
  if (act === 'dec') p[f] = Math.max(0, p[f] - 1);
  if (act === 'out') setOut(p, !p.out);
  if (act === 'del') {
    if (!await ask(tr('Remover {name}?', { name: p.name }))) return;
    state.players = state.players.filter((x) => x !== p);
    if (state.dealer && state.dealer.id === p.id) state.dealer = null;
  }
  // Rebuy traz o jogador eliminado de volta ao jogo
  if (act === 'inc' && f === 'rebuys' && p.out) setOut(p, false);
  save(); renderPlayers();

  // Sobrou um só? Temos campeão.
  const alive = state.players.filter((x) => !x.out);
  if (act === 'out' && p.out && aliveBefore === 2 && alive.length === 1) {
    if (T().running) pause();
    beep(3, 1200);
    const open = await ask(tr('🏆 {name} venceu o torneio! Prêmio: {prize}', { name: alive[0].name, prize: fmtMoney(prizeFor(1, prizePool())) }),
      { okText: tr('💰 Acerto de contas'), cancelText: tr('Fechar') });
    if (open) openSettle();
  }
});

/* ---------------- Novo torneio + histórico ---------------- */
function buildHistoryEntry() {
  const t = totals();
  const pool = prizePool(t);
  const places = placings();
  const players = state.players.map((p) => {
    const place = places.get(p.id) || null;
    return {
      name: p.name, place,
      buyins: p.buyins, rebuys: p.rebuys, addons: p.addons,
      paid: playerTotal(p),
      prize: place ? prizeFor(place, pool) : 0,
    };
  }).sort((a, b) => (a.place || 0) - (b.place || 0));
  return {
    id: uid(),
    date: new Date().toISOString(),
    currency: state.settings.currency,
    pot: t.pot,
    prizePool: pool,
    level: levelNamePt(T().level),
    elapsedMs: elapsedMs(),
    players,
  };
}

$('#newTournamentBtn').addEventListener('click', async () => {
  const has = state.players.length > 0;
  const msg = has
    ? tr('Começar um novo torneio? O torneio atual será guardado no Histórico, os jogadores serão apagados e o timer volta ao nível 1. A estrutura de blinds e os valores são mantidos.')
    : tr('Começar um novo torneio? O timer volta ao nível 1.');
  if (!await ask(msg)) return;
  if (has) state.history.unshift(buildHistoryEntry());
  state.players = [];
  state.outSeq = 0;
  state.dealer = null;
  state.timer = { level: 0, running: false, endAt: null, remainingMs: levelMs(0) };
  warnedLevel = -1;
  setWakeLock(false);
  save(); renderPlayers(); renderTimer(); renderLevels(); renderHistory();
});

function renderHistory() {
  const list = state.history;
  $('#historyEmpty').style.display = list.length ? 'none' : 'block';
  $('#clearHistoryBtn').hidden = !list.length;
  $('#historyList').innerHTML = list.map((h) => {
    const date = new Date(h.date).toLocaleString(LOCALE(), { dateStyle: 'short', timeStyle: 'short' });
    const champ = h.players.find((p) => p.place === 1);
    const money = (n) => fmtMoneyC(n, h.currency);
    const rows = h.players.map((p) => `<tr>
        <td>${p.place ? ord(p.place) : tr('Em jogo')}</td>
        <td>${escapeHtml(p.name)}</td>
        <td class="r">${money(p.paid)}</td>
        <td class="r">${p.prize ? money(p.prize) : '–'}</td>
      </tr>`).join('');
    return `<details class="hist">
      <summary>
        <div><b>${date}</b> · ${tr('{n} jogadores · pote {pot}', { n: h.players.length, pot: money(h.pot) })}</div>
        <div class="muted">${champ ? `🏆 ${escapeHtml(champ.name)}` : tr('Sem campeão definido')} · ${tr('parou no {level}', { level: escapeHtml(trLevel(h.level)) })} · ${tr('{time} de jogo', { time: fmtTime(h.elapsedMs) })}</div>
      </summary>
      <div class="table-wrap"><table class="hist-table">
        <thead><tr><th>${tr('Pos.')}</th><th>${tr('Jogador')}</th><th class="r">${tr('Pagou')}</th><th class="r">${tr('Prêmio')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="row"><button class="btn small danger-outline" data-hdel="${h.id}">${tr('Apagar este torneio')}</button></div>
    </details>`;
  }).join('');
}

$('#historyList').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-hdel]');
  if (!del) return;
  if (!await ask(tr('Apagar este torneio do histórico?'))) return;
  state.history = state.history.filter((h) => h.id !== del.dataset.hdel);
  save(); renderHistory();
});

$('#clearHistoryBtn').addEventListener('click', async () => {
  if (!await ask(tr('Apagar todo o histórico de torneios? Não dá para desfazer.'))) return;
  state.history = [];
  save(); renderHistory();
});

/* ---------------- Backup por código (copiar e colar) ----------------
   O código carrega os próprios dados (comprimidos), então não precisa de internet nem servidor.
   Formato: "BT1" + dados comprimidos em base64 (ou "BT0" + sem compressão, em navegadores antigos). */
const SETTING_KEYS = ['currency', 'buyin', 'rebuy', 'addon', 'chipsBuyin', 'chipsRebuy', 'chipsAddon',
  'rebuyUntil', 'maxRebuys', 'maxAddons', 'houseFee', 'payouts', 'pixKey'];
const packLevels = (levels) => levels.map((l) => (l.isBreak ? [l.min] : [l.sb, l.bb, l.ante, l.min]));
const unpackLevels = (arr) => arr.map((a) => (a.length === 1
  ? { isBreak: true, sb: 0, bb: 0, ante: 0, min: num(a[0]) || 10 }
  : { isBreak: false, sb: num(a[0]), bb: num(a[1]), ante: num(a[2]), min: num(a[3]) || 15 }));

const toB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const canCompress = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const streamBytes = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

async function makeCode(includeHistory) {
  const data = {
    v: 1,
    l: packLevels(state.levels),
    s: SETTING_KEYS.map((k) => state.settings[k]),
    ss: state.savedStructures.map((s) => [s.name, packLevels(s.levels)]),
  };
  if (includeHistory) data.h = state.history;
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (canCompress) return 'BT1' + toB64(await streamBytes(bytes, new CompressionStream('deflate-raw')));
  return 'BT0' + toB64(bytes);
}

async function readCode(code) {
  code = code.replace(/\s+/g, '');
  const kind = code.slice(0, 3);
  let bytes = fromB64(code.slice(3));
  if (kind === 'BT1') {
    if (!canCompress) throw new Error('sem suporte');
    bytes = await streamBytes(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'BT0') throw new Error('prefixo');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (data.v !== 1 || !Array.isArray(data.l) || !data.l.length) throw new Error('formato');
  return data;
}

$('#exportBtn').addEventListener('click', async () => {
  const code = await makeCode($('#exportHistory').checked);
  $('#exportCode').value = code;
  $('#exportBox').hidden = false;
  $('#shareCodeBtn').hidden = !navigator.share;
  $('#exportCode').focus();
  $('#exportCode').select();
});

$('#copyCodeBtn').addEventListener('click', async () => {
  const code = $('#exportCode').value;
  let ok = false;
  try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {
    $('#exportCode').select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
  }
  const btn = $('#copyCodeBtn');
  btn.textContent = tr(ok ? '✔ Copiado!' : 'Selecione e copie manualmente');
  setTimeout(() => { btn.textContent = tr('📋 Copiar código'); }, 2000);
});

$('#shareCodeBtn').addEventListener('click', async () => {
  try { await navigator.share({ text: $('#exportCode').value }); } catch (e) { /* cancelado */ }
});

$('#importBtn').addEventListener('click', async () => {
  const code = $('#importCode').value.trim();
  if (!code) return notify(tr('Cole o código no campo acima.'));
  let data;
  try { data = await readCode(code); } catch (e) {
    return notify(tr('Código inválido. Confira se copiou o código inteiro, do começo (BT…) até o fim.'));
  }
  const importMsg = data.h
    ? 'Importar este código? A estrutura de blinds, os valores, as estruturas salvas e o histórico deste aparelho serão substituídos. Os jogadores do torneio atual continuam.'
    : 'Importar este código? A estrutura de blinds, os valores e as estruturas salvas deste aparelho serão substituídos. Os jogadores do torneio atual continuam.';
  if (!await ask(tr(importMsg))) return;
  const settings = defaultSettings();
  SETTING_KEYS.forEach((k, i) => { if (data.s && data.s[i] !== undefined && data.s[i] !== null) settings[k] = data.s[i]; });
  if (!CURRENCIES.includes(settings.currency)) settings.currency = 'R$';
  if (!Array.isArray(settings.payouts) || !settings.payouts.length) settings.payouts = [100];
  state.settings = settings;
  state.savedStructures = (data.ss || []).map(([name, lv]) => ({ id: uid(), name: String(name), levels: unpackLevels(lv) }));
  if (Array.isArray(data.h)) state.history = data.h;
  fillSettings();
  useLevels(unpackLevels(data.l));
  renderStructures(); renderHistory();
  $('#importCode').value = '';
  notify(tr('Código importado!'));
});

/* ---------------- Pix (código "copia e cola" / QR) ----------------
   Padrão BR Code do Banco Central, Pix estático sem valor definido. */
const emv = (id, value) => id + String(value.length).padStart(2, '0') + value;
const asciiUpper = (s, max) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim().slice(0, max);

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function pixPayload(key, name = 'SUSHIS POKER', city = 'BRASIL', { staticFlag = true } = {}) {
  const p = emv('00', '01')
    + (staticFlag ? emv('01', '11') : '')
    + emv('26', emv('00', 'br.gov.bcb.pix') + emv('01', key.trim()))
    + emv('52', '0000')
    + emv('53', '986')
    + emv('58', 'BR')
    + emv('59', name)
    + emv('60', city)
    + emv('62', emv('05', '***'))
    + '6304';
  return p + crc16(p);
}
const pokerPix = () => pixPayload(state.settings.pixKey, asciiUpper('Sushis Poker', 25), 'BRASIL');

/* ---------------- Acerto de contas ---------------- */
function openSettle() {
  $('#pixKeyInput').value = state.settings.pixKey;
  renderSettle();
  $('#settleSheet').hidden = false;
  document.body.classList.add('no-scroll');
}
function closeSettle() {
  $('#settleSheet').hidden = true;
  document.body.classList.remove('no-scroll');
}

function renderSettle() {
  const t = totals();
  const pool = prizePool(t);
  const places = placings();
  const alive = state.players.filter((p) => !p.out);

  // Aviso se o torneio ainda não acabou
  const warn = $('#settleWarning');
  if (!state.players.length) { warn.hidden = false; warn.textContent = tr('Nenhum jogador cadastrado ainda.'); }
  else if (alive.length > 1) { warn.hidden = false; warn.textContent = tr('⚠ O torneio ainda não terminou ({n} jogadores em jogo). Os prêmios abaixo podem mudar.', { n: alive.length }); }
  else warn.hidden = true;

  // QR Code + chave
  const key = state.settings.pixKey.trim();
  $('#pixKeyShow').textContent = key || tr('(nenhuma chave definida)');
  const qrBox = $('#pixQr');
  if (key && typeof qrcode === 'function') {
    const qr = qrcode(0, 'M');
    qr.addData(pokerPix());
    qr.make();
    qrBox.innerHTML = qr.createSvgTag(5, 3);
  } else qrBox.innerHTML = '';

  // 1. Quem paga quanto
  const paidCount = state.players.filter((p) => p.pixPaid).length;
  const paidSum = state.players.filter((p) => p.pixPaid).reduce((a, p) => a + playerTotal(p), 0);
  $('#settlePayList').innerHTML = state.players.map((p) => `
    <label class="settle-row${p.pixPaid ? ' done' : ''}">
      <input type="checkbox" data-pay="${p.id}"${p.pixPaid ? ' checked' : ''}>
      <span class="sname">${escapeHtml(p.name)}</span>
      <span class="sval">${fmtMoney(playerTotal(p))}</span>
    </label>`).join('');
  $('#settlePayTotal').innerHTML = tr('Recebido: <b>{paid}</b> de {pot} · {n}/{total} pagaram', { paid: fmtMoney(paidSum), pot: fmtMoney(t.pot), n: paidCount, total: state.players.length });

  // 2. Prêmios
  const winners = state.players
    .filter((p) => places.has(p.id) && prizeFor(places.get(p.id), pool) > 0)
    .sort((a, b) => places.get(a.id) - places.get(b.id));
  const pending = state.settings.payouts.length - winners.length;
  let html = winners.map((p) => {
    const place = places.get(p.id);
    return `<label class="settle-row${p.prizeSent ? ' done' : ''}">
      <input type="checkbox" data-sent="${p.id}"${p.prizeSent ? ' checked' : ''}>
      <span class="sname">${place === 1 ? '🏆' : ord(place)} ${escapeHtml(p.name)}</span>
      <span class="sval">${fmtMoney(prizeFor(place, pool))}</span>
    </label>`;
  }).join('');
  if (pending > 0 && alive.length > 1) html += `<p class="hint">${tr('{n} prêmio(s) ainda sem dono: são definidos quando os jogadores forem eliminados.', { n: pending })}</p>`;
  $('#settlePrizeList').innerHTML = html || `<p class="hint">${tr('Nenhum prêmio definido ainda.')}</p>`;
  const sent = winners.filter((p) => p.prizeSent).reduce((a, p) => a + prizeFor(places.get(p.id), pool), 0);
  const fee = t.pot - pool;
  $('#settlePrizeTotal').innerHTML = tr('Enviado: <b>{sent}</b> de {pool}', { sent: fmtMoney(sent), pool: fmtMoney(pool) }) + (fee > 0 ? tr(' · taxa da casa: {fee}', { fee: fmtMoney(fee) }) : '');
}

async function copyText(text, btn, label) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
  }
  btn.textContent = tr(ok ? '✔ Copiado!' : 'Não consegui copiar');
  setTimeout(() => { btn.textContent = tr(label); }, 2000);
}

$('#openSettleBtn').addEventListener('click', openSettle);
$('#closeSettleBtn').addEventListener('click', closeSettle);
$('#settleSheet').addEventListener('click', (e) => { if (e.target.id === 'settleSheet') closeSettle(); });
$('#copyPixKeyBtn').addEventListener('click', (e) => copyText(state.settings.pixKey.trim(), e.currentTarget, '📋 Copiar chave'));
$('#copyPixCodeBtn').addEventListener('click', (e) => copyText(pokerPix(), e.currentTarget, '📋 Pix copia e cola'));
$('#pixKeyInput').addEventListener('change', (e) => {
  state.settings.pixKey = e.target.value.trim();
  save(); renderSettle();
});
$('#settleSheet').addEventListener('change', (e) => {
  const box = e.target.closest('[data-pay], [data-sent]');
  if (!box) return;
  if (sync.mode === 'viewer') { renderSettle(); return; }
  const p = state.players.find((x) => x.id === (box.dataset.pay || box.dataset.sent));
  if (!p) return;
  if (box.dataset.pay) p.pixPaid = box.checked;
  else p.prizeSent = box.checked;
  save(); renderSettle();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#settleSheet').hidden) closeSettle(); });

/* ---------------- Ranking de mãos ---------------- */
const HANDS = [
  ['Royal Flush', 'A, K, Q, J e 10 do mesmo naipe', 'A♠ K♠ Q♠ J♠ 10♠'],
  ['Straight Flush', '5 cartas em sequência do mesmo naipe', '9♥ 8♥ 7♥ 6♥ 5♥'],
  ['Quadra', '4 cartas do mesmo valor', 'K♣ K♦ K♥ K♠ 3♦'],
  ['Full House', 'Uma trinca + um par', 'Q♠ Q♥ Q♦ 7♣ 7♠'],
  ['Flush', '5 cartas do mesmo naipe, fora de sequência', 'A♦ J♦ 8♦ 6♦ 2♦'],
  ['Sequência (Straight)', '5 cartas em sequência, naipes misturados', '10♣ 9♦ 8♠ 7♥ 6♣'],
  ['Trinca', '3 cartas do mesmo valor', '7♠ 7♥ 7♦ K♣ 2♠'],
  ['Dois Pares', 'Dois pares diferentes', 'J♣ J♦ 4♠ 4♥ A♣'],
  ['Um Par', '2 cartas do mesmo valor', 'A♠ A♦ 9♣ 6♥ 3♠'],
  ['Carta Alta', 'Nenhuma combinação: vale a carta mais alta', 'A♥ Q♣ 9♠ 6♦ 3♣'],
];
function renderHands() {
  $('#handsList').innerHTML = HANDS.map(([name, desc, cards]) => `
    <li class="hand">
      <div class="hand-text"><b>${tr(name)}</b><span class="muted">${tr(desc)}</span></div>
      <div class="cards">${cards.split(' ').map((c) => {
        const red = /[♥♦]/.test(c);
        return `<span class="card-mini${red ? ' red' : ''}">${c.slice(0, -1)}<i>${c.slice(-1)}</i></span>`;
      }).join('')}</div>
    </li>`).join('');
}

/* ---------------- Cronômetro de decisão (opcional) ---------------- */
let shot = { running: false, endAt: 0, warned: false };
const shotMs = () => Math.max(5, state.prefs.shotSecs || 30) * 1000;

function renderShotSettings() {
  $('#shotEnabled').checked = !!state.prefs.shotClock;
  $('#shotSecs').value = state.prefs.shotSecs || 30;
  $('#shotClock').hidden = !state.prefs.shotClock;
  renderShot();
}
function renderShot() {
  const left = shot.running ? Math.max(0, shot.endAt - Date.now()) : (shot.endAt ? 0 : shotMs());
  const secs = Math.ceil(left / 1000);
  setText($('#shotVal'), String(secs));
  setText($('#shotHint'), tr(shot.running ? 'toque para reiniciar' : (shot.endAt ? 'tempo esgotado' : 'toque para iniciar')));
  $('#shotBtn').classList.toggle('running', shot.running);
  $('#shotBtn').classList.toggle('danger', (shot.running && secs <= 10) || (!shot.running && !!shot.endAt));
}
function startShot() {
  shot = { running: true, endAt: Date.now() + shotMs(), warned: false };
  renderShot();
}
function stopShot() {
  shot = { running: false, endAt: 0, warned: false };
  renderShot();
}
function tickShot() {
  if (!shot.running) return;
  const left = shot.endAt - Date.now();
  if (!shot.warned && left <= 10000 && shotMs() > 10000) { shot.warned = true; beep(1, 660); }
  if (left <= 0) {
    shot.running = false;
    beep(3, 1200);
  }
  renderShot();
}
$('#shotBtn').addEventListener('click', startShot);
$('#shotStopBtn').addEventListener('click', stopShot);
$('#shotEnabled').addEventListener('change', (e) => {
  state.prefs.shotClock = e.target.checked;
  if (!e.target.checked) stopShot();
  save(); renderShotSettings();
});
$('#shotSecs').addEventListener('change', (e) => {
  state.prefs.shotSecs = Math.min(300, Math.max(5, int(e.target.value) || 30));
  save(); renderShotSettings();
});

/* ---------------- Mesa ao vivo (sincronizar celulares) ----------------
   Quem transmite ("host") envia o estado do torneio para /api/mesa a cada mudança.
   Quem acompanha ("viewer") busca o estado a cada 2 s e mostra tudo em modo somente leitura.
   O timer não é enviado a cada segundo: vai o horário em que o nível termina (no relógio do
   servidor), e cada celular calcula o tempo restante sozinho. */
const LIVE_API = '/api/mesa';
const CODE_OK = /^[A-HJ-NP-Z2-9]{5}$/;
let pushTimer = null;
let pushing = false;
let pushAgain = false;
let pushError = false;
let lastPushOk = 0;
let lastPollOk = 0;
let pollTimer = null;
let remoteV = -1;

const saveSync = () => localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
// Modo TV: acompanhando uma mesa, com timer e tabela em tela cheia e sem botões
const isTv = () => sync.mode === 'viewer' && !!sync.tv;
const liveLink = (code) => `${location.origin}${location.pathname}?mesa=${code}`;

async function liveApi(method, body, query = '') {
  const t0 = Date.now();
  const r = await fetch(LIVE_API + query, method === 'GET'
    ? { cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t1 = Date.now();
  let j = {};
  try { j = await r.json(); } catch (e) { /* resposta sem JSON */ }
  // Diferença entre o relógio deste aparelho e o do servidor
  if (j.now && t1 - t0 < 3000) clockOffset = j.now - (t0 + t1) / 2;
  if (!r.ok) throw Object.assign(new Error((j.error && tr(j.error)) || tr('Erro {s}', { s: r.status })), { status: r.status });
  return j;
}

function snapshot() {
  const s = JSON.parse(JSON.stringify({
    levels: state.levels, settings: state.settings, timer: state.timer,
    players: state.players, outSeq: state.outSeq, dealer: state.dealer,
  }));
  if (s.timer.running && s.timer.endAt) s.timer.endAt += clockOffset; // para o relógio do servidor
  return s;
}

function schedulePush(delay = 300) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, delay);
}

async function pushNow() {
  if (sync.mode !== 'host') return;
  if (pushing) { pushAgain = true; return; }
  pushing = true;
  try {
    await liveApi('POST', { action: 'update', code: sync.code, secret: sync.secret, state: snapshot() });
    lastPushOk = Date.now();
    pushError = false;
  } catch (e) {
    if (e.status === 404 || e.status === 403) {
      const code = sync.code;
      sync = { mode: null };
      saveSync(); renderLive();
      notify(tr('A transmissão da mesa {code} foi encerrada (o código expirou). Toque em "📡 Ao vivo" para transmitir de novo.', { code }));
    } else {
      pushError = true;
      schedulePush(5000); // tenta de novo
    }
  } finally {
    pushing = false;
    if (pushAgain) { pushAgain = false; schedulePush(); }
    renderLiveStatus();
  }
}

async function startHost() {
  try {
    const j = await liveApi('POST', { action: 'create' });
    sync = { mode: 'host', code: j.code, secret: j.secret };
    saveSync();
    await pushNow();
    renderLive();
  } catch (e) {
    notify(e.status === 503
      ? tr('A mesa ao vivo ainda não está configurada no servidor (falta conectar o banco de dados na Vercel).')
      : tr('Não consegui criar a mesa ao vivo: {msg}', { msg: e.message }));
  }
}

async function stopHost() {
  if (!await ask(tr('Parar de transmitir a mesa {code}? Quem está acompanhando vai ser desconectado.', { code: sync.code }))) return;
  try { await liveApi('POST', { action: 'close', code: sync.code, secret: sync.secret }); } catch (e) { /* já encerrada */ }
  sync = { mode: null };
  saveSync(); renderLive();
}

async function joinTable(raw, { tv = false } = {}) {
  const code = String(raw || '').trim().toUpperCase();
  if (!CODE_OK.test(code)) return notify(tr('Código inválido. São 5 letras/números, como K7P2Q.'));
  if (sync.mode === 'host') {
    if (sync.code === code) return notify(tr('Esta é a mesa que você está transmitindo.'));
    if (!await ask(tr('Você está transmitindo a mesa {old}. Parar a transmissão e acompanhar a mesa {code}?', { old: sync.code, code }))) return;
    try { await liveApi('POST', { action: 'close', code: sync.code, secret: sync.secret }); } catch (e) { /* ok */ }
  }
  let j;
  try { j = await liveApi('GET', null, `?code=${code}`); } catch (e) {
    return notify(e.status === 404 ? tr('Mesa {code} não encontrada. Confira o código ou se a transmissão ainda está ativa.', { code }) : tr('Não consegui conectar: {msg}', { msg: e.message }));
  }
  sync = { mode: 'viewer', code, tv };
  saveSync();
  remoteV = -1;
  lastPollOk = Date.now();
  applyRemote(j);
  renderLive();
  closeLive();
  showTab('timer');
  schedulePoll(2000);
}

function leaveTable(message) {
  sync = { mode: null };
  saveSync();
  clearTimeout(pollTimer);
  remoteV = -1;
  state = load(); // volta para o torneio deste aparelho
  renderAll();
  renderLive();
  if (message) notify(message);
}

function applyRemote(j) {
  remoteV = j.v;
  const s = j.state;
  if (!s) return; // mesa criada, mas ainda sem dados
  state.levels = s.levels && s.levels.length ? s.levels : defaultLevels();
  state.settings = { ...defaultSettings(), ...s.settings };
  state.players = Array.isArray(s.players) ? s.players : [];
  state.outSeq = s.outSeq || 0;
  state.dealer = s.dealer || null;
  const t = { ...defaultState().timer, ...s.timer };
  if (t.running && t.endAt) t.endAt -= clockOffset; // para o relógio deste aparelho
  state.timer = t;
  renderAll();
}

function schedulePoll(delay) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, delay);
}

async function poll() {
  if (sync.mode !== 'viewer') return;
  try {
    const j = await liveApi('GET', null, `?code=${sync.code}&since=${remoteV}`);
    lastPollOk = Date.now();
    if (!j.unchanged) applyRemote(j);
    else remoteV = j.v;
  } catch (e) {
    if (e.status === 404) return leaveTable(tr('A mesa {code} foi encerrada.', { code: sync.code }));
  }
  renderLiveStatus();
  schedulePoll(document.visibilityState === 'visible' ? 2000 : 6000);
}

function renderAll() {
  clampLevel();
  fillSettings();
  renderLevels();
  renderStructures();
  renderPlayers();
  renderHistory();
  renderToggles();
  renderShotSettings();
  renderTimer();
  if (!$('#settleSheet').hidden) renderSettle();
}

function renderLiveStatus() {
  const ago = (t) => Math.round((Date.now() - t) / 1000);
  if (sync.mode === 'host') {
    const el = $('#hostStatus');
    if (pushError) { el.textContent = tr('⚠ Sem conexão: tentando enviar de novo…'); el.className = 'live-status center bad'; }
    else if (lastPushOk) { el.textContent = tr('✔ Sincronizado (última atualização há {s}s)', { s: ago(lastPushOk) }); el.className = 'live-status center ok'; }
    else { el.textContent = tr('Conectando…'); el.className = 'live-status center'; }
    $('#livePill').classList.toggle('offline', pushError);
  }
  if (sync.mode === 'viewer') {
    const off = Date.now() - lastPollOk > 8000;
    setText($('#viewerStatus'), off ? tr('· ⚠ sem conexão') : '');
    $('#livePill').classList.toggle('offline', off);
  }
}

function renderLive() {
  const mode = sync.mode;
  document.body.classList.toggle('viewer', mode === 'viewer');
  $('#liveNone').hidden = !!mode;
  $('#liveHost').hidden = mode !== 'host';
  $('#liveViewer').hidden = mode !== 'viewer';
  $('#viewerBanner').hidden = mode !== 'viewer';

  const pill = $('#livePill');
  pill.hidden = !mode;
  pill.textContent = mode === 'host' ? `${tr('● AO VIVO')} · ${sync.code}` : mode === 'viewer' ? `👀 ${sync.code}` : '';
  pill.classList.toggle('watching', mode === 'viewer');
  $('#liveBtn').classList.toggle('on', !!mode);

  if (mode === 'host') {
    $('#hostCode').textContent = sync.code;
    $('#shareLiveBtn').hidden = !navigator.share;
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'M');
      qr.addData(liveLink(sync.code));
      qr.make();
      $('#liveQr').innerHTML = qr.createSvgTag(5, 3);
    }
  }
  if (mode === 'viewer') {
    $('#viewerCode').textContent = sync.code;
    $('#viewerCode2').textContent = sync.code;
  }
  renderToggles();
  if (isTv()) { showTab('timer'); setWakeLock(true); }
  renderLiveStatus();
}

const openLive = () => { renderLive(); $('#liveSheet').hidden = false; document.body.classList.add('no-scroll'); };
const closeLive = () => { $('#liveSheet').hidden = true; document.body.classList.remove('no-scroll'); };

$('#liveBtn').addEventListener('click', openLive);
$('#livePill').addEventListener('click', openLive);
$('#closeLiveBtn').addEventListener('click', closeLive);
$('#liveSheet').addEventListener('click', (e) => { if (e.target.id === 'liveSheet') closeLive(); });
$('#hostBtn').addEventListener('click', startHost);
$('#stopHostBtn').addEventListener('click', stopHost);
$('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); joinTable($('#joinCode').value); });
$('#joinTvBtn').addEventListener('click', () => joinTable($('#joinCode').value, { tv: true }));
$('#copyTvLinkBtn').addEventListener('click', (e) => copyText(`${liveLink(sync.code)}&tv=1`, e.currentTarget, '📺 Copiar link do modo TV'));
$('#tvFsBtn').addEventListener('click', toggleFullscreen);
$('#tvExitBtn').addEventListener('click', () => {
  sync.tv = false;
  saveSync(); renderLive();
  if (fsElement()) toggleFullscreen();
});
$('#joinCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
const confirmLeave = async () => {
  if (await ask(tr('Sair da mesa {code}? Você volta para o torneio salvo neste aparelho.', { code: sync.code }))) { leaveTable(); closeLive(); }
};
$('#leaveBtn').addEventListener('click', confirmLeave);
$('#leaveBtn2').addEventListener('click', confirmLeave);
$('#copyLiveLinkBtn').addEventListener('click', (e) => copyText(liveLink(sync.code), e.currentTarget, '📋 Copiar link'));
$('#shareLiveBtn').addEventListener('click', async () => {
  try { await navigator.share({ title: tr("Sushi's Poker ao vivo"), text: tr('Acompanhe a mesa {code}:', { code: sync.code }), url: liveLink(sync.code) }); } catch (e) { /* cancelado */ }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#liveSheet').hidden) closeLive(); });

// Modo somente leitura: bloqueia qualquer edição dentro do conteúdo principal
const viewerBlocked = (el) => sync.mode === 'viewer' && el instanceof Element
  && el.closest('main') && !el.closest('.viewer-ok, summary');
['click', 'input', 'change', 'submit'].forEach((type) => {
  document.addEventListener(type, (e) => {
    if (!viewerBlocked(e.target)) return;
    e.stopImmediatePropagation();
    if (type === 'click' || type === 'submit') e.preventDefault();
  }, true);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (sync.mode === 'viewer') schedulePoll(0);
  if (sync.mode === 'host') schedulePush(0);
});

function startLive() {
  // Link de convite: ...?mesa=K7P2Q
  const params = new URLSearchParams(location.search);
  const invited = (params.get('mesa') || '').toUpperCase();
  const invitedTv = params.get('tv') === '1';
  if (invited) history.replaceState(null, '', location.pathname);

  renderLive();
  if (sync.mode === 'viewer') { lastPollOk = Date.now(); schedulePoll(0); }
  if (sync.mode === 'host') schedulePush(0);

  if (invited && sync.mode === 'viewer' && sync.code === invited) {
    if (invitedTv && !sync.tv) { sync.tv = true; saveSync(); renderLive(); }
  } else if (invited) joinTable(invited, { tv: invitedTv });
}

/* ---------------- Idioma (PT / EN) ---------------- */
function renderLangButtons() {
  document.querySelectorAll('.lang-btn').forEach((b) => {
    const on = b.dataset.lang === LANG;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
function setLang(lang) {
  if (lang === LANG) return;
  LANG = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ignora */ }
  translateStatic();
  renderAll();
  renderHands();
  renderLive();
  renderLangButtons();
}
document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

/* ---------------- Início ---------------- */
translateStatic();
renderLangButtons();
clampLevel();
fillSettings();
renderLevels();
renderStructures();
renderPlayers();
renderHistory();
renderToggles();
renderHands();
renderShotSettings();
startLive();
tick();
setInterval(tick, 250);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
