// frontend/src/pages/UsersList.tsx
import React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

interface User {
  email: string;
  name: string;
  roles: string[];
}

interface UsersResponse {
  users: User[];
  lastKey?: Record<string, any>;
}

export default function UsersListPage() {
  const { token } = useAuth();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery<UsersResponse, Error>(
    ['users'],
    async ({ pageParam }) => {
      const url = new URL(`${import.meta.env.VITE_API_URL}/users`);
      url.searchParams.set('limit', '20');
      if (pageParam) {
        url.searchParams.set('lastKey', JSON.stringify(pageParam));
      }
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch users');
      }
      return res.json();
    },
    {
      getNextPageParam: (lastPage) => lastPage.lastKey,
    }
  );

  if (status === 'loading') {
    return <p className="p-4">Loading users...</p>;
  }
  if (status === 'error') {
    return <p className="p-4 text-red-500">Error: {error.message}</p>;
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Users</h2>
      <div className="overflow-x-auto bg-white shadow rounded">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roles</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.pages.flatMap(page => page.users).map(user => (
              <tr key={user.email}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.roles.join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-center">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => fetchNextPage()}
          disabled={!hasNextPage || isFetchingNextPage}
        >
          {isFetchingNextPage
            ? 'Loading more...'
            : hasNextPage
            ? 'Load More'
            : 'No more users'}
        </button>
      </div>

      {isFetching && !isFetchingNextPage ? <p className="text-center mt-2">Fetching...</p> : null}
    </div>
  );
}
