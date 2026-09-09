import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
/** Native modal review with focus containment and explicit cancellation; callers keep it open while a command is pending. */
export function ReviewDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const host = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = host.current;
    d?.showModal();
    return () => {
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={host}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button
          aria-label="Close dialog"
          className="icon-button"
          onClick={onClose}
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
