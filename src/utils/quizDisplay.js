import { formatDueDate, formatPoints } from "./gradebook.js";

export const quizGroups = [
  [["assignment"], "Assignment Quizzes"],
  [["practice_quiz"], "Practice Quizzes"],
  [["graded_survey", "survey"], "Surveys"],
];

export function sortQuizzes(quizzes) {
  const due = quiz => Number.isFinite(Date.parse(quiz.dueAt)) ? Date.parse(quiz.dueAt) : Infinity;
  return [...quizzes].sort((a, b) => (due(a) - due(b)) || a.title.localeCompare(b.title));
}

export function quizMetadata(quiz, now = Date.now()) {
  const metadata = [];
  const unlock = Date.parse(quiz.unlockAt);
  const lock = Date.parse(quiz.lockAt);
  if (unlock > now) metadata.push(`Not available until ${formatDueDate(quiz.unlockAt)}`);
  else if (lock <= now || quiz.locked) metadata.push("Closed");
  else if (lock > now) metadata.push(`Available until ${formatDueDate(quiz.lockAt)}`);
  if (Number.isFinite(Date.parse(quiz.dueAt))) metadata.push(`Due ${formatDueDate(quiz.dueAt)}`);
  if (quiz.points != null) metadata.push(`${formatPoints(quiz.points)} ${Number(quiz.points) === 1 ? "pt" : "pts"}`);
  if (quiz.questionCount != null) metadata.push(`${quiz.questionCount} ${Number(quiz.questionCount) === 1 ? "Question" : "Questions"}`);
  return metadata;
}
