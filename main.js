// --- MAIN LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
  setupFileInputFeedback('appendix-files', 'appendix-file-display');
  setupFileInputFeedback('model-files', 'model-file-display');

  // Delegated handler for dynamic direct-upload rows file inputs
  multiUploadModal.addEventListener('change', (event) => {
    if (event.target.matches('#direct-student-table input[type="file"]')) {
      const fileInput = event.target;
      const files = fileInput.files;
      const label = fileInput.nextElementSibling;

      if (label) {
        if (files && files.length > 0) {
          label.textContent = files.length === 1 ? `1 file selected` : `${files.length} files selected`;
        } else {
          label.textContent = 'Choose Files';
        }
      }
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');

  if (!examId) {
    examNameTitle.textContent = 'Error: No Exam ID provided.';
    questionsContainer.innerHTML = '<p>Please return to the main page and select an exam.</p>';
    document.querySelectorAll('.container').forEach((c) => {
      if (c.querySelector('form') || c.querySelector('#grade-all-button')) {
        c.classList.add('hidden');
      }
    });
    return;
  }

  await loadExamDetails(examId);

  [rulesModal, appendixModal, gradesModal].forEach((modal) => {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.add('hidden');
    });
  });
  [rulesModalClose, appendixModalClose, gradesModalClose].forEach((button) => {
    button.addEventListener('click', () => button.closest('.modal-overlay').classList.add('hidden'));
  });

  showGradesButton.addEventListener('click', handleShowGradesClick);

  // Edit Event Listeners
  questionsContainer.addEventListener('click', handleEditClick);
  examNameTitle.addEventListener('click', handleEditClick);
  rulesModal.addEventListener('click', handleEditClick);
  appendixModal.addEventListener('click', handleEditClick);

  // Delegated "add" buttons inside questions container
  questionsContainer.addEventListener('click', (e) => {
    const addSubQ = e.target.closest('.add-sub-question-btn');
    if (addSubQ) {
      addSubQuestion(addSubQ.dataset.questionId);
      return;
    }
    const addAlt = e.target.closest('.add-model-alternative-btn');
    if (addAlt) {
      addModelAlternative(addAlt.dataset.subQuestionId);
      return;
    }
    const addStudent = e.target.closest('.add-student-btn');
    if (addStudent) {
      addStudentToExam(addStudent.dataset.examId);
      return;
    }
    const addAltComment = e.target.closest('.add-alt-comment-btn');
    if (addAltComment) {
      const altEl = addAltComment.closest('.model-alternative');
      addAlternativeCommentDom(altEl);
      return;
    }
    const addComp = e.target.closest('.add-model-component-btn');
    if (addComp) {
      const altEl = addComp.closest('.model-alternative');
      addModelComponentDom(altEl);
      return;
    }
  });
  
  // "Add Question" below all question blocks
  questionsContainer.addEventListener('click', (e) => {
    const addQ = e.target.closest('.add-full-question-btn');
    if (addQ) {
      addFullQuestion();
    }
  });
});
