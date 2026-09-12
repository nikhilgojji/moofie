// Use the same signed DocViewer launch that Canvas supplies for Office files.
// Never expose the personal access token or embed a Canvas page requiring cookies.
export async function loadFilePreview(
  canvasUrl: string,
  token: string,
  fileId: number,
  request: (path: string) => Promise<any>,
  fetcher: typeof fetch = fetch,
) {
  let file = await request(`/api/v1/files/${fileId}?include[]=preview_url`);
  if (file.locked_for_user || file.hidden_for_user) {
    throw new Error("This file is currently locked in Canvas.");
  }
  if (!file.canvadoc_session_url && !file.preview_url) {
    // Canvas's Files screen can provide richer preview metadata than the API.
    // This endpoint supports bearer authentication; no browser cookies required.
    try {
      const page = await request(`/files/${fileId}.json`);
      const attachment = page?.attachment;
      if (attachment?.locked_for_user || attachment?.hidden_for_user) throw new Error("This file is currently locked in Canvas.");
      if (attachment) file = { ...file, ...attachment };
    } catch (error) {
      if (/locked|token|401|403/i.test(String((error as Error).message))) throw error;
      // The client can render the original spreadsheet if metadata is incomplete.
    }
  }
  const signedUrl = file.canvadoc_session_url || file.preview_url;
  if (!signedUrl) return { previewUrl: null };
  const launch = new URL(signedUrl, canvasUrl);
  if (launch.origin !== canvasUrl || launch.username || launch.password ||
      launch.pathname !== "/api/v1/canvadoc_session" ||
      !launch.searchParams.get("blob") || !launch.searchParams.get("hmac")) {
    // enhanced_preview_url is a Canvas page, not an embeddable document.
    return { previewUrl: null };
  }
  launch.searchParams.delete("access_token");
  const response = await fetcher(launch, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: "manual",
    signal: AbortSignal.timeout(35_000),
  });
  if (![301, 302, 303, 307, 308].includes(response.status)) {
    await response.body?.cancel();
    throw new Error("Canvas could not prepare this document preview. Please retry.");
  }
  const destination = response.headers.get("Location");
  await response.body?.cancel();
  if (!destination) throw new Error("Canvas did not return a document preview.");
  const preview = new URL(destination, canvasUrl);
  if (preview.protocol !== "https:" || preview.hostname !== "canvadocs.instructure.com" ||
      preview.port || preview.username || preview.password ||
      !/^\/\d+\/sessions\/[^/]+\/view\/?$/.test(preview.pathname) ||
      preview.searchParams.has("access_token")) {
    throw new Error("Canvas returned an invalid document preview.");
  }
  return { previewUrl: preview.href };
}
