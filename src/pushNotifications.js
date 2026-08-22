import {
  getPushConfig,
  registerPushSubscription,
  removePushSubscription,
} from "./canvasApi";

function decodeApplicationServerKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export function pushNotificationsSupported() {
  return Boolean(
    "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
  );
}

export async function getPushNotificationStatus() {
  if (!pushNotificationsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.register(
    "/service-worker.js",
  );
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "enabled" : "available";
}

export async function enablePushNotifications() {
  if (!pushNotificationsSupported()) {
    throw new Error(
      "On iPhone, add Moofie to your Home Screen before turning on alerts.",
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications were not allowed in your device settings.");
  }

  const registration = await navigator.serviceWorker.register(
    "/service-worker.js",
  );
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(
        (await getPushConfig()).publicKey,
      ),
    }));

  await registerPushSubscription(subscription.toJSON());
  return "enabled";
}

export async function disablePushNotifications() {
  if (!pushNotificationsSupported()) return "unsupported";

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await removePushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  }
  return "available";
}
