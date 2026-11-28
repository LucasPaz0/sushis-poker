'use strict';

/* =========================================================
   Idiomas: português (padrão) e inglês.
   Os textos ficam escritos em português no HTML e no app.js;
   em inglês, cada texto é trocado pela tradução deste dicionário.
   - tr('texto em português {x}', { x: valor }) traduz textos do app.js
   - translateStatic() traduz os textos fixos do HTML
   ========================================================= */

const LANG_KEY = 'pokerBlindTimer.lang';
let LANG = (() => {
  try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'pt'; } catch (e) { return 'pt'; }
})();
const LOCALE = () => (LANG === 'en' ? 'en-US' : 'pt-BR');

function tr(pt, vars) {
  let s = LANG === 'en' && Object.prototype.hasOwnProperty.call(EN, pt) ? EN[pt] : pt;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

// Posição: 1º, 2º… em português; 1st, 2nd, 3rd, 4th… em inglês
function ord(n) {
  if (LANG !== 'en') return `${n}º`;
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suf}`;
}

// Nomes de nível guardados nos dados (ex.: "Nível 3", "Intervalo") mostrados no idioma atual
function trLevel(s) {
  s = String(s || '');
  return LANG === 'en'
    ? s.replace(/^Nível (\d+)$/, 'Level $1').replace(/^Intervalo$/, 'Break')
    : s.replace(/^Level (\d+)$/, 'Nível $1').replace(/^Break$/, 'Intervalo');
}

// Textos fixos do HTML: guarda o original em português e troca conforme o idioma
const ORIGINAL_TEXT = new WeakMap();
function translateStatic() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let orig = ORIGINAL_TEXT.get(n);
    if (orig === undefined) {
      const key = n.nodeValue.trim();
      if (!key || !Object.prototype.hasOwnProperty.call(EN, key)) continue;
      orig = n.nodeValue;
      ORIGINAL_TEXT.set(n, orig);
    }
    const key = orig.trim();
    n.nodeValue = LANG === 'en' ? orig.replace(key, EN[key]) : orig;
  }
  for (const attr of ['placeholder', 'title']) {
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
      const store = `data-pt-${attr}`;
      if (!el.hasAttribute(store)) {
        const v = el.getAttribute(attr);
        if (!Object.prototype.hasOwnProperty.call(EN, v)) return;
        el.setAttribute(store, v);
      }
      const v = el.getAttribute(store);
      el.setAttribute(attr, LANG === 'en' ? EN[v] : v);
    });
  }
  document.documentElement.lang = LANG === 'en' ? 'en' : 'pt-BR';
}

const EN = {
  /* ---------- Abas e topo ---------- */
  'Jogadores': 'Players',
  'Histórico': 'History',
  '👀 Acompanhando a mesa': '👀 Watching table',
  '· somente leitura': '· read-only',
  'Sair': 'Leave',

  /* ---------- Timer ---------- */
  'Nível {n}': 'Level {n}',
  'Nível 1': 'Level 1',
  'Intervalo': 'Break',
  'Nível anterior': 'Previous level',
  'Reiniciar nível': 'Restart level',
  'Próximo nível': 'Next level',
  '▶ Iniciar': '▶ Start',
  '▶ Continuar': '▶ Resume',
  '⏸ Pausar': '⏸ Pause',
  'Pote': 'Pot',
  'Stack médio': 'Avg. stack',
  'Fichas na mesa': 'Chips on table',
  'Tocar para iniciar / reiniciar': 'Tap to start / restart',
  'Decisão': 'Decision',
  'toque para iniciar': 'tap to start',
  'toque para reiniciar': 'tap to restart',
  'tempo esgotado': "time's up",
  'Parar': 'Stop',
  '🔊 Som': '🔊 Sound',
  '🔇 Som': '🔇 Sound',
  '⛶ Tela cheia': '⛶ Fullscreen',
  '⛶ Sair da tela cheia': '⛶ Exit fullscreen',
  '🔔 Avisos': '🔔 Alerts',
  '🔕 Avisos': '🔕 Alerts',
  '📡 Ao vivo': '📡 Live',
  '☕ Pausa': '☕ Break',
  'Último nível': 'Last level',
  'Próximo: Intervalo ({min} min)': 'Next: Break ({min} min)',
  'Próximo:': 'Next:',
  '☕ Intervalo em {time}': '☕ Break in {time}',
  '⏱ Torneio {time}': '⏱ Tournament {time}',
  '➕ Hora do add-on!': '➕ Add-on time!',
  '🔁 Rebuy aberto até o nível {n}': '🔁 Rebuys open until level {n}',
  '🔒 Rebuy encerrado': '🔒 Rebuys closed',
  '🔘 Começa no botão: {name}': '🔘 Starts on the button: {name}',
  'Quem mais colocou no pote': 'Who put the most in the pot',
  'Jogador': 'Player',
  'Entradas (buy-ins)': 'Entries (buy-ins)',
  'Entrada': 'Buy-in',
  'No pote': 'In pot',
  '(fora)': '(out)',

  /* ---------- Avisos por notificação ---------- */
  '⏳ Falta 1 minuto': '⏳ 1 minute left',
  'Depois: {x}': 'Next: {x}',
  '🔔 {level} começou': '🔔 {level} started',
  '☕ Intervalo de {min} min': '☕ {min}-minute break',
  'Este navegador não mostra notificações. No iPhone, primeiro adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e ligue os avisos abrindo o app por lá.':
    "This browser can't show notifications. On iPhone, first add the app to your Home Screen (Share → Add to Home Screen) and turn on alerts by opening the app from there.",
  'As notificações estão bloqueadas para este site. Libere nas configurações do navegador (permissões do site → Notificações) e toque em "Avisos" de novo.':
    'Notifications are blocked for this site. Allow them in your browser settings (site permissions → Notifications) and tap "Alerts" again.',
  '🔔 Avisos ligados': '🔔 Alerts on',
  'Você será avisado 1 minuto antes de o blind subir e quando o nível mudar.':
    "You'll be alerted 1 minute before the blinds go up and when the level changes.",

  /* ---------- Blinds ---------- */
  'Estrutura de blinds': 'Blind structure',
  'Duração padrão (min)': 'Default length (min)',
  'Aplicar a todos os níveis': 'Apply to all levels',
  '+ Nível': '+ Level',
  '+ Intervalo': '+ Break',
  'Restaurar padrão': 'Restore default',
  'Remover': 'Remove',
  'A estrutura precisa ter pelo menos um nível.': 'The structure needs at least one level.',
  'Restaurar a estrutura de blinds padrão? O timer volta para o nível 1.':
    'Restore the default blind structure? The timer goes back to level 1.',
  'Estruturas salvas': 'Saved structures',
  'Salve a estrutura acima com um nome (ex.: "Torneio rápido") para usar de novo depois.':
    'Save the structure above with a name (e.g. "Quick tournament") to use it again later.',
  'Nome da estrutura': 'Structure name',
  'Salvar': 'Save',
  '{n} níveis': '{n} levels',
  '{b} intervalo': '{b} break',
  '{b} intervalos': '{b} breaks',
  'Usar': 'Use',
  'Apagar': 'Delete',
  'Nenhuma estrutura salva.': 'No saved structures.',
  'Já existe uma estrutura chamada "{name}". Substituir?': 'There is already a structure called "{name}". Replace it?',
  'Usar a estrutura "{name}"? A estrutura atual será substituída e o timer volta para o nível 1.':
    'Use the structure "{name}"? The current structure will be replaced and the timer goes back to level 1.',
  'Apagar a estrutura "{name}"?': 'Delete the structure "{name}"?',

  /* ---------- Jogadores: valores e regras ---------- */
  'Valores': 'Values',
  'Moeda': 'Currency',
  'R$ (Real)': 'R$ (Real)',
  'USD (Dólar)': 'USD (Dollar)',
  'Fichas buy-in': 'Buy-in chips',
  'Fichas rebuy': 'Rebuy chips',
  'Fichas add-on': 'Add-on chips',
  'Regras de rebuy e add-on': 'Rebuy and add-on rules',
  'Rebuy até o nível': 'Rebuys until level',
  'Máx. rebuys por jogador': 'Max rebuys per player',
  'Máx. add-ons por jogador': 'Max add-ons per player',
  '0 = sem limite. O rebuy fica liberado até o fim do nível escolhido (inclusive o intervalo logo depois). O add-on é anunciado no primeiro intervalo após o fim do rebuy.':
    '0 = no limit. Rebuys stay open until the end of the chosen level (including the break right after it). The add-on is announced at the first break after rebuys close.',
  'Restaurar valores padrão': 'Restore default values',
  'Voltar moeda, valores, fichas, regras e premiação para o padrão? Os jogadores continuam, mas o pote é recalculado com os novos valores.':
    'Reset currency, values, chips, rules and prizes to the defaults? Players are kept, but the pot is recalculated with the new values.',
  'Pote total': 'Total pot',
  'Fichas em jogo:': 'Chips in play:',

  /* ---------- Premiação ---------- */
  'Premiação': 'Prizes',
  'Taxa da casa (%)': 'House fee (%)',
  '+ Lugar pago': '+ Paid place',
  '− Lugar pago': '− Paid place',
  'Valor para prêmios:': 'Prize pool:',
  '(taxa da casa: {fee})': '(house fee: {fee})',
  'Total: 100% ✔': 'Total: 100% ✔',
  'Total: {sum}% — precisa somar 100%': 'Total: {sum}% — must add up to 100%',

  /* ---------- Jogadores ---------- */
  'Nome do jogador': 'Player name',
  'Adicionar': 'Add',
  'Nenhum jogador ainda.': 'No players yet.',
  '{place} lugar': '{place} place',
  '🏆 Campeão': '🏆 Champion',
  'Pagou {v}': 'Paid {v}',
  'Voltar': 'Bring back',
  'Eliminar': 'Eliminate',
  'Remover {name}?': 'Remove {name}?',
  '🏆 {name} venceu o torneio! Prêmio: {prize}': '🏆 {name} won the tournament! Prize: {prize}',
  'Fechar': 'Close',
  'Classificação': 'Standings',
  'Em jogo:': 'Still playing:',
  'Novo torneio': 'New tournament',
  'Começar um novo torneio? O torneio atual será guardado no Histórico, os jogadores serão apagados e o timer volta ao nível 1. A estrutura de blinds e os valores são mantidos.':
    'Start a new tournament? The current one will be saved to History, the players will be cleared and the timer goes back to level 1. The blind structure and values are kept.',
  'Começar um novo torneio? O timer volta ao nível 1.': 'Start a new tournament? The timer goes back to level 1.',

  /* ---------- Sorteio do botão ---------- */
  '🎲 Sortear quem começa no botão': '🎲 Draw who starts on the button',
  '🎲 Sortear de novo': '🎲 Draw again',
  '🔘 Começa no botão:': '🔘 Starts on the button:',
  'Cadastre pelo menos 2 jogadores para sortear.': 'Add at least 2 players to draw.',
  '🎲 Quem começa no botão': '🎲 Who starts on the button',

  /* ---------- Acerto de contas ---------- */
  'Acerto de contas': 'Settle up',
  'Use no final do torneio: todos fazem o Pix do que pagaram para a chave do poker e depois os prêmios são enviados a cada vencedor.':
    'Use it at the end of the tournament: everyone sends a Pix for what they paid to the poker key, then the prizes are sent to each winner.',
  '💰 Abrir acerto de contas': '💰 Open settle-up',
  '💰 Acerto de contas': '💰 Settle up',
  '1. Todos fazem o Pix do que pagaram': '1. Everyone sends a Pix for what they paid',
  'Chave Pix do poker': 'Poker Pix key',
  '📋 Copiar chave': '📋 Copy key',
  '📋 Pix copia e cola': '📋 Copy Pix code',
  'O QR Code não tem valor definido: cada um digita o próprio valor no app do banco.':
    "The QR code has no fixed amount: everyone types their own amount in their bank's app.",
  '2. Prêmios a enviar': '2. Prizes to send',
  'Alterar chave Pix': 'Change Pix key',
  'Chave Pix': 'Pix key',
  'Nenhum jogador cadastrado ainda.': 'No players added yet.',
  '⚠ O torneio ainda não terminou ({n} jogadores em jogo). Os prêmios abaixo podem mudar.':
    "⚠ The tournament isn't over yet ({n} players still in). The prizes below may change.",
  '(nenhuma chave definida)': '(no key set)',
  'Recebido: <b>{paid}</b> de {pot} · {n}/{total} pagaram': 'Received: <b>{paid}</b> of {pot} · {n}/{total} paid',
  '{n} prêmio(s) ainda sem dono: são definidos quando os jogadores forem eliminados.':
    '{n} prize(s) not decided yet: they are set as players are eliminated.',
  'Nenhum prêmio definido ainda.': 'No prizes decided yet.',
  'Enviado: <b>{sent}</b> de {pool}': 'Sent: <b>{sent}</b> of {pool}',
  ' · taxa da casa: {fee}': ' · house fee: {fee}',
  '✔ Copiado!': '✔ Copied!',
  'Não consegui copiar': "Couldn't copy",

  /* ---------- Extras ---------- */
  'Ranking de mãos': 'Hand rankings',
  'Da mais forte (1) para a mais fraca (10).': 'From strongest (1) to weakest (10).',
  'Empate na mesma mão: vence quem tiver a carta mais alta (o "kicker"). O Ás pode ser a carta mais baixa na sequência A-2-3-4-5.':
    'Tie with the same hand: the highest card (the "kicker") wins. The Ace can be the lowest card in the straight A-2-3-4-5.',
  'Cronômetro de decisão': 'Shot clock',
  'Opcional. Quando ligado, aparece na tela do timer um relógio para o jogador decidir a jogada. Toque nele para iniciar ou reiniciar.':
    'Optional. When on, a clock appears on the timer screen for a player to make their decision. Tap it to start or restart.',
  'Mostrar na tela do timer': 'Show on the timer screen',
  'Segundos': 'Seconds',
  'A, K, Q, J e 10 do mesmo naipe': 'A, K, Q, J and 10 of the same suit',
  '5 cartas em sequência do mesmo naipe': '5 cards in a row of the same suit',
  'Quadra': 'Four of a Kind',
  '4 cartas do mesmo valor': '4 cards of the same rank',
  'Uma trinca + um par': 'Three of a kind + a pair',
  '5 cartas do mesmo naipe, fora de sequência': '5 cards of the same suit, not in a row',
  'Sequência (Straight)': 'Straight',
  '5 cartas em sequência, naipes misturados': '5 cards in a row, mixed suits',
  'Trinca': 'Three of a Kind',
  '3 cartas do mesmo valor': '3 cards of the same rank',
  'Dois Pares': 'Two Pair',
  'Dois pares diferentes': 'Two different pairs',
  'Um Par': 'One Pair',
  '2 cartas do mesmo valor': '2 cards of the same rank',
  'Carta Alta': 'High Card',
  'Nenhuma combinação: vale a carta mais alta': 'No combination: the highest card plays',

  /* ---------- Histórico e backup ---------- */
  'Torneios anteriores': 'Past tournaments',
  'Cada vez que você toca em "Novo torneio", o torneio atual é guardado aqui.':
    'Every time you tap "New tournament", the current tournament is saved here.',
  'Nenhum torneio salvo ainda.': 'No saved tournaments yet.',
  'Apagar histórico': 'Clear history',
  'Em jogo': 'Playing',
  '{n} jogadores · pote {pot}': '{n} players · pot {pot}',
  'Sem campeão definido': 'No champion yet',
  'parou no {level}': 'stopped at {level}',
  '{time} de jogo': '{time} played',
  'Pos.': 'Pos.',
  'Pagou': 'Paid',
  'Prêmio': 'Prize',
  'Apagar este torneio': 'Delete this tournament',
  'Apagar este torneio do histórico?': 'Delete this tournament from history?',
  'Apagar todo o histórico de torneios? Não dá para desfazer.': "Delete the whole tournament history? This can't be undone.",
  'Backup / passar para outro aparelho': 'Backup / move to another device',
  'Gera um código com a estrutura de blinds, os valores e as estruturas salvas. Copie o código e cole no outro aparelho.':
    'Creates a code with the blind structure, the values and the saved structures. Copy the code and paste it on the other device.',
  'Incluir o histórico de torneios (o código fica maior)': 'Include the tournament history (the code gets longer)',
  'Gerar código': 'Generate code',
  '📋 Copiar código': '📋 Copy code',
  '📤 Compartilhar': '📤 Share',
  'Colar código de outro aparelho': 'Paste a code from another device',
  'Cole aqui o código (começa com BT)': 'Paste the code here (starts with BT)',
  'Importar código': 'Import code',
  'Selecione e copie manualmente': 'Select and copy it manually',
  'Cole o código no campo acima.': 'Paste the code in the field above.',
  'Código inválido. Confira se copiou o código inteiro, do começo (BT…) até o fim.':
    'Invalid code. Make sure you copied the whole code, from the start (BT…) to the end.',
  'Importar este código? A estrutura de blinds, os valores e as estruturas salvas deste aparelho serão substituídos. Os jogadores do torneio atual continuam.':
    "Import this code? This device's blind structure, values and saved structures will be replaced. The current tournament's players are kept.",
  'Importar este código? A estrutura de blinds, os valores, as estruturas salvas e o histórico deste aparelho serão substituídos. Os jogadores do torneio atual continuam.':
    "Import this code? This device's blind structure, values, saved structures and history will be replaced. The current tournament's players are kept.",
  'Código importado!': 'Code imported!',

  /* ---------- Mesa ao vivo e modo TV ---------- */
  '📡 Mesa ao vivo': '📡 Live table',
  'Transmita esta mesa para os outros celulares acompanharem ao vivo o timer, os blinds, o pote, os jogadores e a premiação. Quem acompanha só vê; os comandos ficam neste aparelho.':
    'Broadcast this table so other phones can follow the timer, blinds, pot, players and prizes live. Viewers can only watch; the controls stay on this device.',
  '📡 Transmitir esta mesa': '📡 Broadcast this table',
  'Acompanhar uma mesa': 'Watch a table',
  'Código (ex.: K7P2Q)': 'Code (e.g. K7P2Q)',
  'Acompanhar': 'Watch',
  'Mostra o timer e a tabela em tela cheia, sem botões, para deixar numa TV ou notebook':
    'Shows the timer and the table fullscreen, without buttons, to leave on a TV or laptop',
  '📺 Modo TV': '📺 TV mode',
  'Modo TV': 'TV mode',
  ': abra o site na TV ou no notebook, digite o código da mesa e toque em "Modo TV". A tela mostra o timer e a tabela do pote, e quem controla é o celular que transmite.':
    ': open the site on the TV or laptop, type the table code and tap "TV mode". The screen shows the timer and the pot table, and the broadcasting phone stays in control.',
  'Peça para o pessoal ler o QR Code com a câmera, ou abrir o app, tocar em "📡 Ao vivo" e digitar o código.':
    'Ask everyone to scan the QR code with their camera, or open the app, tap "📡 Live" and type the code.',
  '📋 Copiar link': '📋 Copy link',
  '📺 Copiar link do modo TV': '📺 Copy TV mode link',
  'Parar de transmitir': 'Stop broadcasting',
  'Você está acompanhando a mesa': 'You are watching table',
  '. Tudo é atualizado sozinho a cada 2 segundos.': '. Everything updates by itself every 2 seconds.',
  'Seu próprio torneio salvo neste aparelho não é alterado e volta quando você sair.':
    'Your own tournament saved on this device is not changed and comes back when you leave.',
  'Sair da mesa': 'Leave table',
  'Sair do modo TV': 'Exit TV mode',
  'Erro {s}': 'Error {s}',
  'Estado grande demais.': 'Data too large.',
  'Ação inválida.': 'Invalid action.',
  'Método não permitido.': 'Method not allowed.',
  'Erro interno.': 'Internal error.',
  'A transmissão da mesa {code} foi encerrada (o código expirou). Toque em "📡 Ao vivo" para transmitir de novo.':
    'The broadcast of table {code} has ended (the code expired). Tap "📡 Live" to broadcast again.',
  'A mesa ao vivo ainda não está configurada no servidor (falta conectar o banco de dados na Vercel).':
    "The live table isn't set up on the server yet (the database still needs to be connected on Vercel).",
  'Não consegui criar a mesa ao vivo: {msg}': "Couldn't create the live table: {msg}",
  'Parar de transmitir a mesa {code}? Quem está acompanhando vai ser desconectado.':
    'Stop broadcasting table {code}? Everyone watching will be disconnected.',
  'Código inválido. São 5 letras/números, como K7P2Q.': 'Invalid code. It has 5 letters/numbers, like K7P2Q.',
  'Esta é a mesa que você está transmitindo.': 'This is the table you are broadcasting.',
  'Você está transmitindo a mesa {old}. Parar a transmissão e acompanhar a mesa {code}?':
    'You are broadcasting table {old}. Stop broadcasting and watch table {code}?',
  'Mesa {code} não encontrada. Confira o código ou se a transmissão ainda está ativa.':
    'Table {code} not found. Check the code or whether the broadcast is still on.',
  'Não consegui conectar: {msg}': "Couldn't connect: {msg}",
  'A mesa {code} foi encerrada.': 'Table {code} has ended.',
  '⚠ Sem conexão: tentando enviar de novo…': '⚠ No connection: trying to send again…',
  '✔ Sincronizado (última atualização há {s}s)': '✔ Synced (last update {s}s ago)',
  'Conectando…': 'Connecting…',
  '· ⚠ sem conexão': '· ⚠ no connection',
  '● AO VIVO': '● LIVE',
  'Sair da mesa {code}? Você volta para o torneio salvo neste aparelho.':
    'Leave table {code}? You go back to the tournament saved on this device.',
  "Sushi's Poker ao vivo": "Sushi's Poker live",
  'Acompanhe a mesa {code}:': 'Follow table {code}:',

  /* ---------- Janelas ---------- */
  'Cancelar': 'Cancel',
  'Confirmar': 'Confirm',
};
