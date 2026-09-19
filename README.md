# Aula Interativa + Caderno

Site de aulas de Física: slides interativos + um caderno de exercícios ao
lado, ambos com uma camada de tinta (caneta/tablet) para anotar por cima —
com suavização de traço, sensibilidade à pressão e rejeição de toque com a
mão quando uma caneta é detectada. Slides e cadernos podem ser gerados
automaticamente por um agente de IA a partir de material-fonte (PDF,
Markdown, texto), sem precisar abrir o Claude Code.

## Como usar o site

Abra `index.html` num navegador (ideal: servido por HTTP — veja
[Rodando localmente](#rodando-localmente) — para que a troca de aulas via
`fetch` funcione; `data/lessons/trabalho-energia` também está embutido no
HTML como aula padrão, então mesmo abrindo o arquivo diretamente
funciona uma aula).

Na barra superior:
- **Ícone de caderno** (topo esquerdo) — escolhe entre as aulas publicadas
  em `data/lessons/`.
- **Ícone de tema** — troca entre Aurora (escuro, padrão), Claro, Sépia e
  Alto contraste. A escolha fica salva no navegador.
- **Setas do teclado / toque nas bordas** — navega entre slides.
- **Lápis flutuante** (canto inferior esquerdo do slide) — liga o modo de
  anotar por cima do slide atual.
- **Ícone de caderno (topbar direita)** — abre o painel do caderno de
  exercícios, com página por exercício + páginas em branco.
- **Menus de exportar** (aula e caderno) — geram PDF (impressão nativa,
  pixel-exata) e PowerPoint (`.pptx`, um slide por imagem capturada), ambos
  já incluindo qualquer anotação feita à mão.

Desenho: quando uma caneta (Apple Pencil, caneta de mesa digitalizadora)
toca a tela, o app percebe (`pointerType === "pen"`) e passa a **ignorar
toques de dedo** automaticamente enquanto ela estiver ativa — dá pra apoiar
a mão na tela sem borrar o desenho. Isso pode ser desligado no botão "dedo"
do caderno se você quiser desenhar com o dedo mesmo.

## Estrutura do repositório

```
index.html, css/, js/        → o app em si (client-side puro, sem build)
data/manifest.json           → lista de aulas publicadas
data/lessons/<slug>/         → lesson.json (slides) + notebook.json (exercícios) de cada aula
conteudo/<slug>/             → material-fonte (PDF/.md/.txt) + config.json de cada aula a gerar
agent/                       → o agente de IA que lê conteudo/ e escreve data/lessons/
.github/workflows/           → automação (geração autônoma + publicação)
```

## Gerando uma aula nova (o agente autônomo)

Você não precisa rodar nada manualmente para publicar uma aula nova:

1. Crie uma pasta em `conteudo/<slug-da-aula>/` (ex.: `conteudo/leis-de-newton/`).
2. Coloque nela o material-fonte: um ou mais arquivos `.pdf`, `.md` ou
   `.txt` com o conteúdo que a aula deve cobrir.
3. Crie `conteudo/<slug-da-aula>/config.json`:
   ```json
   {
     "title": "Leis de Newton",
     "subject": "Física · Mecânica",
     "length": "medium"
   }
   ```
   `length` é o tamanho/robustez da aula: `"short"` (curta, só texto e
   diagramas simples), `"medium"` (com pequenas animações e 2-3
   exercícios interativos) ou `"long"` (robusta: muitas animações, slide de
   comparação, mapa mental de resumo e 5+ exercícios interativos).
4. Dê **push** para `main`. O workflow **"Gerar aula (agente autônomo)"**
   (`.github/workflows/generate-content.yml`) detecta a pasta nova/alterada,
   chama a API da Anthropic (modelo Claude Opus 5) pedindo os slides e o
   caderno seguindo o design do site, valida o formato e **commita** os
   arquivos gerados em `data/lessons/<slug>/` — tudo sozinho.
5. Assim que o commit sobe, o workflow **"Publicar no GitHub Pages"**
   republica o site automaticamente com a aula nova já disponível no menu.

Você também pode disparar a geração manualmente (sem precisar de push): na
aba **Actions** do repositório → **"Gerar aula (agente autônomo)"** → **Run
workflow**, informando a pasta (`slug`) e opcionalmente um `length` para
sobrescrever o do `config.json` — útil para regenerar uma aula já existente
em outro nível de profundidade.

### Configuração necessária (uma vez só)

1. **Chave da API da Anthropic** — em `Settings → Secrets and variables →
   Actions → New repository secret`, crie um secret chamado
   `ANTHROPIC_API_KEY` com uma chave válida de https://console.anthropic.com/.
   Cada geração de aula consome créditos dessa chave (a "aula longa" usa
   mais tokens que a "curta").
2. **GitHub Pages** — em `Settings → Pages → Build and deployment → Source`,
   selecione **GitHub Actions**. O workflow de deploy cuida do resto.

Sem o secret configurado, o workflow de geração falha com uma mensagem
clara (`ANTHROPIC_API_KEY não está definida`) — o site continua no ar
normalmente com as aulas já publicadas, só não gera aulas novas.

### Rodando o agente localmente (opcional)

```bash
cd agent
npm install
export ANTHROPIC_API_KEY=sk-ant-...
node generate-lesson.mjs exemplo-hidrostatica --length short
```

Isso escreve/atualiza `data/lessons/exemplo-hidrostatica/{lesson,notebook}.json`
e `data/manifest.json` direto no seu checkout local — útil para testar antes
de dar push.

## Rodando localmente

Como o app carrega `data/manifest.json` e os lessons via `fetch`, sirva a
pasta por HTTP em vez de abrir `index.html` como arquivo:

```bash
python3 -m http.server 8080
# depois abra http://localhost:8080/
```

## Vocabulário de componentes (para quem for editar slides à mão)

Os slides são HTML livre dentro de `<section class="slide">`, usando as
classes já definidas em `css/app.css`: `chip`, `title-lg`/`title-md`,
`lede`, `formula`, `grid2`/`grid3`, `card`, `stage-box` (para diagramas SVG),
`pill-row`, `compare`, e o bloco de exercício interativo `ex-wrap` +
`opt-list[data-correct]` + `opt[data-letter]` + `resolution` (o clique nas
alternativas já funciona via `js/slides.js`, sem precisar de JS extra no
slide). Animações prontas: `fade-in fi-1..fi-6`, `anim-box`, `anim-arrow`,
`anim-fall`/`anim-fall-shadow`, `anim-spring`/`anim-block-follow`,
`anim-pendulum`, `bar-ec`/`bar-ep`, `mm-line`, `needle`. É exatamente esse
vocabulário que o agente (`agent/lib/prompt.mjs`) usa para gerar slides que
já nascem com o visual do site.
