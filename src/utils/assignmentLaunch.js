export async function openAssignmentLaunch(loadLaunch, browser = window) {
  const tab = browser.open("about:blank", "_blank");
  if (!tab) throw new Error("Allow pop-ups for Moofie, then try opening the assignment again.");
  tab.opener = null;
  tab.document.title = "Opening course content";
  tab.document.body.textContent = "Opening course content…";
  try {
    const launch = await loadLaunch();
    if (tab.closed) return;
    const destination = new URL(launch.kind === "form" ? launch.action : launch.url);
    if (destination.protocol !== "https:" || destination.username || destination.password) throw new Error("Invalid assignment launch.");
    if (launch.kind === "url") { tab.location.replace(destination.href); return; }
    if (launch.kind !== "form" || !Array.isArray(launch.fields)) throw new Error("Invalid assignment launch.");
    const form = tab.document.createElement("form");
    form.method = "POST"; form.action = destination.href; form.target = "_self";
    for (const field of launch.fields) {
      const input = tab.document.createElement("input");
      input.type = "hidden"; input.name = field.name; input.value = field.value;
      form.append(input);
    }
    tab.document.body.append(form);
    tab.HTMLFormElement.prototype.submit.call(form);
  } catch (error) {
    if (!tab.closed) tab.close();
    throw error;
  }
}
