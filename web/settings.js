export function initSettings({$,state,store,fetcher,captureLoad,assertCurrent,isCurrent,getProfile,switchProfile,discoveryCache,buildAdapter,refreshAll,resetLoad,closeSheet,confirmModal,activity,destroyed,openSheet,showBanner,errorMessage,applyTheme}) {
  // Custom RPC is browser-local; never sent to our server. Public peers still cross-check every snapshot.
  $("rpc-url").value = store.get("wheelhouse:rpc") ?? "";
  function warnSecrets() {
    let risky=false;
    try {const url=new URL($('rpc-url').value); risky=Boolean(url.search)||/(?:key|token|secret|auth|[a-f0-9]{24,}|[A-Za-z0-9_-]{32,})/i.test(url.pathname); }catch{}
    $('rpc-secret-warning').classList.toggle('hidden',!risky);
  }
  $('rpc-url').oninput=warnSecrets;warnSecrets();
  function customRpcValue() {
    const value = $('rpc-url').value.trim();warnSecrets();
    if (value) { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS RPC URL without embedded credentials'); }
    return value;
  }
  $('btn-test-rpc').onclick = async () => {
    const load = captureLoad(), output = $('rpc-test-result');
    try {
      if (!getProfile(state.profileKey).addresses) throw new Error('Mainnet is not deployed; no RPC reads');
      const url = customRpcValue(); if (!url) throw new Error('Enter a custom RPC to test');
      output.textContent = 'Testing…';
      const rpc = async (method, id) => {
        const timeout = AbortSignal.timeout(15000);
        const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params: [] }), signal: AbortSignal.any([load.signal, timeout]) });
        assertCurrent(load); if (!response.ok) throw new Error('RPC test unavailable');
        const value = await response.json(); assertCurrent(load);
        if (value.error || !/^0x[0-9a-f]+$/i.test(value.result ?? '')) throw new Error('RPC returned an invalid response');
        return BigInt(value.result);
      };
      const chain = await rpc('eth_chainId', 1), block = await rpc('eth_blockNumber', 2);
      output.textContent = `chainId ${chain} · block ${block}${chain !== 11155111n ? ' · Wrong chain: Sepolia required' : ''}. Diagnostic only; not two-peer verification.`;
    } catch { if (isCurrent(load)) output.textContent = 'RPC test failed. Use an available HTTPS Sepolia endpoint. No trust check was bypassed.'; }
  };
  $('btn-remove-rpc').onclick = async () => { $('rpc-url').value = ''; store.set('wheelhouse:rpc', ''); await switchProfile(state.profileKey); };
  $('btn-clear-cache').onclick = async () => {
    if (state.busy) { $('cache-result').textContent = 'Wait for the wallet request to finish before clearing cache.'; return; }
    resetLoad();
    const load = captureLoad();
    try {
      await discoveryCache.clear();
      if (!isCurrent(load)) return;
      state.adapter = buildAdapter(state.profileKey);
      await refreshAll();
      if (isCurrent(load)) $('cache-result').textContent = 'Log cache cleared. Ownership rechecked onchain where available.';
    } catch { if (isCurrent(load)) { state.adapter = buildAdapter(state.profileKey); $('cache-result').textContent = 'Could not clear the log cache. No ownership or trust checks were bypassed.'; } }
  };
  $('btn-clear-activity').onclick = async () => {
    const load=captureLoad();
    closeSheet();
    const confirmed = await confirmModal({ title: 'Clear Activity?', body: 'Remove the Activity list saved in this browser, including pending entries. This does not cancel transactions. Check your wallet before retrying any action.', confirmLabel: 'Clear Activity' });
    if(!isCurrent(load))return;
    if (confirmed) activity.clear();
    if (!destroyed()) openSheet('settings-sheet');
  };
  $("btn-save-rpc").onclick = async () => {
    try {
    const value = customRpcValue();
    store.set("wheelhouse:rpc", value);
    await switchProfile(state.profileKey);
    } catch (err) { $("rpc-test-result").textContent = "Use an HTTPS RPC URL without embedded credentials."; showBanner(errorMessage(err), "bad"); }
  };


  $('theme-choice').onchange = () => applyTheme($('theme-choice').value);
}
