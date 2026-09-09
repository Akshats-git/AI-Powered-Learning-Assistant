import { NavLink, useNavigate } from "react-router-dom";
import { GraduationCap, LayoutDashboard, FileText, Layers, HelpCircle, User, ShieldCheck, LogOut, X } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/quizzes", label: "Quizzes", icon: HelpCircle },
  { to: "/profile", label: "Profile", icon: User },
];

const ADMIN_NAV_ITEM = { to: "/admin/costs", label: "Cost Dashboard", icon: ShieldCheck };

const Sidebar = ({ isOpen, onClose }) => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const navItems = user?.isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 lg:static lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-gray-900">StudyAI</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-600" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-primary/10 text-primary-dark" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition"
          >
            <LogOut className="w-4.5 h-4.5" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
