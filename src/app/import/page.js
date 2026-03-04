'use client';

import { useState, useEffect } from 'react';

export default function ImportPage() {
    const [spotifyArtists, setSpotifyArtists] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
    const [toast, setToast] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        checkConnection();
    }, []);

    const checkConnection = async () => {
        try {
            const res = await fetch('/api/spotify?action=status');
            const data = await res.json();
            setConnected(data.connected);
            if (data.connected) {
                fetchSpotifyArtists();
            } else {
                setLoading(false);
            }
        } catch {
            setLoading(false);
        }
    };

    const fetchSpotifyArtists = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/spotify/artists');
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSpotifyArtists(data.artists || []);
            // Auto-select all not-yet-tracked artists
            const untracked = (data.artists || []).filter(a => !a.alreadyTracked).map(a => a.spotifyId);
            setSelected(new Set(untracked));
        } catch (err) {
            showToast('Error loading Spotify artists: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async () => {
        try {
            const res = await fetch('/api/spotify');
            const data = await res.json();
            if (data.authUrl) {
                window.location.href = data.authUrl;
            } else {
                showToast('Could not get Spotify auth URL. Check your credentials in Settings.', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const toggleSelect = (spotifyId) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(spotifyId)) next.delete(spotifyId);
            else next.add(spotifyId);
            return next;
        });
    };

    const selectAll = () => {
        const untracked = spotifyArtists.filter(a => !a.alreadyTracked).map(a => a.spotifyId);
        setSelected(new Set(untracked));
    };

    const deselectAll = () => setSelected(new Set());

    const handleImport = async () => {
        const toImport = spotifyArtists.filter(a => selected.has(a.spotifyId) && !a.alreadyTracked);
        if (toImport.length === 0) return;

        setImporting(true);
        setProgress({ done: 0, total: toImport.length, current: '' });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < toImport.length; i++) {
            const artist = toImport[i];
            setProgress({ done: i, total: toImport.length, current: artist.name });

            try {
                const res = await fetch('/api/artists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: artist.name }),
                });

                if (res.ok) {
                    successCount++;
                    // Mark as tracked in local state
                    setSpotifyArtists(prev => prev.map(a =>
                        a.spotifyId === artist.spotifyId ? { ...a, alreadyTracked: true } : a
                    ));
                    setSelected(prev => {
                        const next = new Set(prev);
                        next.delete(artist.spotifyId);
                        return next;
                    });
                } else {
                    const data = await res.json();
                    if (data.error === 'Artist already tracked') {
                        setSpotifyArtists(prev => prev.map(a =>
                            a.spotifyId === artist.spotifyId ? { ...a, alreadyTracked: true } : a
                        ));
                    } else {
                        failCount++;
                    }
                }
            } catch {
                failCount++;
            }

            // Small delay to not overwhelm the APIs
            await new Promise(r => setTimeout(r, 500));
        }

        setProgress({ done: toImport.length, total: toImport.length, current: 'Done!' });
        setImporting(false);
        showToast(`Imported ${successCount} artists${failCount > 0 ? ` (${failCount} failed)` : ''}`, successCount > 0 ? 'success' : 'error');
    };

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    };

    const untrackedCount = spotifyArtists.filter(a => !a.alreadyTracked).length;
    const selectedCount = [...selected].filter(id => {
        const a = spotifyArtists.find(x => x.spotifyId === id);
        return a && !a.alreadyTracked;
    }).length;

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 40, height: 40 }}></div>
                <h3 style={{ marginTop: 16 }}>
                    {connected ? 'Loading your Spotify artists...' : 'Checking connection...'}
                </h3>
                {connected && <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Fetching top + followed artists across all time ranges</p>}
            </div>
        );
    }

    if (!connected) {
        return (
            <>
                <div className="page-header">
                    <h2>Import from Spotify</h2>
                    <p>Connect your Spotify account to import your favorite artists</p>
                </div>
                <div className="empty-state">
                    <div className="empty-icon">🎧</div>
                    <h3>Spotify not connected</h3>
                    <p style={{ marginBottom: 20 }}>First, add your Spotify Client ID and Secret in Settings, then connect here.</p>
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                        <a href="/settings" className="btn-secondary" style={{ textDecoration: 'none' }}>⚙️ Go to Settings</a>
                        <button className="btn-primary" onClick={handleConnect}>🎵 Connect Spotify</button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="page-header">
                <h2>Import from Spotify</h2>
                <p>{spotifyArtists.length} artists found · {untrackedCount} new · {spotifyArtists.length - untrackedCount} already tracked</p>
            </div>

            {/* Controls */}
            <div className="import-controls">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn-secondary" onClick={selectAll} disabled={importing}>Select All New ({untrackedCount})</button>
                    <button className="btn-secondary" onClick={deselectAll} disabled={importing}>Deselect All</button>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        {selectedCount} selected
                    </span>
                </div>
                <button
                    className="btn-primary"
                    onClick={handleImport}
                    disabled={importing || selectedCount === 0}
                >
                    {importing
                        ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 8, verticalAlign: 'middle' }}></span>Importing ({progress.done}/{progress.total})...</>
                        : `🎵 Import ${selectedCount} Artist${selectedCount !== 1 ? 's' : ''}`
                    }
                </button>
            </div>

            {/* Progress bar */}
            {importing && (
                <div className="import-progress">
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }}></div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
                        Adding: <strong>{progress.current}</strong> ({progress.done}/{progress.total})
                    </div>
                </div>
            )}

            {/* Artist grid */}
            <div className="import-grid">
                {spotifyArtists.map(artist => (
                    <div
                        key={artist.spotifyId}
                        className={`import-card ${artist.alreadyTracked ? 'tracked' : ''} ${selected.has(artist.spotifyId) && !artist.alreadyTracked ? 'selected' : ''}`}
                        onClick={() => !artist.alreadyTracked && !importing && toggleSelect(artist.spotifyId)}
                    >
                        <div className="import-card-img">
                            {artist.imageUrl
                                ? <img src={artist.imageUrl} alt={artist.name} />
                                : <div className="import-card-placeholder">🎵</div>
                            }
                        </div>
                        <div className="import-card-info">
                            <div className="import-card-name">{artist.name}</div>
                            <div className="import-card-genres">{artist.genres?.slice(0, 2).join(', ') || 'Music'}</div>
                        </div>
                        <div className="import-card-check">
                            {artist.alreadyTracked ? (
                                <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Tracked</span>
                            ) : (
                                <div className={`checkbox ${selected.has(artist.spotifyId) ? 'checked' : ''}`}>
                                    {selected.has(artist.spotifyId) && '✓'}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
        </>
    );
}
