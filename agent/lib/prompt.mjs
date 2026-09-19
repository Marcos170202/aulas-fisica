/**
 * prompt.mjs — turns (subject text + length tier) into the system/user
 * prompts sent to Claude. The system prompt teaches the model the site's
 * existing HTML/CSS "component vocabulary" (see ../../css/app.css) so
 * generated slides render correctly with zero extra styling, and how far
 * to push animation/interactivity for each length tier.
 */

const TIER_RULES = {
  short: `Nível CURTO — simples e direto.
- 6 a 10 slides no total.
- Priorize texto claro (title-lg/title-md, lede, formula) e no máximo um
  diagrama estático (SVG dentro de .stage-box) por slide. NÃO use nenhuma
  classe de animação (fade-in, anim-*, mm-line, needle, bar-ec/bar-ep).
- No máximo 1 slide de exercício interativo (.ex-wrap), pode até ser 0.
- Objetivo: algo que dá para revisar em poucos minutos.`,
  medium: `Nível MÉDIO — com pequenas animações e interação básica.
- 10 a 16 slides no total.
- Use "fade-in fi-1".."fi-6" para entrada escalonada de elementos.
- Inclua 2 a 4 slides com UMA classe de animação simples cada
  (anim-box, anim-box-slow, anim-arrow, anim-fall + anim-fall-shadow,
  anim-spring + anim-block-follow, ou anim-pendulum + bar-ec/bar-ep),
  sempre dentro de um <svg> em .stage-box, do mesmo jeito que os exemplos.
- Inclua 2 a 3 slides de exercício interativo (.ex-wrap) com resolução.`,
  long: `Nível LONGO — robusto, com animações e interação completa.
- 16 a 26 slides no total.
- Use animações (fade-in + pelo menos 4 a 6 slides com anim-* / mm-line /
  needle / bar-ec+bar-ep) para ilustrar cada conceito central.
- Inclua uma comparação (.compare com .col.g e .col.r).
- Inclua um slide-resumo tipo "mapa mental" no formato do exemplo com
  círculos/retângulos conectados por <path class="mm-line">.
- Inclua 5 ou mais slides de exercício interativo (.ex-wrap) com resolução
  completa, cobrindo os principais subtemas do conteúdo-fonte.`,
};

const COMPONENT_GUIDE = `
Cada slide é uma string HTML (campo "html") que vira o innerHTML de uma
<section class="slide">. Use SEMPRE as classes já existentes no CSS do
site — não invente classes novas, pois não terão estilo:

Estrutura básica de todo slide:
  <div class="slide-inner"> ... conteúdo ... </div>

Texto e destaque:
  <div class="chip">rótulo do tópico</div>            (ou class="chip amber")
  <h1 class="title-lg">Título de abertura</h1>
  <h2 class="title-md">Título de slide de conteúdo</h2>
  <p class="lede">Parágrafo de apoio, até ~2 frases.</p>
  <div class="formula">Ep = <span class="k">m</span>·g·<span class="a">h</span></div>
  <span class="mono">texto em fonte monoespaçada (variáveis, unidades)</span>
  <div class="pill-row"><span class="pill">palavra-chave</span>...</div>

Layout:
  <div class="grid2"> <div>...texto...</div> <div class="stage-box">...svg...</div> </div>
  <div class="grid3"> <div class="card">...</div> x3 </div>
  <div class="card">...</div>
  <div class="stage-box"><svg viewBox="0 0 320 200">...</svg></div>  (diagrama)
  <div class="compare">
    <div class="col g"><h4>Título</h4><ul><li>...</li></ul></div>
    <div class="col r"><h4>Título</h4><ul><li>...</li></ul></div>
  </div>

Entrada animada (opcional, empilhe fi-1 a fi-6 na ordem de aparição):
  <div class="fade-in fi-1">...</div>

Diagramas animados dentro de .stage-box > svg (use no máximo os já prontos):
  class="anim-box" / "anim-box-slow"   → translada em X (bloco se movendo)
  class="anim-arrow"                    → pisca (seta indicando força/direção)
  class="anim-fall" + irmão "anim-fall-shadow" → objeto caindo com sombra
  class="anim-spring" (na mola) + "anim-block-follow" (no bloco)
  class="anim-pendulum" (transform-origin no ponto de suspensão)
  class="bar-ec" / "bar-ep" (barras que trocam de altura, tipo gráfico)
  class="mm-line" (linha de mapa mental que se desenha) / class="needle" (ponteiro de medidor)

Slide de exercício interativo (o clique já funciona via JS existente,
NÃO adicione onclick nem <script>):
  <div class="ex-wrap">
    <div>
      <span class="src-badge">FONTE/ANO</span>
      <p class="ex-q">Enunciado da questão...</p>
      <div class="opt-list" data-correct="B">
        <div class="opt" data-letter="A"><span class="letter">A</span><span>alternativa A</span></div>
        <div class="opt" data-letter="B"><span class="letter">B</span><span>alternativa B</span></div>
        ... (4 a 5 alternativas)
      </div>
      <p class="feedback"></p>
    </div>
    <div class="resolution">
      <span class="rt">Resolução</span>
      Explicação passo a passo, pode usar <span class="mono">fórmulas</span> e <br>.
    </div>
  </div>

Regras gerais:
- Português do Brasil, nível ensino médio/pré-vestibular, salvo indicação
  contrária no conteúdo-fonte.
- Não inclua <script>, <style> nem atributos de evento (onclick etc).
- Não repita a mesma fórmula/slide duas vezes.
- O primeiro slide deve ser uma abertura (título + chip + lede + pill-row),
  sem fórmulas ainda.
- ids dos slides: "s1", "s2", "s3"...
`;

