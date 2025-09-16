// --- MAIN LOGIC ---
let uploadUIInitialized = false;

function initializeUploadUI() {
  if (uploadUIInitialized) return;
  uploadUIInitialized = true;

  resetMultiUploadState();

  multiUploadModal.addEventListener('click', (event) => {
    if (event.target === multiUploadModal) {
      resetMultiUploadState({ closeModal: true });
    }

    if (event.target.closest('.back-to-multi-choice-btn')) {
      resetMultiUploadState();
    }
  });

  multiUploadModalClose.addEventListener('click', () => resetMultiUploadState({ closeModal: true }));

  chooseSingleStudentButton.addEventListener('click', () => {
    submissionChoiceContainer.classList.add('hidden');
    studentAnswersForm.classList.remove('hidden');
    backToSubmissionChoice.classList.remove('hidden');
  });

  backToSubmissionChoice.addEventListener('click', () => {
    studentAnswersForm.classList.add('hidden');
    submissionChoiceContainer.classList.remove('hidden');
    backToSubmissionChoice.classList.add('hidden');

    stopScanPolling();
    studentAnswersForm.reset();
    scanLinkArea.classList.add('hidden');
    generateScanLinkButton.disabled = false;
    setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
    showSpinner(false, spinnerStudent);
    if (directUploadInput) {
      directUploadInput.value = '';
    }
  });

  chooseMultiStudentButton.addEventListener('click', () => {
    resetMultiUploadState();
    multiUploadModal.classList.remove('hidden');
  });

  multiScanButton.addEventListener('click', () => {
    multiUploadChoiceArea.classList.add('hidden');
    multiDirectUploadArea.classList.add('hidden');
    multiScanArea.classList.remove('hidden');
    if (!multiScanTableContainer.querySelector('table')) {
      generateStudentTable('scan');
    }
  });

  multiDirectUploadButton.addEventListener('click', () => {
    multiUploadChoiceArea.classList.add('hidden');
    multiScanArea.classList.add('hidden');
    multiDirectUploadArea.classList.remove('hidden');
    if (!multiDirectUploadTableContainer.querySelector('table')) {
      generateStudentTable('direct');
    }
  });

  multiScanAddRowButton.addEventListener('click', () => addStudentTableRow('scan'));
  multiDirectAddRowButton.addEventListener('click', () => addStudentTableRow('direct'));
  multiScanStartButton.addEventListener('click', handleStartMultiScan);
  multiDirectProcessButton.addEventListener('click', handleProcessAllDirectUploads);
}

document.addEventListener('DOMContentLoaded', async () => {
  setupFileInputFeedback('appendix-files', 'appendix-file-display');
  setupFileInputFeedback('model-files', 'model-file-display');

  initializeUploadUI();

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

    // Add-buttons (sub-q, model alt, student, question)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.classList.contains('add-subq-btn')) {
            const qId = btn.dataset.questionId || btn.closest('.question-block')?.dataset?.questionId;
            if (qId) stageNewSubQuestion(qId);
        }

        if (btn.classList.contains('add-model-alt-btn')) {
            const subQId = btn.dataset.subQuestionId
                || btn.closest('.grid-cell')?.dataset?.subQuestionId
                || '';
            if (subQId) stageNewModelAlternative(subQId);
        }

        if (btn.classList.contains('add-student-btn')) {
            const examId = btn.dataset.examId;
            if (examId) stageNewStudent(examId, btn);
        }

        if (btn.classList.contains('add-question-btn')) {
            const examId = btn.dataset.examId;
            if (examId) stageNewQuestion(examId);
        }
    });


});
