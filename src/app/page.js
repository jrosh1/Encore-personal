'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
    const router = useRouter();
    const [events, setEvents] = useState([]);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [artists, setArtists] = useState([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [toast, setToast] = useState(null);
    const [locationFilter, setLocationFilter] = useState('');

    const fetchData = useCallback(async () => {
        try {
            // Fetch all data in parallel
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

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Filter events by location search text
    const filteredEvents = useMemo(() => {
        const query = locationFilter.trim().toLowerCase();
        if (!query) return events;
        return events.filter(e => {
            const loc = [e.city, e.state, e.country].filter(Boolean).join(', ').toLowerCase();
            return loc.includes(query);
        });
    }, [events, locationFilter]);

    // Derive upcoming events from filtered events
    const filteredUpcoming = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const seen = new Set();
        return filteredEvents
            .filter(e => {
                if (e.date < today) return false;
                const key = `${e.artist_name}-${e.date}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 5);
    }, [filteredEvents]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/sync', { method: 'POST' });
            const data = await res.json();
            showToast(`Synced! Found ${data.newEvents} new events.`, 'success');
            fetchData();
        } catch (err) {
            showToast('Sync failed: ' + err.message, 'error');
        } finally {
            setSyncing(false);
        }
    };

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };
    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };
    const goToday = () => setCurrentDate(new Date());

    // Build calendar days
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    const calendarDays = [];
    // Previous month tail
    for (let i = firstDay - 1; i >= 0; i--) {
        calendarDays.push({ day: daysInPrevMonth - i, otherMonth: true, date: formatDate(year, month - 1, daysInPrevMonth - i) });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = formatDate(year, month, d);
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
        calendarDays.push({ day: d, otherMonth: false, date: dateStr, isToday });
    }
    // Next month head
    const remaining = 42 - calendarDays.length;
    for (let d = 1; d <= remaining; d++) {
        calendarDays.push({ day: d, otherMonth: true, date: formatDate(year, month + 1, d) });
    }

    // Group filtered events by date for the calendar, deduplicated by artist per day
    const eventsByDate = {};
    for (const event of filteredEvents) {
        if (!eventsByDate[event.date]) eventsByDate[event.date] = [];
        // Only add if this artist isn't already on this day
        const alreadyListed = eventsByDate[event.date].some(e => e.artist_name === event.artist_name);
        if (!alreadyListed) {
            eventsByDate[event.date].push(event);
        } else if (event.source_url) {
            // Replace the existing entry if this one has a better source_url
            const idx = eventsByDate[event.date].findIndex(e => e.artist_name === event.artist_name && !e.source_url);
            if (idx !== -1) eventsByDate[event.date][idx] = event;
        }
    }

    const totalArtists = artists.length;
    const totalMembers = artists.reduce((sum, a) => sum + (a.members?.length || 0), 0);
    const futureEvents = filteredEvents.filter(e => e.date >= today.toISOString().split('T')[0]).length;
    const sources = [...new Set(filteredEvents.map(e => e.source))].length;

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 40, height: 40 }}></div>
                <h3 style={{ marginTop: 16 }}>Loading your concerts...</h3>
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>Your upcoming shows at a glance</p>
            </div>

            {/* Stats */}
            <div className="stats-row">
                <div className="stat-card clickable" onClick={() => router.push('/artists')}>
                    <div className="stat-icon purple">🎸</div>
                    <div className="stat-content">
                        <div className="stat-value">{totalArtists}</div>
                        <div className="stat-label">Artists Tracked</div>
                    </div>
                </div>
                <div className="stat-card clickable" onClick={() => router.push('/artists')}>
                    <div className="stat-icon blue">👤</div>
                    <div className="stat-content">
                        <div className="stat-value">{totalMembers}</div>
                        <div className="stat-label">Members Tracked</div>
                    </div>
                </div>
                <div className="stat-card clickable" onClick={() => router.push('/shows')}>
                    <div className="stat-icon pink">🎫</div>
                    <div className="stat-content">
                        <div className="stat-value">{futureEvents}</div>
                        <div className="stat-label">Upcoming Shows</div>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green">🔄</div>
                    <div className="stat-content">
                        <button
                            className="btn-secondary"
                            onClick={handleSync}
                            disabled={syncing}
                            style={{ padding: '8px 16px', fontSize: 13 }}
                        >
                            {syncing ? <><span className="spinner" style={{ width: 14, height: 14, marginRight: 6, verticalAlign: 'middle' }}></span>Syncing...</> : 'Sync Now'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Calendar */}
            <div className="calendar-container">
                <div className="calendar-header">
                    <h3>Event Calendar</h3>
                    <div className="calendar-nav">
                        <div style={{ position: 'relative', marginRight: 8 }}>
                            <input
                                type="text"
                                placeholder="📍 Filter by city or state..."
                                value={locationFilter}
                                onChange={(e) => setLocationFilter(e.target.value)}
                                style={{
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 6,
                                    padding: '6px 10px',
                                    fontSize: 13,
                                    width: 200,
                                }}
                            />
                            {locationFilter && (
                                <button
                                    onClick={() => setLocationFilter('')}
                                    style={{
                                        position: 'absolute',
                                        right: 6,
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        padding: '0 4px',
                                    }}
                                >×</button>
                            )}
                        </div>
                        <button onClick={prevMonth}>← Prev</button>
                        <span className="current-month">{MONTHS[month]} {year}</span>
                        <button onClick={nextMonth}>Next →</button>
                        <button onClick={goToday}>Today</button>
                    </div>
                </div>

                <div className="calendar-grid">
                    {DAYS.map(d => (
                        <div key={d} className="calendar-day-header">{d}</div>
                    ))}
                    {calendarDays.map((d, i) => (
                        <div
                            key={i}
                            className={`calendar-day ${d.otherMonth ? 'other-month' : ''} ${d.isToday ? 'today' : ''}`}
                        >
                            <div className="day-number">{d.day}</div>
                            {(eventsByDate[d.date] || []).slice(0, 3).map((event, j) => (
                                <a
                                    key={j}
                                    className={`calendar-event source-${event.source}`}
                                    href={event.source_url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`${event.artist_name} — ${event.venue || 'TBA'}, ${event.city || ''}`}
                                >
                                    {event.artist_name}
                                </a>
                            ))}
                            {(eventsByDate[d.date] || []).length > 3 && (
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 6 }}>
                                    +{eventsByDate[d.date].length - 3} more
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Upcoming events list */}
            <div style={{ marginTop: 32 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                    Next Up
                    {locationFilter && (
                        <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                            matching "{locationFilter}"
                        </span>
                    )}
                </h3>
                {filteredUpcoming.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📅</div>
                        <h3>No upcoming events{locationFilter ? ' matching that location' : ''}</h3>
                        <p>{locationFilter ? 'Try a different search or clear the filter.' : 'Add some artists to start tracking their shows, then sync to fetch events.'}</p>
                    </div>
                ) : (
                    <div className="event-list">
                        {filteredUpcoming.map((event, i) => {
                            const d = new Date(event.date + 'T00:00:00');
                            return (
                                <a
                                    key={i}
                                    className="event-card"
                                    href={event.source_url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <div className="event-date-badge">
                                        <div className="month">{MONTHS[d.getMonth()]?.slice(0, 3)}</div>
                                        <div className="day">{d.getDate()}</div>
                                    </div>
                                    <div className="event-info">
                                        <div className="event-title">{event.artist_name} — {event.title}</div>
                                        <div className="event-meta">
                                            {event.venue || 'Venue TBA'}
                                            {event.city ? ` · ${event.city}` : ''}
                                            {event.state ? `, ${event.state}` : ''}
                                        </div>
                                    </div>
                                    <span className={`event-source-badge ${event.source}`}>{event.source}</span>
                                    {event.source_url && (
                                        <span className="event-link-btn">View →</span>
                                    )}
                                </a>
                            );
                        })}
                    </div>
                )}
            </div>

            {toast && (
                <div className={`toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </>
    );
}

function formatDate(year, month, day) {
    // Handle month overflow/underflow
    const d = new Date(year, month, day);
    return d.toISOString().split('T')[0];
}
