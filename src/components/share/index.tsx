import {Component,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {ShareModal,type ShareModalProps} from './ShareModal';
class ShareBoundary extends Component<{children:ReactNode;onClose:()=>void},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 /** Keep a failed renderer isolated from wallet state and offer an explicit escape route. */
 render(){return this.state.failed?<div className="premium-overlay"><div className="premium-modal" role="alert"><p>Could not display the premium card. Your wallet is unchanged.</p><button className="premium-button" onClick={this.props.onClose}>Close</button></div></div>:this.props.children;}
}
/** Mount one isolated dialog; the returned close function is safe to call more than once. */
export function openPremiumShare(props:Omit<ShareModalProps,'onClose'>&{onClosed?:()=>void}){
 const {onClosed,...modalProps}=props;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let closed=false;
 /** Release this root exactly once, whether closed manually or during dashboard teardown. */
 const close=()=>{if(closed)return;closed=true;root.unmount();host.remove();onClosed?.();};
 root.render(<ShareBoundary onClose={close}><ShareModal {...modalProps} snapshot={Object.freeze({...props.snapshot})} onClose={close}/></ShareBoundary>);
 return close;
}
