import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

// Without this, a dropped connection shows up as a string of unexplained error
// toasts and endless spinners. A live region, so screen readers hear it too.
const OfflineBanner = () => {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 px-4 py-2.5 mb-4 rounded-lg bg-gray-800 text-sm text-white">
      <WifiOff className="w-4 h-4 shrink-0" />
      <p>You're offline. Changes and AI requests won't go through until your connection is back.</p>
    </div>
  );
};

export default OfflineBanner;
