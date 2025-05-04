// frontend/src/pages/Dashboard.tsx
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const { roles, isRootAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded shadow">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <button
            onClick={logout}
            className="text-red-600 hover:underline"
          >
            Logout
          </button>
        </header>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Your Roles</h2>
          {isRootAdmin ? (
            <p className="text-green-600">You are the Root Admin</p>
          ) : (
            <ul className="list-disc list-inside">
              {roles.map(roleId => (
                <li key={roleId}>{roleId}</li>
              ))}
            </ul>
          )}
        </section>

        <nav className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/roles"
            className="block bg-blue-500 text-white p-4 rounded hover:bg-blue-600 text-center"
          >
            Create Role
          </Link>
          <Link
            to="/users/create"
            className="block bg-green-500 text-white p-4 rounded hover:bg-green-600 text-center"
          >
            Create User
          </Link>
          <Link
            to="/users"
            className="block bg-indigo-500 text-white p-4 rounded hover:bg-indigo-600 text-center"
          >
            View Users
          </Link>
        </nav>
      </div>
    </div>
  );
}
