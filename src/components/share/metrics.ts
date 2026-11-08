/** Keep unknown snapshot metrics identical in cards and social drafts; never invent zero. */
export function displayMetric(value:unknown):string {
 return typeof value==='string'&&value.trim()&&!/^(?:not available|nan|[-+]?infinity|null|undefined)$/i.test(value.trim())?value:'—';
}
/** Fit full uint256-sized decimal strings without ellipsis; wrapping handles the longest values. */
export function metricFontSize(text:string,hero=false):number {
 return Math.max(hero?10:7,Math.min(hero?39:17,Math.floor((hero?420:130)/text.length)));
}
