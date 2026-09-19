import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";

// Shown only inside the shared demo account: says plainly that it's read-only,
// and turns the moment of "this is nice" into a signup.
const DemoBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user?.isDemo) return null;

  // No logout first: PublicRoute lets a demo visitor through, and registering
  // replaces the demo session with the new account's.
  const handleSignup = () => navigate("/register");

  return (
    <div role="note" className="flex flex-wrap items-center gap-3 px-4 py-2.5 mb-4 rounded-lg bg-primary/5 border border-primary/20 text-sm text-gray-700">
      <Eye className="w-4 h-4 shrink-0 text-primary" />
      <p className="flex-1 min-w-[200px]">
        You're exploring a <strong>read-only demo</strong>. Look around freely — uploading, chatting and generating need an account.
      </p>
      <button onClick={handleSignup} className="font-medium text-primary hover:underline">
        Create a free account
      </button>
    </div>
  );
};

export default DemoBanner;
