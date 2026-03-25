import React, { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Mail, Lock, ArrowRight, ChevronLeft } from "lucide-react";
import logo from "/image.png";

/* ─── Floating animated squares ─── */
const SQUARES = [
  { size: 54, x: 8,  y: 12, dur: 18, delay: 0,    rot: 25,  opacity: 0.13 },
  { size: 32, x: 78, y: 8,  dur: 22, delay: -4,   rot: -15, opacity: 0.10 },
  { size: 72, x: 85, y: 60, dur: 26, delay: -8,   rot: 40,  opacity: 0.08 },
  { size: 20, x: 15, y: 70, dur: 16, delay: -2,   rot: -30, opacity: 0.14 },
  { size: 44, x: 50, y: 82, dur: 20, delay: -6,   rot: 55,  opacity: 0.09 },
  { size: 28, x: 62, y: 22, dur: 24, delay: -10,  rot: -45, opacity: 0.11 },
  { size: 16, x: 30, y: 45, dur: 14, delay: -3,   rot: 20,  opacity: 0.16 },
  { size: 60, x: 3,  y: 40, dur: 30, delay: -12,  rot: -10, opacity: 0.07 },
  { size: 36, x: 90, y: 30, dur: 19, delay: -7,   rot: 65,  opacity: 0.10 },
  { size: 22, x: 45, y: 5,  dur: 17, delay: -1,   rot: -55, opacity: 0.13 },
  { size: 48, x: 70, y: 88, dur: 23, delay: -9,   rot: 30,  opacity: 0.08 },
  { size: 14, x: 20, y: 90, dur: 15, delay: -5,   rot: -70, opacity: 0.15 },
];

