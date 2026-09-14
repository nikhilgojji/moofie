import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasLinkNavigation } from './canvasLinks.js';

for (const courseId of [4, 39041, 82716]) {
  const base = `https://canvas.example/courses/${courseId}/pages/home`;
  test(`links preserve exact resource identity in course ${courseId}`, () => {
    for (const [path, type, id] of [['assignments/72', 'assignment', '72'], ['quizzes/73', 'quiz', '73'],
      ['discussion_topics/74', 'discussion', '74'], ['files/75/preview', 'file', '75'],
      ['files?preview=76', 'file', '76'], ['files/folder/Lecture%20Notes?preview=77', 'file', '77'],
      ['users/78', 'person', '78'], ['pages/week%202', 'page', 'week 2']]) {
      const result = canvasLinkNavigation(`/courses/${courseId}/${path}`, base);
      assert.equal(result.moofieViewer.courseId, courseId);
      assert.equal(result.moofieViewer.type, type);
      assert.equal(result.moofieViewer.item.id, id);
    }
  });
  test(`module redirects and unsupported Canvas actions are never replaced with course lists in ${courseId}`, () => {
    for (const path of ['modules/items/44', 'external_tools/retrieve?assignment_id=72', 'assignments/72/submissions/8']) {
      assert.equal(canvasLinkNavigation(`/courses/${courseId}/${path}`, base), null);
    }
    assert.equal(canvasLinkNavigation(`/courses/${courseId}/modules`, base).moofieHomeSection, 'course-modules');
    assert.equal(canvasLinkNavigation(`/courses/${courseId}/files?preview=invalid`, base).moofieViewer, null);
  });
}

test('cross-course links retain the target course rather than the current course', () => {
  const result = canvasLinkNavigation('/courses/29/files?preview=99', 'https://canvas.example/courses/4/pages/home');
  assert.equal(result.moofieViewer.courseId, 29);
  assert.equal(result.moofieViewer.item.id, '99');
});
