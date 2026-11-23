# Sushi's Poker ♠

🇺🇸 [English](#english) · 🇧🇷 [Português](#português)

**🔗 Live / No ar: https://sushis-poker.vercel.app**

---

## English

Blind timer and tournament manager for the **Sushi's Poker** table: a website and an installable app (PWA).

### What it does

- **Blind timer** with an editable structure, breaks, a 1-minute warning, fullscreen and keep-screen-on
- **Players**: buy-in, rebuy and add-on (with rules and limits), eliminations and standings
- **Pot and payouts** with a house fee and a percentage per place
- **Settle-up** at the end of the tournament, with a Pix QR code (no fixed amount)
- **Live table**: one phone broadcasts and the others follow with a code or QR code
- **History** of tournaments, saved structures and backup by code
- **Extras**: hand rankings and a decision timer (optional)

### Structure

| File | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app (plain HTML/CSS/JS, no build step) |
| `sw.js`, `manifest.json`, `icons/` | PWA: works offline and installs on your phone |
| `api/mesa.js` | Vercel serverless function for the live table (uses Upstash Redis) |
| `vendor/qrcode.js` | QR code library ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT) |
| `serve.js` | Local test server (not deployed) |

### Run locally

```bash
node serve.js
```

Open http://localhost:8080. The live table works locally with an in-memory store.

### Deploy

The repository is connected to Vercel: **every `git push` to `main` deploys the site automatically**.
You can also deploy by hand:

```bash
npx vercel deploy --prod
```

The live table needs an **Upstash Redis** database connected to the Vercel project (`KV_REST_API_URL` and `KV_REST_API_TOKEN` variables).
When you change app files, bump the cache version in `sw.js` so phones get the update.

---

## Português

Timer de blinds e controle de torneio da mesa **Sushi's Poker**: site e app instalável (PWA).

### O que faz

- **Timer de blinds** com estrutura editável, intervalos, aviso de 1 minuto, tela cheia e tela sempre ligada
- **Jogadores**: buy-in, rebuy e add-on (com regras e limites), eliminações e classificação
- **Pote e premiação** com taxa da casa e porcentagem por lugar
- **Acerto de contas** no fim do torneio, com QR Code Pix (sem valor definido)
- **Mesa ao vivo**: um celular transmite e os outros acompanham pelo código ou QR Code
- **Histórico** de torneios, estruturas salvas e backup por código
- **Extras**: ranking de mãos e cronômetro de decisão (opcional)

### Estrutura

| Arquivo | Para quê |
|---|---|
| `index.html`, `styles.css`, `app.js` | O app (HTML/CSS/JS puro, sem build) |
| `sw.js`, `manifest.json`, `icons/` | PWA: funcionar offline e instalar no celular |
| `api/mesa.js` | Função serverless da Vercel da mesa ao vivo (usa Upstash Redis) |
| `vendor/qrcode.js` | Biblioteca de QR Code ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT) |
| `serve.js` | Servidor local para testes (não vai para o site) |

### Rodar localmente

```bash
node serve.js
```

Abra http://localhost:8080. A mesa ao vivo funciona localmente com um banco em memória.

### Publicar

O repositório está ligado à Vercel: **todo envio (`git push`) para a branch `main` publica o site sozinho**.
Também dá para publicar na mão:

```bash
npx vercel deploy --prod
```

A mesa ao vivo precisa do banco **Upstash Redis** conectado ao projeto na Vercel (variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`).
Ao alterar arquivos do app, aumente a versão do cache em `sw.js` para os celulares receberem a atualização.
