// src/pages/CreateUser.tsx
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Role {
  id: string;
  roleType: string;
  name: string;
}

interface FormInputs {
  email: string;
  name: string;
  roles: string[];
}

export default function CreateUserPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch assignable roles
  const {
    data: roles = [],
    isLoading: rolesLoading,
    isError: rolesError,
  } = useQuery<Role[]>(
    ['assignableRoles'],
    async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/roles/assignable`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load roles');
      const json = await res.json();
      return json.roles as Role[];
    },
    { enabled: !!token }
  );

  // Mutation to create user
  const createUser = useMutation(
    async (data: FormInputs) => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create user');
      }
      return res.json();
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['users']);
        navigate('/users');
      },
    }
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormInputs>();

  const onSubmit = (data: FormInputs) => {
    createUser.mutate(data);
  };

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-semibold mb-6">Create New User</h2>

      {rolesLoading && <p>Loading roles...</p>}
      {rolesError && <p className="text-red-500">Error loading roles</p>}

      {!rolesLoading && !rolesError && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              {...register('email', { required: 'Email is required' })}
              className="mt-1 block w-full border border-gray-300 rounded p-2"
              placeholder="user@example.com"
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              {...register('name', { required: 'Name is required' })}
              className="mt-1 block w-full border border-gray-300 rounded p-2"
              placeholder="Jane Doe"
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="roles" className="block text-sm font-medium text-gray-700">
              Assign Roles
            </label>
            <select
              id="roles"
              multiple
              {...register('roles', {
                validate: (v) => v.length > 0 || 'Select at least one role',
              })}
              className="mt-1 block w-full border border-gray-300 rounded p-2 h-36"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {`${role.roleType} — ${role.name}`}
                </option>
              ))}
            </select>
            {errors.roles && (
              <p className="text-red-500 text-sm mt-1">{errors.roles.message}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={createUser.isLoading}
          >
            {createUser.isLoading ? 'Creating...' : 'Create User'}
          </button>

          {createUser.isError && (
            <p className="text-red-500 text-sm mt-2">{(createUser.error as Error).message}</p>
          )}
        </form>
      )}
    </div>
  );
}
