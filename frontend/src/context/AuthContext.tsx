// frontend/src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// Use named import for jwt-decode
import { jwtDecode } from 'jwt-decode';

// Interface defining the expected custom claims in the JWT payload
interface AuthClaims {
  // Add email/sub if needed, based on what your token actually contains
  email?: string;
  sub?: string;
  'custom:roles': string; // Expecting a JSON string array
  'custom:isRootAdmin': 'true' | 'false'; // Expecting 'true' or 'false' string
  exp: number; // Standard JWT expiry claim (seconds since epoch)
  iat?: number; // Standard JWT issued at claim
}

// Interface defining the shape of the AuthContext value
interface AuthContextValue {
  token: string | null;         // The raw JWT string
  roles: string[];              // Parsed array of role IDs
  isRootAdmin: boolean;         // Parsed boolean root admin status
  login: (token: string) => void; // Function to handle login/token setting
  logout: () => void;           // Function to handle logout
}

// Create the React Context
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// AuthProvider component wraps the application to provide auth state
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [isRootAdmin, setIsRootAdmin] = useState(false);

  // Effect to load token from localStorage on initial component mount
  useEffect(() => {
    console.log("[AuthContext] useEffect: Checking localStorage for token...");
    const savedToken = localStorage.getItem('access_token');
    if (savedToken) {
      console.log("[AuthContext] Found token in localStorage, attempting to handle.");
      handleToken(savedToken); // Validate and set state if token found
    } else {
        console.log("[AuthContext] No token found in localStorage.");
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Function to process a JWT: decode, validate expiry, set state, store in localStorage
  function handleToken(jwt: string) {
    try {
      console.log("[AuthContext] handleToken: Decoding token...");
      // Decode the token using the named import
      const decoded = jwtDecode<AuthClaims>(jwt);
      console.log("[AuthContext] Decoded payload:", decoded);

      // Validate expiry: exp claim is in seconds, Date.now() is in milliseconds
      if (decoded.exp * 1000 < Date.now()) {
        console.log("[AuthContext] Token expired.");
        throw new Error('Token expired');
      }
      console.log("[AuthContext] Token is valid. Setting state.");

      // Set the raw token state
      setToken(jwt);

      // Safely parse roles from the custom claim
      let parsedRoles: string[] = [];
      try {
          const rolesClaim = decoded['custom:roles'];
          if (rolesClaim) {
              const tempRoles = JSON.parse(rolesClaim);
              if (Array.isArray(tempRoles)) {
                  parsedRoles = tempRoles.filter(r => typeof r === 'string');
              } else {
                   console.warn("[AuthContext] 'custom:roles' claim is not a valid JSON array:", rolesClaim);
              }
          }
      } catch (e) {
          console.error("[AuthContext] Failed to parse 'custom:roles' claim:", e);
      }
      setRoles(parsedRoles);
      console.log("[AuthContext] Roles set:", parsedRoles);


      // Parse root admin status
      const rootAdminStatus = decoded['custom:isRootAdmin'] === 'true';
      setIsRootAdmin(rootAdminStatus);
       console.log("[AuthContext] IsRootAdmin set:", rootAdminStatus);

      // Store the valid token in localStorage
      localStorage.setItem('access_token', jwt);
       console.log("[AuthContext] Token saved to localStorage.");

    } catch (error) {
      // If decoding fails or token is expired, log out
      console.error("[AuthContext] handleToken error:", error);
      logout();
    }
  }

  // Login function exposed by the context
  function login(jwt: string) {
    console.log("[AuthContext] login called.");
    handleToken(jwt); // Process the new token
  }

  // Logout function exposed by the context
  function logout() {
    console.log("[AuthContext] logout called.");
    // Clear state variables
    setToken(null);
    setRoles([]);
    setIsRootAdmin(false);
    // Remove token from localStorage
    localStorage.removeItem('access_token');
     console.log("[AuthContext] Token removed from localStorage.");
  }

  // Provide the context value to children components
  return (
    <AuthContext.Provider value={{ token, roles, isRootAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to easily consume the AuthContext
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Ensure the hook is used within a component wrapped by AuthProvider
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
