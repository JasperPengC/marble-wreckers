import { ACHIEVEMENTS } from "../game/meta.ts";
import { h } from "../ui/overlays.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface CollectionSceneInput {
  achievements: readonly string[];
  onBack(): void;
}

export function showCollectionScene(shell: SceneShell, t: Translate, input: CollectionSceneInput): void {
  shell.open({
    title: t("collection.title"),
    meta: input.achievements.length + "/" + ACHIEVEMENTS.length,
    body: [
      h(
        "div",
        { class: "tile-grid tile-grid--ach" },
        ...ACHIEVEMENTS.map((def) => {
          const has = input.achievements.includes(def.id);
          return h(
            "div",
            { class: "tile tile--ach" + (has ? " tile--unlocked" : "") },
            h("span", { class: "tile__name" }, (has ? "🏅 " : "🔒 ") + def.name),
            h("span", { class: "tile__desc" }, def.desc)
          );
        })
      ),
    ],
    onBack: input.onBack,
  });
}
