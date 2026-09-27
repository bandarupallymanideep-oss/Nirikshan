import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/prisma';
import { createToken } from '@/auth';

export async function POST(req: Request) {
	try {
		const { name, email, password } = await req.json();

		if (!email || !password) {
			return NextResponse.json(
				{ error: 'Email and password are required' },
				{ status: 400 }
			);
		}

		if (password.length < 6) {
			return NextResponse.json(
				{ error: 'Password must be at least 6 characters' },
				{ status: 400 }
			);
		}

		// Check if user already exists
		const existingUser = await prisma.user.findUnique({
			where: { email: email.toLowerCase() },
		});

		if (existingUser) {
			return NextResponse.json(
				{ error: 'An account with this email already exists' },
				{ status: 409 }
			);
		}

		// Hash the password
		const hashedPassword = await bcrypt.hash(password, 12);

		// Create the user
		const user = await prisma.user.create({
			data: {
				name: name || null,
				email: email.toLowerCase(),
				password: hashedPassword,
			},
			select: {
				id: true,
				name: true,
				email: true,
				createdAt: true,
			},
		});

		// Create JWT token
		const token = createToken(user);

		// Set the auth cookie
		const response = NextResponse.json(
			{ user, message: 'Account created successfully' },
			{ status: 201 }
		);

		response.cookies.set('auth-token', token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7, // 7 days
			path: '/',
		});

		return response;
	} catch (error) {
		console.error('Registration error:', error);
		return NextResponse.json(
			{ error: 'An error occurred during registration' },
			{ status: 500 }
		);
	}
}
