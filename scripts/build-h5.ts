import { copyFile, readFile, writeFile } from "node:fs/promises";

/**
 * Assemble the standalone web build in `dist/web`.
 *
 * Vite emits the bundle as a library (`app.js` + `app.css`), which is what the
 * mini-app loader wants, but a browser needs a real document. This wraps the
 * same body markup in `src/shell.html` so `dist/web` is a deployable static
 * site that runs without the linux.do bridge.
 */
const shell = await readFile("src/shell.html", "utf8");
const fragment = await readFile("src/template.html", "utf8");

if (!shell.includes("<!--app-->")) {
  throw new Error("src/shell.html is missing the <!--app--> mount point");
}

await writeFile("dist/web/index.html", shell.replace("<!--app-->", fragment));
await copyFile("src/strings.json", "dist/web/strings.json");

console.log("Created dist/web/index.html (standalone web build)");
