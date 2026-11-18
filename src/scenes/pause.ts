import { h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface PauseSceneInput {
  onResume(): void;
  onHelp(): void;
  onSettings(): void;
  onRetreat(): void;
}

export function showPauseScene(shell: SceneShell, t: Translate, input: PauseSceneInput): void {
  shell.open({
    title: t("pause.title"),
    body: [
      h("p", { class: "overlay__subtitle" }, t("pause.hint")),
      h(
        "button",
        { class: "btn btn--primary", onclick: () => input.onResume() },
        icon("play"),
        t("pause.resume")
      ),
      h(
        "button",
        { class: "btn btn--key", style: "--key:#c8b28a", onclick: () => input.onHelp() },
        h("span", { class: "btn__badge" }, icon("help")),
        h("span", { class: "btn__label" }, t("pause.help"))
      ),
      h(
        "button",
        { class: "btn btn--key", style: "--key:#8fb8ff", onclick: () => input.onSettings() },
        h("span", { class: "btn__badge" }, icon("gear")),
        h("span", { class: "btn__label" }, t("menu.settings"))
      ),
      h(
        "button",
        {
          class: "btn btn--key",
          style: "--key:#ff8a5c",
          onclick: () => {
            input.onRetreat();
          },
        },
        h("span", { class: "btn__badge" }, icon("flag")),
        h("span", { class: "btn__label" }, t("pause.retreat"))
      ),
    ],
    foot: t("pause.foot"),
    onBack: () => input.onResume(),
  });
  shell.setKeys((event) => {
    if (event.code === "Escape" || event.code === "KeyP") {
      input.onResume();
      return true;
    }
    return false;
  });
}
