import { useEffect, useRef } from "react";
export function trapTab(event: React.KeyboardEvent, container: HTMLElement) {
  if (event.key !== "Tab") return;
  const items = [
    ...container.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    ),
  ];
  if (!items.length) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = items[0],
    last = items.at(-1)!;
  if (!items.includes(document.activeElement as HTMLElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "취소",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  return (
    <div className="scrim">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          } else trapTab(e, e.currentTarget);
        }}
        className="confirm"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="actions">
          <button ref={cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
