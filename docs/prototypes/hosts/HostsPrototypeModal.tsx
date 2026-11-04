import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function HostsPrototypeModal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="hp-modal"
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="关闭" onClick={close}>
          <X size={17} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
