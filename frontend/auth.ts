import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from '@/prisma';

const JWT_SECRET = process.env.AUTH_SECRET || 'change-me-in-production';

export type SessionUser = {
	id: string;
	name: string | null;
	email: string;
};

export type Session = {
	user: SessionUser;
} | null;

/**
 * Creates a JWT token for the given user.
 */
export function createToken(user: { id: string; name: string | null; email: string }): string {
	return jwt.sign(
		{ id: user.id, name: user.name, email: user.email },
		JWT_SECRET,
		{ expiresIn: '7d' }
	);
}

/**
 * Verifies and decodes a JWT token.
 */
export function verifyToken(token: string): SessionUser | null {
	try {
		const decoded = jwt.verify(token, JWT_SECRET) as SessionUser;
		return decoded;
	} catch {
		return null;
	}
}

/**
 * Server-side function to get the current session from the auth cookie.
 * Works in Server Components, Route Handlers, and Server Actions.
 */
export async function auth(): Promise<Session> {
	const cookieStore = await cookies();
	const token = cookieStore.get('auth-token')?.value;

	if (!token) return null;

	const user = verifyToken(token);
	if (!user) return null;

	// Optionally verify user still exists in the database
	const dbUser = await prisma.user.findUnique({
		where: { id: user.id },
		select: { id: true, name: true, email: true },
	});

	if (!dbUser) return null;

	return { user: dbUser };
}
