// src/pages/Dashboard.tsx
import React, { useMemo } from 'react'; // Import useMemo
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator"; // Can be used if needed
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, UserPlus, Shield, ShieldPlus, LogOut, ArrowRight } from "lucide-react"; // Import icons

// Interface for the summary data from the backend
interface SummaryData {
    roleCount: number;
    userCount: number;
}

// Interface for individual role details (matching backend response)
interface Role {
  id: string;
  name: string;
  roleType: string;
  parentId: string | null;
}


export default function DashboardPage() {
  // Get auth state: token (for API calls), roles (IDs assigned to user), isRootAdmin, logout function
  const { token, roles: userRoleIds, isRootAdmin, logout } = useAuth();

  // --- Query 1: Fetch Summary Data ---
  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError, error: summaryError } = useQuery<SummaryData, Error>(
    ['dashboardSummary'],
    async () => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");
        console.log("[Dashboard] Fetching summary...");
        const res = await fetch(`${apiUrl}/summary`, {
             headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
             const errorData = await res.json().catch(() => ({}));
             console.error("[Dashboard] Error fetching summary:", errorData);
             throw new Error(errorData.error || 'Failed to fetch summary data');
        }
        const data = await res.json();
        console.log("[Dashboard] Received summary:", data);
        return data;
    },
    {
        enabled: !!token, // Only run if logged in
        staleTime: 1 * 60 * 1000, // Cache summary for 1 minute
    }
  );

  // --- Query 2: Fetch All Roles (to map IDs to names) ---
  // WARNING: Backend uses Scan - may be slow if many roles exist
  const { data: allRolesData, isLoading: areRolesLoading, isError: areRolesError, error: rolesError } = useQuery<Role[], Error>(
    ['allRoles'], // Use same key as other places fetching all roles
    async () => {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) throw new Error("VITE_API_URL is not defined.");
        console.log("[Dashboard] Fetching all roles for name lookup...");
        const res = await fetch(`${apiUrl}/roles`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
             console.error("[Dashboard] Error fetching all roles:", errorData);
            throw new Error(errorData.error || 'Failed to load roles list');
        }
        const json = await res.json();
         console.log("[Dashboard] Received all roles:", json.roles);
        return json.roles as Role[];
    },
    {
        enabled: !!token, // Only run if logged in
        staleTime: 15 * 60 * 1000, // Cache roles longer
        cacheTime: 30 * 60 * 1000,
    }
  );

  // --- Create a lookup map for role names ---
  const roleMap = useMemo(() => {
      const map = new Map<string, Role>();
      if (allRolesData) {
          allRolesData.forEach(role => map.set(role.id, role));
      }
      console.log("[Dashboard] Created roleMap:", map);
      return map;
  }, [allRolesData]); // Recompute only when allRolesData changes

  // Combined loading state
  const isLoading = isSummaryLoading || areRolesLoading;

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gray-100 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <header className="flex items-center justify-between mb-6 md:mb-8 pb-4 border-b">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </header>

        {/* Display global loading error if roles fetch fails */}
        {areRolesError && (
             <Alert variant="destructive" className="mb-6">
                <AlertTitle>Error Loading Role Data</AlertTitle>
                <AlertDescription>{(rolesError as Error)?.message || "Could not load essential role information."}</AlertDescription>
            </Alert>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">

          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6 md:space-y-8">

            {/* User Management Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" /> User Management
                </CardTitle>
                <CardDescription>
                  Create new users or view and manage existing ones within your hierarchy.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-4">
                 <Button asChild className="w-full sm:w-auto">
                    <Link to="/users/create">
                         <UserPlus className="mr-2 h-4 w-4" /> Create User
                    </Link>
                 </Button>
                 <Button variant="secondary" asChild className="w-full sm:w-auto">
                     <Link to="/users">
                         View All Users <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                 </Button>
              </CardContent>
              {/* User Count Footer */}
              <CardFooter className="text-sm text-muted-foreground pt-4 border-t">
                 {isSummaryLoading ? (
                     <Skeleton className="h-4 w-32" />
                 ) : isSummaryError ? (
                     <span className="text-destructive">Could not load user count.</span>
                 ) : (
                     `You can manage ${summary?.userCount ?? 0} user(s).`
                 )}
              </CardFooter>
            </Card>

            {/* Role Management Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" /> Role Management
                </CardTitle>
                <CardDescription>
                  Define the hierarchical structure by creating and managing roles.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-4">
                 <Button asChild className="w-full sm:w-auto">
                    <Link to="/roles/create">
                         <ShieldPlus className="mr-2 h-4 w-4" /> Create Role
                    </Link>
                 </Button>
                 <Button variant="secondary" asChild className="w-full sm:w-auto">
                     <Link to="/roles">
                         View All Roles <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                 </Button>
              </CardContent>
               {/* Role Count Footer */}
               <CardFooter className="text-sm text-muted-foreground pt-4 border-t">
                  {isSummaryLoading ? (
                     <Skeleton className="h-4 w-40" />
                  ) : isSummaryError ? (
                      <span className="text-destructive">Could not load role count.</span>
                  ) : (
                      `You can manage ${summary?.roleCount ?? 0} role(s) below you ${isRootAdmin ? '(System Total)' : ''}.`
                  )}
               </CardFooter>
            </Card>

          </div>

          {/* Right Column (Sidebar) */}
          <div className="lg:col-span-1 space-y-6 md:space-y-8">
             <Card>
                <CardHeader>
                    <CardTitle>Your Status</CardTitle>
                </CardHeader>
                <CardContent>
                    {isRootAdmin ? (
                        <p className="text-lg font-semibold text-green-600 dark:text-green-400">Root Administrator</p>
                    ) : (
                        <div>
                            <p className="font-medium mb-2">Assigned Roles:</p>
                            {/* Display loading state for roles */}
                            {areRolesLoading ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                </div>
                            ) : userRoleIds.length > 0 ? (
                                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                    {/* Map user's role IDs to names using the roleMap */}
                                    {userRoleIds.map(roleId => {
                                        const role = roleMap.get(roleId);
                                        return (
                                            <li key={roleId}>
                                                {role ? `${role.roleType} - ${role.name}` : `Unknown Role (${roleId.substring(0,8)}...)`}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="text-sm text-muted-foreground italic">No roles assigned.</p>
                            )}
                        </div>
                    )}
                </CardContent>
             </Card>

             {/* Display Summary Fetch Error if any */}
             {isSummaryError && !isLoading && ( // Show only if not loading roles
                  <Alert variant="destructive">
                    <AlertTitle>Error Loading Summary</AlertTitle>
                    <AlertDescription>{(summaryError as Error)?.message || "Could not load dashboard summary data."}</AlertDescription>
                </Alert>
             )}

          </div>

        </div>
      </div>
    </div>
  );
}
