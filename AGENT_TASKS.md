# 🤖 AI Coding Agent Execution Plan: Squeekchain-Console
**Repository:** `https://github.com/CryptoExplor/Squeekchain-console`  
**Objective:** Audit codebase, resolve/merge/split PR #20 and PR #21, and implement the V2 Premium Share Card UI/UX update.

---

## 📋 1. Codebase Audit & Architecture Improvements

### 🔍 Current Issues Identified (To Fix)
1. **Component Coupling:** UI components are tightly coupled with Web3/RPC fetching logic, making the dashboard slow to re-render.
2. **Inconsistent Theme Tokens:** Hardcoded hex/RGB values are scattered across components instead of using unified Tailwind theme tokens.
3. **Lack of Error Boundaries:** Failed RPC calls or missing wallet states can crash the entire console view.
4. **DOM-to-Image Rendering Flaws:** The current Share Card implementation lacks proper font-embedding and CORS handling for external avatars/icons during canvas export.

### 🚀 Required Enhancements
- **State Management:** Extract chain/console metrics into a dedicated hook (`useSqueekMetrics.ts`) or lightweight store (Zustand).
- **Performance:** Wrap heavy data tables and chart components in `React.memo` and implement skeleton loaders.
- **Styling:** Centralize the new "Obsidian Neon" premium color palette into `tailwind.config.js`.

---

## 🔀 2. Git Strategy: PR #20 & PR #21 (Merge, Remove, Split)

**Agent Directive:** Execute the following Git workflow to cleanly handle PR #20 and PR #21 without introducing regression bugs.

### ✅ MERGE (Keep & Integrate)
- **From PR #20:** Keep the core data-fetching updates, state management hooks, and API/RPC endpoint configurations.
- **From PR #21:** Keep the utility functions for social sharing (Twitter/X intent URLs, clipboard API logic) and modal trigger states.

### ❌ REMOVE (Delete / Revert)
- **Remove from PR #20 & #21:** 
  - Delete deprecated/old `ShareCard` CSS modules or inline style blocks (they will be replaced by the new Tailwind V2 Premium Share Card below).
  - Remove conflicting `package-lock.json` / `yarn.lock` changes—regenerate a clean lockfile after merging.
  - Strip out all `console.log()` debug statements added in both PRs.

### ✂️ SPLIT (Modularize)
- **Split PR #21 into two distinct modules:**
  1. `src/components/share/ShareCard.tsx` (Pure presentational component for the visual card).
  2. `src/components/share/ShareModal.tsx` (Controller component handling `html-to-image` generation, download states, and social share buttons).

### 🖥️ Commands for Agent to Run:
```bash
# 1. Fetch both PR branches
git fetch origin pull/20/head:pr-20
git fetch origin pull/21/head:pr-21

# 2. Create a unified integration branch from main
git checkout main
git checkout -b feat/unified-pr20-21-sharecard

# 3. Merge PR 20 base changes (resolve lockfile in favor of main)
git merge pr-20 --no-commit

# 4. Cherry-pick or merge utility changes from PR 21
git merge -X theirs pr-21 --no-commit

# 5. Clean up dependencies
npm install html-to-image lucide-react clsx tailwind-merge
```

---

## 🎨 3. Premium Share Card Update (Design, Colors & Code)

### 🌈 Color Palette Update (`tailwind.config.js`)
**Agent Directive:** Update `tailwind.config.js` to include the new "Squeekchain Obsidian & Cyber-Gold/Cyan" theme tokens.

```javascript
// MODIFY: tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        squeek: {
          bg: '#07090E',          // Deep Obsidian
          card: '#0D111A',        // Elevated Dark Surface
          border: '#1E293B',      // Subtle Metallic Border
          accent: '#00F5D4',      // Cyber Cyan (Primary Highlight)
          secondary: '#7B2CBF',   // Deep Nebula Purple (Glows)
          gold: '#FFD166',        // Premium Tier Highlight
          muted: '#64748B',       // Secondary Text
        }
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
        'cyber-grid': 'radial-gradient(#1E293B 1px, transparent 1px)',
      }
    }
  }
}
```

---

### 🧩 Component 1: The Premium Share Card (`ShareCard.tsx`)
**Agent Directive:** Create or overwrite `src/components/share/ShareCard.tsx` with the following production-ready code. It features ambient glowing orbs, glassmorphism, monospace financial/chain typography, and high-DPI export compatibility.

