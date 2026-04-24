import { useDispatch } from 'react-redux';
import { logout, toggleLogin, setSocketStatus } from '../../features/auth/authSlice.js';
import { disconnectSocket } from '../../services/socket.js';

export default function ConnectionError({ onRetry }) {
  const dispatch = useDispatch();

  const handleSignOut = () => {
    localStorage.clear();
    disconnectSocket();
    dispatch(logout());
    dispatch(toggleLogin(true));
  };

  const handleRetry = () => {
    dispatch(setSocketStatus('idle'));
    if (onRetry) onRetry();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');

        .ce-topbar {
          height: 3px;
          background: linear-gradient(90deg, #fbbf24, #f59e0b, #d97706, #f59e0b, #fbbf24);
          background-size: 300% 100%;
          animation: ceShimmer 3s linear infinite;
        }
        @keyframes ceShimmer {
          0%   { background-position: 0% center; }
          100% { background-position: 300% center; }
        }

        @keyframes ceCardIn {
          from { opacity: 0; transform: translateY(18px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        .ce-card {
          animation: ceCardIn 0.5s cubic-bezier(0.16,1,0.3,1) both;
        }

        @keyframes ceDot {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.25); }
        }

        @keyframes ceBlobDrift {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(30px,20px) scale(1.06); }
        }

        .ce-btn-primary {
          position: relative; overflow: hidden;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #111827;
          font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 14px;
          padding: 13px 28px; border-radius: 14px; border: none; cursor: pointer;
          box-shadow: 0 6px 20px rgba(245,158,11,0.38), inset 0 1px 0 rgba(255,255,255,0.28);
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          display: inline-flex; align-items: center; gap: 8px;
          letter-spacing: 0.01em;
        }
        .ce-btn-primary::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 60%);
        }
        .ce-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(245,158,11,0.48);
        }
        .ce-btn-primary:active { transform: translateY(0); }

        .ce-btn-retry {
          color: #9ca3af;
          font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
          padding: 0; border: none; background: none; cursor: pointer;
          transition: color 0.2s; text-decoration: underline; text-underline-offset: 3px;
        }
        .ce-btn-retry:hover { color: #d97706; }
      `}</style>

      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px',
        background: `
          radial-gradient(ellipse 80% 60% at 20% 10%, rgba(253,230,138,0.4) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 80% 80%, rgba(251,191,36,0.25) 0%, transparent 55%),
          linear-gradient(160deg, #fffbeb 0%, #f9fafb 50%, #fef3c7 100%)
        `,
        position: 'relative', overflow: 'hidden',
        fontFamily: "'DM Sans', sans-serif",
      }}>

        {/* Background blobs */}
        <div style={{
          position: 'absolute', width: '480px', height: '480px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(253,230,138,0.45), rgba(251,191,36,0.15))',
          filter: 'blur(80px)', top: '-140px', left: '-100px', opacity: 0.55,
          animation: 'ceBlobDrift 10s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', width: '360px', height: '360px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,191,36,0.35), rgba(245,158,11,0.1))',
          filter: 'blur(70px)', bottom: '-80px', right: '-60px', opacity: 0.45,
          animation: 'ceBlobDrift 13s ease-in-out infinite alternate-reverse',
          pointerEvents: 'none',
        }} />

        {/* Card */}
        <div
          className="ce-card"
          style={{
            position: 'relative', zIndex: 1,
            width: '100%', maxWidth: '420px',
            borderRadius: '28px',
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(245,158,11,0.14)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.11), 0 8px 32px rgba(245,158,11,0.09), inset 0 0 0 1px rgba(255,255,255,0.9)',
            overflow: 'hidden',
          }}
        >
          {/* Shimmer top bar */}
          <div className="ce-topbar" />

          <div style={{ padding: '32px 36px 36px' }}>

            {/* Icon row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '16px',
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  border: '1px solid rgba(245,158,11,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(245,158,11,0.2)',
                }}>
                  <svg width="22" height="22" fill="none" stroke="#d97706" strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
                    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
                    <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
                    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                    <line x1="12" y1="20" x2="12.01" y2="20"/>
                  </svg>
                </div>
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  width: '13px', height: '13px', borderRadius: '50%',
                  background: '#ef4444', border: '2.5px solid white',
                  animation: 'ceDot 2s ease-in-out infinite', display: 'block',
                }} />
              </div>

              <div>
                <h2 style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '22px', fontWeight: 600,
                  color: '#111827', letterSpacing: '-0.02em',
                  lineHeight: 1.15, margin: 0,
                }}>
                  Connection interrupted
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px' }}>
                  <span style={{
                    display: 'inline-block', width: '7px', height: '7px',
                    borderRadius: '50%', background: '#ef4444',
                    animation: 'ceDot 2s ease-in-out infinite',
                  }} />
                  <span style={{
                    fontSize: '11px', color: '#9ca3af', fontWeight: 500,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>
                    Real-time sync offline
                  </span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{
              height: '1px', margin: '0 0 20px',
              background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.22), transparent)',
            }} />

            {/* Body */}
            <p style={{
              color: '#6b7280', fontSize: '14px', lineHeight: 1.7,
              margin: '0 0 24px', fontFamily: "'DM Sans', sans-serif",
            }}>
              Your session may have expired or the connection was interrupted.
              Sign out and sign back in to restore live updates across all modules.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' }}>
              <button className="ce-btn-primary" onClick={handleSignOut}>
                <svg width="14" height="14" fill="none" stroke="currentColor"
                  strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                Sign Out &amp; Reconnect
              </button>
              {onRetry && (
                <button className="ce-btn-retry" onClick={handleRetry}>
                  Try again without signing out
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
