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
const EditUserPage = lazy(() => import('./pages/EditUser'));
// Import new Role pages lazily
const RolesListPage = lazy(() => import('./pages/RolesList'));
const EditRolePage = lazy(() => import('./pages/EditRole'));


// --- Loading Fallback ---
function LoadingFallback() {
    // You can replace this with a more sophisticated spinner/skeleton component
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
}

// --- Protected Route Component ---
// Ensures only authenticated users can access certain routes
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth(); // Get token from authentication context
  // console.log("ProtectedRoute Check: Token exists?", !!token); // Keep for debugging if needed
  if (!token) {
    // If no token, redirect to the login page
    // console.log("ProtectedRoute Redirecting to /login");
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

        {/* --- Role Routes --- */}
        <Route
          path="/roles/create" // Specific path for creating roles
          element={
            <ProtectedRoute>
              <CreateRolePage />
            </ProtectedRoute>
          }
        />
         <Route
          path="/roles/edit/:id" // Path for editing a specific role
          element={
            <ProtectedRoute>
              <EditRolePage />
            </ProtectedRoute>
          }
        />
         <Route
          path="/roles" // Main path for listing roles
          element={
            <ProtectedRoute>
              <RolesListPage />
            </ProtectedRoute>
          }
        />
        {/* --- End Role Routes --- */}


        {/* --- User Routes --- */}
        <Route
          path="/users/create"
          element={
            <ProtectedRoute>
              <CreateUserPage />
            </ProtectedRoute>
          }
        />
         <Route
          path="/users/edit/:email"
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
         {/* --- End User Routes --- */}


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
