import sharp from 'sharp';

// Quix wraps the page's own content in div.qx.quix[data-type=page]; header,
// footer and module collections get their own wrappers with other types.
const PAGE_CONTENT = '.qx.quix[data-type="page"]';

// Screenshot a Quix page with Playwright and write the thumbnail to `out`.
// Build the template on a page of its own, then pass that page's URL.
// - layout: top of the page content, 920x1000 (2x the library's 460x500 cards)
// - section/header/footer: the whole page content, 700px wide (max 1000 high)
export async function screenshot(url, type, out) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(url, { waitUntil: 'networkidle' });

    // entrance animations start hidden, and lazy images load on scroll
    await page.addStyleTag({
      content: `.qx-opacity-0{opacity:1!important}*,*::before,*::after{animation:none!important;transition:none!important}`,
    });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 100));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');

    // debug bars, cookie banners and chat widgets float over the content
    await page.evaluate((sel) => {
      const content = document.querySelector(sel);
      for (const el of document.querySelectorAll('body *')) {
        if (content && content.contains(el)) continue;
        const pos = getComputedStyle(el).position;
        if (pos === 'fixed' || pos === 'sticky') el.style.setProperty('visibility', 'hidden', 'important');
      }
    }, PAGE_CONTENT);

    const content = await page.$(PAGE_CONTENT);
    const png = content ? await content.screenshot() : await page.screenshot({ fullPage: true });

    if (type === 'layout') {
      await sharp(png)
        .resize({ width: 920 })
        .toBuffer()
        .then((buf) => sharp(buf).resize(920, 1000, { fit: 'cover', position: 'top' }).jpeg({ quality: 80 }).toFile(out));
    } else {
      const resized = await sharp(png).resize({ width: 700 }).toBuffer({ resolveWithObject: true });
      const height = Math.min(resized.info.height, 1000);
      await sharp(resized.data).extract({ left: 0, top: 0, width: 700, height }).jpeg({ quality: 82 }).toFile(out);
    }
  } finally {
    await browser.close();
  }
}
