import {forwardRef, memo} from 'react';
import {Activity, CircleDot, Layers, Sparkles} from 'lucide-react';
import clsx from 'clsx';
import {twMerge} from 'tailwind-merge';

/** Only values read from a frozen holder snapshot. No synthetic scores, PnL or tiers. */
export interface ShareCardProps {
  walletAddress: string | null;
  count: string;
  power: string;
  powerLabel: string;
  claimable: string;
  claimed: string;
  compounded: string;
  network: string;
  date: string;
}
// Missing/invalid metrics stay unknown: never fabricate zero or a performance claim.
const value = (s: string | null | undefined) => typeof s === 'string' && s.trim() && !/^(?:not available|nan|[-+]?infinity|null|undefined)$/i.test(s.trim()) ? s : '—';
export const ShareCard = memo(forwardRef<HTMLDivElement, ShareCardProps>((data,ref) => (
 <div ref={ref} className="premium-card v2-relative v2-overflow-hidden v2-bg-squeek-bg v2-text-white v2-rounded-2xl v2-border v2-border-solid v2-border-squeek-border" data-testid="premium-card">
  <div className="premium-glow premium-glow-purple"/><div className="premium-glow premium-glow-cyan"/><div className="premium-grid"/>
  <div className="v2-relative v2-z-10">
   <header className="premium-header v2-flex v2-items-center v2-justify-between">
    <div className="v2-flex v2-items-center v2-gap-3"><span className="premium-mark"><CircleDot size={24}/></span><div><strong className="premium-wordmark">WHEELHOUSE <span className="v2-text-squeek-accent">V2</span></strong><p className="premium-muted">Independent Squeekchain console</p></div></div>
    <span className="premium-network"><Sparkles size={12}/>{value(data.network)}</span>
   </header>
   <div className="premium-body">
    <section className="premium-hero"><p className="premium-label"><Activity size={13}/> CLAIMABLE SQK</p><div className={twMerge(clsx('premium-amount',value(data.claimable)==='—' && 'premium-unknown'))}>{value(data.claimable).replace(/\s*SQK$/i,'')}</div><p className="premium-caption">Holder snapshot · {value(data.date)}</p>
     <div className="premium-identity"><span className="premium-avatar"><Layers size={16}/></span><span><strong>{data.walletAddress || 'A Squeek holder'}</strong><small>{data.walletAddress ? 'Address shown by choice' : 'Wallet address hidden'}</small></span></div>
    </section>
    <section className="premium-stats" aria-label="Holder metrics">
     {[[data.count,'Squeeks'],[data.power,data.powerLabel],[data.claimed,'SQK claimed'],[data.compounded,'SQK compounded']].map(([number,label])=><div className="premium-stat" key={label}><span>{label}</span><strong>{value(number).replace(/\s*SQK$/i,'')}</strong></div>)}
    </section>
   </div>
   <footer className="premium-footer"><span>wheel-house.pages.dev</span><span>{value(data.network).toLowerCase()==='mainnet'?'Holder snapshot':'Testnet snapshot'} · Not financial advice</span></footer>
  </div>
 </div>
)));
ShareCard.displayName='ShareCard';
