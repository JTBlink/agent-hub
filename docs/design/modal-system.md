# 弹窗系统技术方案

## 背景

AgentHub 需要在多处展示弹窗反馈（操作结果、确认提示、错误通知），但之前的实现存在以下问题：

- 两个弹窗组件（`LegacyActionFeedbackModal`、`ClearUserDataConfirmModal`）逻辑高度重复。
- 破坏性操作使用浏览器原生 `window.confirm()`，与暗色主题不一致。
- CSS 样式分散为独立命名（`.action-feedback-*`、`.data-clear-confirm*`），难以维护。

## 设计目标

1. 统一弹窗行为（portal、键盘、焦点管理、响应式）到一个组件。
2. 提供声明式（`<Modal>`、`<ConfirmModal>`）和命令式（`useConfirm`）两种 API。
3. 通过色调变体区分场景，保持视觉一致性。
4. 支持无障碍（ARIA、焦点陷阱、Escape 键关闭）。

## 组件 API

### `<Modal>`

通用弹窗容器，所有变体的基础。

```tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  tone?: "neutral" | "success" | "error" | "danger";
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  width?: string;
  dismissOnBackdrop?: boolean;
}
```

### `<ConfirmModal>`

基于 `<Modal>` 的确认弹窗快捷组件，预设取消/确认按钮。

```tsx
interface ConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "danger" | "neutral";
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  confirmLabel?: string; // 默认 "确认"
  cancelLabel?: string; // 默认 "取消"
}
```

`tone="danger"` 时确认按钮使用 `.button-danger` 样式；确认弹窗默认不允许点击遮罩关闭。

### `useConfirm()`

命令式 Hook，用于替换 `window.confirm()`。

```tsx
const { confirm, ConfirmPortal } = useConfirm();

async function handleDelete() {
  const ok = await confirm({
    tone: "danger",
    title: "确定删除？",
    description: "此操作不可恢复。",
  });
  if (!ok) return;
  // ...
}

// ConfirmPortal 需放入 JSX 树中（使用 createPortal，位置无限制）
return <>{ConfirmPortal}</>;
```

## 色调变体

| 色调      | 用途               | 边框          | 图标色        |
| --------- | ------------------ | ------------- | ------------- |
| `neutral` | 普通信息、通用确认 | `var(--line)` | `var(--blue)` |
| `success` | 操作成功反馈       | `#2b6675`     | `#77d2ae`     |
| `error`   | 操作失败反馈       | `#8a4a52`     | `#ff9da5`     |
| `danger`  | 破坏性操作确认     | `#71404b`     | `#ff9da5`     |

## 行为规范

- **渲染方式**：`createPortal` 到 `document.body`，z-index 1000。
- **遮罩**：半透明深色 + 轻度 blur（3px），防止过度模糊影响感知。
- **关闭方式**：Escape 键、遮罩点击（可配置）、右上角关闭按钮、操作按钮。
- **焦点管理**：打开时焦点移至标题（`tabIndex={-1}`），关闭后由调用方恢复焦点。
- **动画**：遮罩 fade-in 160ms，面板 slide-up + scale 190ms；`prefers-reduced-motion` 下禁用。
- **响应式**：小屏（≤ 560px）时面板贴底对齐、全宽、按钮拉伸。

## 文件位置

| 文件                | 内容                            |
| ------------------- | ------------------------------- |
| `src/app/Modal.tsx` | Modal、ConfirmModal、useConfirm |
| `src/styles.css`    | `.modal-*` 系列样式             |

## 使用示例

### 操作反馈

```tsx
<Modal
  open={!!feedback}
  onClose={() => setFeedback(undefined)}
  tone={feedback?.tone === "error" ? "error" : "success"}
  title={feedback?.title ?? ""}
  icon={
    <Icon name={feedback?.tone === "error" ? "warning" : "check"} size={20} />
  }
  actions={
    <button className="button button-primary" onClick={dismiss}>
      关闭
    </button>
  }
>
  <p>{feedback?.summary}</p>
</Modal>
```

### 破坏性确认

```tsx
<ConfirmModal
  open={showConfirm}
  tone="danger"
  title="确定清理备份？"
  description="操作完成后无法从 AgentHub 恢复。"
  confirmLabel="确认清理"
  onCancel={() => setShowConfirm(false)}
  onConfirm={handleClear}
/>
```

### 命令式确认（替代 window.confirm）

```tsx
const { confirm, ConfirmPortal } = useConfirm();

const ok = await confirm({
  title: "确认迁移？",
  description: (
    <>
      <div className="modal-paths">
        <code>原位置：...</code>
      </div>
    </>
  ),
  confirmLabel: "确认迁移",
});
```
