/** 场景只接收只读数据与操作回调，不持有宿主或可变游戏状态。 */

export type { SceneShell } from "../app/shell.ts";

export type Translate = (key: string, values?: object) => string;
