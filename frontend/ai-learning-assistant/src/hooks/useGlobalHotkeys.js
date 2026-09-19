import { useEffect } from "react";

const isTypingTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
};

/**
 * App-wide shortcuts:
 *   Ctrl/Cmd+K  command palette (works even while typing)
 *   /           command palette (only when not typing in a field)
 *   ?           shortcuts sheet (only when not typing in a field)
 * Single-key shortcuts are ignored while typing so they never eat real input,
 * and while a modifier is held so they never shadow browser shortcuts.
 */
export const useGlobalHotkeys = ({ onPalette, onShortcuts }) => {
  useEffect(() => {
    const handle = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onPalette();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;

      if (e.key === "/") {
        e.preventDefault(); // otherwise the "/" lands in the palette's input
        onPalette();
      } else if (e.key === "?") {
        e.preventDefault();
        onShortcuts();
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [onPalette, onShortcuts]);
};
