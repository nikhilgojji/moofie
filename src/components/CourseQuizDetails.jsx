import { formatDueDate, formatPoints } from '../utils/gradebook';
import { SafeCourseHtml } from './SafeCourseHtml';

export function CourseQuizDetails({ quiz, baseUrl }) {
  return <section className="native-quiz-view" aria-label="Quiz details">
    <div className="quiz-detail-meta">
      <span><strong>Due</strong> {formatDueDate(quiz.dueAt)}</span>
      {quiz.points != null && <span><strong>Points</strong> {formatPoints(quiz.points)}</span>}
      {quiz.questionCount != null && <span><strong>Questions</strong> {quiz.questionCount}</span>}
      {quiz.unlockAt && <span><strong>Available from</strong> {formatDueDate(quiz.unlockAt)}</span>}
      {quiz.lockAt && <span><strong>Available until</strong> {formatDueDate(quiz.lockAt)}</span>}
      {Object.hasOwn(quiz, 'timeLimit') && <span><strong>Time Limit</strong> {quiz.timeLimit ? `${quiz.timeLimit} minutes` : 'None'}</span>}
    </div>
    {quiz.description && <SafeCourseHtml html={quiz.description} baseUrl={quiz.htmlUrl || baseUrl} />}
    {quiz.lockExplanation && <SafeCourseHtml html={quiz.lockExplanation} baseUrl={quiz.htmlUrl || baseUrl} />}
    {(quiz.action?.url || quiz.htmlUrl) && <div className="quiz-launch"><a href={quiz.action?.url || quiz.htmlUrl} target="_blank" rel="noreferrer noopener">{quiz.action?.label || 'Open Quiz in Canvas'}</a></div>}
  </section>;
}
