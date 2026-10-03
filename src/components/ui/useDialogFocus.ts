import { useEffect, useRef, type RefObject } from "react";

export function isElementVisible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest("[hidden], [inert]"))
    return false;
  let current: HTMLElement | null = element;
  while (current) {
    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    )
      return false;
    current = current.parentElement;
  }
  return true;
}

export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  fallback?: RefObject<HTMLElement | null>,
) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const panel = dialog.current;
    const focusable = () =>
      [
        ...(panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => {
        const closed = element.closest("details:not([open])");
        return (
          isElementVisible(element) &&
          (!closed || element === closed.querySelector("summary"))
        );
      });
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (
        previous instanceof HTMLElement &&
        previous !== document.body &&
        isElementVisible(previous)
      ) {
        previous.focus();
      } else if (fallback?.current && isElementVisible(fallback.current)) {
        fallback.current.focus();
      }
    };
  }, [open, fallback]);

  return dialog;
}
