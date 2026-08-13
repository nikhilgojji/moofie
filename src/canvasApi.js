import { supabase } from "./supabase";

// Send one authenticated command to the server. Canvas tokens never need to be
// handled directly by the browser after the initial connection request.
async function callCanvasFunction(action, payload = {}) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.functions.invoke("canvas", {
    body: { action, ...payload },
  });

  if (error) {
    let message = error.message;
    try {
      const details = await error.context?.json();
      message = details?.error || message;
    } catch {
      // A non-JSON response has no extra detail, so retain the SDK message.
    }
    throw new Error(message || "Moofie could not reach the server.");
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
  return callCanvasFunction("connect", { canvasUrl, token });
}

// Remove only the saved Canvas connection while keeping the Moofie account.
export function disconnectCanvasAccount() {
  return callCanvasFunction("disconnect");
}

// Permanently remove the current user and all data tied to that user.
export function deleteMoofieAccount() {
  return callCanvasFunction("delete_account");
}
