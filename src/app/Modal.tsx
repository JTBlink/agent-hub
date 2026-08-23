import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/* ─── Modal ─────────────────────────────────────────────────────── */

export interface ModalProps {
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

export function Modal({
  open,
  onClose,
  tone = "neutral",
  title,
  children,
  icon,
  actions,
  width,
  dismissOnBackdrop = true,
}: ModalProps) {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (dismissOnBackdrop) closeRef.current();
      }}
    >
      <section
        className={`modal-panel ${tone !== "neutral" ? `tone-${tone}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={width ? { width } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-body">
          <div className="modal-heading">
            {icon && (
              <div className={`modal-icon tone-${tone}`} aria-hidden="true">
                {icon}
              </div>
            )}
            <h2
              className="modal-title"
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
            >
              {title}
            </h2>
          </div>
          <div className="modal-content">{children}</div>
          {actions && <div className="modal-actions">{actions}</div>}
        </div>
        <button
          className="icon-button modal-close"
          type="button"
          aria-label="关闭"
          onClick={onClose}
        >
          <svg
            className="icon"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </section>
    </div>,
    document.body,
  );
}

/* ─── ConfirmModal ──────────────────────────────────────────────── */

export interface ConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "danger" | "neutral";
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  tone = "neutral",
  title,
  description,
  icon,
  confirmLabel = "确认",
  cancelLabel = "取消",
}: ConfirmModalProps) {
  const defaultIcon = (
    <svg
      className="icon"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4 21 20H3L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );

  return (
    <Modal
      open={open}
      onClose={onCancel}
      tone={tone === "danger" ? "danger" : "neutral"}
      title={title}
      icon={icon ?? defaultIcon}
      dismissOnBackdrop={false}
      actions={
        <>
          <button
            className="button button-ghost"
            type="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`button ${tone === "danger" ? "button-danger" : "button-primary"}`}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {typeof description === "string" ? <p>{description}</p> : description}
    </Modal>
  );
}

/* ─── useConfirm (imperative API) ──────────────────────────────── */

interface ConfirmRequest {
  tone?: "danger" | "neutral";
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmResolver = (value: boolean) => void;

export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolverRef = useRef<ConfirmResolver | null>(null);

  const confirm = useCallback((opts: ConfirmRequest): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setRequest(opts);
    });
  }, []);

  const handleResult = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const ConfirmPortal = request ? (
    <ConfirmModal
      open
      tone={request.tone}
      title={request.title}
      description={request.description}
      icon={request.icon}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      onCancel={() => handleResult(false)}
      onConfirm={() => handleResult(true)}
    />
  ) : null;

  return { confirm, ConfirmPortal };
}
