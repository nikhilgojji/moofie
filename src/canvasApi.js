import { supabase } from "./supabase";
import { recoverCanvasRead, resetCanvasSync } from "./utils/canvasSync";

supabase?.auth.onAuthStateChange(event => {
  if (event === "SIGNED_OUT" || event === "SIGNED_IN") resetCanvasSync();
});

const REQUEST_TIMEOUT_MS = 45_000;

// Prevent a suspended browser tab or stalled network request from leaving the
// interface in its loading state forever.
async function withTimeout(request) {
  let timeoutId;
  try {
    return await Promise.race([
      request,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("The request took too long. Please try again.")),
          REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Send one authenticated command to the server. Canvas tokens never need to be
// handled directly by the browser after the initial connection request.
async function callCanvasFunction(action, payload = {}) {
  return recoverCanvasRead(action, payload, () => invokeCanvasFunction(action, payload));
}

async function invokeCanvasFunction(action, payload = {}) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await withTimeout(
    supabase.functions.invoke("canvas", { body: { action, ...payload } }),
  );

  if (error) {
    let message = error.message;
    try {
      const details = await error.context?.json();
      message = details?.error || message;
    } catch {
      // A non-JSON response has no extra detail, so retain the SDK message.
    }
    const failure = new Error(message || "Moofie could not reach the server.");
    failure.status = error.context?.status;
    throw failure;
  }

  if (data?.error) throw new Error(data.error);
  return data;
}

// Fetch the connected user's courses, assignments, and grades.
export function loadCanvasDashboard() {
  return callCanvasFunction("dashboard");
}

// Validate and securely store a Canvas URL and personal access token.
export function connectCanvasAccount(canvasUrl, token) {
  resetCanvasSync();
  return callCanvasFunction("connect", { canvasUrl, token });
}

// Remove only the saved Canvas connection while keeping the Moofie account.
export function disconnectCanvasAccount() {
  resetCanvasSync();
  return callCanvasFunction("disconnect");
}

// Permanently remove the current user and all data tied to that user.
export function deleteMoofieAccount() {
  return callCanvasFunction("delete_account");
}

// Read the public VAPID key used by this Moofie deployment.
export function getPushConfig() {
  return callCanvasFunction("push_config");
}

// Associate this browser's Web Push subscription with the signed-in user.
export function registerPushSubscription(subscription) {
  return callCanvasFunction("subscribe_push", { subscription });
}

// Stop sending grade alerts to one browser or installed app.
export function removePushSubscription(endpoint) {
  return callCanvasFunction("unsubscribe_push", { endpoint });
}
