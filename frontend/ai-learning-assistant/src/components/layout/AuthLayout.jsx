import { GraduationCap } from "lucide-react";

const AuthLayout = ({ title, subtitle, children, footer }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-sm">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">{children}</div>

        {footer && <div className="mt-6 text-center text-xs text-gray-400">{footer}</div>}
      </div>
    </div>
  );
};

export default AuthLayout;
