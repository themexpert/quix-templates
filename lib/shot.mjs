import sharp from 'sharp';

// Screenshot a page with Playwright and write a 600px wide jpg to `out`.
// Layouts get the full page, blocks the first .qx-section (full page if none).
export async function screenshot(url, type, out) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    let png;
    const section = type === 'layout' ? null : await page.$('.qx-section');
    png = section ? await section.screenshot() : await page.screenshot({ fullPage: true });
    await sharp(png).resize({ width: 600 }).jpeg({ quality: 82 }).toFile(out);
  } finally {
    await browser.close();
  }
}
