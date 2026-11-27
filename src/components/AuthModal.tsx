import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { PublicUser } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasSuperAdmin: boolean;
  passcodeConfigured: boolean;
  currentUser: PublicUser | null;
  onAuthenticated: (user: PublicUser, token: string) => void;
  onSignOut: () => void;
}

export function AuthModal({
  isOpen,
  onClose,
  hasSuperAdmin,
  passcodeConfigured,
  currentUser,
  onAuthenticated,
  onSignOut,
}: AuthModalProps) {
  const [fullName, setFullName] = useState('Sajid Khan (MD)');
  const [email, setEmail] = useState(hasSuperAdmin ? '' : 'md@creaseradar.local');
  const [password, setPassword] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [provisionSampleTeam, setProvisionSampleTeam] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password, provisionSampleTeam, adminPasscode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to claim Super Admin account.');
      } else {
        onAuthenticated(data.user, data.token);
        onClose();
      }
    } catch {
      setError('Network error while contacting server.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid credentials.');
      } else {
        onAuthenticated(data.user, data.token);
        onClose();
      }
    } catch {
      setError('Network error while signing in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white border border-[#DDE3DE] rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold text-[#0B1410]">
            {currentUser
              ? 'Active Session'
              : hasSuperAdmin
              ? 'Sign In to CreaseRadar'
              : 'Claim Super Admin (MD / CEO)'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {currentUser && (
          <div className="mb-5 pb-5 border-b border-[#DDE3DE]">
            <p className="text-sm font-semibold text-[#0B1410]">{currentUser.fullName}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {currentUser.email} · {currentUser.role.replace('_', ' ')} · {currentUser.subscriptionTier}
            </p>
            <button
              type="button"
              onClick={() => {
                onSignOut();
              }}
              className="mt-3 px-4 py-2 text-xs font-semibold text-[#C81E2B] border border-[#C81E2B]/30 rounded-lg hover:bg-red-50 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        )}

        {!hasSuperAdmin ? (
          <form onSubmit={handleBootstrap} className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              Initialize the primary Super Admin account to unlock scoring, speed logging, and role administration. Passwords are hashed on the server with scrypt.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#DDE3DE] rounded-lg focus:outline-none focus:border-[#0E7A49]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-[#DDE3DE] rounded-lg focus:outline-none focus:border-[#0E7A49]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Choose Workspace Password (min 6 chars)</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-3 py-2.5 text-sm border border-[#DDE3DE] rounded-lg focus:outline-none focus:border-[#0E7A49]"
              />
            </div>

            {passcodeConfigured && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Server Admin Passcode</label>
                <input
                  type="password"
                  required
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-[#DDE3DE] rounded-lg focus:outline-none focus:border-[#0E7A49]"
                />
              </div>
            )}

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={provisionSampleTeam}
                onChange={(e) => setProvisionSampleTeam(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#0E7A49]"
              />
              <span>
                Also provision Managing Admin (<span className="font-mono">organizer@creaseradar.local</span>) and Scorer (<span className="font-mono">scorer@creaseradar.local</span>) with this password so all 3 RBAC tiers can be tested.
              </span>
            </label>

            {error && <p className="text-xs font-semibold text-[#C81E2B]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#0E7A49] hover:bg-[#0B633B] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Creating Workspace...' : 'Claim Super Admin & Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-slate-500 py-1">Quick email fill:</span>
              {[
                { label: 'Super Admin', mail: 'md@creaseradar.local' },
                { label: 'Managing Admin', mail: 'organizer@creaseradar.local' },
                { label: 'Scorer', mail: 'scorer@creaseradar.local' },
              ].map((preset) => (
                <button
                  key={preset.mail}
                  type="button"
                  onClick={() => setEmail(preset.mail)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-md cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@creaseradar.local"
                className="w-full px-3 py-2.5 text-sm border border-[#DDE3DE] rounded-lg focus:outline-none focus:border-[#0E7A49]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2.5 text-sm border border-[#DDE3DE] rounded-lg focus:outline-none focus:border-[#0E7A49]"
              />
            </div>

            {error && <p className="text-xs font-semibold text-[#C81E2B]">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-[#0E7A49] hover:bg-[#0B633B] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
