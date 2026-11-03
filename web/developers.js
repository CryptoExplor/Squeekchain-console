export function initDevelopers({el, win, json, toast, showOut, viewTask, callTool, captureLoad, isCurrent, manifest}) {
  el.agent.run.onclick = async () => {
    let args = {};
    try {
      args = el.agent.args.value.trim() ? JSON.parse(el.agent.args.value) : {};
    } catch {
      return showOut(el.agent.out, { error: "args must be valid JSON" });
    }
    const load = captureLoad();
    const result = await viewTask(() => callTool(el.agent.select.value, args));
    if (isCurrent(load)) showOut(el.agent.out, result);
  };
  el.agent.copy.onclick = async () => {
    const text = json(manifest());
    try {
      await win.navigator.clipboard.writeText(text);
      toast("manifest copied", "ok");
    } catch {
      showOut(el.agent.out, text);
    }
  };

}
