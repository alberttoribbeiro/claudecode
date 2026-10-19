# Mentor do YouTube

Você digita o que quer aprender (ex.: "rebocar uma parede") e o app monta um curso completo:
várias etapas (materiais, preparação, passo a passo, técnicas, erros comuns, acabamento),
cada uma com as 3 melhores aulas encontradas no YouTube em português.

Não é um buscador de vídeos solto: as aulas são filtradas (sem Shorts, sem vídeos curtos demais),
ranqueadas por duração de aula, audiência e títulos didáticos, e não se repetem entre etapas.
Você marca o que já assistiu e acompanha o progresso.

## Como rodar

1. Crie uma chave da **YouTube Data API v3** no Google Cloud Console
   (projeto → ativar "YouTube Data API v3" → Credenciais → Criar chave de API).
2. Sirva a pasta com um servidor estático (a API não aceita `file://` de forma confiável):

   ```bash
   cd youtube-mentor
   npm start        # ou: python3 -m http.server 8080
   ```

3. Abra o endereço no navegador, cole a chave e clique em **Montar curso**.

A chave fica salva só no `localStorage` do seu navegador. Ela vai direto para o Google,
não passa por nenhum servidor próprio.

## Cota

A cota gratuita é de 10.000 unidades por dia. Cada curso faz 6 buscas (100 unidades cada)
mais uma consulta de detalhes, então dá para montar cerca de 15 cursos por dia.

## Testes

```bash
npm test
```

Os testes cobrem a lógica pura (`mentor.js`): leitura de duração, montagem do currículo,
filtro e ranking de vídeos, e cálculo de progresso. A chamada à API não é testada aqui,
porque depende de chave e rede.

## Arquivos

- `mentor.js` — lógica do currículo (sem rede)
- `app.js` — chamadas à YouTube Data API e interface
- `index.html`, `styles.css` — página
- `mentor.test.js` — testes com `node:test`
