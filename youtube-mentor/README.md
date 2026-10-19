# Mentor do YouTube

Você digita qualquer tema (ex.: "fazer bolo de cenoura", "rebocar uma parede", "criar um micro SaaS no Lovable")
e o app monta um curso em etapas, com as melhores aulas em português já escolhidas.

Como funciona:
1. Um modelo da Claude desenha as etapas do aprendizado do tema, com os termos de busca de quem é da área.
2. O app busca cada etapa no YouTube e descarta Shorts e vídeos curtos demais.
3. A Claude escolhe até 3 aulas por etapa e explica por que cada uma vale a pena.
4. Você marca as aulas assistidas e acompanha o progresso (salvo no navegador).

As chaves ficam no servidor, nunca no navegador.

## Como rodar

Você precisa de Node.js 18 ou mais novo.

1. Crie uma chave da **YouTube Data API v3** (Google Cloud Console → ativar a API → Credenciais → Criar chave de API).
2. (Opcional, recomendado) Crie uma chave da **API da Claude** em console.anthropic.com. Sem ela, o app usa só o ranking local, sem as justificativas da IA.
3. Inicie o servidor:

   ```bash
   cd youtube-mentor
   export YOUTUBE_API_KEY="sua-chave-do-youtube"
   export ANTHROPIC_API_KEY="sua-chave-da-claude"   # opcional
   npm start
   ```

4. Abra http://localhost:8080, digite um tema e clique em **Montar curso**.

Para mudar a porta, use `PORT=3000 npm start`.

## Custos

- **YouTube:** cota gratuita de 10.000 unidades por dia. Cada etapa gasta cerca de 101 unidades, então um curso de 6 etapas gasta uns 600. Temas já pesquisados ficam em cache na memória do servidor, enquanto ele estiver rodando.
- **Claude:** paga por uso. Um curso costuma custar centavos.

## Testes

```bash
npm test
```

Os testes não usam rede: as chamadas à YouTube e à Claude são simuladas.

## Arquivos

- `server.js`: servidor HTTP e rota `POST /api/course`
- `course.js`: planejamento das etapas, busca no YouTube e escolha das aulas
- `mentor.js`: lógica de duração, ranking e progresso (sem rede)
- `app.js`, `index.html`, `styles.css`: interface
- `*.test.js`: testes com `node:test`
