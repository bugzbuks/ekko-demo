// src/pages/Login.tsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
// Change import to namespace import
import * as jwtEncodeLib from 'jwt-encode';

import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";


// Define validation schema using Zod
const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string(), // No password validation needed for local mode simulation
});

type LoginFormInputs = z.infer<typeof formSchema>;

// --- Constants for Local Auth ---
const IS_LOCAL_MODE = import.meta.env.VITE_IS_LOCAL_MODE === 'true';
const LOCAL_DUMMY_SECRET = "local-secret";

// Interface for the expected response from our new backend endpoint
interface UserDetailsResponse {
    email: string;
    roles: string[];
    isRootAdmin: boolean;
    found: boolean;
}

// Helper function to access the encode function, handling potential default export
const encodeToken = (payload: any, secret: string): string => {
    // Try accessing via .default first (common interop pattern)
    if (typeof (jwtEncodeLib as any).default === 'function') {
        return (jwtEncodeLib as any).default(payload, secret);
    }
    // Otherwise, assume the main export is the function (less common for CJS->ESM)
    if (typeof jwtEncodeLib === 'function') {
         // This case is unlikely given the previous error, but check just in case
         return (jwtEncodeLib as any)(payload, secret);
    }
     // Or maybe the named export is the function itself?
     if (typeof (jwtEncodeLib as any).jwtEncode === 'function') {
         return (jwtEncodeLib as any).jwtEncode(payload, secret);
     }

    // If none work, throw an error
    console.error("Could not find the jwtEncode function within the imported module.", jwtEncodeLib);
    throw new Error("jwtEncode function not found in the library.");
};


export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [localLoginLoading, setLocalLoginLoading] = useState(false);
  const [localLoginError, setLocalLoginError] = useState<string | null>(null);

  const form = useForm<LoginFormInputs>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Mutation for actual backend login (if needed in non-local mode)
  const realLoginMutation = useMutation(
    async (data: LoginFormInputs) => {
      console.log("Attempting real login (backend endpoint /auth/login needed)");
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
          throw new Error("VITE_API_URL is not defined in environment variables.");
      }
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Login failed: ${res.statusText}` }));
        throw new Error(err.error || `Login failed: ${res.statusText}`);
      }
      return res.json();
    },
    {
      onSuccess: (data) => {
        if (data.accessToken) {
            console.log("Real login successful");
            login(data.accessToken);
            navigate('/dashboard');
        } else {
             console.error("Login response missing accessToken");
             form.setError("root", { type: "manual", message: "Login failed: Invalid response from server." });
        }
      },
      onError: (error: Error) => {
          console.error("Login mutation error:", error);
          form.setError("root", { type: "manual", message: error.message || "An unknown login error occurred." });
      }
    }
  );

  // --- Local Login Fetch Logic ---
  const fetchUserDetailsAndLoginLocally = async (email: string) => {
      setLocalLoginLoading(true);
      setLocalLoginError(null);
      form.clearErrors("root");

      try {
          const apiUrl = import.meta.env.VITE_API_URL;
           if (!apiUrl) {
              throw new Error("VITE_API_URL is not defined in environment variables.");
          }
          const encodedEmail = encodeURIComponent(email);
          const detailsUrl = `${apiUrl}/users/${encodedEmail}/details`;
          console.log(`[Local Login] Fetching details from: ${detailsUrl}`);

          const res = await fetch(detailsUrl);

          if (!res.ok) {
              const errText = await res.text();
              console.error(`[Local Login] Error fetching user details: ${res.status} ${res.statusText}`, errText);
              throw new Error(`Failed to fetch user details (Status: ${res.status})`);
          }

          const userDetails: UserDetailsResponse = await res.json();
          console.log("[Local Login] Received user details:", userDetails);

          const dummyPayload = {
              email: userDetails.email,
              'custom:roles': JSON.stringify(userDetails.roles),
              'custom:isRootAdmin': userDetails.isRootAdmin ? 'true' : 'false',
              exp: Math.floor(Date.now() / 1000) + (60 * 60),
              sub: userDetails.email,
              iat: Math.floor(Date.now() / 1000),
          };

          // Use the helper function to encode the token
          const dummyToken = encodeToken(dummyPayload, LOCAL_DUMMY_SECRET);
          console.log("[Local Login] Generated dummy token.");

          login(dummyToken);
          navigate('/dashboard');

      } catch (error: any) {
          console.error("[Local Login] Error:", error);
          setLocalLoginError(error.message || "An error occurred during local login.");
          form.setError("root", { type: "manual", message: error.message || "An error occurred during local login." });
      } finally {
          setLocalLoginLoading(false);
      }
  };
  // --- End Local Login Fetch Logic ---


  // Handle form submission
  const onSubmit = (data: LoginFormInputs) => {
    if (IS_LOCAL_MODE) {
      console.log("Local mode detected (VITE_IS_LOCAL_MODE=true), attempting simulated login.");
      fetchUserDetailsAndLoginLocally(data.email);
    } else {
       console.log("Production mode detected (VITE_IS_LOCAL_MODE is not 'true'), attempting real login.");
      realLoginMutation.mutate(data);
    }
  };

  const isLoading = realLoginMutation.isLoading || localLoginLoading;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Login</CardTitle>
          <CardDescription className="text-center">
            Enter your credentials to access your dashboard.
            {IS_LOCAL_MODE && <span className="block text-yellow-600 dark:text-yellow-400 text-xs mt-1">(Local Dev Mode: Login always succeeds using entered email's roles)</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="•••••••• (ignored in local mode)" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              {form.formState.errors.root && (
                   <Alert variant="destructive" className="mt-2">
                       <AlertTitle>Login Error</AlertTitle>
                       <AlertDescription>
                           {form.formState.errors.root.message}
                       </AlertDescription>
                   </Alert>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? 'Logging in...' : 'Log In'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
           <p className="text-center text-sm text-muted-foreground">
             Don't have an account?{' '}
             <Link to="/register" className="text-primary hover:underline font-medium">
               Register
             </Link>
           </p>
        </CardFooter>
      </Card>
    </div>
  );
}
