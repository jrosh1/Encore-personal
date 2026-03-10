'use client';

import { useState, useEffect, useCallback } from 'react';

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        ticketmaster_api_key: '',
        smtp_host: '',
        smtp_port: '587',
        smtp_user: '',
        smtp_pass: '',
        notification_email: '',
        poll_interval_hours: '6',
        spotify_client_id: '',
        spotify_client_secret: '',
        filter_country: 'US',
        filter_state: '',
        digest_imap_host: '',
        digest_imap_port: '993',
        digest_imap_user: '',
        digest_imap_pass: '',
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testingEmail, setTestingEmail] = useState(false);
    const [toast, setToast] = useState(null);
    const [spotifyConnected, setSpotifyConnected] = useState(false);
    const [connectingSpotify, setConnectingSpotify] = useState(false);
    const [sendingDigest, setSendingDigest] = useState(false);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            if (data.settings) {
                setSettings(prev => ({ ...prev, ...data.settings }));
            }
        } catch (err) {
            console.error('Error fetching settings:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
        checkSpotifyStatus();
    }, [fetchSettings]);

    const checkSpotifyStatus = async () => {
        try {
            const res = await fetch('/api/spotify?action=status');
            const data = await res.json();
            setSpotifyConnected(data.connected);
        } catch { /* ignore */ }
    };

    const handleConnectSpotify = async () => {
        // Save credentials first
        setConnectingSpotify(true);
        try {
            await fetch('/api/spotify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: settings.spotify_client_id,
                    clientSecret: settings.spotify_client_secret,
                }),
            });
            const res = await fetch('/api/spotify');
            const data = await res.json();
            if (data.authUrl) {
                window.location.href = data.authUrl;
            } else {
                showToast('Could not get auth URL. Check credentials.', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setConnectingSpotify(false);
        }
    };

    const handleDisconnectSpotify = async () => {
        try {
            await fetch('/api/spotify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'disconnect' }),
            });
            setSpotifyConnected(false);
            showToast('Disconnected from Spotify', 'info');
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Settings saved!', 'success');
            } else {
                showToast(data.error || 'Failed to save', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTestEmail = async () => {
        setTestingEmail(true);
        try {
            // Save settings first
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });

            const res = await fetch('/api/settings', { method: 'POST' });
            const data = await res.json();
            if (data.sent) {
                showToast('Test email sent! Check your inbox.', 'success');
            } else {
                showToast(data.reason || 'Failed to send test email', 'error');
            }
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally {
            setTestingEmail(false);
        }
    };

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 40, height: 40 }}></div>
                <h3 style={{ marginTop: 16 }}>Loading settings...</h3>
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <h2>Settings</h2>
                <p>Configure API keys, email notifications, and sync preferences</p>
            </div>

            <form onSubmit={handleSave}>
                <div className="settings-grid">
                    {/* Spotify */}
                    <div className="form-section">
                        <h3>🎧 Spotify Import</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="spotify-id">Client ID</label>
                                <input
                                    id="spotify-id"
                                    type="text"
                                    placeholder="Your Spotify app Client ID"
                                    value={settings.spotify_client_id}
                                    onChange={(e) => updateSetting('spotify_client_id', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="spotify-secret">Client Secret</label>
                                <input
                                    id="spotify-secret"
                                    type="password"
                                    placeholder="Your Spotify app Client Secret"
                                    value={settings.spotify_client_secret}
                                    onChange={(e) => updateSetting('spotify_client_secret', e.target.value)}
                                />
                            </div>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                            Create a free app at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>developer.spotify.com/dashboard →</a>
                            <br />Set the redirect URI to: <code style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>http://127.0.0.1:3000/api/spotify/callback</code>
                        </p>
                        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                            {spotifyConnected ? (
                                <>
                                    <span style={{ fontSize: 13, color: 'var(--success)' }}>✓ Connected</span>
                                    <a href="/import" className="btn-primary" style={{ textDecoration: 'none', padding: '8px 16px', fontSize: 13 }}>🎵 Import Artists</a>
                                    <button type="button" className="btn-secondary" onClick={handleDisconnectSpotify} style={{ padding: '8px 16px', fontSize: 13 }}>Disconnect</button>
                                </>
                            ) : (
                                <button type="button" className="btn-primary" onClick={handleConnectSpotify} disabled={connectingSpotify || !settings.spotify_client_id} style={{ padding: '8px 16px', fontSize: 13 }}>
                                    {connectingSpotify ? 'Connecting...' : '🎧 Connect Spotify'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Email Notifications */}
                    <div className="form-section">
                        <h3>📧 Email Notifications</h3>
                        <div className="form-group">
                            <label htmlFor="notify-email">Send alerts to</label>
                            <input
                                id="notify-email"
                                type="email"
                                placeholder="your@email.com"
                                value={settings.notification_email}
                                onChange={(e) => updateSetting('notification_email', e.target.value)}
                            />
                        </div>

                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                            Emails will be sent using the global email server configured by the administrator.
                        </p>
                    </div>

                    {/* Sync Preferences */}
                    <div className="form-section">
                        <h3>🔄 Sync Preferences</h3>
                        <div className="form-group">
                            <label htmlFor="poll-interval">Check for new events every</label>
                            <select
                                id="poll-interval"
                                value={settings.poll_interval_hours}
                                onChange={(e) => updateSetting('poll_interval_hours', e.target.value)}
                            >
                                <option value="1">1 hour</option>
                                <option value="3">3 hours</option>
                                <option value="6">6 hours</option>
                                <option value="12">12 hours</option>
                                <option value="24">24 hours</option>
                            </select>
                        </div>

                        <div style={{ marginTop: 16 }}>
                            <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>Location Filter</h4>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Limit Ticketmaster results to a specific region</p>
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="filter-country">Country Code</label>
                                    <input
                                        id="filter-country"
                                        type="text"
                                        placeholder="US"
                                        value={settings.filter_country}
                                        onChange={(e) => updateSetting('filter_country', e.target.value)}
                                        maxLength={2}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="filter-state">State (optional)</label>
                                    <input
                                        id="filter-state"
                                        type="text"
                                        placeholder="e.g. CA, NY, CO (leave blank for all)"
                                        value={settings.filter_state}
                                        onChange={(e) => updateSetting('filter_state', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Digest Inbox */}
                    <div className="form-section">
                        <h3>📬 Newsletter Digest Inbox</h3>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                            Set up a dedicated email account (e.g. Gmail) and subscribe to your bands' mailing lists.
                            Encore will read that inbox weekly and send you a consolidated summary.
                        </p>
                        <div className="form-row">
                            <div className="form-group" style={{ flex: 2 }}>
                                <label htmlFor="digest-host">IMAP Host</label>
                                <input
                                    id="digest-host"
                                    type="text"
                                    placeholder="imap.gmail.com"
                                    value={settings.digest_imap_host}
                                    onChange={(e) => updateSetting('digest_imap_host', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="digest-port">Port</label>
                                <input
                                    id="digest-port"
                                    type="text"
                                    placeholder="993"
                                    value={settings.digest_imap_port}
                                    onChange={(e) => updateSetting('digest_imap_port', e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="form-row" style={{ marginTop: 12 }}>
                            <div className="form-group">
                                <label htmlFor="digest-user">Email Address</label>
                                <input
                                    id="digest-user"
                                    type="email"
                                    placeholder="mybandupdates@gmail.com"
                                    value={settings.digest_imap_user}
                                    onChange={(e) => updateSetting('digest_imap_user', e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="digest-pass">Password / App Password</label>
                                <input
                                    id="digest-pass"
                                    type="password"
                                    placeholder="••••••••"
                                    value={settings.digest_imap_pass}
                                    onChange={(e) => updateSetting('digest_imap_pass', e.target.value)}
                                />
                            </div>
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={sendingDigest || !settings.digest_imap_host || !settings.digest_imap_user}
                                onClick={async () => {
                                    setSendingDigest(true);
                                    try {
                                        // Save settings first
                                        await fetch('/api/settings', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(settings),
                                        });
                                        const res = await fetch('/api/digest', { method: 'POST' });
                                        const data = await res.json();
                                        if (data.sent) {
                                            showToast(`Digest sent! (${data.emailCount} emails summarized)`, 'success');
                                        } else {
                                            showToast(data.error || 'Failed to send digest', 'error');
                                        }
                                    } catch (err) {
                                        showToast('Error: ' + err.message, 'error');
                                    } finally {
                                        setSendingDigest(false);
                                    }
                                }}
                            >
                                {sendingDigest ? (
                                    <><span className="spinner" style={{ width: 14, height: 14, marginRight: 6, verticalAlign: 'middle' }}></span>Sending...</>
                                ) : '📬 Send Digest Now'}
                            </button>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                            The digest will also be sent automatically every Sunday at 10am.
                        </p>
                    </div>

                    {/* Save button */}
                    <button type="submit" className="btn-primary" disabled={saving} style={{ justifySelf: 'start' }}>
                        {saving ? (
                            <><span className="spinner" style={{ width: 16, height: 16, marginRight: 8, verticalAlign: 'middle' }}></span>Saving...</>
                        ) : '💾 Save Settings'}
                    </button>
                </div>
            </form>

            {toast && (
                <div className={`toast ${toast.type}`}>
                    {toast.message}
                </div>
            )}
        </>
    );
}
