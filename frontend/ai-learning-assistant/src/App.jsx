import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicRoute from "./components/auth/PublicRoute";
import DashboardLayout from "./components/layout/DashboardLayout";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import { usePageTitle, titleForPath } from "./hooks/usePageTitle";

const LoginPage = lazy(() => import("./pages/Auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/Auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/Auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/Auth/ResetPasswordPage"));
const VerifyEmailPage = lazy(() => import("./pages/Auth/VerifyEmailPage"));
const DashboardPage = lazy(() => import("./pages/Dashboard/DashboardPage"));
const DocumentListPage = lazy(() => import("./pages/Documents/DocumentListPage"));
const DocumentDetailPage = lazy(() => import("./pages/Documents/DocumentDetailPage"));
const FlashcardPage = lazy(() => import("./pages/Flashcards/FlashcardPage"));
const FlashcardsListPage = lazy(() => import("./pages/Flashcards/FlashcardsListPage"));
const ReviewSessionPage = lazy(() => import("./pages/Review/ReviewSessionPage"));
const QuizzesListPage = lazy(() => import("./pages/Quizzes/QuizzesListPage"));
const QuizTakePage = lazy(() => import("./pages/Quizzes/QuizTakePage"));
const QuizResultPage = lazy(() => import("./pages/Quizzes/QuizResultPage"));
const ProfilePage = lazy(() => import("./pages/Profile/ProfilePage"));
const AdminCostDashboardPage = lazy(() => import("./pages/Admin/AdminCostDashboardPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

const PageLoader = () => (
  <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
    <span className="sr-only">Loading page</span>
  </div>
);

// Title for every static route; dynamic pages (a document) override it themselves.
const RouteTitle = () => {
  const { pathname } = useLocation();
  usePageTitle(titleForPath(pathname));
  return null;
};

const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<RootRedirect />} />

    <Route
      path="/login"
      element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      }
    />
    <Route
      path="/register"
      element={
        <PublicRoute>
          <RegisterPage />
        </PublicRoute>
      }
    />
    <Route
      path="/forgot-password"
      element={
        <PublicRoute>
          <ForgotPasswordPage />
        </PublicRoute>
      }
    />
    <Route
      path="/reset-password"
      element={
        <PublicRoute>
          <ResetPasswordPage />
        </PublicRoute>
      }
    />
    {/* Not gated by PublicRoute/ProtectedRoute — a verification link must
        work whether or not the clicking browser happens to be logged in. */}
    <Route path="/verify-email" element={<VerifyEmailPage />} />

    <Route
      element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/documents" element={<DocumentListPage />} />
      <Route path="/documents/:id" element={<DocumentDetailPage />} />
      <Route path="/documents/:id/flashcards" element={<FlashcardPage />} />
      <Route path="/flashcards" element={<FlashcardsListPage />} />
      <Route path="/review" element={<ReviewSessionPage />} />
      <Route path="/quizzes" element={<QuizzesListPage />} />
      <Route path="/quizzes/:id" element={<QuizTakePage />} />
      <Route path="/quizzes/:id/results" element={<QuizResultPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin/costs" element={<AdminCostDashboardPage />} />
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

// Outermost boundary: if something above a page breaks (the layout itself), the
// user still gets a message instead of a blank screen. Pages get their own,
// keyed by route, in DashboardLayout.
const App = () => (
  <Router>
    <AuthProvider>
      <Toaster position="top-center" />
      <RouteTitle />
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <AppRoutes />
        </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  </Router>
);

export default App;
