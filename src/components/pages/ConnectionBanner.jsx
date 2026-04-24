export default function ConnectionBanner({ onReconnect, onDismiss }) {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap');

        .cb-topbar {
          height: 3px;
          background: linear-gradient(90deg, #fbbf24, #f59e0b, #d97706, #f59e0b, #fbbf24);
          background-size: 300% 100%;
          animation: cbShimmer 3s linear infinite;
        }
        @keyframes cbShimmer {
          0%   { background-position: 0% center; }
          100% { background-position: 300% center; }
        }

        @keyframes cbSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .cb-root {
          animation: cbSlideUp 0.45s cubic-bezier(0.16,1,0.3,1) both;
        }

        @keyframes cbDot {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%       { opacity: 1;    transform: scale(1.2); }
        }

        .cb-btn-primary {
          position: relative; overflow: hidden;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #111827;
          font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 13px;
          padding: 10px 20px; border-radius: 12px; border: none; cursor: pointer;
          box-shadow: 0 4px 16px rgba(245,158,11,0.38), inset 0 1px 0 rgba(255,255,255,0.28);
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          display: inline-flex; align-items: center; gap: 6px;
          letter-spacing: 0.01em; white-space: nowrap;
        }
        .cb-btn-primary::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 60%);
        }
        .cb-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(245,158,11,0.48);
        }
        .cb-btn-primary:active { transform: translateY(0); }

        .cb-dismiss {
          background: none; border: none; cursor: pointer; color: #c4c9d4;
          padding: 4px; border-radius: 8px; transition: color 0.2s;
          display: flex; align-items: center; flex-shrink: 0;
        }
        .cb-dismiss:hover { color: #6b7280; }
      `}</style>

      <div
        className="cb-root"
        style={{
          position: 'fixed', bottom: '28px', left: '50%',
          transform: 'translateX(-50%)',
          width: '100%', maxWidth: '430px',
          padding: '0 16px',
          zIndex: 40,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{
          borderRadius: '24px',
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(245,158,11,0.14)',
          boxShadow:
            '0 32px 80px rgba(0,0,0,0.11), 0 8px 24px rgba(245,158,11,0.09), inset 0 0 0 1px rgba(255,255,255,0.9)',
          overflow: 'hidden',
        }}>

          {/* Amber shimmer bar */}
          <div className="cb-topbar" />

          <div style={{ padding: '20px 22px 22px' }}>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>

              {/* Icon tile */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '13px',
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  border: '1px solid rgba(245,158,11,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(245,158,11,0.18)',
                }}>
                  {/* WiFi-off SVG */}
                  <svg width="17" height="17" fill="none" stroke="#d97706" strokeWidth="2"
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
                {/* Pulsing status dot */}
                <span style={{
                  position: 'absolute', top: '-3px', right: '-3px',
                  width: '11px', height: '11px', borderRadius: '50%',
                  background: '#ef4444', border: '2px solid white',
                  animation: 'cbDot 2s ease-in-out infinite',
                  display: 'block',
                }} />
              </div>

              {/* Title + status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '19px', fontWeight: 600,
                  color: '#111827', letterSpacing: '-0.02em',
                  lineHeight: 1.15, margin: 0,
                }}>
                  Connection interrupted
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                  <span style={{
                    display: 'inline-block', width: '6px', height: '6px',
                    borderRadius: '50%', background: '#ef4444',
                    animation: 'cbDot 2s ease-in-out infinite',
                  }} />
                  <span style={{
                    fontSize: '10.5px', color: '#9ca3af', fontWeight: 500,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                  }}>
                    Real-time sync offline
                  </span>
                </div>
              </div>

              {/* Dismiss X */}
              <button className="cb-dismiss" onClick={onDismiss} aria-label="Dismiss">
                <svg width="14" height="14" fill="none" stroke="currentColor"
                  strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Divider */}
            <div style={{
              height: '1px', margin: '14px 0',
              background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.2), transparent)',
            }} />

            {/* Body */}
            <p style={{
              color: '#6b7280', fontSize: '13px', lineHeight: 1.65,
              margin: '0 0 16px', fontFamily: "'DM Sans', sans-serif",
            }}>
              Your session may have expired or the connection was interrupted.
              Sign out and sign back in to restore live updates across all modules.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="cb-btn-primary" onClick={onReconnect}>
                <svg width="12" height="12" fill="none" stroke="currentColor"
                  strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                </svg>
                Sign Out &amp; Reconnect
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
