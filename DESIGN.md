# Moofie design system

## Visual authority

The September 7 reference screenshots establish typography, palette, whitespace, and restrained interactive detail. The user explicitly excludes an editor, file explorer, and terminal. Keep Moofie's student workflows and navigation. This replaces the compact teal workspace direction.

## Color

Default canvas: near black `#0b0b0c`. Surfaces: `#101011`. Separators: `#232325`. Reading text: `#a7a7ab`. Metadata: `#89898f`. Primary headings: `#eeedeb`. Yellow/amber `#e8ac2e` marks interface selection, contextual labels, internal file/folder links, and breadcrumbs. Blue (`#78b7ff` dark; `#0066b3` light) is reserved for email and outgoing website hyperlinks. Preserve semantic error and warning colors. Header and footer match the page background, with no divider lines. File-folder icons are neutral, solid silhouettes. Hide the course-name breadcrumb at the Files root; inside folders show All files and the folder trail for navigation.

Explicit saved light/dark choices persist. New visitors start in light mode, applied before the first paint. Light mode translates the same hierarchy onto warm paper with dark amber for readable accent text. Only a manual toggle writes a theme preference.

## Typography

Self-hosted Libre Franklin Variable carries headings, body, course names, navigation and the wordmark. Course names use 22–24px at weight 600; navigation uses 15px at weight 450. Monospaced navigation and the extra font families were removed at the user's request. Main titles use 42–68px, section titles 32–46px, and document titles 30–52px. Course prose uses 18px/1.8 on desktop and 16px/1.8 on mobile, with paragraph measure capped at 72ch.

## Layout

Dashboard content is capped at 1120px with 76px top spacing. Courses and grade summaries use full-width separated rows. Desktop course pages have a 230px navigation rail and 36–88px separation from the reading pane. Main course workspace is capped at 1440px. Mobile uses 18px gutters and horizontally scrollable course navigation. File previews retain their wider layout.

## Interaction

Pages follows Canvas's front-page flow: show the course front-page content first, with View All Pages revealing the index. Courses without front-page content show the index directly. Individual pages also offer View All Pages. The front page, index, and opened page have distinct browser-history entries.

Files open in a full-viewport, themed document reader. A compact filename header holds file information, download, and close controls; page/zoom/rotation/fullscreen controls sit directly above the document. The document keeps its original colors. A bottom bar offers previous/next files and Close. Close/Escape returns to the originating screen even after browsing multiple files, while browser Back/Forward visits individual files. The reader hides the course sidebar, large page heading, duplicate download row, and site chrome. Background controls are inert while reading. Mobile keeps document controls usable with a wrapping toolbar.

Active navigation uses a quiet amber tint and fine amber edge. Course rows expose an Open course action whose arrow moves slightly on hover or focus. Expanding modules highlights the current summary. Section changes reveal content with a brief 220ms motion; reduced-motion mode disables animation and transitions. Preserve keyboard focus, disabled states, themed caret and scrollbars, and tabular numerals for grades.

## Implementation and verification

Navigation uses `src/utils/navigation.js`: each course, tab, folder, and content view gets a browser-history entry. Search, sorting, filters, and fetched page bodies update the current entry. Back/Forward and reload read saved route state, and content uses its underlying Home/Grades context rather than a separate context-free content route. Course resources remain cached while switching app views. Browser and content-pane scroll positions are restored. Six navigation regression tests cover history traversal, folder/file context, grade context, current-entry updates, and saved scroll positions.

`src/reference-theme.css`, imported after existing styles, owns this visual layer. `CourseLists.jsx` provides bordered, collapsible Upcoming/Undated/Past assignment groups with availability, deadlines, scores, and status. Files use real Canvas folder relationships, breadcrumbs, course-wide search, sorting, and downloads. The Canvas folder-data update was deployed with user approval on September 7, 2026, using an isolated copy of the existing live function so unrelated local backend changes were not published. Root/nested folder mapping, locked states, file membership, and empty-folder responses passed fixture checks. Existing open sessions need a page reload to fetch fresh course resources. Older responses retain access to the flat file list. The home introduction was removed at the user's request.

The production build and server-rendered sample-data checks pass. A live browser was unavailable, so desktop/mobile rendering and interactive visual review remain unverified. The mechanical font warning is accepted because the supplied reference governs the type direction.
