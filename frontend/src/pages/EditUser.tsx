// src/pages/EditUser.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"; // Although FormLabel is often used within FormField
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
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
} from "@/components/ui/select"; // Using Select for roles, though multi-select needs care
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// --- Interfaces ---
// For data fetched about the user being edited
interface UserDetails {
  email: string;
  name: string;
  roles: string[]; // Array of role IDs
  isRootAdmin?: boolean; // Optional
  found?: boolean; // From our helper endpoint
}

// For the list of roles the current admin can assign
interface AssignableRole {
  id: string;
  roleType: string;
  name: string;
}

// For form validation
const formSchema = z.object({
  name: z.string().min(1, { message: "Name is required." }),
  // Roles will be handled separately as multi-select state, but validated on submit
  roles: z.array(z.string()).min(1, { message: "At least one role must be selected." }),
});

type FormInputs = z.infer<typeof formSchema>;

export default function EditUserPage() {
  const { email: encodedEmail } = useParams<{ email: string }>(); // Get email from URL param
  const email = encodedEmail ? decodeURIComponent(encodedEmail) : undefined;
  const navigate = useNavigate();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  // State for managing selected roles in the multi-select UI
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  // --- React Query Hooks ---

  // 1. Fetch details of the user being edited
  const { data: userData, isLoading: isUserLoading, isError: isUserError, error: userError } = useQuery<UserDetails, Error>(
    ['userDetails', email], // Query key includes the email
    async () => {
        console.log(`[EditUserPage] Fetching user details for: ${email}`);
        if (!email) throw new Error("User email not found in URL.");

        // Ensure VITE_API_URL is defined
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) {
            throw new Error("VITE_API_URL is not defined in environment variables.");
        }

        const detailsUrl = `${apiUrl}/users/${encodeURIComponent(email)}/details`;
        const res = await fetch(detailsUrl); // No auth needed for this specific helper endpoint
        console.log(`[EditUserPage] Fetch response status for user details: ${res.status}`);

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
             console.error(`[EditUserPage] Failed fetch user details response:`, errData);
            throw new Error(errData.error || `Failed to fetch user details (Status: ${res.status})`);
        }
        const data = await res.json();
         console.log(`[EditUserPage] Received user details data:`, data);
        if (!data.found) {
            throw new Error(`User with email ${email} not found.`);
        }
        return data;
    },
    {
        enabled: !!email, // Only run query if email exists
        staleTime: 5 * 60 * 1000, // Cache data for 5 minutes
        cacheTime: 10 * 60 * 1000,
        retry: 1, // Retry once on error
        onSuccess: (data) => {
            // Added log on successful fetch
            console.log("[EditUserPage] Successfully fetched user data:", data);
        },
        onError: (err) => {
             console.error("[EditUserPage] Error fetching user data:", err);
        }
    }
  );

  // 2. Fetch roles assignable by the current logged-in user
  const { data: assignableRoles = [], isLoading: areRolesLoading, isError: areRolesError, error: rolesError } = useQuery<AssignableRole[], Error>(
    ['assignableRoles'],
    async () => {
       console.log("[EditUserPage] Fetching assignable roles...");
       const apiUrl = import.meta.env.VITE_API_URL;
       if (!apiUrl) throw new Error("VITE_API_URL is not defined.");

       const res = await fetch(`${apiUrl}/roles/assignable`, {
        headers: { Authorization: `Bearer ${token}` },
      });
       console.log(`[EditUserPage] Fetch response status for assignable roles: ${res.status}`);
      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
          console.error(`[EditUserPage] Failed fetch assignable roles response:`, errData);
         throw new Error(errData.error || 'Failed to load assignable roles');
      }
      const json = await res.json();
       console.log("[EditUserPage] Received assignable roles:", json.roles);
      return json.roles as AssignableRole[];
    },
    {
        enabled: !!token, // Only run if logged in
        staleTime: 5 * 60 * 1000,
        cacheTime: 10 * 60 * 1000,
         onError: (err) => {
             console.error("[EditUserPage] Error fetching assignable roles:", err);
        }
    }
  );

  // 3. Mutation hook for updating the user
  const updateUserMutation = useMutation(
    async (data: { name: string; roles: string[] }) => {
        if (!email) throw new Error("Cannot update user without email.");
         const apiUrl = import.meta.env.VITE_API_URL;
         if (!apiUrl) throw new Error("VITE_API_URL is not defined.");

        const updateUrl = `${apiUrl}/users/${encodeURIComponent(email)}`;
        const res = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(data), // Send only name and roles
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to update user (Status: ${res.status})`);
        }
        return res.json();
    },
    {
        onSuccess: (data) => {
            toast({
                title: "User Updated",
                description: `User ${email} has been successfully updated.`,
            });
            queryClient.invalidateQueries({ queryKey: ['users'] }); // Updated syntax for RQ v5+
            queryClient.invalidateQueries({ queryKey: ['userDetails', email] }); // Updated syntax for RQ v5+
            navigate('/users');
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
      roles: [], // Initialize roles array
    },
  });

  // Effect to populate form when user data loads
  useEffect(() => {
    // Add log inside useEffect
    console.log("[EditUserPage] useEffect triggered. userData:", userData);
    if (userData) {
        const resetValues = {
            name: userData.name || '', // Ensure name is not undefined
            roles: userData.roles || [], // Ensure roles is an array
        };
        console.log("[EditUserPage] Resetting form with values:", resetValues);
      form.reset(resetValues);
      // Also update the local state used for the multi-select UI
      setSelectedRoles(userData.roles || []);
    }
  }, [userData, form.reset]); // Keep dependencies

  // Handle form submission
  const onSubmit = (data: FormInputs) => {
    console.log("[EditUserPage] Form submitted. RHF data:", data, "Selected Roles State:", selectedRoles);
    // Manually validate selectedRoles length before mutation
     if (selectedRoles.length === 0) {
         form.setError("roles", { type: "manual", message: "At least one role must be selected." });
         return; // Prevent submission
     }
    // Mutate using the name from RHF data and roles from the component state
    updateUserMutation.mutate({ name: data.name, roles: selectedRoles });
  };

  // --- Render Logic ---

  // Combined loading state
  const isLoading = isUserLoading || areRolesLoading;

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
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        </div>
     );
  }

  // Handle error states
  if (isUserError || areRolesError) {
     return (
        <div className="p-4 md:p-6 max-w-xl mx-auto">
             <Alert variant="destructive">
                <AlertTitle>Error Loading Data</AlertTitle>
                <AlertDescription>
                    {/* Display specific error first if available */}
                    {userError?.message || rolesError?.message || "Could not load necessary data to edit user."}
                </AlertDescription>
                 <div className="mt-4">
                     <Button variant="outline" asChild>
                         <Link to="/users">Back to Users</Link>
                     </Button>
                 </div>
            </Alert>
        </div>
     );
  }

  // Ensure userData exists before rendering form (should be covered by loading/error states)
  if (!userData) {
      // This case should ideally not be reached if loading/error states are handled
      return <div className="p-4">User data is unavailable after loading.</div>;
  }

  // --- Multi-select Role Handling ---
  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const options = event.target.options;
      const selected: string[] = [];
      for (let i = 0, l = options.length; i < l; i++) {
          if (options[i].selected) {
              selected.push(options[i].value);
          }
      }
      console.log("[EditUserPage] Roles selection changed:", selected);
      setSelectedRoles(selected);
      // Update form state for validation schema link
      form.setValue("roles", selected, { shouldValidate: true });
      // Clear validation error manually if selection becomes valid
       if (selected.length > 0) {
           form.clearErrors("roles");
       }
  };
  // --- End Multi-select ---


  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
        <Card>
            <CardHeader>
            <CardTitle>Edit User: {userData.email}</CardTitle>
            <CardDescription>Update the user's name and assigned roles.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => {
                            // *** ADD THIS CONSOLE LOG ***
                            console.log("[EditUserPage] Rendering Name field:", field);
                            return (
                                <FormItem>
                                    <FormLabel>Full Name</FormLabel>
                                    <FormControl>
                                    {/* Ensure value is controlled */}
                                    <Input placeholder="Jane Doe" {...field} value={field.value ?? ''} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            );
                        }}
                    />

                    {/* Basic HTML Multi-Select for Roles */}
                    <FormField
                         control={form.control} // Registering with RHF for validation schema link
                         name="roles"
                         render={({ field }) => ( // field isn't directly used for multi-select value/onChange here
                            <FormItem>
                                <FormLabel>Assigned Roles</FormLabel>
                                <FormControl>
                                     <select
                                         multiple
                                         value={selectedRoles} // Control value with state
                                         onChange={handleRoleChange} // Use custom handler
                                         className="flex h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                     >
                                         {assignableRoles.map((role) => (
                                             <option key={role.id} value={role.id}>
                                                 {`${role.roleType} — ${role.name}`}
                                             </option>
                                         ))}
                                     </select>
                                </FormControl>
                                <FormDescription>
                                    Select one or more roles (Ctrl/Cmd + Click). Only roles you can manage are shown.
                                </FormDescription>
                                <FormMessage /> {/* Shows validation error for roles */}
                            </FormItem>
                         )}
                    />


                    {/* Display general mutation errors */}
                    {updateUserMutation.isError && (
                            <Alert variant="destructive">
                                <AlertTitle>Update Failed</AlertTitle>
                                <AlertDescription>
                                    {(updateUserMutation.error as Error)?.message || "An unknown error occurred."}
                                </AlertDescription>
                            </Alert>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                         <Button variant="outline" type="button" onClick={() => navigate('/users')} disabled={updateUserMutation.isLoading}>
                            Cancel
                         </Button>
                         <Button type="submit" disabled={updateUserMutation.isLoading}>
                            {updateUserMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
