import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal = ({ title, onClose, children, footer, size = "md" }) => {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };
  const titleId = useId();
  const dialogRef = useRef(null);
  // Kept in a ref so the effect below runs once per open dialog: callers pass a
  // fresh inline `onClose` every render, and re-running would steal focus back
  // to the first field on every keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    const focusables = () => [...dialog.querySelectorAll(FOCUSABLE)];

    // Prefer a field in the body (the thing the user came here to fill in) over
    // the header's Close button, which is first in DOM order.
    (dialog.querySelector("input, textarea, select") || focusables()[0] || dialog).focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const outside = !dialog.contains(document.activeElement);
      if (e.shiftKey && (outside || document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Hand focus back to whatever opened the dialog, so a keyboard user isn't
      // dropped at the top of the page.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative bg-white rounded-2xl shadow-xl w-full ${widths[size]} max-h-[85vh] flex flex-col outline-none`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 id={titleId} className="text-base font-semibold text-gray-900">
            {title}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto">{children}</div>

        {footer && <div className="px-6 py-4 border-t border-gray-100 shrink-0">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
