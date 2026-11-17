/** 从真实游戏状态截取双主题画面，再合成 README 的手机机框展示图。 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { connectToPage, launchChrome, probeCdpPort, sleep } from "../test/e2e/cdp.mjs";

const url = process.env.README_URL ?? "http://127.0.0.1:5194/";
const port = Number(process.env.README_CDP_PORT ?? 9337);
const output = path.resolve("docs/images");
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "chai-lou-readme-"));
if (await probeCdpPort(port)) throw new Error(`截图端口 ${port} 已被占用`);
await fs.mkdir(output, { recursive: true });
const chrome = await launchChrome({
  executablePath: process.env.E2E_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  port,
});
const client = await connectToPage(port);

async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`截图页面未就绪：${expression}`);
}

async function capture(theme) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 900, deviceScaleFactor: 2, mobile: true,
  });
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }],
  });
  await client.send("Page.navigate", { url });
  await waitFor("window.__dbg && window.__theme && document.querySelector('#overlay .btn--primary')");
  await sleep(150);
  await client.evaluate(`window.__theme(${JSON.stringify(theme)})`);
  await client.evaluate(`(() => {
    document.documentElement.style.setProperty('--safe-area-top', '67px');
    document.documentElement.style.setProperty('--safe-area-bottom', '41px');
  })()`);
  await client.evaluate(`(() => {
    document.querySelector('#overlay .btn--primary').click();
    window.__grant({ clone: 3, lanes: 2, pierce: 1, fire: 1 });
    window.dispatchEvent(new Event('resize'));
    window.__step(1100);
    window.__fire(0.14);
    for (let frame = 0; frame < 64; frame++) {
      window.__step(1);
      window.__render();
    }
    window.__render();
  })()`);
  await sleep(2300); // 等实际的楼栋提示退出，截图不遮挡弹道。
  const battle = (await client.send("Page.captureScreenshot", { format: "png" })).data;
  await client.evaluate("window.__win(); window.__step(90); window.__readmeFrame()");
  await waitFor("document.querySelectorAll('#overlay .card').length === 3");
  const draft = (await client.send("Page.captureScreenshot", { format: "png" })).data;
  await fs.writeFile(path.join(temporary, `battle-${theme}.png`), Buffer.from(battle, "base64"));
  await fs.writeFile(path.join(temporary, `draft-${theme}.png`), Buffer.from(draft, "base64"));
  return { battle, draft };
}

function compose(theme, { battle, draft }) {
  const dark = theme === "dark";
  const ink = dark ? "#c6ccd4" : "#414955";
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1000px; height: 850px; overflow: hidden; background: transparent; }
    body { position: relative; font-family: 'PingFang SC', sans-serif; color: ${ink}; }
    .phone { position: absolute; width: 300px; padding: 8px; border-radius: 48px;
      background: #30353a;
      box-shadow: 0 24px 36px -14px ${dark ? "#000a" : "#17223438"}, inset 0 0 0 1px #969da3; }
    .phone--battle { left: 150px; top: 38px; }
    .phone--draft { left: 550px; top: 38px; }
    .phone::before, .phone::after { content: ''; position: absolute; width: 3px; border-radius: 2px; background: #777d82; }
    .phone::before { left: -2px; top: 144px; height: 74px; }
    .phone::after { right: -2px; top: 180px; height: 58px; }
    .display { position: relative; aspect-ratio: 390 / 900; border-radius: 40px; overflow: hidden; background: #080b11; }
    .status { height: 46px; position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 19px; color: ${dark ? '#f1f3f5' : '#1d2530'}; }
    .time { font: 600 11px -apple-system, sans-serif; }
    .island { position: absolute; width: 82px; height: 25px; border-radius: 20px; left: 50%; top: 8px; transform: translateX(-50%); background: #000; }
    .lens { position: absolute; right: 9px; top: 9px; width: 7px; height: 7px; background: radial-gradient(circle at 40% 35%, #26374b, #0e141d 70%); border-radius: 50%; }
    .status svg { width: 42px; height: 12px; }
    .game { display: block; width: 100%; height: auto; }
    .home { height: 28px; position: absolute; bottom: 0; left: 0; right: 0; }
    .home::after { content: ''; position: absolute; height: 4px; width: 92px; border-radius: 3px; background: ${dark ? '#e7e9ec' : '#1d2530'}; top: 14px; left: 50%; transform: translateX(-50%); }
    .caption { position: absolute; bottom: 44px; width: 340px; text-align: center; font-size: 17px; line-height: 1.7; letter-spacing: .03em; }
    .caption--battle { left: 130px; }
    .caption--draft { left: 530px; }
    .caption strong { display: block; color: ${dark ? "#f1d393" : "#7c5717"}; font-size: 19px; font-weight: 600; }
    .caption span { font-size: 13px; color: ${dark ? "#8f9baa" : "#6d7682"}; }
  </style>
  ${[["battle", battle], ["draft", draft]].map(([scene, image]) => `<div class="phone phone--${scene}"><div class="display">
    <img class="game" src="data:image/png;base64,${image}" alt="游戏实机画面">
    <div class="status"><span class="time">9:41</span><span class="island"><i class="lens"></i></span>
    <svg viewBox="0 0 46 14" fill="currentColor"><path d="M0 9h2v4H0zm4-3h2v7H4zm4-3h2v10H8zm4-3h2v13h-2z"/><path d="M18 4q5-5 10 0l-1.5 1.5q-3.5-3.5-7 0zm2 3q3-3 6 0l-1.5 1.5q-1.5-1.5-3 0zm2 3 1-1 1 1-1 2z"/><rect x="32" y="2" width="12" height="10" rx="2" fill="none" stroke="currentColor"/><rect x="34" y="4" width="8" height="6" rx="1"/><path d="M45 5h1v4h-1z"/></svg></div>
    <div class="home"></div>
    </div></div>`).join("")}
  <div class="caption caption--battle"><strong>弹珠拆楼</strong><span>拖动瞄准，松手发射</span></div>
  <div class="caption caption--draft"><strong>三选一强化</strong><span>每拆完一栋，选一次</span></div>
  </html>`;
}

/** 在 WebP 内写入来源，保留截图原始像素数据。 */
function withProvenance(buffer, theme) {
  const xmp = Buffer.from(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" dc:source="Real screenshots of this repository's game, captured in Chrome at 390x900 DPR 2 with simulated safe-area insets, ${theme} theme; phone frame authored in scripts/readme-assets.mjs. No generated game imagery."/></rdf:RDF></x:xmpmeta>`);
  const chunks = [];
  let extended = false;
  for (let offset = 12; offset < buffer.length;) {
    const size = buffer.readUInt32LE(offset + 4);
    const chunk = Buffer.from(buffer.subarray(offset, offset + 8 + size + (size % 2)));
    if (chunk.toString("ascii", 0, 4) === "VP8X") {
      chunk[8] |= 0x04;
      extended = true;
    }
    chunks.push(chunk);
    offset += chunk.length;
  }
  if (!extended) {
    const header = Buffer.alloc(18);
    header.write("VP8X", 0);
    header.writeUInt32LE(10, 4);
    header[8] = 0x04;
    header.writeUIntLE(1999, 12, 3);
    header.writeUIntLE(1699, 15, 3);
    chunks.unshift(header);
  }
  const metadata = Buffer.alloc(8 + xmp.length + (xmp.length % 2));
  metadata.write("XMP ", 0);
  metadata.writeUInt32LE(xmp.length, 4);
  xmp.copy(metadata, 8);
  chunks.push(metadata);
  const result = Buffer.concat([Buffer.from(buffer.subarray(0, 12)), ...chunks]);
  result.writeUInt32LE(result.length - 8, 4);
  return result;
}

try {
  await client.send("Page.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.clear();
    Date.now = () => 1794891600000;
    Math.random = () => 0.3827;
    let nextFrame;
    window.requestAnimationFrame = callback => { nextFrame = callback; return 1; };
    window.__readmeFrame = () => nextFrame?.(performance.now() + 16.667);
  ` });
  const screenshots = {};
  for (const theme of ["dark", "light"]) screenshots[theme] = await capture(theme);
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1000, height: 850, deviceScaleFactor: 2, mobile: false,
  });
  await client.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  for (const theme of ["dark", "light"]) {
    const html = path.join(temporary, `hero-${theme}.html`);
    await fs.writeFile(html, compose(theme, screenshots[theme]));
    await client.send("Page.navigate", { url: new URL(`file://${html}`).href });
    await waitFor("document.images.length === 2 && [...document.images].every(image => image.complete && image.naturalWidth > 0)");
    const geometry = await client.evaluate(`(() => ({
      phones: [...document.querySelectorAll('.phone')].map(phone => ({
        transform: getComputedStyle(phone).transform,
        top: phone.getBoundingClientRect().top,
        height: phone.getBoundingClientRect().height,
      })),
      images: [...document.images].map(image => ({
        natural: image.naturalWidth / image.naturalHeight,
        rendered: image.getBoundingClientRect().width / image.getBoundingClientRect().height,
      })),
    }))()`);
    if (geometry.phones.some(phone => phone.transform !== 'none') ||
        geometry.phones[0].top !== geometry.phones[1].top ||
        geometry.phones[0].height !== geometry.phones[1].height ||
        geometry.images.some(image => Math.abs(image.natural - image.rendered) > 0.0001)) {
      throw new Error(`手机机框或截图比例不一致：${JSON.stringify(geometry)}`);
    }
    const { data } = await client.send("Page.captureScreenshot", { format: "webp", quality: 90 });
    const file = path.join(output, `hero-${theme}.webp`);
    await fs.writeFile(file, withProvenance(Buffer.from(data, "base64"), theme));
    await fs.writeFile(file + ".json", JSON.stringify({
      prompt: `Source: real screenshots of this repository game in Chrome, 390x900 DPR 2 with simulated safe-area insets, ${theme} theme. Captured and composed with authored phone-frame HTML/CSS by scripts/readme-assets.mjs. No generated game imagery.`,
      createdAt: new Date().toISOString(),
    }, null, 2) + "\n");
    console.log(file);
  }
  console.log(`原始截图与机框源文件：${temporary}`);
} finally {
  client.close();
  await chrome.kill();
}
