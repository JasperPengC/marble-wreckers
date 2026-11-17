import type { MiniAppManifest } from "@discourse-mini-app/sdk/pack";
import { pack } from "@discourse-mini-app/sdk/pack";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile("manifest.json", "utf8")
) as MiniAppManifest;
manifest.id = process.env.MINI_APP_ID || manifest.id;
manifest.version = process.env.MINI_APP_VERSION || manifest.version;
// The mini-app loader injects app.js/app.css from the manifest, so its
// index.html stays a body fragment. The standalone build gets a full document
// from scripts/build-h5.ts instead.
const files: Record<string, Buffer> = {
  "index.html": await readFile("src/template.html"),
  "app.js": await readFile("dist/web/app.js"),
  "app.css": await readFile("dist/web/app.css"),
  "strings.json": await readFile("src/strings.json"),
};
for (const path of manifest.assets || []) {
  if (
    !/^[a-zA-Z0-9_.\-/]{1,160}$/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Invalid package asset path");
  }
  files[path] = await readFile(`dist/web/${path}`);
}
const result = await pack({ manifest, files, outputDirectory: "dist/package" });
console.log(
  `Created ${result.file} (${result.size} bytes), app ${manifest.id}, version ${manifest.version}`
);
