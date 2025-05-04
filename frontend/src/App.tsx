// src/App.tsx
import { ReactNode, Suspense, lazy } from 'react'; // Import lazy and Suspense
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// --- Page Components ---
// Use React.lazy for code splitting (optional but good practice)
const LoginPage = lazy(() => import('./pages/Login'));
const RegisterPage = lazy(() => import('./pages/Register'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const CreateRolePage = lazy(() => import('./pages/CreateRole'));
const CreateUserPage = lazy(() => import('./pages/CreateUser'));
const UsersListPage = lazy(() => import('./pages/UsersList'));
// Define EditUserPage lazily (assuming you will create this file)
const EditUserPage = lazy(() => import('./pages/EditUser'));
// TODO: Add imports for EditRolePage, RolesListPage when created

// --- Loading Fallback ---
function LoadingFallback() {
    // You can replace this with a more sophisticated spinner/skeleton component
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
}

// --- Protected Route Component ---
// Ensures only authenticated users can access certain routes
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth(); // Get token from authentication context
  console.log("ProtectedRoute Check: Token exists?", !!token); // Add log
  if (!token) {
    // If no token, redirect to the login page
    console.log("ProtectedRoute Redirecting to /login");
    return <Navigate to="/login" replace />;
  }
  // If token exists, render the child components
  return <>{children}</>;
}

// --- Main App Component ---
export default function App() {
  return (
    // Wrap everything in Suspense for lazy loading
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/roles" // Consider renaming to /roles/create or having a separate list page
          element={
            <ProtectedRoute>
              <CreateRolePage />
            </ProtectedRoute>
          }
        />
        {/* TODO: Add route for Roles List Page */}
        {/* TODO: Add route for Edit Role Page (e.g., /roles/edit/:id) */}

        <Route
          path="/users/create"
          element={
            <ProtectedRoute>
              <CreateUserPage />
            </ProtectedRoute>
          }
        />
         <Route
          path="/users/edit/:email" // NEW: Route for editing a specific user
          element={
            <ProtectedRoute>
              <EditUserPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <UsersListPage />
            </ProtectedRoute>
          }
        />


        {/* Root and catch-all redirection */}
        {/* Redirect root to dashboard (which triggers protected route check) */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* Redirect any unmatched routes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster /> {/* Add Toaster component here for notifications */}
    </Suspense>
  );
}
