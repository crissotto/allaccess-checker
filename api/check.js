const cheerio = require("cheerio");

let LAST_STATUS = null;
let LAST_NOTIFY = 0;
const COOLDOWN_MINUTES = 10;

module.exports = async function handler(req, res) {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: "Missing url param ?url=" });
  }

  try {
    /* ============================
       FETCH HTML
    ============================ */
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const bodyText = $("body").text().toLowerCase();

    let status = "RED";
    let reason = "agotado";

    /* ============================
       SELECTORES ALLACCESS
    ============================ */

    // Banner "Agotado"
    const soldOut =
      $(".event-status.status-soldout span")
        .text()
        .toLowerCase()
        .includes("agotado");

    // Contenedor de funciones
    const hasPickerBar = $("#picker-bar").length > 0;

    // Bloqueos reales
    const hardBlock =
      bodyText.includes("no hay funciones disponibles") ||
      bodyText.includes("no hay entradas disponibles");

    /* ============================
       DECISIÓN FINAL
    ============================ */

    // 🟢 Eventos dinámicos (ej: Bad Bunny)
    if (hasPickerBar && !hardBlock) {
      status = "GREEN";
      reason = "disponible";
    }

    // 🔴 Realmente agotado (ej: AC/DC)
    if (soldOut && !hasPickerBar) {
      status = "RED";
      reason = "agotado";
    }

    /* ============================
       TELEGRAM (ANTI SPAM)
    ============================ */

    const now = Date.now();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

    const shouldNotify =
      status === "GREEN" &&
      (LAST_STATUS !== "GREEN" || now - LAST_NOTIFY > cooldownMs);

    if (shouldNotify && process.env.TG_TOKEN && process.env.TG_CHAT) {
      await fetch(
        `https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TG_CHAT,
            text: `🟢 ENTRADAS DISPONIBLES\n${url}`,
          }),
        }
      );

      LAST_STATUS = "GREEN";
      LAST_NOTIFY = now;
    }

    if (status === "RED") {
      LAST_STATUS = "RED";
    }

    /* ============================
       RESPONSE
    ============================ */

    res.status(200).json({
      status,
      reason,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
};
