'use client';

import { AuthProvider } from '@/contexts/auth-context';

const SessionWrapper: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	return <AuthProvider>{children}</AuthProvider>;
};

export default SessionWrapper;
