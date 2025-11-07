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

    if (event.target.matches('#bulk-pdf-input')) {
      const file = event.target.files && event.target.files[0];
      if (bulkPdfInputLabel) {
        bulkPdfInputLabel.textContent = file ? file.name : 'Choose Bulk PDF';
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

    // Add-buttons (sub-q, model alt, student, question)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.classList.contains('add-subq-btn')) {
            if (typeof window.requireEditsUnlocked === 'function' && !window.requireEditsUnlocked()) {
                return;
            }
            const qId = btn.dataset.questionId || btn.closest('.question-block')?.dataset?.questionId;
            if (qId) stageNewSubQuestion(qId);
        }

        if (btn.classList.contains('add-model-alt-btn')) {
            if (typeof window.requireEditsUnlocked === 'function' && !window.requireEditsUnlocked()) {
                return;
            }
            const subQId = btn.dataset.subQuestionId
                || btn.closest('.grid-cell')?.dataset?.subQuestionId
                || '';
            if (subQId) stageNewModelAlternative(subQId);
        }

        if (btn.classList.contains('add-student-btn')) {
            if (typeof window.requireEditsUnlocked === 'function' && !window.requireEditsUnlocked()) {
                return;
            }
            const examId = btn.dataset.examId;
            if (examId) stageNewStudent(examId, btn);
        }

        if (btn.classList.contains('add-question-btn')) {
            if (typeof window.requireEditsUnlocked === 'function' && !window.requireEditsUnlocked()) {
                return;
            }
            const examId = btn.dataset.examId;
            if (examId) stageNewQuestion(examId);
        }
    });


});
