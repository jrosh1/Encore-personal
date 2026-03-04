'use client';

import { useState, useEffect, useCallback } from 'react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ShowsPage() {
    const [events, setEvents] = useState([]);
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterArtist, setFilterArtist] = useState('all');
    const [filterCity, setFilterCity] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterSource, setFilterSource] = useState('all');
    const [sortOrder, setSortOrder] = useState('asc');

    const fetchData = useCallback(async () => {
        try {
            const [eventsRes, artistsRes] = await Promise.all([
                fetch('/api/events'),
                fetch('/api/artists'),
            ]);
            const eventsData = await eventsRes.json();
            const artistsData = await artistsRes.json();
            setEvents(eventsData.events || []);
            setArtists(artistsData.artists || []);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Deduplicate by artist+date+venue
    const seen = new Set();
    const dedupedEvents = events.filter(e => {
        const key = `${e.artist_name}-${e.date}-${(e.venue || '').toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Apply filters
    const filtered = dedupedEvents.filter(e => {
        if (filterArtist !== 'all' && String(e.artist_id) !== filterArtist) return false;
        if (filterCity && !((e.city || '').toLowerCase().includes(filterCity.toLowerCase()) ||
            (e.state || '').toLowerCase().includes(filterCity.toLowerCase()) ||
            (e.venue || '').toLowerCase().includes(filterCity.toLowerCase()))) return false;
        if (filterDateFrom && e.date < filterDateFrom) return false;
        if (filterDateTo && e.date > filterDateTo) return false;
        if (filterSource !== 'all' && e.source !== filterSource) return false;
        return true;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        return sortOrder === 'asc'
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date);
    });

    // Get unique sources and cities for filter options
    const sources = [...new Set(events.map(e => e.source).filter(Boolean))];
    const allArtistNames = [...new Set(events.map(e => ({ id: e.artist_id, name: e.artist_name })))]
        .reduce((acc, curr) => {
            if (!acc.find(a => a.id === curr.id)) acc.push(curr);
            return acc;
        }, [])
        .sort((a, b) => a.name.localeCompare(b.name));

    const clearFilters = () => {
        setFilterArtist('all');
        setFilterCity('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterSource('all');
    };

    const hasActiveFilters = filterArtist !== 'all' || filterCity || filterDateFrom || filterDateTo || filterSource !== 'all';

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 40, height: 40 }}></div>
                <h3 style={{ marginTop: 16 }}>Loading shows...</h3>
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <h2>All Shows</h2>
                <p>{sorted.length} show{sorted.length !== 1 ? 's' : ''} found{hasActiveFilters ? ' (filtered)' : ''}</p>
            </div>

            {/* Filters */}
            <div className="filters-bar">
                <div className="filter-group">
                    <label>Artist</label>
                    <select value={filterArtist} onChange={e => setFilterArtist(e.target.value)}>
                        <option value="all">All Artists</option>
                        {allArtistNames.map(a => (
                            <option key={a.id} value={String(a.id)}>{a.name}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label>Location</label>
                    <input
                        type="text"
                        placeholder="City, state, or venue..."
                        value={filterCity}
                        onChange={e => setFilterCity(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <label>From</label>
                    <input
                        type="date"
                        value={filterDateFrom}
                        onChange={e => setFilterDateFrom(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <label>To</label>
                    <input
                        type="date"
                        value={filterDateTo}
                        onChange={e => setFilterDateTo(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <label>Source</label>
                    <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                        <option value="all">All Sources</option>
                        {sources.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <label>Sort</label>
                    <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                        <option value="asc">Soonest First</option>
                        <option value="desc">Latest First</option>
                    </select>
                </div>

                {hasActiveFilters && (
                    <button className="btn-secondary" onClick={clearFilters} style={{ alignSelf: 'flex-end', padding: '8px 16px', fontSize: 13 }}>
                        ✕ Clear
                    </button>
                )}
            </div>

            {/* Shows list */}
            {sorted.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🎤</div>
                    <h3>{hasActiveFilters ? 'No shows match your filters' : 'No shows found'}</h3>
                    <p>{hasActiveFilters ? 'Try adjusting your filter criteria.' : 'Add artists and sync to discover shows.'}</p>
                </div>
            ) : (
                <div className="shows-list">
                    {sorted.map((event, i) => {
                        const d = new Date(event.date + 'T00:00:00');
                        const isPast = event.date < new Date().toISOString().split('T')[0];
                        return (
                            <div key={`${event.id}-${i}`} className={`show-row ${isPast ? 'past' : ''}`}>
                                <div className="show-date">
                                    <div className="show-month">{MONTHS[d.getMonth()]?.slice(0, 3)}</div>
                                    <div className="show-day">{d.getDate()}</div>
                                    <div className="show-year">{d.getFullYear()}</div>
                                </div>

                                <div className="show-details">
                                    <div className="show-artist">{event.artist_name}</div>
                                    <div className="show-title">{event.title}</div>
                                    <div className="show-location">
                                        {event.venue || 'Venue TBA'}
                                        {event.city ? ` · ${event.city}` : ''}
                                        {event.state ? `, ${event.state}` : ''}
                                        {event.country && event.country !== 'US' ? ` · ${event.country}` : ''}
                                    </div>
                                </div>

                                <div className="show-actions">
                                    <span className={`event-source-badge ${event.source}`}>{event.source}</span>
                                    {event.source_url && (
                                        <a
                                            href={event.source_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="event-link-btn"
                                        >
                                            View →
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}
