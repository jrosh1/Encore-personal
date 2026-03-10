'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthProvider from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <title>Encore — Never Miss a Show</title>
                <meta name="description" content="Track your favorite bands and never miss a show. Personalized concert alerts from multiple sources." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body>
                <AuthProvider>
                    <div className="app-layout">
                        <Sidebar />
                        <main className="main-content">
                            <ProtectedRoute>
                                {children}
                            </ProtectedRoute>
                        </main>
                    </div>
                </AuthProvider>
            </body>
        </html>
    );
}

function Sidebar() {
    const pathname = usePathname();
    const { data: session, status } = useSession();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none">
                        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" />
                    </svg>
                </div>
                <h1>Encore</h1>
            </div>

            <nav className="sidebar-nav">
                <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
                    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Dashboard
                </Link>

                <Link href="/artists" className={`nav-link ${pathname === '/artists' ? 'active' : ''}`}>
                    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                    Artists
                </Link>

                <Link href="/shows" className={`nav-link ${pathname === '/shows' ? 'active' : ''}`}>
                    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 6h16M4 12h16M4 18h12" />
                    </svg>
                    Shows
                </Link>

                <Link href="/import" className={`nav-link ${pathname === '/import' ? 'active' : ''}`}>
                    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><path d="M8 12l4-4 4 4" /><path d="M12 16V8" />
                    </svg>
                    Import
                </Link>

                <Link href="/venues" className={`nav-link ${pathname === '/venues' ? 'active' : ''}`}>
                    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
                    </svg>
                    Venues
                </Link>

                <Link href="/settings" className={`nav-link ${pathname === '/settings' ? 'active' : ''}`}>
                    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    Settings
                </Link>
            </nav>

            <div className="sidebar-footer">
                {status === 'loading' ? (
                    <div className="sync-status">Loading session...</div>
                ) : session ? (
                    <div className="user-profile">
                        <div className="sync-status" style={{ marginBottom: '8px' }}>
                            Logged in as {session.user.name || session.user.email}
                        </div>
                        <button onClick={() => signOut()} className="secondary-button" style={{ width: '100%' }}>
                            Sign Out
                        </button>
                    </div>
                ) : (
                    <button onClick={() => signIn()} className="primary-button" style={{ width: '100%' }}>
                        Sign In
                    </button>
                )}
            </div>
        </aside>
    );
}
