# Automatic issue reports

Signed-in Moofie sessions report exhausted Canvas read failures, incomplete
course loads, preview failures, and uncaught app errors. Existing read recovery
still handles temporary failures; reporting does not retry submissions or fix code.

Open **Supabase → SQL Editor** in the Moofie project and run:

```sql
select * from public.client_issue_dashboard order by last_seen desc, reports desc;
```

The view groups the last seven days by app area, fixed error category, preview
type, and mobile/desktop layout. `reports` counts sampled reports, not affected
users: identical errors are suppressed for five minutes per browser session.
`partial` means a Canvas response had incomplete sections; `access` includes
locked files and permission failures and does not necessarily indicate a bug.

The collector accepts at most 20 events per authenticated user per ten minutes.
Browsers batch at most ten events, retry delivery once, and keep the queue only
in memory. Signing out or changing accounts clears the queue. Nothing is sent
while offline. Failed reporting never blocks course loads.

Only allowlisted categories are accepted on both client and server. Reports do
not include error text, stack traces, URLs, course/file IDs, names, grades,
submission content, Canvas tokens, or user agent strings. Counts have no user
identifier. A separate private rate-limit table keeps a user ID and counter to
prevent abuse; stale counters are removed on ingestion after one day. Aggregate
rows older than 30 days are removed on ingestion. Supabase's ordinary network
request logs may contain transport metadata separately from these reports.

Both tables and the dashboard deny access to anonymous and signed-in app users.
Only the authenticated reporting RPC can write allowlisted reports; project
administrators and the service role can read the dashboard.

Apply `20260912000000_client_issue_reports.sql` before deploying the frontend.
Reports do not inspect the inside of cross-origin Canvas document frames: browser
security prevents that. Network errors and failures observed by Moofie's own
readers are covered. This is diagnostic sampling, not proof of complete parity.
