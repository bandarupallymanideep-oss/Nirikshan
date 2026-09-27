import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/prisma';
import { createToken } from '@/auth';

export async function POST(req: Request) {
	try {
		const { email, password } = await req.json();

		if (!email || !password) {
			return NextResponse.json(
				{ error: 'Email and password are required' },
				{ status: 400 }
			);
		}

		// Find user by email
		const user = await prisma.user.findUnique({
			where: { email: email.toLowerCase() },
		});

		if (!user) {
			return NextResponse.json(
				{ error: 'Invalid email or password' },
				{ status: 401 }
			);
		}

		// Compare passwords
		const isPasswordValid = await bcrypt.compare(password, user.password);

		if (!isPasswordValid) {
			return NextResponse.json(
				{ error: 'Invalid email or password' },
				{ status: 401 }
			);
		}

		// Create JWT token
		const token = createToken({
			id: user.id,
			name: user.name,
			email: user.email,
		});

		// Set the auth cookie
		const response = NextResponse.json({
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
			},
			message: 'Logged in successfully',
		});

		response.cookies.set('auth-token', token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7, // 7 days
			path: '/',
		});

		return response;
	} catch (error) {
		console.error('Login error:', error);
		return NextResponse.json(
			{ error: 'An error occurred during login' },
			{ status: 500 }
		);
	}
}
