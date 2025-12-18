const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

let LAST_STATUS = null;
let LAST_NOTIFY = 0;
const COOLDOWN_MINUTES = 10;

module.exports = async function handler(req, res) {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: "Missing url param" });
  }

  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const result = await page.evaluate(() => {
      // 🔴 AGOTADO
      if (document.querySelector(".event-status.status-soldout")) {
        return { status: "RED" };
      }

      const text = document.body.innerText.toLowerCase();

      // 🟢 FILA VIRTUAL
      if (
        text.includes("fila virtual") ||
        text.includes("alta demanda") ||
        text.includes("por favor espere")
      ) {
        return { status: "GREEN", queue: true };
      }

      // 🟢 BOTÓN DE COMPRA
      if (
        document.querySelector("#show-button") ||
        document.querySelector(".action-container button") ||
        Array.from(document.querySelectorAll("button,a")).some(el =>
          el.offsetParent !== null &&
          /ver entradas|comprar/i.test(el.innerText)
        )
      ) {
        return { status: "GREEN" };
      }

      return { status: "RED" };
    });

    const now = Date.now();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

    const shouldNotify =
      LAST_STATUS !== result.status || now - LAST_NOTIFY > cooldownMs;

    if (shouldNotify && result.status === "GREEN") {
      const telegramUrl =
        `https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`;

      await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TG_CHAT,
          text:
            (result.queue ? "⏳ FILA VIRTUAL ACTIVA\n" : "🟢 ENTRADAS DISPONIBLES\n") +
            url,
        }),
      });

      LAST_STATUS = result.status;
      LAST_NOTIFY = now;
    }

    res.status(200).json({
      status: result.status,
      queue: !!result.queue,
      checkedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error("PUPPETEER ERROR:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
};
