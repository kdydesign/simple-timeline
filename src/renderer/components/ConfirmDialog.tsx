import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogCancel,AlertDialogAction} from "./ui/alert-dialog";
export function trapTab(event: React.KeyboardEvent, container: HTMLElement) {
  if (event.key !== "Tab") return;
  const items = [
    ...container.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    ),
  ].filter(item => item.tabIndex >= 0 && !item.hasAttribute("data-radix-focus-guard") && !item.closest('[hidden],[aria-hidden="true"]') && !(item instanceof HTMLInputElement && item.type === "hidden"));
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
export function ConfirmDialog({title,message,confirmLabel,cancelLabel="취소",onConfirm,onCancel}: {
 title:string;message:string;confirmLabel:string;cancelLabel?:string;onConfirm:()=>void;onCancel:()=>void;
}) {
 return <AlertDialog open>
  <AlertDialogContent className="confirm" onEscapeKeyDown={e=>{e.preventDefault();e.stopPropagation();onCancel()}} onCloseAutoFocus={e=>e.preventDefault()}>
   <AlertDialogTitle>{title}</AlertDialogTitle>
   <AlertDialogDescription>{message}</AlertDialogDescription>
   <div className="actions"><AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel><AlertDialogAction className="danger" variant="outline" onClick={onConfirm}>{confirmLabel}</AlertDialogAction></div>
  </AlertDialogContent>
 </AlertDialog>
}
