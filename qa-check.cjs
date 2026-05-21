const { chromium } = require("C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded" });
  const desktop = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.textContent,
    categories: document.querySelectorAll(".category-card").length,
    services: document.querySelectorAll(".service-card").length,
    bodyWidth: document.body.scrollWidth,
    viewport: innerWidth
  }));

  await page.goto("http://127.0.0.1:4173/projects/photoshop", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="q"]', "poster");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".project-grid");
  const category = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector("h1")?.textContent,
    cards: document.querySelectorAll(".project-card").length,
    search: new URL(location.href).searchParams.get("q")
  }));

  await page.goto("http://127.0.0.1:4173/admin", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="password"]', "mudasar2026");
  await page.click('button[type="submit"]');
  await page.waitForSelector(".admin-panel");
  const admin = await page.evaluate(() => ({
    heading: document.querySelector(".admin-page h1")?.textContent,
    tabs: [...document.querySelectorAll("[data-admin-tab]")].map((button) => button.textContent)
  }));

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("http://127.0.0.1:4173/projects/uiux", { waitUntil: "domcontentloaded" });
  const mobile = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewport: innerWidth,
    menu: getComputedStyle(document.querySelector("[data-menu]")).display,
    projectCards: document.querySelectorAll(".project-card").length
  }));

  await browser.close();
  console.log(JSON.stringify({ desktop, category, admin, mobile }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
