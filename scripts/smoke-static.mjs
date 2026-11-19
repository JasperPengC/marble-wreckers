/**
 * 静态站点烟雾测试:把 dist/web 挂在 /marble-wreckers/ 子路径下伺服,
 * 用无头 Chrome 实测"部署到 GitHub Pages 后的形态"——游戏启动、开局、
 * 发射,断言 0 个 console 错误、无失败资源请求、主循环无异常。
 *
 * 用法: node scripts/smoke-static.mjs [baseDir] [urlPath] [port]
 *   baseDir  默认 /tmp/pages-sim(需含指向 dist/web 的子目录)
 */
import path from "node:path";
import { connectToPage, launchChrome, probeCdpPort, sleep, attachPageErrors } from "../test/e2e/cdp.mjs";

const port = Number(process.argv[4] ?? 8199);
const urlPath = process.argv[3] ?? "/marble-wreckers/";
const target = `http://127.0.0.1:${port}${urlPath}`;

if (await probeCdpPort(9341)) throw new Error("CDP 端口 9341 被占用");
const chrome = await launchChrome({
  port: 9341,
  executablePath: process.env.E2E_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const client = await connectToPage(9341);
  const errors = attachPageErrors(client);

  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
  });

  await client.send("Page.navigate", { url: target });
  // 等:主循环钩子 + 主页按钮就绪(与 e2e 同一套就绪判据)
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await client.evaluate("window.__dbg && document.querySelector('#overlay .btn--primary')").catch(() => false)) {
      ready = true;
      break;
    }
    await sleep(100);
  }
  if (!ready) throw new Error("页面未就绪:__dbg 或主页按钮缺失");

  // 开局 → 推进若干帧 → 发射一轮 → 再推进,复刻 e2e 的核心路径
  await client.evaluate("document.querySelector('#overlay .btn--primary').click()");
  await client.evaluate("window.__step(600)");
  await client.evaluate("window.__fire(0.1)");
  await client.evaluate("window.__step(300)");
  await client.evaluate("window.__render()");
  await sleep(600);

  const result = await client.evaluate(`(() => {
    const failed = performance.getEntriesByType("resource")
      .filter((r) => r.responseStatus >= 400)
      .map((r) => r.name + " → " + r.responseStatus);
    const nav = performance.getEntriesByType("navigation")[0];
    return JSON.stringify({
      url: location.href,
      title: document.title,
      canvas: !!document.querySelector("#board"),
      inRun: !!window.__dbg && typeof window.__dbg() === "object" && window.__dbg() !== null,
      loopError: window.__loopError === undefined ? null : String(window.__loopError).slice(0, 300),
      failedResources: failed,
      navStatus: nav ? nav.responseStatus : null,
      resourceCount: performance.getEntriesByType("resource").length,
      consoleErrors: 0,
    });
  })()`);
  const summary = JSON.parse(result);
  summary.consoleErrors = errors.length;
  if (errors.length) summary.errorSamples = errors.slice(0, 3).map((e) => `${e.kind}: ${e.text.slice(0, 120)}`);

  // 关键断言
  const problems = [];
  if (summary.navStatus !== 200) problems.push(`主页响应码 ${summary.navStatus}`);
  if (summary.failedResources.length) problems.push(`失败资源: ${summary.failedResources.join(", ")}`);
  if (summary.loopError) problems.push(`主循环异常: ${summary.loopError}`);
  if (summary.consoleErrors > 0) problems.push(`console 错误 ${summary.consoleErrors} 条`);
  if (!summary.inRun) problems.push("未能进入对局");

  console.log(JSON.stringify(summary, null, 2));
  const shot = (await client.send("Page.captureScreenshot", { format: "png" })).data;
  const fs = await import("node:fs/promises");
  await fs.writeFile("/tmp/smoke-static.png", Buffer.from(shot, "base64"));
  console.log("截图: /tmp/smoke-static.png");

  if (problems.length) {
    console.error("烟雾测试失败:\n  - " + problems.join("\n  - "));
    process.exitCode = 1;
  } else {
    console.log(`✅ 静态烟雾测试通过: ${summary.url}`);
  }
  client.close();
} finally {
  await chrome.kill();
}
