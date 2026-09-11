import { useEffect, useState } from "react";
import { loadCourseContent } from "../canvasApi";
import { writeNavigation } from "../utils/navigation";
import { profileEnrollments } from "../utils/people";
import { ContentSkeleton } from "./ContentSkeleton";
import { CourseAvatar } from "./CourseAvatar";
import { SafeCourseHtml } from "./SafeCourseHtml";

export function CoursePerson({ courseId, person: initialPerson, availableCourses = [] }) {
  const [person, setPerson] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPerson(null);
    setError("");
    loadCourseContent(courseId, "person", initialPerson.id).then(result => { if (active) setPerson(result); }).catch(error => { if (active) setError(error.message || "This profile could not be loaded."); });
    return () => { active = false; };
  }, [courseId, initialPerson.id, attempt]);
  const current = person || initialPerson;
  return <div className="course-person-profile">
    <CourseAvatar className="people-avatar profile-avatar" name={current.name} src={current.avatarUrl} eager />
    <div className="profile-content">
      <h3>{current.name}{current.pronouns && <em> ({current.pronouns})</em>}</h3>
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : !person ? <ContentSkeleton label="Loading profile" variant="text" /> : <>
        {person.title && <p>{person.title}</p>}
        {!person.profileAvailable && <p className="profile-notice">Canvas has not made this person’s full profile available to your account.</p>}
        <section><h4>Name Pronunciation</h4><p>{person.pronunciation || (person.profileAvailable ? "No name pronunciation provided" : "Name pronunciation is not available.")}</p></section>
        <section><h4>Contact</h4>{person.email && <p><a href={`mailto:${person.email}`}>{person.email}</a></p>}{person.services.map((service, index) => <div key={index}><ProfileLink url={service.url} courseId={courseId}>{service.name}</ProfileLink></div>)}</section>
        <section><h4>Biography</h4>{person.bio ? <p className="profile-biography">{person.bio}</p> : <p>{person.profileAvailable ? "No biography has been added" : "Biography is not available."}</p>}</section>
        <section>
          <h4>Enrollments</h4>
          {person.enrollments.length ? <ul>{profileEnrollments(person.enrollments).map((enrollment, index) => {
            const canOpen = Number(enrollment.courseId) === Number(courseId) || availableCourses.some(course => Number(course.id) === Number(enrollment.courseId));
            const label = `${enrollment.roles.join(", ")}${enrollment.courseName ? ` in ${enrollment.courseName}` : ""}`;
            return <li key={index}>
              {canOpen ? <button className="profile-course-link" type="button" onClick={() => writeNavigation({ moofieView: "home", moofieHomeCourse: enrollment.courseId, moofieHomeSection: "course-overview", moofieViewer: null })}>{label}</button> : label}
              {enrollment.sections.length > 0 && <span className="profile-sections">{enrollment.sections.join(" · ")}</span>}
            </li>;
          })}</ul> : <p>No enrollments are available to view.</p>}
        </section>
        <section><h4>Links</h4>{person.links.length ? <ul>{person.links.map((link, index) => <li key={index}><ProfileLink url={link.url} courseId={courseId}>{link.title}</ProfileLink></li>)}</ul> : <p>{person.profileAvailable ? "No links have been added" : "Profile links are not available."}</p>}</section>
      </>}
    </div>
  </div>;
}

function ProfileLink({ url, courseId, children }) {
  // The existing rich-content renderer also routes Canvas links within Moofie.
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  return <SafeCourseHtml html={`<a href="${escape(url)}">${escape(children)}</a>`} baseUrl={`https://catcourses.ucmerced.edu/courses/${courseId}`} />;
}
