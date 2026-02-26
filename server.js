import express from "express";
import puppeteer from "puppeteer";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

let currentJob = null;

app.post("/start", async (req, res) => {
  if (currentJob && currentJob.running) {
    return res.json({ error: "Job already running" });
  }

  const urls = req.body.urls;
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
  if (!currentJob) return res.json({ message: "No job" });
  res.json(currentJob);
});

app.post("/stop", (req, res) => {
  if (currentJob) currentJob.running = false;
  res.json({ message: "Stopped" });
});

async function processUrls(urls) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const concurrency = 3;
  const queue = [...urls];

  async function worker() {
    const page = await browser.newPage();

    while (queue.length > 0 && currentJob.running) {
      const url = queue.shift();

      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

        const email = await page.evaluate(() => {
          const text = document.body.innerText;
          const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
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

app.listen(3000, () => console.log("Server running on port 3000"));