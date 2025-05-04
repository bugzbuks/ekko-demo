// frontend/src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import jwtDecode from 'jwt-decode';

interface AuthClaims {
  'custom:roles': string;
  'custom:isRootAdmin': 'true' | 'false';
  exp: number;
}

interface AuthContextValue {
  token: string | null;
  roles: string[];
  isRootAdmin: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [isRootAdmin, setIsRootAdmin] = useState(false);

  useEffect(() => {
    // Load token from storage
    const saved = localStorage.getItem('access_token');
    if (saved) {
      handleToken(saved);
    }
  }, []);

  function handleToken(jwt: string) {
    try {
      const decoded = jwtDecode<AuthClaims>(jwt);
      if (decoded.exp * 1000 < Date.now()) {
        throw new Error('Token expired');
      }
      setToken(jwt);
      setRoles(JSON.parse(decoded['custom:roles']));
      setIsRootAdmin(decoded['custom:isRootAdmin'] === 'true');
      localStorage.setItem('access_token', jwt);
    } catch {
      logout();
    }
  }

  function login(jwt: string) {
    handleToken(jwt);
  }

  function logout() {
    setToken(null);
    setRoles([]);
    setIsRootAdmin(false);
    localStorage.removeItem('access_token');
  }

  return (
    <AuthContext.Provider value={{ token, roles, isRootAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
