import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
	try {
		const session = await auth();

		if (!session) {
			return NextResponse.json(
				{ error: 'Not authenticated' },
				{ status: 401 }
			);
		}

		return NextResponse.json({ user: session.user });
	} catch (error) {
		console.error('Auth check error:', error);
		return NextResponse.json(
			{ error: 'Authentication check failed' },
			{ status: 500 }
		);
	}
}
