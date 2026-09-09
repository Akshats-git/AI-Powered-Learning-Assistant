import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./hooks/useAuth";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import PublicRoute from "./components/auth/PublicRoute";
import DashboardLayout from "./components/layout/DashboardLayout";

import LoginPage from "./pages/Auth/LoginPage";
import RegisterPage from "./pages/Auth/RegisterPage";
import DashboardPage from "./pages/Dashboard/DashboardPage";
import DocumentListPage from "./pages/Documents/DocumentListPage";
import DocumentDetailPage from "./pages/Documents/DocumentDetailPage";
import FlashcardPage from "./pages/Flashcards/FlashcardPage";
import FlashcardsListPage from "./pages/Flashcards/FlashcardsListPage";
import QuizzesListPage from "./pages/Quizzes/QuizzesListPage";
import QuizTakePage from "./pages/Quizzes/QuizTakePage";
import QuizResultPage from "./pages/Quizzes/QuizResultPage";
import ProfilePage from "./pages/Profile/ProfilePage";
import AdminCostDashboardPage from "./pages/Admin/AdminCostDashboardPage";
import NotFoundPage from "./pages/NotFoundPage";

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
      <Route path="/quizzes" element={<QuizzesListPage />} />
      <Route path="/quizzes/:id" element={<QuizTakePage />} />
      <Route path="/quizzes/:id/results" element={<QuizResultPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/admin/costs" element={<AdminCostDashboardPage />} />
    </Route>

    <Route path="*" element={<NotFoundPage />} />
  </Routes>
);

const App = () => (
  <Router>
    <AuthProvider>
      <Toaster position="top-center" />
      <AppRoutes />
    </AuthProvider>
  </Router>
);

export default App;
