/**
 * Load exam details, wire modal and multi-upload events, and render.
 * @param {string} examId
 */
async function loadExamDetails(examId) {
  const { data: examData, error } = await fetchFullExamDetails(examId);

  if (error) {
    examNameTitle.textContent = 'Error Loading Exam';
    questionsContainer.innerHTML = `<p>Could not load exam details: ${error.message}</p>`;
    return;
  }

  currentExamData = examData;
  examNameTitle.innerHTML = `
        <span data-editable="exam_name">${examData.exam_name}</span>
        <button class="edit-btn" data-edit-target="exam_name" data-exam-id="${examId}">
            ${EDIT_ICON_SVG}
        </button>
    `;

  await checkAndShowActionButtons(examId);

    renderExam(examData.questions);

    // Refresh / (re)apply the student view selector after render
    if (typeof refreshStudentView === 'function') {
        refreshStudentView();
    }

}
