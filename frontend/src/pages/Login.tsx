// src/pages/Login.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

interface LoginFormInputs {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormInputs>();

  const loginMutation = useMutation(
    async (data: LoginFormInputs) => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_API_KEY,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Login failed: ${res.statusText}`);
      }
      return res.json();
    },
    {
      onSuccess: (data) => {
        // Use AuthContext to store token and decode claims
        login(data.accessToken);
        navigate('/dashboard');
      },
    }
  );

  const onSubmit = (data: LoginFormInputs) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="p-8 bg-white rounded-lg shadow-lg w-full max-w-md"
      >
        <h2 className="text-2xl mb-4 text-center">Login</h2>

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            {...register('email', { required: 'Email is required' })}
            className="mt-1 block w-full border border-gray-300 rounded p-2"
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            {...register('password', { required: 'Password is required' })}
            className="mt-1 block w-full border border-gray-300 rounded p-2"
          />
          {errors.password && (
            <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
          disabled={loginMutation.isLoading}
        >
          {loginMutation.isLoading ? 'Logging in...' : 'Log In'}
        </button>

        {loginMutation.isError && (
          <p className="text-red-500 text-sm mt-4">{(loginMutation.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}
