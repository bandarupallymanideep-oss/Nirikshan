'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export function RegisterForm({
	className,
	...props
}: React.ComponentPropsWithoutRef<'div'>) {
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const { register } = useAuth();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');

		if (password !== confirmPassword) {
			setError('Passwords do not match');
			return;
		}

		if (password.length < 6) {
			setError('Password must be at least 6 characters');
			return;
		}

		setLoading(true);

		const result = await register(name, email, password);

		if (result.error) {
			setError(result.error);
		}

		setLoading(false);
	};

	return (
		<div className={cn('flex flex-col gap-6', className)} {...props}>
			<Card>
				<CardHeader className='text-center'>
					<CardTitle className='text-xl'>Create Account</CardTitle>
					<CardDescription>Sign up for a Nirikshan account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<div className='grid gap-6'>
							{error && (
								<div className='rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive'>
									{error}
								</div>
							)}
							<div className='grid gap-2'>
								<Label htmlFor='name'>Name</Label>
								<Input
									id='name'
									type='text'
									placeholder='Your name'
									value={name}
									onChange={(e) => setName(e.target.value)}
									disabled={loading}
								/>
							</div>
							<div className='grid gap-2'>
								<Label htmlFor='email'>Email</Label>
								<Input
									id='email'
									type='email'
									placeholder='you@example.com'
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									disabled={loading}
								/>
							</div>
							<div className='grid gap-2'>
								<Label htmlFor='password'>Password</Label>
								<Input
									id='password'
									type='password'
									placeholder='••••••••'
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
									disabled={loading}
								/>
							</div>
							<div className='grid gap-2'>
								<Label htmlFor='confirmPassword'>Confirm Password</Label>
								<Input
									id='confirmPassword'
									type='password'
									placeholder='••••••••'
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									required
									disabled={loading}
								/>
							</div>
							<Button type='submit' className='w-full' disabled={loading}>
								{loading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
								Create Account
							</Button>
							<div className='text-center text-sm'>
								Already have an account?{' '}
								<Link href='/auth' className='underline underline-offset-4 hover:text-primary'>
									Login
								</Link>
							</div>
						</div>
					</form>
				</CardContent>
			</Card>
			<div className='text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary'>
				By clicking continue, you agree to our <a href='#'>Terms of Service</a>{' '}
				and <a href='#'>Privacy Policy</a>.
			</div>
		</div>
	);
}
