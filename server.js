import express from "express";
import puppeteer from "puppeteer-core";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   ROOT ROUTE (VERY IMPORTANT)
========================= */
app.get("/", (req, res) => {
  res.send("Mail backend is live 🚀");
});

/* =========================
   JOB MANAGEMENT
========================= */

let currentJob = null;

app.post("/start", async (req, res) => {
  if (currentJob && currentJob.running) {
    return res.json({ error: "Job already running" });
  }

  const urls = req.body.urls;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Invalid URLs array" });
  }

  currentJob = {
    running: true,
    processed: 0,
    total: urls.length,
    results: []
  };

  processUrls(urls);

  res.json({ message: "Job started" });
});

app.get("/status", (req, res) => {
  if (!currentJob) {
    return res.json({ message: "No job" });
  }
  res.json(currentJob);
});

app.post("/stop", (req, res) => {
  if (currentJob) {
    currentJob.running = false;
  }
  res.json({ message: "Stopped" });
});

/* =========================
   SCRAPER LOGIC
========================= */

async function processUrls(urls) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true
  });

  const concurrency = 3;
  const queue = [...urls];

  async function worker() {
    const page = await browser.newPage();

    while (queue.length > 0 && currentJob.running) {
      const url = queue.shift();

      try {
        await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000
        });

        const email = await page.evaluate(() => {
          const text = document.body.innerText;
          const match = text.match(
            /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
          );
          return match ? match[0] : null;
        });

        currentJob.results.push({
          url,
          email: email || "Not found",
          status: email ? "valid" : "not found"
        });

      } catch (err) {
        currentJob.results.push({
          url,
          email: "Error",
          status: "error"
        });
      }

      currentJob.processed++;
    }

    await page.close();
  }

  await Promise.all(Array(concurrency).fill().map(worker));

  await browser.close();
  currentJob.running = false;
}

/* =========================
   SERVER START
========================= */

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});