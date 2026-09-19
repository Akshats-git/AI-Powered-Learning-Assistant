import { useCallback, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "../ui/ErrorBoundary";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import VerifyEmailBanner from "./VerifyEmailBanner";
import DemoBanner from "./DemoBanner";
import OfflineBanner from "./OfflineBanner";
import CommandPalette from "../ui/CommandPalette";
import ShortcutsSheet from "../ui/ShortcutsSheet";
import { useGlobalHotkeys } from "../../hooks/useGlobalHotkeys";

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openPalette = useCallback(() => {
    setShortcutsOpen(false);
    setPaletteOpen(true);
  }, []);
  const openShortcuts = useCallback(() => {
    setPaletteOpen(false);
    setShortcutsOpen(true);
  }, []);
  useGlobalHotkeys({ onPalette: openPalette, onShortcuts: openShortcuts });

  return (
    <div className="min-h-screen flex bg-[#F9FAFB]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setSidebarOpen(true)} onSearchClick={openPalette} />
        <main className="flex-1 p-4 sm:p-6">
          <OfflineBanner />
          <DemoBanner />
          <VerifyEmailBanner />
          {/* A crash inside one page keeps the sidebar and navbar alive, and clears on navigation. */}
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {shortcutsOpen && <ShortcutsSheet onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
};

export default DashboardLayout;
