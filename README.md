# Sushi's Poker ♠

Timer de blinds e controle de torneio da mesa **Sushi's Poker** — site + app instalável (PWA).

🔗 **No ar:** https://sushis-poker.vercel.app

## O que faz

- **Timer de blinds** com estrutura editável, intervalos, aviso de 1 minuto, tela cheia e tela sempre ligada
- **Jogadores**: buy-in, rebuy e add-on (com regras e limites), eliminações e classificação
- **Pote e premiação** com taxa da casa e porcentagem por lugar
- **Acerto de contas** no fim do torneio, com QR Code Pix (sem valor definido)
- **Mesa ao vivo**: um celular transmite e os outros acompanham pelo código ou QR Code
- **Histórico** de torneios, estruturas salvas e backup por código
- **Extras**: ranking de mãos e cronômetro de decisão (opcional)

## Estrutura

| Arquivo | Para quê |
|---|---|
| `index.html`, `styles.css`, `app.js` | O app (HTML/CSS/JS puro, sem build) |
| `sw.js`, `manifest.json`, `icons/` | PWA: funcionar offline e instalar no celular |
| `api/mesa.js` | Função serverless da Vercel da mesa ao vivo (usa Upstash Redis) |
| `vendor/qrcode.js` | Biblioteca de QR Code ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT) |
| `serve.js` | Servidor local para testes (não vai para o site) |

## Rodar localmente

```bash
node serve.js
```

Abra http://localhost:8080. A mesa ao vivo funciona localmente com um banco em memória.

## Publicar

```bash
npx vercel deploy --prod
```

A mesa ao vivo precisa do banco **Upstash Redis** conectado ao projeto na Vercel (variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`).
Ao alterar arquivos do app, aumente a versão do cache em `sw.js` para os celulares receberem a atualização.
