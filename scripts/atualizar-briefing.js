const fs = require("fs");

const FEEDS = [
  "https://www.infomoney.com.br/feed/",
  "https://www.moneytimes.com.br/feed/"
];

async function fetchHeadlines() {
  var headlines = [];
  for (const feedUrl of FEEDS) {
    try {
      console.log("Buscando manchetes de:", feedUrl);
      const r = await fetch("https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(feedUrl));
      const j = await r.json();
      if (j.status === "ok" && j.items) {
        headlines.push(...j.items.slice(0, 5).map(function(it){ return it.title; }));
      }
    } catch (e) {
      console.warn("Feed falhou, seguindo com o que já tem:", feedUrl, e.message);
    }
  }
  console.log("Total de manchetes encontradas:", headlines.length);
  return headlines.slice(0, 10);
}

async function gerarBriefing(headlines) {
  const prompt =
    "Você escreve o \"briefing do dia\" de um site financeiro brasileiro chamado " +
    "Nexus Money. Com base nessas manchetes REAIS de hoje, escreva exatamente 2 a 3 " +
    "frases em português do Brasil, tom direto e editorial, conectando os pontos " +
    "mais relevantes pra quem investe. Não invente número, dado ou fato que não " +
    "esteja nas manchetes abaixo. Não use aspas nem markdown, só texto corrido.\n\n" +
    "Manchetes de hoje:\n" + headlines.map(function(h){ return "- " + h; }).join("\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada (ver README)");

  console.log("Chamando a Gemini...");
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  console.log("Gemini respondeu com status:", r.status);
  if (!r.ok) {
    const corpo = await r.text();
    throw new Error("Gemini API retornou HTTP " + r.status + " — corpo: " + corpo.slice(0, 300));
  }
  const data = await r.json();
  const texto = data && data.candidates && data.candidates[0] && data.candidates[0].content
    && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
    && data.candidates[0].content.parts[0].text;
  if (!texto || !texto.trim()) throw new Error("resposta vazia da Gemini: " + JSON.stringify(data).slice(0, 300));
  return texto.trim().replace(/\s+/g, " ");
}

async function main() {
  try {
    const headlines = await fetchHeadlines();
    if (headlines.length === 0) {
      console.log("Nenhuma manchete disponível agora — não atualiza hoje.");
      return;
    }

    const briefing = await gerarBriefing(headlines);
    console.log("Briefing gerado:", briefing);

    let html = fs.readFileSync("index.html", "utf-8");

    const blocoRegex = /(<p class="brief-txt">)[\s\S]*?(<\/p>)/;
    if (!blocoRegex.test(html)) {
      console.log("Não encontrei o bloco <p class=\"brief-txt\"> no index.html. Não mexi em nada.");
      return;
    }
    html = html.replace(blocoRegex, "$1" + briefing + "$2");

    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const briefingTagRegex = /(<p class="brief-txt">[\s\S]*?<\/p>\s*)<span class="sample-tag">[\s\S]*?<\/span>/;
    html = html.replace(briefingTagRegex, "$1" + '<span class="sample-tag"><i>◆</i> gerado automaticamente às ' + agora + "</span>");

    fs.writeFileSync("index.html", html);
    console.log("index.html atualizado com sucesso.");
  } catch (e) {
    console.error("Não atualizou hoje — script termina sem erro pra não quebrar o site. Motivo:", e.message);
    process.exit(0);
  }
}

main();
