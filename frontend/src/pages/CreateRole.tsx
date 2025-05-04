// src/pages/CreateRole.tsx
import React from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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
import { toast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from "lucide-react";

// --- Interfaces ---
interface RoleOption {
  id: string;
  roleType: string;
  name: string;
}

// --- Form Schema ---
const formSchema = z.object({
  roleType: z.string().min(1, { message: "Role type is required." }),
  name: z.string().min(1, { message: "Name is required." }),
  parentId: z.string().optional(), // Represents selected parent ID or the sentinel value
});

type FormInputs = z.infer<typeof formSchema>;

// --- Constants ---
const TOP_LEVEL_PARENT_ID = "ROOT"; // Value representing top-level parent in DB
const TOP_LEVEL_SENTINEL_VALUE = "__TOP_LEVEL__"; // Special value for the "Top Level" option in UI
const ROOT_ROLE_ID_FOR_FILTER = "SYSTEM_ROOT"; // Match seed script constant


export default function CreateRolePage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- React Query Hooks ---

  // 1. Fetch ALL roles to populate the parent dropdown
  const { data: parentOptions = [], isLoading: loadingParents, isError: parentLoadError, error: parentError } = useQuery<RoleOption[], Error>(
    ['allRoles'],
    async () => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");
        const res = await fetch(`${apiUrl}/roles`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to load roles list');
        }
        const json = await res.json();
        // Filter out roles with potentially empty IDs just in case
        return (json.roles as RoleOption[]).filter(role => role.id && role.id.trim() !== '');
    },
    { enabled: !!token, staleTime: 15 * 60 * 1000 }
  );

  // 2. Mutation to create a new role
  const createRoleMutation = useMutation(
    async (data: { name: string; roleType: string; parentId: string | null }) => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");
        const res = await fetch(`${apiUrl}/roles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to create role');
        }
        return res.json();
    },
    {
        onSuccess: (data) => {
            toast({ title: "Role Created", description: `Role "${data?.role?.name}" created.` });
            queryClient.invalidateQueries({ queryKey: ['allRoles'] });
            queryClient.invalidateQueries({ queryKey: ['assignableRoles'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
            navigate('/roles');
        },
         onError: (error: Error) => {
             toast({ variant: "destructive", title: "Creation Failed", description: error.message });
        }
    }
  );

  // --- Form Setup ---
  const form = useForm<FormInputs>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      roleType: '',
      name: '',
      parentId: TOP_LEVEL_SENTINEL_VALUE, // Default to selecting "Top Level"
    },
  });

  // Handle form submission
  const onSubmit = (data: FormInputs) => {
     // Convert sentinel value back to null for the backend
     const effectiveParentId = data.parentId === TOP_LEVEL_SENTINEL_VALUE ? null : data.parentId;
     console.log("Submitting create role:", { name: data.name, roleType: data.roleType, parentId: effectiveParentId });
     createRoleMutation.mutate({
        name: data.name,
        roleType: data.roleType,
        parentId: effectiveParentId
     });
  };

  // --- Render Logic ---

  if (loadingParents) { /* ... loading skeleton ... */
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
   if (parentLoadError) { /* ... error alert ... */
     return (
        <div className="p-4 md:p-6 max-w-xl mx-auto">
             <Alert variant="destructive">
                <AlertTitle>Error Loading Parent Roles</AlertTitle>
                <AlertDescription>{(parentError as Error)?.message || "Could not load data needed for the form."}</AlertDescription>
                 <div className="mt-4">
                     <Button variant="outline" asChild>
                         <Link to="/dashboard">Back to Dashboard</Link>
                     </Button>
                 </div>
            </Alert>
        </div>
     );
   }

  // Filter out the absolute root role from parent options
  const validParentOptions = parentOptions.filter(role => role.id !== ROOT_ROLE_ID_FOR_FILTER);
  console.log("[CreateRolePage] Filtered validParentOptions for rendering:", validParentOptions); // Log options before mapping

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
        <Card>
            <CardHeader>
            <CardTitle>Create New Role</CardTitle>
            <CardDescription>Define a new role within the hierarchy.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField /* ... RoleType Field ... */
                        control={form.control}
                        name="roleType"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Role Type</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g. Region, Department, City" {...field} />
                            </FormControl>
                            <FormDescription>
                                A category describing the role's level or function.
                            </FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField /* ... Name Field ... */
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Role Name</FormLabel>
                            <FormControl>
                            <Input placeholder="e.g. North Region, Sales, Cape Town" {...field} />
                            </FormControl>
                             <FormDescription>
                                A specific name for this role instance.
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
                            {/* Ensure value is string, default to sentinel */}
                            <Select onValueChange={field.onChange} value={field.value || TOP_LEVEL_SENTINEL_VALUE}>
                                <FormControl>
                                <SelectTrigger>
                                    {/* Placeholder might not show if default value is set, rely on item */}
                                    <SelectValue placeholder="Select parent..." />
                                </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                 {/* Use non-empty sentinel value for Top Level Item */}
                                <SelectItem value={TOP_LEVEL_SENTINEL_VALUE}>— Top Level Role (No Parent) —</SelectItem>
                                 {/* Render only valid parent options */}
                                {validParentOptions.map((role) => {
                                     // *** ADD LOGGING HERE ***
                                     console.log(`[CreateRolePage] Rendering SelectItem for role: ID='${role.id}', Name='${role.name}'`);
                                     // Check specifically for empty string ID before rendering
                                     if (!role.id || role.id.trim() === '') {
                                         console.error("[CreateRolePage] Attempted to render SelectItem with invalid ID:", role);
                                         return null; // Skip rendering this item
                                     }
                                     return (
                                        <SelectItem key={role.id} value={role.id}>
                                            {`${role.roleType} — ${role.name}`}
                                        </SelectItem>
                                     );
                                })}
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                Place this role under an existing role in the hierarchy.
                            </FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                        />

                    {/* Display general mutation errors */}
                    {createRoleMutation.isError && ( /* ... error alert ... */
                            <Alert variant="destructive">
                                <AlertTitle>Creation Failed</AlertTitle>
                                <AlertDescription>
                                    {(createRoleMutation.error as Error)?.message || "An unknown error occurred."}
                                </AlertDescription>
                            </Alert>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                         <Button variant="outline" type="button" onClick={() => navigate(-1)} disabled={createRoleMutation.isLoading}> {/* Go back */}
                            Cancel
                         </Button>
                         <Button type="submit" disabled={createRoleMutation.isLoading}>
                            {createRoleMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Role
                         </Button>
                    </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    </div>
  );
}
