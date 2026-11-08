import {useMemo} from 'react';
import type {ShareCardProps} from './ShareCard';
/** Snapshot-only view state: never fetches RPC, signs, or subscribes to wallet changes. */
export function useSqueekMetrics(snapshot: Readonly<ShareCardProps>, showAddress: boolean) {
 return useMemo(()=>Object.freeze({...snapshot,walletAddress:showAddress?snapshot.walletAddress:null}),[snapshot,showAddress]);
}
