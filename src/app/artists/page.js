'use client';

import { useState, useEffect, useCallback } from 'react';

export default function ArtistsPage() {
    const [artists, setArtists] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [toast, setToast] = useState(null);

    const fetchArtists = useCallback(async () => {
        try {
            const res = await fetch('/api/artists');
            const data = await res.json();
            setArtists(data.artists || []);
        } catch (err) {
            console.error('Error fetching artists:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchArtists();
    }, [fetchArtists]);

    const handleAddArtist = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setAdding(true);
        try {
            const res = await fetch('/api/artists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: searchQuery.trim() }),
            });
            const data = await res.json();

            if (res.ok) {
                showToast(data.message || `Added ${data.artist?.name}!`, 'success');
                setSearchQuery('');
                fetchArtists();
            } else {
                showToast(data.error || 'Failed to add artist', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setAdding(false);
        }
    };

    const handleRemoveArtist = async (id, name) => {
        if (!confirm(`Remove ${name} and all their events?`)) return;

        try {
            const res = await fetch(`/api/artists?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast(`Removed ${name}`, 'info');
                fetchArtists();
            }
        } catch (err) {
            showToast('Error removing artist', 'error');
        }
    };

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const urlTypeIcons = {
        website: '🌐',
        instagram: '📸',
        facebook: '📘',
        twitter: '🐦',
        youtube: '▶️',
        bandcamp: '🎵',
        spotify: '🎧',
        soundcloud: '☁️',
        tiktok: '🎬',
        social: '🔗',
        other: '🔗',
    };

    // Get best link for an artist/member (website > bandcamp > social > any)
    const getArtistLink = (urls) => {
        if (!urls || urls.length === 0) return null;
        const priority = ['website', 'bandcamp', 'instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'social', 'soundcloud', 'spotify'];
        for (const type of priority) {
            const match = urls.find(u => u.url_type === type);
            if (match) return match.url;
        }
        return urls[0]?.url || null;
    };

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 40, height: 40 }}></div>
                <h3 style={{ marginTop: 16 }}>Loading artists...</h3>
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <h2>Artists</h2>
                <p>Manage the bands and solo artists you're tracking</p>
            </div>

            {/* Add artist */}
            <form className="search-container" onSubmit={handleAddArtist}>
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search for a band or artist (e.g. Radiohead, Kendrick Lamar)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={adding}
                />
                <button type="submit" className="btn-primary" disabled={adding || !searchQuery.trim()}>
                    {adding ? (
                        <><span className="spinner" style={{ width: 16, height: 16, marginRight: 8, verticalAlign: 'middle' }}></span>Adding...</>
                    ) : (
                        '+ Add Artist'
                    )}
                </button>
            </form>

            {adding && (
                <div className="card" style={{ marginBottom: 24, padding: 16, textAlign: 'center' }}>
                    <span className="spinner" style={{ marginRight: 8, verticalAlign: 'middle' }}></span>
                    Searching MusicBrainz, fetching member info & URLs, and scanning for events...
                    <br />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>This may take 10-30 seconds due to API rate limits</span>
                </div>
            )}

            {/* Artist list */}
            {artists.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🎸</div>
                    <h3>No artists tracked yet</h3>
                    <p>Search for a band above to start tracking their concerts. Members will be auto-discovered!</p>
                </div>
            ) : (
                <div className="artist-grid">
                    {artists.map(artist => (
                        <div key={artist.id} className="artist-card">
                            <div className="artist-card-header">
                                <h3>
                                    {(() => {
                                        const link = getArtistLink(artist.urls);
                                        return link ? (
                                            <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid var(--accent-primary)' }}>
                                                {artist.name}
                                            </a>
                                        ) : artist.name;
                                    })()}
                                </h3>
                                <button
                                    className="remove-btn"
                                    onClick={() => handleRemoveArtist(artist.id, artist.name)}
                                >
                                    Remove
                                </button>
                            </div>

                            <div className="artist-meta">
                                {artist.upcoming_count > 0
                                    ? `${artist.upcoming_count} upcoming show${artist.upcoming_count > 1 ? 's' : ''}`
                                    : 'No upcoming shows'}
                            </div>

                            {/* Members */}
                            {artist.members && artist.members.length > 0 && (
                                <div className="members-section">
                                    <h4>Members ({artist.members.length})</h4>
                                    <div className="member-chips">
                                        {artist.members.map(member => {
                                            const memberLink = getArtistLink(member.urls);
                                            return memberLink ? (
                                                <a key={member.id} className="member-chip" href={memberLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                                    {member.name}
                                                </a>
                                            ) : (
                                                <span key={member.id} className="member-chip">
                                                    {member.name}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* URLs — only show recognized platforms */}
                            {artist.urls && artist.urls.filter(u => u.url_type !== 'other').length > 0 && (
                                <div className="urls-section">
                                    {artist.urls
                                        .filter(u => u.url_type !== 'other')
                                        .map((urlObj, i) => (
                                            <a
                                                key={i}
                                                className="url-chip"
                                                href={urlObj.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={urlObj.url}
                                            >
                                                {urlTypeIcons[urlObj.url_type] || '🔗'} {urlObj.url_type}
                                            </a>
                                        ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {toast && (
                <div className={`toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </>
    );
}
