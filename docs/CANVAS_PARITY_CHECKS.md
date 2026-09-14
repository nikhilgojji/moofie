# Canvas behavior checks

Canvas is the source of course content and destinations. A successful API response
does not prove that a rendered link reaches the right item.

## Checks run on every push and pull request

- Backend mapping fixtures check content, ordering, permissions, and course home settings.
- Rendered-link browser tests check assignment and quiz identity, file previews from
  Canvas list URLs, cross-course links, Back, and Ctrl/Cmd-click.
- External assignment and module-tool tests check context identifiers, fresh launch
  forms, one-click POST handoff, popup failures, and the production form security policy.
- File preview tests cover original MIME types and bytes, office previews, spreadsheet
  fallback, expired sessions, and switching files while a request is pending.
- Browser layout tests cover mobile navigation, grade editing, and document controls.

Failed browser checks retain a trace and screenshot in the GitHub Actions
`browser-failure-evidence` artifact for seven days. Fixtures use synthetic accounts
and files; they never need another student's token, submissions, or screenshots.

## Rules for shared flows

- Keep the exact course and resource identity. Never replace an unknown item with a
  course overview, list, provider homepage, or invented empty-content message.
- Intercept a Canvas link only when Moofie has a matching route. Otherwise preserve
  the original Canvas destination as a usable link. Module redirect links currently
  use this fallback; module-list external-tool buttons use contextual launches.
- Launch LTI tools only on a user click, using fresh Canvas launch fields. Do not
  cache or automatically replay a launch, or issue launches from background audits.
- Failures report only the existing allowlisted diagnostic categories. Do not log
  tokens, signed launch fields, URLs, grades, names, or course content.
- For each navigation/preview regression, add a case that would fail with the old
  behavior and exercise the actual mapper, renderer, or click handler involved.

## Verification limits

These fixtures verify known Canvas contracts and Moofie's implementation. They do
not compare every user's live Canvas screen or prove the final behavior inside a
third-party tool. Cross-origin content may fail without exposing an observable error.
Background coverage checks course data and page reads; it does not take quizzes,
submit work, launch tools, or inspect other users' sessions.

Report live provider checks separately from fixture checks. GitHub Actions checks
run automatically; this workflow alone does not configure Vercel deployment gates
or GitHub branch protection.
