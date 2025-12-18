const cheerio = require("cheerio");

let LAST_STATUS = null;
let LAST_NOTIFY = 0;
const COOLDOWN_MINUTES = 10;

module.exports = async function handler(req, res) {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: "Missing url param" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    let status = "RED";
    let reason = "agotado";

    // 🔴 AGOTADO
    if ($(".event-status.status-soldout").length > 0) {
      status = "RED";
      reason = "agotado";
    }

    // 🟢 Seleccionar función
    if (
      $("button#show-button").length > 0 ||
      $(".dropdown-toggle").length > 0 ||
      $("body").text().toLowerCase().includes("seleccioná la función")
    ) {
      status = "GREEN";
      reason = "seleccionar_funcion";
    }

    // 🟢 Botón ver entradas
    $("button, a").each((_, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes("ver entradas") || text.includes("comprar")) {
        status = "GREEN";
        reason = "ver_entradas";
      }
    });

    const now = Date.now();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

    const shouldNotify =
      status === "GREEN" &&
      (LAST_STATUS !== "GREEN" || now - LAST_NOTIFY > cooldownMs);

    if (shouldNotify) {
      const telegramUrl =
        `https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`;

      let message = "🟢 ENTRADAS DISPONIBLES";

      if (reason === "seleccionar_funcion") {
        message = "🟢 SELECCIONÁ LA FUNCIÓN";
      }

      if (reason === "ver_entradas") {
        message = "🔥 VER ENTRADAS DISPONIBLE";
      }

      await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TG_CHAT,
          text: `${message}\n${url}`,
        }),
      });

      LAST_STATUS = "GREEN";
      LAST_NOTIFY = now;
    }

    if (status === "RED") {
      LAST_STATUS = "RED";
    }

    res.status(200).json({
      status,
      reason,
      checkedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
