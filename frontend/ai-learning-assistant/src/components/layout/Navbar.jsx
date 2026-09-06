import { Bell, Menu } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

const initialsOf = (name) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

const Navbar = ({ onMenuClick }) => {
  const { user } = useAuth();

  return (
    <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-gray-100 bg-white">
      <button
        onClick={onMenuClick}
        className="lg:hidden text-gray-500 hover:text-gray-700"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-4">
        <button className="text-gray-400 hover:text-gray-600 relative" aria-label="Notifications">
          <Bell className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white text-xs font-semibold">
            {initialsOf(user?.username)}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium text-gray-800">{user?.username}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
