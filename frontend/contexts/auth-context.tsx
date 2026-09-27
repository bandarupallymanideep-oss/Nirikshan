'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type User = {
	id: string;
	name: string | null;
	email: string;
};

type AuthContextType = {
	user: User | null;
	loading: boolean;
	login: (email: string, password: string) => Promise<{ error?: string }>;
	register: (name: string, email: string, password: string) => Promise<{ error?: string }>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
	user: null,
	loading: true,
	login: async () => ({}),
	register: async () => ({}),
	logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const router = useRouter();

	// Check auth status on mount
	const checkAuth = useCallback(async () => {
		try {
			const res = await fetch('/api/auth/me');
			if (res.ok) {
				const data = await res.json();
				setUser(data.user);
			} else {
				setUser(null);
			}
		} catch {
			setUser(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		checkAuth();
	}, [checkAuth]);

	const login = async (email: string, password: string): Promise<{ error?: string }> => {
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
			});

			const data = await res.json();

			if (!res.ok) {
				return { error: data.error || 'Login failed' };
			}

			setUser(data.user);
			router.push('/');
			router.refresh();
			return {};
		} catch {
			return { error: 'An error occurred during login' };
		}
	};

	const register = async (name: string, email: string, password: string): Promise<{ error?: string }> => {
		try {
			const res = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, password }),
			});

			const data = await res.json();

			if (!res.ok) {
				return { error: data.error || 'Registration failed' };
			}

			setUser(data.user);
			router.push('/');
			router.refresh();
			return {};
		} catch {
			return { error: 'An error occurred during registration' };
		}
	};

	const logout = async () => {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			setUser(null);
			router.push('/auth');
			router.refresh();
		} catch {
			console.error('Logout failed');
		}
	};

	return (
		<AuthContext.Provider value={{ user, loading, login, register, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
}
