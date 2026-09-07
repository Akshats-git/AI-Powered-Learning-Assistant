import { X } from "lucide-react";

const Modal = ({ title, onClose, children, footer, size = "md" }) => {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        className={`relative bg-white rounded-2xl shadow-xl w-full ${widths[size]} max-h-[85vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
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
