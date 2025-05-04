// src/pages/RolesList.tsx
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { toast } from '@/hooks/use-toast';
import { Trash2, Pencil, Loader2, ArrowLeft, PlusCircle } from "lucide-react";

// --- Interfaces ---
interface Role {
  id: string;
  name: string;
  roleType: string;
  parentId: string | null; // Can be null or 'ROOT' from backend/seed
}

// For delete confirmation
interface RoleToDelete {
    id: string;
    name: string;
}

// --- Constants ---
const ROOT_ROLE_ID = "SYSTEM_ROOT";
const TOP_LEVEL_PARENT_ID = "ROOT"; // Sentinel value used in backend/seed

export default function RolesListPage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [roleToDelete, setRoleToDelete] = useState<RoleToDelete | null>(null);

  // --- Fetch All Roles Query ---
  // WARNING: Backend uses Scan - inefficient for large number of roles.
  const { data: rolesData, isLoading, isError, error } = useQuery<Role[], Error>(
    ['allRoles'], // Query key
    async () => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");

        const res = await fetch(`${apiUrl}/roles`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to fetch roles');
        }
        const json = await res.json();
        return json.roles as Role[];
    },
    {
        enabled: !!token, // Only run if logged in
        staleTime: 5 * 60 * 1000, // Cache for 5 mins
    }
  );

  // --- Delete Role Mutation ---
  const deleteRoleMutation = useMutation(
    async (roleIdToDelete: string) => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");

        const deleteUrl = `${apiUrl}/roles/${roleIdToDelete}`;
        console.log(`Attempting DELETE request to: ${deleteUrl}`);

        const res = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: `Failed to delete role: ${res.statusText}` }));
            throw new Error(errorData.error || `Failed to delete role: ${res.statusText}`);
        }
         // Handle potential no-content response
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
             return res.json();
        } else {
             return { message: `Role ${roleIdToDelete} deleted successfully (no content)` };
        }
    },
    {
        onSuccess: (data, roleIdToDelete) => {
            console.log("Delete success:", data);
            toast({
                title: "Role Deleted",
                description: `Role ${roleToDelete?.name || roleIdToDelete} has been successfully deleted.`,
            });
            // Invalidate relevant queries to refetch
            queryClient.invalidateQueries({ queryKey: ['allRoles'] });
            queryClient.invalidateQueries({ queryKey: ['assignableRoles'] }); // Also invalidate assignable roles
            setRoleToDelete(null); // Close confirmation dialog
        },
        onError: (error: Error, roleIdToDelete) => {
            console.error("Delete error:", error);
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: error.message || `Could not delete role ${roleToDelete?.name || roleIdToDelete}.`,
            });
            setRoleToDelete(null); // Close confirmation dialog
        },
    }
  );

  // --- Data Processing for Display ---
  // Create a map for easy parent name lookup
  const roleMap = useMemo(() => {
      const map = new Map<string, Role>();
      rolesData?.forEach(role => map.set(role.id, role));
      return map;
  }, [rolesData]);

  const getParentName = (parentId: string | null): string => {
      if (!parentId || parentId === TOP_LEVEL_PARENT_ID) {
          return "Top Level / Root";
      }
      return roleMap.get(parentId)?.name ?? `Unknown (${parentId.substring(0, 8)}...)`;
  };

  // --- Render Logic ---

  if (isLoading) {
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
            </div>
        </div>
    );
  }

  if (isError) {
     return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
             <div className="flex justify-between items-center mb-4">
                 <h2 className="text-2xl font-semibold">Manage Roles</h2>
                 <Button variant="outline" asChild>
                     <Link to="/dashboard">
                         <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                     </Link>
                 </Button>
             </div>
             <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{(error as Error)?.message || "An unknown error occurred while fetching roles."}</AlertDescription>
            </Alert>
        </div>
     );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-2xl font-semibold">Manage Roles</h2>
        {/* Action Buttons */}
        <div className="flex space-x-2">
            <Button variant="outline" asChild>
                 <Link to="/dashboard">
                     <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                 </Link>
             </Button>
            <Button asChild>
                <Link to="/roles/create"> {/* Assuming /roles/create is the route */}
                     <PlusCircle className="mr-2 h-4 w-4" /> Create New Role
                </Link>
            </Button>
        </div>
      </div>

      {/* Roles Table */}
      <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead className="text-right w-[100px] sm:w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rolesData && rolesData.length > 0 ? (
                // Sort roles maybe? Or display hierarchy? For now, simple list.
                rolesData.map(role => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell>{role.roleType}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                        {getParentName(role.parentId)}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Prevent actions on the root role */}
                      {role.id !== ROOT_ROLE_ID ? (
                        <div className="flex justify-end space-x-1 sm:space-x-2">
                           {/* Edit Button/Link */}
                           <Button
                                variant="outline"
                                size="icon"
                                asChild
                                title="Edit Role"
                            >
                               <Link to={`/roles/edit/${role.id}`}> {/* Link to EditRolePage */}
                                   <Pencil className="h-4 w-4" />
                               </Link>
                           </Button>
                           {/* Delete Button Trigger */}
                           <Button
                                variant="destructive"
                                size="icon"
                                title="Delete Role"
                                onClick={() => setRoleToDelete({ id: role.id, name: role.name })}
                                disabled={deleteRoleMutation.isLoading && roleToDelete?.id === role.id}
                           >
                               {deleteRoleMutation.isLoading && roleToDelete?.id === role.id ? (
                                   <Loader2 className="h-4 w-4 animate-spin" />
                               ) : (
                                   <Trash2 className="h-4 w-4" />
                               )}
                           </Button>
                        </div>
                      ) : (
                          <span className="text-xs text-muted-foreground italic">Root Role</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
            ) : (
                 <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                        No roles found. Create one to get started.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

       {/* Delete Confirmation Dialog */}
       <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the role{' '}
                    <span className="font-medium">{roleToDelete?.name}</span>.
                    Deleting a role does not automatically remove it from assigned users.
                    Child roles must be reassigned or deleted first.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setRoleToDelete(null)}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                    onClick={() => {
                        if (roleToDelete) {
                            deleteRoleMutation.mutate(roleToDelete.id);
                        }
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteRoleMutation.isLoading}
                >
                     {deleteRoleMutation.isLoading ? (
                        <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
                     ) : (
                        "Yes, delete role"
                     )}
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
