import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import ErrorBoundary from "../ui/ErrorBoundary";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import VerifyEmailBanner from "./VerifyEmailBanner";
import DemoBanner from "./DemoBanner";

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex bg-[#F9FAFB]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <DemoBanner />
          <VerifyEmailBanner />
          {/* A crash inside one page keeps the sidebar and navbar alive, and clears on navigation. */}
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
