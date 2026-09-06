import { Link } from "react-router-dom";

const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F9FAFB] text-center px-4">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <p className="text-gray-600">Page not found.</p>
      <Link to="/dashboard" className="text-primary font-medium hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
};

export default NotFoundPage;
