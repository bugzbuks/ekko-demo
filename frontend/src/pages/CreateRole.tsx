// frontend/src/pages/CreateRole.tsx
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface RoleOption {
  id: string;
  roleType: string;
  name: string;
}

interface FormInputs {
  roleType: string;
  name: string;
  parentId: string;
}

export default function CreateRolePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch roles to use as possible parents
  const { data: options = [], isLoading: loading, isError: loadError } = useQuery<RoleOption[]>(
    ['assignableRoles'],
    async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/roles/assignable`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load roles');
      return (await res.json()).roles as RoleOption[];
    },
    { enabled: !!token }
  );

  // Mutation to create a new role
  const createRole = useMutation(
    async (data: FormInputs) => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/roles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create role');
      }
      return res.json();
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['assignableRoles']);
        navigate('/roles');
      },
    }
  );

  const { register, handleSubmit, formState: { errors } } = useForm<FormInputs>();
  const onSubmit = handleSubmit(data => createRole.mutate(data));

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-2xl font-semibold mb-6">Create New Role</h2>

      {loading && <p>Loading available parent roles…</p>}
      {loadError && <p className="text-red-500 mb-4">Could not load roles.</p>}

      {!loading && !loadError && (
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label htmlFor="roleType" className="block text-sm font-medium text-gray-700">
              Role Type
            </label>
            <input
              id="roleType"
              type="text"
              placeholder="e.g. City, Suburb"
              {...register('roleType', { required: 'Role type is required' })}
              className="mt-1 block w-full border border-gray-300 rounded p-2"
            />
            {errors.roleType && (
              <p className="text-red-500 text-sm mt-1">{errors.roleType.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="e.g. Cape Town"
              {...register('name', { required: 'Name is required' })}
              className="mt-1 block w-full border border-gray-300 rounded p-2"
            />
            {errors.name && (
              <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="parentId" className="block text-sm font-medium text-gray-700">
              Parent Role
            </label>
            <select
              id="parentId"
              {...register('parentId')}
              className="mt-1 block w-full border border-gray-300 rounded p-2"
            >
              <option value="">— Top level role —</option>
              {options.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.roleType} — {opt.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={createRole.isLoading}
            className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {createRole.isLoading ? 'Creating…' : 'Create Role'}
          </button>

          {createRole.isError && (
            <p className="text-red-500 text-sm mt-2">
              {(createRole.error as Error).message}
            </p>
          )}
        </form>
      )}

      <div className="mt-6 text-center">
        <Link to="/dashboard" className="text-blue-600 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
