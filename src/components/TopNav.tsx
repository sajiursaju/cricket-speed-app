import { Activity, Camera, Code2, ShieldCheck, Tv } from 'lucide-react';
import type { AppTab, PublicUser } from '../types';

interface TopNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  currentUser: PublicUser | null;
  hasSuperAdmin: boolean;
  onOpenAuth: () => void;
}

const NAV_ITEMS: Array<{ id: AppTab; label: string }> = [
  { id: 'scorer', label: 'Live Scorer' },
  { id: 'radar', label: 'Speed Radar' },
  { id: 'spectator', label: 'Spectator' },
  { id: 'admin', label: 'Admin & Roles' },
  { id: 'blueprint', label: 'RN Expo Code' },
];

export function TopNav({ activeTab, onSelectTab, currentUser, hasSuperAdmin, onOpenAuth }: TopNavProps) {
  const roleLabel = currentUser
    ? currentUser.role === 'SUPER_ADMIN'
      ? 'Super Admin'
      : currentUser.role === 'MANAGING_ADMIN'
      ? 'Managing Admin'
      : 'Scorer'
    : hasSuperAdmin
    ? 'Sign In'
    : 'Setup Admin';

  return (
    <>
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#DDE3DE]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => onSelectTab('scorer')}
            className="font-display text-lg font-bold tracking-tight text-[#0B1410] whitespace-nowrap shrink-0 cursor-pointer"
          >
            CreaseRadar
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                    active
                      ? 'text-[#0B1410] border-[#0E7A49] font-semibold'
                      : 'text-slate-600 border-transparent hover:text-[#0B1410]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 min-h-[40px] text-xs font-semibold text-white bg-[#0E7A49] rounded-lg hover:bg-[#0B633B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {currentUser ? `${currentUser.fullName.split(' ')[0]} · ${roleLabel}` : roleLabel}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Thumb Bottom Navigation Bar (<= 15% viewport height) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#DDE3DE] grid grid-cols-5 h-16"
        aria-label="Mobile navigation"
      >
        <button
          type="button"
          onClick={() => onSelectTab('scorer')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeTab === 'scorer' ? 'text-[#0E7A49]' : 'text-slate-500'
          }`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Scorer</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('radar')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeTab === 'radar' ? 'text-[#0E7A49]' : 'text-slate-500'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Radar</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('spectator')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeTab === 'spectator' ? 'text-[#0E7A49]' : 'text-slate-500'
          }`}
        >
          <Tv className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Live</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('admin')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeTab === 'admin' ? 'text-[#0E7A49]' : 'text-slate-500'
          }`}
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Admin</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectTab('blueprint')}
          className={`flex flex-col items-center justify-center min-h-[44px] ${
            activeTab === 'blueprint' ? 'text-[#0E7A49]' : 'text-slate-500'
          }`}
        >
          <Code2 className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-1">Expo</span>
        </button>
      </nav>
    </>
  );
}
