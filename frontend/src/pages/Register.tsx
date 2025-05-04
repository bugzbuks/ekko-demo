// frontend/src/pages/Register.tsx
import React from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';

interface RegisterFormInputs {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormInputs>();
  const password = watch('password', '');

  const registerMutation = useMutation(
    async (data: { email: string; password: string }) => {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/auth/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': import.meta.env.VITE_API_KEY,
          },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Registration failed');
      }
      return res.json();
    },
    {
      onSuccess: () => {
        navigate('/login');
      },
    }
  );

  const onSubmit = (data: RegisterFormInputs) => {
    registerMutation.mutate({ email: data.email, password: data.password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="p-8 bg-white rounded-lg shadow-lg w-full max-w-md"
      >
        <h2 className="text-2xl mb-4 text-center">Register</h2>

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

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            {...register('password', {
              required: 'Password is required',
              minLength: { value: 8, message: 'Password must be at least 8 characters' },
            })}
            className="mt-1 block w-full border border-gray-300 rounded p-2"
          />
          {errors.password && (
            <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (value) =>
                value === password || 'Passwords do not match',
            })}
            className="mt-1 block w-full border border-gray-300 rounded p-2"
          />
          {errors.confirmPassword && (
            <p className="text-red-500 text-sm mt-1">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700"
          disabled={registerMutation.isLoading}
        >
          {registerMutation.isLoading ? 'Registering...' : 'Register'}
        </button>

        {registerMutation.isError && (
          <p className="text-red-500 text-sm mt-4">
            {(registerMutation.error as Error).message}
          </p>
        )}

        <p className="text-center mt-4 text-sm">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