function FloatingSquares() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {SQUARES.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            border: `1.5px solid rgba(217,119,6,${s.opacity * 2})`,
            background: `rgba(251,191,36,${s.opacity * 0.3})`,
            borderRadius: '4px',
            transform: `rotate(${s.rot}deg)`,
            animation: `squareFloat ${s.dur}s ease-in-out ${s.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Floating label input ─── */
function FloatingInput({ type, value, onChange, label, icon: Icon, id, showToggle, onToggle, showPassword }) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div style={{ position: 'relative', marginBottom: '20px' }}>
      <div style={{
        position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
        color: active ? '#d97706' : '#9ca3af',
        transition: 'color 0.25s ease', pointerEvents: 'none', zIndex: 2,
      }}>
        <Icon size={15} />
      </div>

      <label
        htmlFor={id}
        style={{
          position: 'absolute',
          left: '44px',
          top: active ? '8px' : '50%',
          transform: active ? 'translateY(0)' : 'translateY(-50%)',
          fontSize: active ? '10px' : '13.5px',
          fontWeight: active ? 600 : 400,
          color: active ? '#d97706' : '#9ca3af',
          transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: 'none',
          letterSpacing: active ? '0.07em' : '0',
          textTransform: active ? 'uppercase' : 'none',
          fontFamily: "'DM Sans', sans-serif",
          zIndex: 2,
        }}
      >
        {label}
      </label>

      <input
        id={id}
        type={showToggle ? (showPassword ? 'text' : 'password') : type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        style={{
          width: '100%',
          paddingLeft: '44px',
          paddingRight: showToggle ? '48px' : '16px',
          paddingTop: active ? '22px' : '16px',
          paddingBottom: active ? '8px' : '16px',
          height: '58px',
          border: `1.5px solid ${focused ? '#f59e0b' : '#e5e7eb'}`,
          borderRadius: '14px',
          background: focused ? '#fffef9' : '#fafafa',
          boxShadow: focused ? '0 0 0 4px rgba(245,158,11,0.1)' : 'none',
          outline: 'none',
          fontSize: '14px',
          color: '#111827',
          fontFamily: "'DM Sans', sans-serif",
          transition: 'all 0.25s ease',
          boxSizing: 'border-box',
        }}
      />

      {value.length > 0 && !showToggle && (
        <div style={{
          position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
          color: '#10b981', fontSize: '14px', animation: 'checkPop 0.2s ease',
        }}>✓</div>
      )}

      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
            padding: '6px', borderRadius: '8px', transition: 'color 0.2s',
            display: 'flex', alignItems: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#f59e0b'}
          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
        >
          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  );
}

/* ─── Main Component ─── */
function LoginModal({ onClose, onSubmit }) {
  const [view, setView] = useState("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ripple, setRipple] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.token);
        onSubmit(data.role, data.name || email.split("@")[0], data.token);
        onClose();
      } else {
        setError(res.status === 429 ? "Too many login attempts. Please wait and try again." : data.error || "Login failed");
      }
    } catch (err) {
      setError("Network error — please check if the server is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRipple = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setRipple(null), 600);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap');

        * { box-sizing: border-box; }
        .lm-root { font-family: 'DM Sans', sans-serif; }

        .lm-bg {
          background:
            radial-gradient(ellipse 80% 60% at 20% 10%, rgba(253,230,138,0.45) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 80%, rgba(251,191,36,0.3) 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 60% 40%, rgba(209,213,219,0.25) 0%, transparent 50%),
            linear-gradient(160deg, #fffbeb 0%, #f9fafb 50%, #fef3c7 100%);
        }

        @keyframes squareFloat {
          0%   { transform: rotate(var(--rot, 0deg)) translateY(0px) scale(1); }
          33%  { transform: rotate(calc(var(--rot, 0deg) + 8deg)) translateY(-18px) scale(1.04); }
          66%  { transform: rotate(calc(var(--rot, 0deg) - 5deg)) translateY(-8px) scale(0.97); }
          100% { transform: rotate(calc(var(--rot, 0deg) + 12deg)) translateY(-26px) scale(1.02); }
        }

        @keyframes blobDrift1 {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(40px,25px) scale(1.08); }
        }
        @keyframes blobDrift2 {
          from { transform: translate(0,0) scale(1); }
          to   { transform: translate(-30px,-20px) scale(1.05); }
        }

        .lm-landing-enter {
          animation: landingIn 0.7s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes landingIn {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .lm-logo-glow {
          filter: drop-shadow(0 16px 40px rgba(245,158,11,0.4));
          animation: logoFloat 4s ease-in-out infinite alternate;
        }
        @keyframes logoFloat {
          from { transform: translateY(0px); filter: drop-shadow(0 16px 40px rgba(245,158,11,0.35)); }
          to   { transform: translateY(-10px); filter: drop-shadow(0 28px 50px rgba(245,158,11,0.5)); }
        }

        .lm-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(52px, 7vw, 76px);
          font-weight: 600;
          letter-spacing: -0.03em;
          line-height: 1.05;
        }

        .lm-subtitle {
          font-size: 12px;
          color: #9ca3af;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
        }

        .lm-shimmer-line {
          height: 1px;
          width: 120px;
          background: linear-gradient(90deg, transparent, #f59e0b, transparent);
          background-size: 200% 100%;
          animation: shimmerMove 2.5s ease-in-out infinite;
          margin: 0 auto;
        }
        @keyframes shimmerMove {
          0%   { background-position: -200% center; opacity: 0.4; }
          50%  { background-position: 200% center;  opacity: 1; }
          100% { background-position: -200% center; opacity: 0.4; }
        }

        @keyframes logoPulse {
          0%,100% { transform: scale(1); opacity: 0.5; }
          50%      { transform: scale(1.1); opacity: 1; }
        }

        @keyframes titleShimmer {
          0%,100% { background-position: 0% center; }
          50%      { background-position: 200% center; }
        }

        .lm-cta {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #111827;
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          font-size: 17px;
          padding: 20px 60px;
          border-radius: 16px;
          border: none;
          cursor: pointer;
          transition: all 0.35s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 8px 32px rgba(245,158,11,0.4), 0 2px 8px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.25);
          letter-spacing: 0.01em;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .lm-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 60%);
        }
        .lm-cta:hover {
          transform: translateY(-3px) scale(1.02);
          box-shadow: 0 16px 48px rgba(245,158,11,0.5), 0 4px 12px rgba(245,158,11,0.3);
        }
        .lm-cta:active { transform: translateY(0) scale(0.99); }
        .lm-cta-arrow { transition: transform 0.3s ease; }
        .lm-cta:hover .lm-cta-arrow { transform: translateX(5px); }

        .lm-form-enter {
          animation: formIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes formIn {
          from { opacity: 0; transform: translateY(32px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .lm-topbar {
          position: absolute;
          top: 0; left: 32px; right: 32px;
          height: 3px;
          border-radius: 0 0 6px 6px;
          background: linear-gradient(90deg, #fbbf24, #f59e0b, #d97706, #f59e0b, #fbbf24);
          background-size: 300% 100%;
          animation: topbarShimmer 3s linear infinite;
        }
        @keyframes topbarShimmer {
          0%   { background-position: 0% center; }
          100% { background-position: 300% center; }
        }

        .lm-field-1 { animation: fieldIn 0.4s cubic-bezier(0.16,1,0.3,1) 0.15s both; }
        .lm-field-2 { animation: fieldIn 0.4s cubic-bezier(0.16,1,0.3,1) 0.25s both; }
        .lm-field-3 { animation: fieldIn 0.4s cubic-bezier(0.16,1,0.3,1) 0.35s both; }
        @keyframes fieldIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .lm-submit {
          position: relative;
          overflow: hidden;
          width: 100%;
          padding: 17px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #111827;
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          font-size: 15px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 20px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.25);
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
          letter-spacing: 0.01em;
        }
        .lm-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 60%);
        }
        .lm-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 32px rgba(245,158,11,0.45);
        }
        .lm-submit:active:not(:disabled) { transform: translateY(0); }
        .lm-submit-arrow { transition: transform 0.25s ease; }
        .lm-submit:hover:not(:disabled) .lm-submit-arrow { transform: translateX(4px); }

        .lm-ripple {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.35);
          transform: scale(0);
          animation: rippleOut 0.6s ease-out forwards;
          pointer-events: none;
        }
        @keyframes rippleOut {
          to { transform: scale(4); opacity: 0; }
        }

        .lm-back {
          display: inline-flex; align-items: center; gap: 2px;
          color: #9ca3af; font-size: 14px; font-weight: 500;
          background: none; border: none; cursor: pointer;
          transition: color 0.2s; padding: 0;
          font-family: 'DM Sans', sans-serif;
        }
        .lm-back:hover { color: #f59e0b; }

        .lm-error { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake {
          10%, 90% { transform: translateX(-2px); }
          20%, 80% { transform: translateX(3px); }
          30%, 50%, 70% { transform: translateX(-3px); }
          40%, 60% { transform: translateX(3px); }
        }

        .lm-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(17,24,39,0.25);
          border-top-color: #111827;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes checkPop {
          from { transform: translateY(-50%) scale(0); opacity: 0; }
          to   { transform: translateY(-50%) scale(1); opacity: 1; }
        }
      `}</style>

      <div className="lm-root lm-bg" style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>

        {/* Blobs */}
        <div style={{
          position: 'absolute', width: '560px', height: '560px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(253,230,138,0.5), rgba(251,191,36,0.2))',
          filter: 'blur(90px)', top: '-160px', left: '-120px', opacity: 0.6,
          animation: 'blobDrift1 10s ease-in-out infinite alternate',
        }} />
        <div style={{
          position: 'absolute', width: '440px', height: '440px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,191,36,0.4), rgba(245,158,11,0.15))',
          filter: 'blur(80px)', bottom: '-100px', right: '-80px', opacity: 0.5,
          animation: 'blobDrift2 12s ease-in-out infinite alternate',
        }} />

        {/* Floating squares — landing only */}
        {view === "landing" && <FloatingSquares />}

        {/* ── LANDING ── */}
        {view === "landing" && (
          <div
            className="lm-landing-enter"
            style={{
              position: 'relative', zIndex: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', padding: '0 24px', maxWidth: '680px', width: '100%',
            }}
          >
            {/* Logo */}
            <div style={{ marginBottom: '36px', position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: '-40px', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)',
                animation: 'logoPulse 3.5s ease-in-out infinite',
              }} />
              <img
                src={logo}
                alt="Intute.ai"
                className="lm-logo-glow"
                style={{ height: '240px', width: 'auto', objectFit: 'contain', position: 'relative' }}
              />
            </div>

            {/* Title */}
            <h1 className="lm-title" style={{ marginBottom: '12px' }}>
              <span style={{
                background: 'linear-gradient(135deg, #d97706 0%, #92400e 60%, #d97706 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundSize: '200% 100%', animation: 'titleShimmer 4s ease infinite',
              }}>
                Business
              </span>
              {' '}
              <span style={{ color: '#1f2937' }}>Planner</span>
            </h1>

            <div className="lm-shimmer-line" style={{ marginBottom: '14px' }} />
            <p className="lm-subtitle" style={{ marginBottom: '48px' }}>Powered by Intute.ai</p>

            <button className="lm-cta" onClick={() => setView("form")}>
              Get Started
              <span className="lm-cta-arrow"><ArrowRight size={19} strokeWidth={2.5} /></span>
            </button>

            {/* Dots */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '48px' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{
                  width: i === 2 ? 28 : 7, height: 7,
                  borderRadius: 4, background: '#d97706',
                  opacity: i === 2 ? 0.75 : 0.2,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* ── FORM ── */}
        {view === "form" && (
          <div
            className="lm-form-enter"
            style={{
              position: 'relative', zIndex: 10,
              width: '460px', maxWidth: 'calc(100vw - 32px)',
              borderRadius: '28px',
              background: 'rgba(255,255,255,0.96)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(245,158,11,0.12)',
              boxShadow: '0 40px 100px rgba(0,0,0,0.12), 0 8px 32px rgba(245,158,11,0.08), inset 0 0 0 1px rgba(255,255,255,0.8)',
            }}
          >
            <div className="lm-topbar" />

            <div style={{ padding: '40px 44px 44px' }}>

              {/* Back + Logo */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
                <button className="lm-back" onClick={() => { setView("landing"); setError(null); }}>
                  <ChevronLeft size={15} strokeWidth={2.5} />
                  Back
                </button>
                <img
                  src={logo}
                  alt="Intute.ai"
                  style={{
                    height: '96px', width: 'auto', objectFit: 'contain',
                    filter: 'drop-shadow(0 4px 12px rgba(245,158,11,0.3))',
                  }}
                />
              </div>

              {/* Heading */}
              <div style={{ marginBottom: '28px' }}>
                <h1 style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: '28px', fontWeight: 600, color: '#111827',
                  letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: '6px',
                }}>
                  Welcome back
                </h1>
                <p style={{ color: '#9ca3af', fontSize: '13px', fontWeight: 400, letterSpacing: '0.01em' }}>
                  Sign in to continue to your workspace
                </p>
              </div>

              {/* Error */}
              {error && (
                <div
                  className="lm-error"
                  style={{
                    marginBottom: '20px', padding: '12px 16px', borderRadius: '12px',
                    background: '#fff1f2', border: '1px solid #fecdd3',
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '14px', marginTop: '1px' }}>⚠️</span>
                  <p style={{ color: '#be123c', fontSize: '13px', fontWeight: 500, lineHeight: 1.4 }}>{error}</p>
                </div>
              )}

              {/* Fields */}
              <form onSubmit={handleSubmit}>
                <div className="lm-field-1">
                  <FloatingInput
                    id="email" type="email" label="Email address"
                    value={email} onChange={e => setEmail(e.target.value)}
                    icon={Mail}
                  />
                </div>

                <div className="lm-field-2">
                  <FloatingInput
                    id="password" type="password" label="Password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    icon={Lock} showToggle
                    showPassword={showPassword} onToggle={() => setShowPassword(p => !p)}
                  />
                </div>

                <div className="lm-field-3">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="lm-submit"
                    style={{ marginTop: '4px', opacity: isLoading ? 0.88 : 1 }}
                    onClick={handleRipple}
                  >
                    {ripple && (
                      <span
                        className="lm-ripple"
                        style={{ width: '60px', height: '60px', left: ripple.x - 30, top: ripple.y - 30 }}
                      />
                    )}
                    {isLoading ? (
                      <>
                        <span className="lm-spinner" />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      <>
                        <span>Sign in</span>
                        <span className="lm-submit-arrow"><ArrowRight size={16} strokeWidth={2.5} /></span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default LoginModal;