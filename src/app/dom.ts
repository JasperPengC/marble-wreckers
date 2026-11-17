/** 模板里的静态元素清单：集中一处，免得各处写错 id 字符串。 */

export type TemplateElements = {
  board: HTMLCanvasElement;
  toggle: HTMLElement;
};

/** 按 id 取模板元素；模板缺元素时直接报错，好定位。 */
export function element<Id extends string>(id: Id): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing from template`);
  return node;
}

export function canvasElement(id: string): HTMLCanvasElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLCanvasElement)) {
    throw new Error(`#${id} missing from template`);
  }
  return node;
}
