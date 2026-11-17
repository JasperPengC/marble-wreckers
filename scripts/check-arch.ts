/**
 * 架构约束检查（零依赖，直接读源码里的 import 语句）。
 *
 * 目的不是把目录摆好看，而是守住几条可证伪的规则——哪天有人图省事让
 * 领域层 import 了渲染器，或者界面层直接伸手进游戏状态，这里就会失败。
 *
 *   bun run arch
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve } from "node:path";

const ROOT = resolve("src");

type Module = { file: string; imports: Array<{ line: number; target: string; spec: string }> };

/** 递归收集 src 下的 ts 文件。 */
async function collect(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

/** 抽出相对 import，解析成 src 内的路径；外部依赖不管。 */
async function parse(file: string): Promise<Module> {
  const source = await readFile(file, "utf8");
  const imports: Module["imports"] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]{0,200}?from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const spec = match[1];
    if (!spec.startsWith(".")) continue;
    const line = source.slice(0, match.index).split("\n").length;
    const target = normalize(resolve(dirname(file), spec));
    imports.push({ line, target, spec });
  }
  return { file, imports };
}

const rel = (file: string) => relative(process.cwd(), file);
const inDir = (file: string, dir: string) => !relative(join(ROOT, dir), file).startsWith("..");

type Rule = {
  name: string;
  /** 命中这条规则的源文件。 */
  from: (file: string) => boolean;
  /** 允许 import 的目标；返回 false 即违规。 */
  allow: (from: string, target: string) => boolean;
  hint: string;
};

/** 领域层只能依赖领域层。 */
const domainPure: Rule = {
  name: "领域层纯净",
  from: (file) => inDir(file, "game"),
  allow: (_from, target) => inDir(target, "game"),
  hint: "src/game 是纯逻辑，不能依赖渲染/界面/宿主",
};

/** 渲染层只读游戏状态，不认识 DOM 组件。 */
const renderIsolated: Rule = {
  name: "渲染层隔离",
  from: (file) => inDir(file, "render"),
  allow: (_from, target) => inDir(target, "game") || inDir(target, "render"),
  hint: "src/render 只能读游戏状态，不能依赖界面层",
};

/** 界面层不认识渲染器，也不直接吃游戏对象（走 hud-model 适配）。 */
const uiIsolated: Rule = {
  name: "界面层隔离",
  from: (file) => inDir(file, "ui"),
  allow: (from, target) =>
    inDir(target, "ui") ||
    (inDir(target, "game") && rel(from).endsWith("ui/hud-model.ts")),
  hint: "src/ui 只能依赖自己 + hud-model.ts 这个适配层",
};

/** 平台适配不依赖任何游戏/界面代码，保证能被独立替换。 */
const adapterPure: Rule = {
  name: "平台适配独立",
  from: (file) => /^src\/(host|platform)\.ts$/.test(rel(file)),
  allow: () => false,
  hint: "宿主适配层不该 import 项目内其它模块（方向应该反过来）",
};

/** 音效层只认事件类型（game 的导出类型），不认识界面和渲染。 */
const audioIsolated: Rule = {
  name: "音效层隔离",
  from: (file) => inDir(file, "audio"),
  allow: (_from, target) => inDir(target, "audio") || inDir(target, "game"),
  hint: "src/audio 只依赖自己 + 游戏事件类型，不能依赖界面/渲染",
};

/** 场景只构建界面，主流程和服务通过输入与回调传入。 */
const scenesIsolated: Rule = {
  name: "场景层隔离",
  from: (file) => inDir(file, "scenes"),
  allow: (_from, target) =>
    inDir(target, "scenes") || inDir(target, "game") || inDir(target, "ui") ||
    target === join(ROOT, "app/shell.ts"),
  hint: "src/scenes 只能依赖场景、领域定义、界面组件与 SceneShell 类型，主流程通过回调注入",
};

const appIsolated: Rule = {
  name: "骨架层隔离",
  from: (file) => inDir(file, "app"),
  allow: (_from, target) => inDir(target, "app") || inDir(target, "ui"),
  hint: "src/app 只依赖自身与界面组件，不认识游戏状态或场景",
};

const RULES: Rule[] = [
  domainPure, renderIsolated, uiIsolated, adapterPure, audioIsolated,
  scenesIsolated, appIsolated,
];

const problems: string[] = [];

const files = await collect(ROOT);
const modules = await Promise.all(files.map(parse));

for (const module of modules) {
  for (const rule of RULES) {
    if (!rule.from(module.file)) continue;
    for (const entry of module.imports) {
      if (!rule.allow(module.file, entry.target)) {
        problems.push(
          `[${rule.name}] ${rel(module.file)}:${entry.line} → ${entry.spec}\n    ${rule.hint}`
        );
      }
    }
  }
}

// 循环依赖：三种颜色 DFS，命中灰色节点即成环。
const graph = new Map(modules.map((module) => [module.file, module.imports.map((i) => i.target)]));
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;
const color = new Map<string, number>();
const stack: string[] = [];

function walk(file: string): void {
  color.set(file, GRAY);
  stack.push(file);
  for (const next of graph.get(file) ?? []) {
    if (!graph.has(next)) continue; // 只关心项目内的模块
    const state = color.get(next) ?? WHITE;
    if (state === GRAY) {
      const cycle = [...stack.slice(stack.indexOf(next)), next].map(rel).join("\n      → ");
      problems.push(`[循环依赖]\n      ${cycle}`);
    } else if (state === WHITE) {
      walk(next);
    }
  }
  stack.pop();
  color.set(file, BLACK);
}

for (const file of graph.keys()) if ((color.get(file) ?? WHITE) === WHITE) walk(file);

if (problems.length > 0) {
  console.error(`架构约束失败（${problems.length} 处）：\n`);
  for (const problem of problems) console.error("  " + problem + "\n");
  process.exit(1);
}

console.log(
  `架构约束通过：${modules.length} 个模块，领域层无反向依赖、界面层不越界、无循环依赖。`
);
