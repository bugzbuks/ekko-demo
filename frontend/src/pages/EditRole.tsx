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
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from '@/hooks/use-toast'; // Ensure correct path
import { Loader2, ArrowLeft } from "lucide-react";

// --- Constants ---
const ROOT_ROLE_ID = "SYSTEM_ROOT";
const TOP_LEVEL_PARENT_ID = "ROOT"; // Value representing top-level parent in DB
const TOP_LEVEL_SENTINEL_VALUE = "__TOP_LEVEL__"; // Special value for the "Top Level" option in UI

// --- Interfaces ---
interface RoleDetails {
  id: string;
  name: string;
  roleType: string;
  parentId: string | null;
}

interface RoleOption {
  id: string;
  roleType: string;
  name: string;
}

// --- Form Schema ---
const formSchema = z.object({
  name: z.string().min(1, { message: "Name is required." }),
  roleType: z.string().min(1, { message: "Role type is required." }),
  // parentId now represents selected parent ID or the sentinel value
  parentId: z.string().optional(),
});

type FormInputs = z.infer<typeof formSchema>;

export default function EditRolePage() {
  const { id: roleId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  // --- React Query Hooks ---

  // 1. Fetch role details
  const { data: roleData, isLoading: isRoleLoading, isError: isRoleError, error: roleError } = useQuery<RoleDetails, Error>(
    ['roleDetails', roleId],
    async () => {
        console.log(`[EditRolePage] Fetching role details for ID: ${roleId}`);
        if (!roleId) throw new Error("Role ID not found in URL.");
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");
        const detailsUrl = `${apiUrl}/roles/${roleId}`;
        const res = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`[EditRolePage] Fetch response status for role details: ${res.status}`);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error(`[EditRolePage] Failed fetch role details response:`, errData);
            throw new Error(errData.error || `Failed to fetch role details (Status: ${res.status})`);
        }
        const data = await res.json();
        console.log(`[EditRolePage] Received role details data:`, data);
        if (!data.role) throw new Error(`Role with ID ${roleId} not found.`);
        return data.role;
    },
    { enabled: !!roleId && !!token, staleTime: 5 * 60 * 1000, cacheTime: 10 * 60 * 1000, retry: 1 }
  );

  // 2. Fetch all roles for parent dropdown
  const { data: allRoles = [], isLoading: areRolesLoading, isError: areRolesError, error: rolesListError } = useQuery<RoleOption[], Error>(
    ['allRoles'],
    async () => {
       console.log("[EditRolePage] Fetching all roles for parent dropdown...");
       const apiUrl = import.meta.env.VITE_API_URL;
       if (!apiUrl) throw new Error("VITE_API_URL is not defined.");
       const res = await fetch(`${apiUrl}/roles`, { headers: { Authorization: `Bearer ${token}` } });
       console.log(`[EditRolePage] Fetch response status for all roles: ${res.status}`);
       if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error(`[EditRolePage] Failed fetch all roles response:`, errData);
          throw new Error(errData.error || 'Failed to load roles list');
       }
       const json = await res.json();
       console.log("[EditRolePage] Received all roles:", json.roles);
       return (json.roles as RoleOption[]).filter(role => role.id && role.id.trim() !== ''); // Pre-filter invalid IDs
    },
    { enabled: !!token, staleTime: 15 * 60 * 1000, cacheTime: 30 * 60 * 1000 }
  );

  // 3. Mutation hook for updating the role
  const updateRoleMutation = useMutation(
    // Data now includes name, roleType, and the *processed* parentId (TOP_LEVEL_PARENT_ID or actual ID)
    async (data: { name: string; roleType: string; parentId: string }) => {
        if (!roleId) throw new Error("Cannot update role without ID.");
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");
        const updateUrl = `${apiUrl}/roles/${roleId}`;
        // Prepare payload: send null if parentId is TOP_LEVEL_PARENT_ID, otherwise send the ID string
        const payload = {
            name: data.name,
            roleType: data.roleType,
            parentId: data.parentId === TOP_LEVEL_PARENT_ID ? null : data.parentId
        };
        console.log(`[EditRolePage] Sending PUT request to ${updateUrl} with payload:`, payload);
        const res = await fetch(updateUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
        });
        console.log(`[EditRolePage] PUT response status: ${res.status}`);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error(`[EditRolePage] Failed update role response:`, errData);
            throw new Error(errData.error || `Failed to update role (Status: ${res.status})`);
        }
        return res.json();
    },
    {
        onSuccess: (data) => {
             console.log("[EditRolePage] Update successful:", data);
            toast({ title: "Role Updated", description: `Role ${roleData?.name} updated.` });
            queryClient.invalidateQueries({ queryKey: ['allRoles'] });
            queryClient.invalidateQueries({ queryKey: ['roleDetails', roleId] });
            queryClient.invalidateQueries({ queryKey: ['assignableRoles'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
            navigate('/roles');
        },
        onError: (error: Error) => {
             console.error("[EditRolePage] Update mutation error:", error);
             toast({ variant: "destructive", title: "Update Failed", description: error.message });
        }
    }
  );

  // --- Form Setup ---
  const form = useForm<FormInputs>({
    resolver: zodResolver(formSchema),
    // Default parentId to the sentinel value if it should represent "Top Level" initially
    defaultValues: { name: '', roleType: '', parentId: TOP_LEVEL_SENTINEL_VALUE },
  });

  // Effect to populate form when role data loads
  useEffect(() => {
    console.log("[EditRolePage] useEffect triggered. roleData:", roleData);
    if (roleData) {
      // Map null or 'ROOT' parentId from DB to the sentinel value for the form
      const formParentId = (roleData.parentId === null || roleData.parentId === undefined || roleData.parentId === TOP_LEVEL_PARENT_ID)
                           ? TOP_LEVEL_SENTINEL_VALUE
                           : roleData.parentId;
      const resetValues = { name: roleData.name || '', roleType: roleData.roleType || '', parentId: formParentId };
      console.log("[EditRolePage] Resetting form with values:", resetValues);
      form.reset(resetValues);
    }
  }, [roleData, form.reset]);

  // Handle form submission
  const onSubmit = (data: FormInputs) => {
    // Convert the sentinel value back to the actual value needed by the backend ('ROOT')
    const effectiveParentId = data.parentId === TOP_LEVEL_SENTINEL_VALUE ? TOP_LEVEL_PARENT_ID : data.parentId!;
    console.log("[EditRolePage] Form submitted. RHF data:", data, "Effective ParentId for mutation:", effectiveParentId);
     if (roleId === effectiveParentId) {
         form.setError("parentId", { type: "manual", message: "A role cannot be its own parent." });
         return;
     }
    // Mutate using the processed parentId ('ROOT' or actual ID)
    updateRoleMutation.mutate({ name: data.name, roleType: data.roleType, parentId: effectiveParentId });
  };

  // --- Render Logic ---
  const isLoading = isRoleLoading || areRolesLoading;

  if (isLoading) { /* ... loading skeleton ... */
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
  if (isRoleError || areRolesError) { /* ... error alert ... */
     return (
        <div className="p-4 md:p-6 max-w-xl mx-auto">
             <Alert variant="destructive">
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>
                    {roleError?.message || rolesListError?.message || "Could not load necessary data to edit role."}
                </AlertDescription>
                 <div className="mt-4">
                     <Button variant="outline" asChild>
                         <Link to="/roles">Back to Roles</Link>
                     </Button>
                 </div>
            </Alert>
        </div>
     );
   }
  if (!roleData) { /* ... no data message ... */
      return <div className="p-4">Role data is unavailable after loading.</div>;
  }

  // Filter out the current role and the root role from the parent options
  const validParentOptions = allRoles.filter(r => r.id !== roleId && r.id !== ROOT_ROLE_ID);

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
                    <FormField /* ... Name Field ... */
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
                     <FormField /* ... RoleType Field ... */
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
                    <FormField /* ... ParentId Field ... */
                        control={form.control}
                        name="parentId"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Parent Role</FormLabel>
                            {/* Use field.value which is controlled by form.reset/onChange */}
                            {/* Ensure field.value is a string, default to sentinel if empty/null */}
                            <Select onValueChange={field.onChange} value={field.value || TOP_LEVEL_SENTINEL_VALUE}>
                                <FormControl>
                                <SelectTrigger>
                                     {/* Placeholder is now less critical as we have an explicit item */}
                                    <SelectValue placeholder="Select parent..." />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                 {/* *** FIX: Use non-empty sentinel value for Top Level Item *** */}
                                 <SelectItem value={TOP_LEVEL_SENTINEL_VALUE}>— Top Level Role (No Parent) —</SelectItem>
                                 {/* Map over the actual valid parent options */}
                                {validParentOptions.map((role) => (
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
                    {updateRoleMutation.isError && ( /* ... error alert ... */
                            <Alert variant="destructive">
                                <AlertTitle>Update Failed</AlertTitle>
                                <AlertDescription>
                                    {(updateRoleMutation.error as Error)?.message || "An unknown error occurred."}
                                </AlertDescription>
                            </Alert>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                         <Button variant="outline" type="button" onClick={() => navigate('/roles')} disabled={updateRoleMutation.isLoading}>
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
