'use client';

import { useState, useEffect, useCallback } from 'react';

const POPULAR_VENUES = [
    { name: 'Red Rocks Amphitheatre', website_url: 'https://www.redrocksonline.com/concerts-events/', city: 'Morrison', state: 'CO' },
    { name: 'Madison Square Garden', website_url: 'https://www.msg.com/calendar', city: 'New York', state: 'NY' },
    { name: 'The Gorge Amphitheatre', website_url: 'https://www.georgeamphitheatre.com/events', city: 'George', state: 'WA' },
    { name: 'Hollywood Bowl', website_url: 'https://www.hollywoodbowl.com/events/performances', city: 'Los Angeles', state: 'CA' },
    { name: 'Radio City Music Hall', website_url: 'https://www.msg.com/radio-city-music-hall/calendar', city: 'New York', state: 'NY' },
];

export default function VenuesPage() {
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [toast, setToast] = useState(null);
    const [form, setForm] = useState({ name: '', website_url: '', city: '', state: '', country: 'US' });

    const fetchVenues = useCallback(async () => {
        try {
            const res = await fetch('/api/venues');
            const data = await res.json();
            setVenues(data.venues || []);
        } catch (err) {
            console.error('Error fetching venues:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchVenues(); }, [fetchVenues]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.website_url.trim()) return;

        setAdding(true);
        const isEditing = editingId !== null;
        
        try {
            const res = await fetch('/api/venues', {
                method: isEditing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isEditing ? { id: editingId, ...form } : form),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || (isEditing ? 'Venue updated!' : `Added ${data.venue?.name}!`), 'success');
                setForm({ name: '', website_url: '', city: '', state: '', country: 'US' });
                setEditingId(null);
                fetchVenues();
            } else {
                showToast(data.error || (isEditing ? 'Failed to update venue' : 'Failed to add venue'), 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setAdding(false);
        }
    };
    
    const startEditing = (venue) => {
        setEditingId(venue.id);
        setForm({
            name: venue.name,
            website_url: venue.website_url,
            city: venue.city || '',
            state: venue.state || '',
            country: venue.country || 'US',
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEditing = () => {
        setEditingId(null);
        setForm({ name: '', website_url: '', city: '', state: '', country: 'US' });
    };

    const handleQuickAdd = async (venue) => {
        setAdding(true);
        try {
            const res = await fetch('/api/venues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(venue),
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Added ${venue.name}!`, 'success');
                fetchVenues();
            } else {
                showToast(data.error || 'Already added', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = async (id, name) => {
        if (!confirm(`Remove ${name}?`)) return;
        try {
            const res = await fetch(`/api/venues?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast(`Removed ${name}`, 'info');
                fetchVenues();
            }
        } catch (err) {
            showToast('Error removing venue', 'error');
        }
    };

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const trackedUrls = new Set(venues.map(v => v.website_url));

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 40, height: 40 }}></div>
                <h3 style={{ marginTop: 16 }}>Loading venues...</h3>
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <h2>Venues</h2>
                <p>Track specific concert venues to pull their full schedules</p>
            </div>

            {/* Add/Edit venue form */}
            <form className="card" onSubmit={handleSubmit} style={{ marginBottom: 24, padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{editingId ? 'Edit Venue' : 'Add a Venue'}</h3>
                <div className="form-row" style={{ gap: 12 }}>
                    <div className="form-group" style={{ flex: 2 }}>
                        <label>Venue Name</label>
                        <input
                            type="text"
                            placeholder="Red Rocks Amphitheatre"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            required
                        />
                    </div>
                    <div className="form-group" style={{ flex: 3 }}>
                        <label>Events Page URL</label>
                        <input
                            type="url"
                            placeholder="https://venue.com/events"
                            value={form.website_url}
                            onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))}
                            required
                        />
                    </div>
                </div>
                <div className="form-row" style={{ gap: 12, marginTop: 12 }}>
                    <div className="form-group">
                        <label>City</label>
                        <input
                            type="text"
                            placeholder="Morrison"
                            value={form.city}
                            onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                        />
                    </div>
                    <div className="form-group">
                        <label>State</label>
                        <input
                            type="text"
                            placeholder="CO"
                            value={form.state}
                            onChange={e => setForm(p => ({ ...p, state: e.target.value }))}
                        />
                    </div>
                    <div className="form-group">
                        <label>Country</label>
                        <input
                            type="text"
                            placeholder="US"
                            value={form.country}
                            onChange={e => setForm(p => ({ ...p, country: e.target.value }))}
                        />
                    </div>
                    {editingId && (
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={cancelEditing}
                            disabled={adding}
                            style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap', marginRight: 8 }}
                        >
                            Cancel
                        </button>
                    )}
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={adding || !form.name.trim() || !form.website_url.trim()}
                        style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
                    >
                        {adding ? 'Saving...' : (editingId ? 'Save Changes' : '+ Add Venue')}
                    </button>
                </div>
            </form>

            {/* Quick-add popular venues */}
            {POPULAR_VENUES.filter(v => !trackedUrls.has(v.website_url)).length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>POPULAR VENUES</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {POPULAR_VENUES.filter(v => !trackedUrls.has(v.website_url)).map(v => (
                            <button
                                key={v.website_url}
                                className="btn-secondary"
                                onClick={() => handleQuickAdd(v)}
                                disabled={adding}
                                style={{ fontSize: 13, padding: '6px 14px' }}
                            >
                                + {v.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Venue list */}
            {venues.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🏟️</div>
                    <h3>No venues tracked yet</h3>
                    <p>Add your favorite venues above or use the quick-add buttons</p>
                </div>
            ) : (
                <div className="shows-list">
                    {venues.map(venue => (
                        <div key={venue.id} className="show-row">
                            <div className="show-date" style={{ background: 'rgba(20, 184, 166, 0.08)' }}>
                                <div style={{ fontSize: 22 }}>🏟️</div>
                            </div>
                            <div className="show-details">
                                <div className="show-artist">{venue.name}</div>
                                <div className="show-location">
                                    {venue.city}{venue.state ? `, ${venue.state}` : ''}{venue.country && venue.country !== 'US' ? ` · ${venue.country}` : ''}
                                </div>
                            </div>
                            <div className="show-actions">
                                <a
                                    href={venue.website_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="event-link-btn"
                                >
                                    Schedule →
                                </a>
                                <button
                                    className="edit-btn"
                                    onClick={() => startEditing(venue)}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-color)',
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    Edit
                                </button>
                                <button
                                    className="remove-btn"
                                    onClick={() => handleRemove(venue.id, venue.name)}
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
        </>
    );
}
