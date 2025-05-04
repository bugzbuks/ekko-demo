// src/pages/UsersList.tsx
import React, { useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Import Link for Back button, useNavigate for Edit button action
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from '@/hooks/use-toast'; // Corrected import path
// Import necessary icons
import { Trash2, Pencil, Loader2, ArrowLeft } from "lucide-react";

// Define the structure of a User object
interface User {
  email: string;
  name: string;
  roles: string[];
  isRootAdmin?: boolean; // Include if available from backend
}

// Define the structure of the API response for users
interface UsersResponse {
  users: User[];
  lastKey?: Record<string, any>; // For pagination
}

// Define the structure for the user to be deleted (for confirmation dialog)
interface UserToDelete {
    email: string;
    name: string;
}

// Constant for the root admin email to prevent deletion/editing actions
const ROOT_ADMIN_EMAIL = "root@system.app";

export default function UsersListPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate(); // Hook for navigation
  const [userToDelete, setUserToDelete] = useState<UserToDelete | null>(null); // State for delete confirmation

  // --- Fetch Users (Infinite Query) ---
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery<UsersResponse, Error>(
    ['users'], // Query key
    async ({ pageParam }) => { // Fetch function
      const apiUrl = import.meta.env.VITE_API_URL;
       if (!apiUrl) {
          throw new Error("VITE_API_URL is not defined in environment variables.");
      }
      const url = new URL(`${apiUrl}/users`);
      url.searchParams.set('limit', '20');
      if (pageParam) {
        url.searchParams.set('lastKey', JSON.stringify(pageParam));
      }
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Failed to fetch users' }));
        throw new Error(errorData.message || 'Failed to fetch users');
      }
      return res.json();
    },
    {
      getNextPageParam: (lastPage) => lastPage.lastKey,
      enabled: !!token,
    }
  );

  // --- Delete User Mutation ---
  const deleteUserMutation = useMutation(
    async (emailToDelete: string) => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) {
            throw new Error("VITE_API_URL is not defined in environment variables.");
        }
        const encodedEmail = encodeURIComponent(emailToDelete);
        const deleteUrl = `${apiUrl}/users/${encodedEmail}`;
        console.log(`Attempting DELETE request to: ${deleteUrl}`);

        const res = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: `Failed to delete user: ${res.statusText}` }));
            throw new Error(errorData.error || `Failed to delete user: ${res.statusText}`);
        }
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
             return res.json();
        } else {
             return { message: `User ${emailToDelete} deleted successfully (no content)` };
        }
    },
    {
        onSuccess: (data, emailToDelete) => {
            console.log("Delete success:", data);
            toast({
                title: "User Deleted",
                description: `User ${emailToDelete} has been successfully deleted.`,
            });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setUserToDelete(null);
        },
        onError: (error: Error, emailToDelete) => {
            console.error("Delete error:", error);
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: error.message || `Could not delete user ${emailToDelete}.`,
            });
            setUserToDelete(null);
        },
    }
  );

  // --- Navigation Handler for Edit ---
  const handleEditClick = (email: string) => {
      navigate(`/users/edit/${encodeURIComponent(email)}`);
  };

  // --- Render Logic ---

  if (status === 'loading') {
    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                 <Skeleton className="h-8 w-48" />
                 <div className="flex space-x-2">
                    <Skeleton className="h-9 w-44" />
                    <Skeleton className="h-9 w-36" />
                 </div>
            </div>
            <div className="space-y-2 border rounded-lg p-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        </div>
    );
  }

  if (status === 'error') {
    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
             <div className="flex justify-between items-center mb-4">
                 <h2 className="text-2xl font-semibold">Manage Users</h2>
                 <Button variant="outline" asChild>
                     <Link to="/dashboard">
                         <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                     </Link>
                 </Button>
             </div>
             <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error.message || "An unknown error occurred while fetching users."}</AlertDescription>
            </Alert>
        </div>
    );
  }

  const allUsers = data?.pages.flatMap(page => page.users) ?? [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-2xl font-semibold">Manage Users</h2>
        <div className="flex space-x-2">
            <Button variant="outline" asChild>
                 <Link to="/dashboard">
                     <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                 </Link>
             </Button>
            <Button asChild>
                <Link to="/users/create">Create New User</Link>
            </Button>
        </div>
      </div>

      {/* User Table */}
      <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px] sm:w-auto">Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right w-[100px] sm:w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allUsers.length > 0 ? (
                allUsers.map(user => (
                  <TableRow key={user.email}>
                    <TableCell className="font-medium break-all">{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                        {user.roles.join(', ') || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.email !== ROOT_ADMIN_EMAIL ? (
                        <div className="flex justify-end space-x-1 sm:space-x-2">
                           {/* Edit Button with onClick */}
                           <Button
                                variant="outline"
                                size="icon"
                                title="Edit User"
                                onClick={() => handleEditClick(user.email)} // Use onClick handler
                            >
                               <Pencil className="h-4 w-4" />
                           </Button>
                           {/* Delete Button Trigger */}
                           <Button
                                variant="destructive"
                                size="icon"
                                title="Delete User"
                                onClick={() => setUserToDelete({ email: user.email, name: user.name })}
                                disabled={deleteUserMutation.isLoading && userToDelete?.email === user.email}
                           >
                               {deleteUserMutation.isLoading && userToDelete?.email === user.email ? (
                                   <Loader2 className="h-4 w-4 animate-spin" />
                               ) : (
                                   <Trash2 className="h-4 w-4" />
                               )}
                           </Button>
                        </div>
                      ) : (
                          <span className="text-xs text-muted-foreground italic">Root Admin</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
            ) : (
                 <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                        No users found matching your permissions.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Button */}
      <div className="mt-6 flex justify-center">
        <Button
          variant="outline"
          onClick={() => fetchNextPage()}
          disabled={!hasNextPage || isFetchingNextPage}
        >
          {isFetchingNextPage ? (
              <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading more...</>
          ) : hasNextPage ? (
            'Load More Users'
          ) : (
            'No more users'
          )}
        </Button>
      </div>

      {/* General Fetching Indicator */}
      {isFetching && !isFetchingNextPage && (
           <div className="text-center mt-4 text-sm text-muted-foreground">Fetching...</div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the user{' '}
                    <span className="font-medium">{userToDelete?.name} ({userToDelete?.email})</span>{' '}
                    and remove their access.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                    onClick={() => {
                        if (userToDelete) {
                            deleteUserMutation.mutate(userToDelete.email);
                        }
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteUserMutation.isLoading}
                >
                     {deleteUserMutation.isLoading ? (
                        <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
                     ) : (
                        "Yes, delete user"
                     )}
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