```tsx
// CREATE/REPLACE: src/components/share/ShareCard.tsx
import React, { forwardRef } from 'react';
import { Sparkles, Activity, ShieldCheck, Zap, ArrowUpRight } from 'lucide-react';

export interface ShareCardProps {
  username?: string;
  walletAddress: string;
  totalTx: number;
  squeekScore: number;
  rank: string;
  pnlPercentage: number;
  tier?: 'Alpha' | 'Whale' | 'Squeeker' | 'OG';
  timestamp?: string;
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  (
    {
      username = 'Anon Squeeker',
      walletAddress = '0x71C...89A2',
      totalTx = 1420,
      squeekScore = 9850,
      rank = '#42',
      pnlPercentage = 342.8,
      tier = 'OG',
      timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
    ref
  ) => {
    const isPositive = pnlPercentage >= 0;

    return (
      <div
        ref={ref}
        className="relative w-[600px] h-[340px] rounded-2xl bg-[#07090E] p-6 text-white overflow-hidden border border-white/10 shadow-2xl select-none font-sans"
      >
        {/* Ambient Glow Orbs */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-[#7B2CBF]/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-[#00F5D4]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Cyber Grid Background */}
        <div 
          className="absolute inset-0 opacity-20 pointer-events-none" 
          style={{ backgroundImage: 'radial-gradient(#1E293B 1px, transparent 1px)', backgroundSize: '16px 16px' }} 
        />

        {/* Top Header: Brand & Tier Badge */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00F5D4] to-[#7B2CBF] p-[1px]">
              <div className="w-full h-full bg-[#07090E] rounded-[11px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#00F5D4]" />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wider uppercase text-white flex items-center gap-1.5">
                Squeekchain <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[#00F5D4] font-mono">CONSOLE</span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">{timestamp}</p>
            </div>
          </div>

          {/* Tier Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/10 to-yellow-500/20 border border-amber-400/30 text-amber-300 text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{tier} TIER</span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="relative z-10 grid grid-cols-12 gap-4 my-5 items-center">
          {/* Left Column: Hero Metric (ROI / Score) */}
          <div className="col-span-7 space-y-1">
            <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-[#00F5D4]" /> Net Console Performance
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-5xl font-black font-mono tracking-tight ${
                  isPositive
                    ? 'bg-gradient-to-r from-[#00F5D4] via-emerald-300 to-teal-200 bg-clip-text text-transparent'
                    : 'text-rose-500'
                }`}
              >
                {isPositive ? '+' : ''}
                {pnlPercentage}%
              </span>
              <ArrowUpRight className="w-6 h-6 text-[#00F5D4] -ml-1" />
            </div>

            {/* User Identity */}
            <div className="pt-3 flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-[#7B2CBF] to-[#00F5D4] flex items-center justify-center text-xs font-bold text-black">
                {username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-none">{username}</p>
                <p className="text-xs font-mono text-slate-400">{walletAddress}</p>
              </div>
            </div>
          </div>

          {/* Right Column: Bento Stat Boxes */}
          <div className="col-span-5 space-y-2.5">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex justify-between items-center">
              <div>
                <p className="text-[11px] text-slate-400 uppercase">Squeek Score</p>
                <p className="text-lg font-bold font-mono text-white">{squeekScore.toLocaleString()}</p>
              </div>
              <ShieldCheck className="w-5 h-5 text-[#00F5D4] opacity-80" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
                <p className="text-[10px] text-slate-400 uppercase">Global Rank</p>
                <p className="text-base font-bold font-mono text-amber-300">{rank}</p>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
                <p className="text-[10px] text-slate-400 uppercase">Total TXs</p>
                <p className="text-base font-bold font-mono text-white">{totalTx}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Watermark */}
        <div className="relative z-10 flex items-center justify-between pt-3 border-t border-white/5 text-[11px] text-slate-500 font-mono">
          <span>squeekchain.console // verified-on-chain</span>
          <span className="text-slate-400">⚡ Powered by Squeekchain</span>
        </div>
      </div>
    );
  }
);

ShareCard.displayName = 'ShareCard';
```

---

### 🧩 Component 2: Share Modal & Export Controller (`ShareModal.tsx`)
**Agent Directive:** Create `src/components/share/ShareModal.tsx` to handle high-res PNG downloads and one-click X (Twitter) sharing.

```tsx
// CREATE/REPLACE: src/components/share/ShareModal.tsx
import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Download, Share2, Check, Copy, X } from 'lucide-react';
import { ShareCard, ShareCardProps } from './ShareCard';

interface ShareModalProps extends ShareCardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, ...cardProps }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2, // 2x Retina quality
        backgroundColor: '#07090E',
      });
      const link = document.createElement('a');
      link.download = `squeekchain-stats-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export Share Card:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(
      `Just hit a ${cardProps.pnlPercentage}% performance score on the @Squeekchain Console! ⚡\n\nRank: ${cardProps.rank} | Score: ${cardProps.squeekScore}\n\nCheck your on-chain stats 👇`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative bg-[#0D111A] border border-white/10 rounded-2xl p-6 max-w-[650px] w-full shadow-2xl space-y-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Share Console Performance</h3>
            <p className="text-xs text-slate-400">Download or copy your verified Squeekchain Flex Card</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Preview Container (Scaled for responsive screens) */}
        <div className="flex justify-center overflow-x-auto py-2">
          <ShareCard ref={cardRef} {...cardProps} />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-white/10">
          <button
            onClick={handleCopyImage}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium text-white transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied Image!' : 'Copy Image'}
          </button>

          <button
            onClick={handleDownload}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-white transition"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Rendering...' : 'Download PNG'}
          </button>

          <button
            onClick={handleShareTwitter}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00F5D4] to-teal-400 text-black font-bold text-sm hover:opacity-90 transition shadow-lg shadow-[#00F5D4]/20"
          >
            <Share2 className="w-4 h-4" />
            Share on X
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## ✅ 4. Agent Step-by-Step Verification Checklist

Once you (the Coding Agent) have applied the above changes, execute these verification steps:

- [ ] **Step 1:** Run `git status` to ensure no leftover conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) exist from merging PR #20 and PR #21.
- [ ] **Step 2:** Verify old Share Card files from PR #20/#21 are deleted and imports across the main Dashboard point to `src/components/share/ShareModal.tsx`.
- [ ] **Step 3:** Run `npm run lint` and `npm run typecheck` (or `tsc --noEmit`) and fix any TypeScript prop mismatches between the console state and `ShareCardProps`.
- [ ] **Step 4:** Run `npm run build` to verify production bundling succeeds without SSR/Canvas errors.
- [ ] **Step 5:** Commit changes to `feat/unified-pr20-21-sharecard` with commit message:  
  `feat(ui): merge PR 20 & 21 and implement V2 premium share card`
