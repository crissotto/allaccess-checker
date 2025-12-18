import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

let LAST_STATUS = null;
let LAST_NOTIFY = 0;
const COOLDOWN_MINUTES = 10;

export default async function handler(req, res) {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: "Missing url param" });
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const result = await page.evaluate(() => {

      // 🔴 AGOTADO
      if (document.querySelector(".event-status.status-soldout")) {
        return { status: "RED" };
      }

      const bodyText = document.body.innerText.toLowerCase();

      // 🟢 FILA VIRTUAL
      if (
        bodyText.includes("fila virtual") ||
        bodyText.includes("alta demanda") ||
        bodyText.includes("por favor espere")
      ) {
        return { status: "GREEN", queue: true };
      }

      const functions = Array.from(
        document.querySelectorAll(".show-item, .function-item")
      );

      let hasTickets = false;
      let hasPriority = false;

      functions.forEach(fn => {
        const text = fn.innerText.toLowerCase();
        const button = fn.querySelector("button, a");

        if (button && fn.offsetParent !== null) {
          hasTickets = true;
          if (text.includes("31/03")) {
            hasPriority = true;
          }
        }
      });

      if (
        document.querySelector("#show-button") ||
        document.querySelector(".action-container button")
      ) {
        hasTickets = true;
      }

      if (hasPriority) {
        return { status: "GREEN", priority: true };
      }

      if (hasTickets) {
        return { status: "GREEN" };
      }

      return { status: "RED" };
    });

    const now = Date.now();
    const cooldownMs = COOLDOWN_MINUTES * 60 * 1000;

    const shouldNotify =
      LAST_STATUS !== result.status ||
      now - LAST_NOTIFY > cooldownMs;

    if (shouldNotify && result.status === "GREEN") {
      let message = "🟢 ENTRADAS DISPONIBLES";

      if (result.queue) {
        message = "⏳ FILA VIRTUAL ACTIVA";
      } else if (result.priority) {
        message = "🔥 PRIORIDAD 31/03 DISPONIBLE";
      }

      await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TG_CHAT,
          text: `${message}\n${url}`
        })
      });

      LAST_STATUS = result.status;
      LAST_NOTIFY = now;
    }

    res.status(200).json({
      status: result.status,
      priority: result.priority || false,
      queue: result.queue || false,
      checkedAt: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
  }
}
