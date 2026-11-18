import type { PlayerSettings } from "../game/meta.ts";
import { h } from "../ui/overlays.ts";
import { icon } from "../ui/icons.ts";
import type { SceneShell, Translate } from "./types.ts";

export interface SettingsSceneInput {
  settings: Readonly<PlayerSettings>;
  savedAt?: string;
  /** 主题「自动」档的文案：快应用跟随论坛，普通网页跟随系统。 */
  themeFollowLabel: string;
  onChange(patch: Partial<PlayerSettings>): void;
  onReset(): void;
  onExport(): string;
  onImport(text: string): boolean;
  onNotice(text: string): void;
  onRefresh(): void;
  onBack(): void;
}

function settingRow(label: string, hint: string, control: HTMLElement): HTMLElement {
  return h(
    "div",
    { class: "set-row" },
    h(
      "div",
      { class: "set-row__text" },
      h("div", { class: "set-row__label" }, label),
      hint ? h("div", { class: "set-row__hint" }, hint) : null
    ),
    control
  );
}

function settingSwitch(value: boolean, onChange: (next: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox", checked: value }) as HTMLInputElement;
  input.addEventListener("change", () => onChange(input.checked));
  return h(
    "label",
    { class: "switch" },
    input,
    h("span", { class: "switch__track" }, h("span", { class: "switch__knob" }))
  );
}

/** 重置确认属于设置页；设置与存档的写入交给显式回调。 */
export function createSettingsScene(shell: SceneShell, t: Translate): (input: SettingsSceneInput) => void {
  let resetArmed = false;

  function show(input: SettingsSceneInput): void {
    const shake = settingSwitch(input.settings.screenShake, (next) => {
      input.onChange({ screenShake: next });
    });
    const motion = settingSwitch(input.settings.reducedMotion, (next) => {
      input.onChange({ reducedMotion: next });
    });
    const sound = settingSwitch(input.settings.sound, (next) => {
      input.onChange({ sound: next });
    });
    const themeSel = h(
      "div",
      { class: "seg" },
      ...(
        [
          ["auto", t("settings.themeAuto")],
          ["dark", t("settings.themeDark")],
          ["light", t("settings.themeLight")],
        ] as Array<[string, string]>
      ).map(([value, label]) =>
        h(
          "button",
          {
            class: "seg__opt" + (input.settings.themeMode === value ? " seg__opt--on" : ""),
            onclick: () => {
              input.onChange({ themeMode: value as PlayerSettings["themeMode"] });
              input.onRefresh();
            },
          },
          label
        )
      ).map((node, index) => {
        // 「自动」档的文案由宿主环境决定（跟随论坛 / 跟随系统）。
        if (index === 0) node.textContent = input.themeFollowLabel;
        return node;
      })
    );
    const locale = h(
      "select",
      { class: "select" },
      h("option", { value: "zh_CN", selected: input.settings.locale === "zh_CN" }, "简体中文"),
      h("option", { value: "en", selected: input.settings.locale === "en" }, "English")
    ) as HTMLSelectElement;
    locale.addEventListener("change", () => {
      input.onChange({ locale: locale.value === "en" ? "en" : "zh_CN" });
      input.onRefresh();
    });
    const reset = h(
      "button",
      {
        class: "btn btn--small",
        onclick: () => {
          if (!resetArmed) {
            resetArmed = true;
            reset.textContent = t("settings.resetConfirm");
            window.setTimeout(() => {
              resetArmed = false;
              if (reset.isConnected) reset.textContent = t("settings.reset");
            }, 4000);
            return;
          }
          input.onReset();
          resetArmed = false;
          input.onNotice(t("settings.resetDone"));
          input.onRefresh();
        },
      },
      t("settings.reset")
    ) as HTMLButtonElement;
    shell.open({
      title: t("settings.title"),
      body: [
        h(
          "div",
          { class: "help__section" },
          settingRow(t("settings.shake"), t("settings.shakeHint"), shake),
          settingRow(t("settings.motion"), t("settings.motionHint"), motion),
          settingRow(t("settings.sound"), t("settings.soundHint"), sound),
          settingRow(t("settings.theme"), t("settings.themeHint"), themeSel),
          settingRow(t("settings.locale"), "", locale)
        ),
        h(
          "div",
          { class: "help__section" },
          settingRow(t("settings.reset"), t("settings.resetHint"), reset)
        ),
        h(
          "div",
          { class: "help__section" },
          h("div", { class: "help__heading" }, icon("gem"), t("settings.backup")),
          h("div", { class: "help__note" }, t("settings.backupHint")),
          h("textarea", {
            class: "backup-box",
            id: "backup-text",
            rows: "3",
            placeholder: t("settings.backupEmpty"),
          }),
          h(
            "div",
            { class: "backup-actions" },
            h(
              "button",
              {
                class: "btn btn--small",
                onclick: () => {
                  const box = document.getElementById("backup-text") as HTMLTextAreaElement | null;
                  if (!box) return;
                  box.value = input.onExport();
                  box.focus();
                  box.select();
                  input.onNotice(t("settings.backupReady"));
                },
              },
              t("settings.backupExport")
            ),
            h(
              "button",
              {
                class: "btn btn--small",
                onclick: () => {
                  const box = document.getElementById("backup-text") as HTMLTextAreaElement | null;
                  if (!box) return;
                  try {
                    if (!input.onImport(box.value)) throw new Error("bad");
                    input.onNotice(t("settings.backupRestored"));
                    input.onRefresh();
                  } catch {
                    input.onNotice(t("settings.backupFailed"));
                  }
                },
              },
              t("settings.backupImport")
            )
          )
        ),
        h(
          "div",
          { class: "help__section" },
          h("div", { class: "help__heading" }, icon("book"), t("settings.about")),
          h("div", { class: "help__note" }, t("settings.aboutText")),
          ...(input.savedAt
            ? [
                h(
                  "div",
                  { class: "help__note" },
                  t("settings.storageInfo", { saved: new Date(input.savedAt).toLocaleString() })
                ),
              ]
            : [])
        ),
      ],
      foot: "",
      onBack: input.onBack,
    });
  }

  return show;
}
