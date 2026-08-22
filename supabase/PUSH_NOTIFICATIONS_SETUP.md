# Push notification deployment

Moofie uses standards-based Web Push. On iPhone and iPad it works on iOS 16.4+
after the user adds Moofie to the Home Screen and taps **Turn on** under the bell.

## 1. Create VAPID keys

Generate one VAPID key pair and keep the private key secret:

```sh
npx web-push generate-vapid-keys
```

In Supabase **Edge Functions → Secrets**, add:

- `VAPID_PUBLIC_KEY`: generated public key
- `VAPID_PRIVATE_KEY`: generated private key
- `VAPID_SUBJECT`: `mailto:` followed by the support email address

The existing `TOKEN_ENCRYPTION_KEY` secret must remain unchanged because the
background checker decrypts the already stored Canvas tokens with it.

## 2. Apply and deploy

Apply `20260822000000_push_notifications.sql`, then deploy both functions:

```sh
supabase db push
supabase functions deploy canvas
supabase functions deploy grade-notifications --no-verify-jwt
```

The second migration creates the 15-minute Cron job automatically and stores
its authentication value in Supabase Vault. Disable JWT verification only for
`grade-notifications`; the private Vault secret still protects the endpoint.

The first run records a baseline and intentionally sends nothing. Later runs
send an alert only when an assignment receives its first score or its score is
changed.
