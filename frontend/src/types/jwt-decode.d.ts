// frontend/src/types/jwt-decode.d.ts

declare module 'jwt-decode' {
  // A generic function taking a JWT string and returning the decoded payload
  export default function jwtDecode<T = any>(token: string): T;
}