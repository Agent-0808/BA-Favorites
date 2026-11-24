/** 弹窗底部按钮的样式与行为。 */
export interface DialogAction {
  label: string;
  /** 按钮配色：默认蓝色斜切，gray 次要操作，ghost 白底蓝描边。 */
  variant?: 'default' | 'gray' | 'ghost';
  /** 是否在点击后关闭弹窗，默认关闭。 */
  close?: boolean;
  onClick?: () => void;
}

export interface DialogOptions {
  title: string;
  /** 正文内容；内容过长时正文区内部滚动，标题栏保持固定。 */
  content: Node;
  /** 底部按钮；不传则不渲染底部操作区。 */
  actions?: DialogAction[];
}

export interface DialogHandle {
  element: HTMLDialogElement;
  open: () => void;
  close: () => void;
}

/**
 * 创建通用弹窗：双层框体 + 标题栏 + 可滚动正文 + 可选按钮区。
 * 支持点击遮罩、Esc 与右上角关闭按钮关闭。
 */
export function createDialog(options: DialogOptions): DialogHandle {
  const dialog = document.createElement('dialog');
  dialog.className = 'ba-dialog';
  dialog.setAttribute('aria-label', options.title);

  const panel = document.createElement('div');
  panel.className = 'ba-dialog-panel';

  const head = document.createElement('div');
  head.className = 'ba-dialog-head';

  const title = document.createElement('h2');
  title.className = 'ba-dialog-title';
  title.textContent = options.title;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ba-dialog-close';
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.textContent = '✕';

  head.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'ba-dialog-body';
  body.append(options.content);

  panel.append(body);

  if (options.actions?.length) {
    const foot = document.createElement('div');
    foot.className = 'ba-dialog-foot';
    for (const action of options.actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ba-btn';
      if (action.variant === 'gray') btn.classList.add('ba-btn--gray');
      if (action.variant === 'ghost') btn.classList.add('ba-btn--ghost');
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.onClick?.();
        if (action.close !== false) dialog.close();
      });
      foot.append(btn);
    }
    panel.append(foot);
  }

  // 标题栏贴住弹窗顶部，不在白色面板的内衬里，蓝色因此铺满整个顶部
  dialog.append(head, panel);

  closeBtn.addEventListener('click', () => dialog.close());
  // 点击遮罩关闭；面板内的点击不会命中 dialog 自身
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });

  document.body.append(dialog);

  return {
    element: dialog,
    open: () => dialog.showModal(),
    close: () => dialog.close()
  };
}
