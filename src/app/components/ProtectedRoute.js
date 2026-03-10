'use client';

import { useSession } from 'next-auth/react';

export default function ProtectedRoute({ children }) {
    const { status } = useSession();

    if (status === 'loading') {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 40, height: 40 }}></div>
                <h3 style={{ marginTop: 16 }}>Loading session...</h3>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        return (
            <div className="empty-state">
                <div className="empty-icon">🔒</div>
                <h3>Authentication Required</h3>
                <p>Please sign in using the sidebar to view and track your concerts.</p>
            </div>
        );
    }

    return <>{children}</>;
}
