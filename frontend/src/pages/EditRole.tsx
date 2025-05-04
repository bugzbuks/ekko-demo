// src/pages/EditRole.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"; // Using Shadcn Select for parent role
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

// --- Constants ---
const ROOT_ROLE_ID = "SYSTEM_ROOT"; // Should not be editable anyway, but good for checks
const TOP_LEVEL_PARENT_ID = "ROOT"; // Value representing top-level parent in DB

// --- Interfaces ---
// For data fetched about the role being edited
interface RoleDetails {
  id: string;
  name: string;
  roleType: string;
  parentId: string | null; // Can be null from DB, map to TOP_LEVEL_PARENT_ID if needed
}

// For the list of roles to populate parent dropdown
interface RoleOption {
  id: string;
  roleType: string;
  name: string;
  // Add parentId if needed for filtering/display, but backend currently sends all
}

// For form validation
const formSchema = z.object({
  name: z.string().min(1, { message: "Name is required." }),
  roleType: z.string().min(1, { message: "Role type is required." }),
  parentId: z.string().optional(), // Parent ID from the select dropdown (value is string ID or empty string for 'ROOT')
});

type FormInputs = z.infer<typeof formSchema>;

export default function EditRolePage() {
  const { id: roleId } = useParams<{ id: string }>(); // Get role ID from URL param
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  // --- React Query Hooks ---

  // 1. Fetch details of the role being edited
  const { data: roleData, isLoading: isRoleLoading, isError: isRoleError, error: roleError } = useQuery<RoleDetails, Error>(
    ['roleDetails', roleId], // Query key includes the role ID
    async () => {
        if (!roleId) throw new Error("Role ID not found in URL.");
        // Use the new GET /roles/{id} endpoint
        const detailsUrl = `${import.meta.env.VITE_API_URL}/roles/${roleId}`;
        const res = await fetch(detailsUrl, {
             headers: { Authorization: `Bearer ${token}` }, // Endpoint is protected
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to fetch role details (Status: ${res.status})`);
        }
        const data = await res.json();
        // The backend returns { role: RoleDetails }, extract the role object
        if (!data.role) {
             throw new Error(`Role with ID ${roleId} not found.`);
        }
        return data.role;
    },
    {
        enabled: !!roleId && !!token, // Only run query if ID and token exist
        staleTime: 5 * 60 * 1000,
        cacheTime: 10 * 60 * 1000,
        retry: 1,
    }
  );

  // 2. Fetch ALL roles to populate the parent dropdown
  // WARNING: Uses Scan on backend - may be slow if many roles exist
  const { data: allRoles = [], isLoading: areRolesLoading, isError: areRolesError, error: rolesListError } = useQuery<RoleOption[], Error>(
    ['allRoles'], // Separate query key for all roles
    async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/roles`, { // Use new GET /roles endpoint
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error || 'Failed to load roles list');
      }
      const json = await res.json();
      return json.roles as RoleOption[];
    },
    {
        enabled: !!token,
        staleTime: 15 * 60 * 1000, // Cache longer as roles might not change often
        cacheTime: 30 * 60 * 1000,
    }
  );

  // 3. Mutation hook for updating the role
  const updateRoleMutation = useMutation(
    // Data includes name, roleType, and the *processed* parentId ('ROOT' or actual ID)
    async (data: { name: string; roleType: string; parentId: string }) => {
        if (!roleId) throw new Error("Cannot update role without ID.");
        const updateUrl = `${import.meta.env.VITE_API_URL}/roles/${roleId}`;
        const payload = {
            name: data.name,
            roleType: data.roleType,
            // Send null if parentId is 'ROOT', otherwise send the ID string
            parentId: data.parentId === TOP_LEVEL_PARENT_ID ? null : data.parentId
        };
        const res = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to update role (Status: ${res.status})`);
        }
        return res.json();
    },
    {
        onSuccess: (data) => {
            toast({
                title: "Role Updated",
                description: `Role ${roleData?.name} has been successfully updated.`,
            });
            // Invalidate queries to refetch data
            queryClient.invalidateQueries(['allRoles']); // Invalidate roles list
            queryClient.invalidateQueries(['roleDetails', roleId]); // Invalidate this role's details
            queryClient.invalidateQueries(['assignableRoles']); // Assignable roles might change
            // TODO: Navigate back to a roles list page when it exists
            navigate('/dashboard'); // Navigate back to dashboard for now
        },
        onError: (error: Error) => {
             toast({
                variant: "destructive",
                title: "Update Failed",
                description: error.message || "An unknown error occurred.",
            });
        }
    }
  );

  // --- Form Setup ---
  const form = useForm<FormInputs>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      roleType: '',
      parentId: '', // Default to empty string, representing 'ROOT' selection
    },
  });

  // Effect to populate form when role data loads
  useEffect(() => {
    if (roleData) {
      form.reset({
        name: roleData.name,
        roleType: roleData.roleType,
        // Set parentId for the form. If DB has null/undefined, use empty string for 'ROOT' option.
        // If DB has 'ROOT', use empty string. Otherwise use the ID.
        parentId: (roleData.parentId === null || roleData.parentId === undefined || roleData.parentId === TOP_LEVEL_PARENT_ID) ? '' : roleData.parentId,
      });
    }
  }, [roleData, form.reset]);

  // Handle form submission
  const onSubmit = (data: FormInputs) => {
    // Process parentId: if empty string from form, use TOP_LEVEL_PARENT_ID ('ROOT')
    const effectiveParentId = data.parentId === '' ? TOP_LEVEL_PARENT_ID : data.parentId!;
    console.log("Submitting update:", { name: data.name, roleType: data.roleType, parentId: effectiveParentId });

    // Prevent making role its own parent (double check)
     if (roleId === effectiveParentId) {
         form.setError("parentId", { type: "manual", message: "A role cannot be its own parent." });
         return;
     }

    updateRoleMutation.mutate({
        name: data.name,
        roleType: data.roleType,
        parentId: effectiveParentId
    });
  };

  // --- Render Logic ---

  // Combined loading state
  const isLoading = isRoleLoading || areRolesLoading;

  // Handle loading states
  if (isLoading) {
     return (
        <div className="p-4 md:p-6 max-w-xl mx-auto">
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/5" />
                    <Skeleton className="h-4 w-4/5" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        </div>
     );
  }

  // Handle error states
  if (isRoleError || areRolesError) {
     return (
        <div className="p-4 md:p-6 max-w-xl mx-auto">
             <Alert variant="destructive">
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>
                    {roleError?.message || rolesListError?.message || "Could not load necessary data to edit role."}
                </AlertDescription>
                 <div className="mt-4">
                      {/* TODO: Link back to roles list page */}
                     <Button variant="outline" asChild>
                         <Link to="/dashboard">Back to Dashboard</Link>
                     </Button>
                 </div>
            </Alert>
        </div>
     );
  }

  // Ensure roleData exists before rendering form
  if (!roleData) {
      return <div className="p-4">Role data is unavailable.</div>;
  }

  // Filter out the current role and the root role from the parent options
  const parentRoleOptions = allRoles.filter(r => r.id !== roleId && r.id !== ROOT_ROLE_ID);

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
        <Card>
            <CardHeader>
            <CardTitle>Edit Role: {roleData.name}</CardTitle>
            <CardDescription>Update the role's details and parent.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role Name</FormLabel>
                            <FormControl>
                            <Input placeholder="e.g. Cape Town" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                     <FormField
                        control={form.control}
                        name="roleType"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role Type</FormLabel>
                            <FormControl>
                            <Input placeholder="e.g. City, Suburb" {...field} />
                            </FormControl>
                             <FormDescription>
                                A category for the role (e.g., Region, Department).
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="parentId"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Parent Role</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select the parent role" />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                 {/* Option for Top Level (ROOT) */}
                                <SelectItem value="">— Top Level Role (No Parent) —</SelectItem>
                                 {/* Filtered list of possible parents */}
                                {parentRoleOptions.map((role) => (
                                    <SelectItem key={role.id} value={role.id}>
                                        {`${role.roleType} — ${role.name}`}
                                    </SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                Assign this role under another role in the hierarchy.
                            </FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                        />

                    {/* Display general mutation errors */}
                    {updateRoleMutation.isError && (
                            <Alert variant="destructive">
                                <AlertTitle>Update Failed</AlertTitle>
                                <AlertDescription>
                                    {(updateRoleMutation.error as Error)?.message || "An unknown error occurred."}
                                </AlertDescription>
                            </Alert>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                         {/* TODO: Link back to roles list page */}
                         <Button variant="outline" type="button" onClick={() => navigate('/dashboard')} disabled={updateRoleMutation.isLoading}>
                            Cancel
                         </Button>
                         <Button type="submit" disabled={updateRoleMutation.isLoading}>
                            {updateRoleMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                         </Button>
                    </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    </div>
  );
}
