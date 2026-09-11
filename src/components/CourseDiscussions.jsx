import { useState } from "react";

export function CourseDiscussions({ discussions = [], onOpen }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const visible = discussions.filter(item => !item.isAnnouncement)
    .filter(item => `${item.title} ${item.authorName || ""}`.toLowerCase().includes(query.toLowerCase()))
    .filter(item => filter !== "unread" || item.unreadCount > 0)
    .sort((a, b) => new Date(b.lastReplyAt || b.postedAt || 0) - new Date(a.lastReplyAt || a.postedAt || 0));
  const groups = [
    { title: "Pinned Discussions", items: visible.filter(item => item.pinned && !item.closed), empty: "No pinned discussions." },
    { title: "Discussions", items: visible.filter(item => !item.pinned && !item.closed), empty: "There are no discussions to show in this section." },
    { title: "Closed for Comments", items: visible.filter(item => item.closed), empty: "You currently have no discussions with closed comments." },
  ];
  return <div className="course-discussions-index">
    <div className="course-discussion-filters">
      <select aria-label="Filter discussions" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All</option><option value="unread">Unread</option></select>
      <input aria-label="Search discussions by title or author" placeholder="Search by title or author…" value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    {groups.filter(group => group.title !== "Pinned Discussions" || group.items.length).map(group => <details key={group.title} open className="course-discussion-group">
      <summary>{group.title}<small>Ordered by Recent Activity</small></summary>
      {group.items.length ? group.items.map(item => <button className="home-resource-row" type="button" key={item.id} onClick={() => onOpen(item)}>
        <span className="home-resource-copy"><strong>{item.title}</strong><small>{item.authorName}{item.unreadCount > 0 ? ` · ${item.unreadCount} unread` : ""}</small></span>
      </button>) : <div className="course-discussion-empty">{query || filter !== "all" ? "No discussions match your filters." : group.empty}</div>}
    </details>)}
  </div>;
}