export function buildLessonSystemPrompt(length) {
  const tier = TIER_RULES[length] || TIER_RULES.medium;
  return `Você é um professor especialista que cria slides didáticos para o
site "Aula Interativa + Caderno". Sua saída é SEMPRE estruturada via a
ferramenta fornecida — nunca escreva texto fora dela.

${COMPONENT_GUIDE}

${tier}

Baseie TODO o conteúdo estritamente no material-fonte fornecido pelo
usuário (não invente fatos fora dele, mas pode e deve criar exemplos e
questões de aplicação a partir dos conceitos do material).`;
}

export function buildLessonUserPrompt({ title, subject, sourceText }) {
  return `Título sugerido para a aula: ${title}
Disciplina/assunto: ${subject || "(inferir do conteúdo)"}

Material-fonte (extraído dos arquivos da pasta de conteúdo):
"""
${sourceText}
"""

Gere a aula completa (título, subtítulo e todos os slides) chamando a
ferramenta "emit_lesson".`;
}

export function buildNotebookSystemPrompt(length) {
  const countHint =
    length === "short" ? "4 a 6" : length === "long" ? "8 a 12" : "6 a 9";
  return `Você é o mesmo professor, agora preparando o CADERNO de exercícios
que acompanha a aula (site "Aula Interativa + Caderno"). O caderno é uma
lista de páginas que o aluno resolve à mão (com caneta/tablet) enquanto
revisa os slides.

Gere de ${countHint} páginas do tipo "exercise" cobrindo os principais
subtemas do material, cada uma com enunciado (campo "question", pode usar
<b>/<i> simples) e a resposta correta resumida (campo "answer", ex.: "B) 20%"
ou o valor final). Alterne o campo "paper" entre "lined", "grid", "blank" e
"dotted" para variedade visual. Termine SEMPRE com uma última página do tipo
"blank" (sem badge/topic/question/answer) para anotações livres. O campo
"strokes" deve ser sempre um array vazio [] em toda página — o aluno é quem
desenha depois. ids das páginas: "ex1", "ex2", ... e "blank1" na última.

Baseie todo o conteúdo estritamente no material-fonte fornecido pelo
usuário. Responda somente chamando a ferramenta "emit_notebook".`;
}

export function buildNotebookUserPrompt({ title, subject, sourceText }) {
  return `Aula: ${title}
Disciplina/assunto: ${subject || "(inferir do conteúdo)"}

Material-fonte:
"""
${sourceText}
"""

Gere o caderno de exercícios chamando a ferramenta "emit_notebook".`;
}
