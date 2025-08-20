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

  // NEW: Add event listeners for multi-upload modal
  multiUploadModal.addEventListener('click', (event) => {
    if (event.target === multiUploadModal) multiUploadModal.classList.add('hidden');

    if (event.target.closest('.back-to-multi-choice-btn')) {
      multiScanArea.classList.add('hidden');
      multiDirectUploadArea.classList.add('hidden');

      multiUploadChoiceArea.classList.remove('hidden');

      multiScanTableContainer.innerHTML = '';
      multiDirectUploadTableContainer.innerHTML = '';

      multiScanQrArea.classList.add('hidden');
      multiScanStartButton.classList.remove('hidden');
      multiScanStartButton.disabled = false;
      multiScanAddRowButton.disabled = false;
      multiScanProcessButton.classList.add('hidden');

      if (multiScanPollingInterval) clearInterval(multiScanPollingInterval);
      multiScanPollingInterval = null;
      currentMultiScanSession = null;
    }
  });
  multiUploadModalClose.addEventListener('click', () => multiUploadModal.classList.add('hidden'));

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
    multiUploadModal.classList.remove('hidden');
    multiUploadChoiceArea.classList.remove('hidden');
    multiScanArea.classList.add('hidden');
    multiDirectUploadArea.classList.add('hidden');
  });

  multiScanButton.addEventListener('click', () => {
    multiUploadChoiceArea.classList.add('hidden');
    multiScanArea.classList.remove('hidden');
    generateStudentTable('scan');
  });
  multiDirectUploadButton.addEventListener('click', () => {
    multiUploadChoiceArea.classList.add('hidden');
    multiDirectUploadArea.classList.remove('hidden');
    generateStudentTable('direct');
  });

  multiScanAddRowButton.addEventListener('click', () => addStudentTableRow('scan'));
  multiDirectAddRowButton.addEventListener('click', () => addStudentTableRow('direct'));
  multiScanStartButton.addEventListener('click', handleStartMultiScan);
  multiDirectProcessButton.addEventListener('click', handleProcessAllDirectUploads);

  multiDirectUploadArea.addEventListener('change', (event) => {
    if (event.target.matches('#direct-student-table input[type="file"]')) {
      const fileInput = event.target;
      const files = fileInput.files;
      const label = fileInput.nextElementSibling;

      if (label) {
        if (files && files.length > 0) {
          label.textContent = files.length === 1 ? `1 file` : `${files.length} files`;
        } else {
          label.textContent = 'Choose Files';
        }
      }
    }
  });

  currentExamData = examData;
  examNameTitle.innerHTML = `
        <span data-editable="exam_name">${examData.exam_name}</span>
        <button class="edit-btn" data-edit-target="exam_name" data-exam-id="${examId}">
            ${EDIT_ICON_SVG}
        </button>
    `;

  await checkAndShowActionButtons(examId);

  renderExam(examData.questions);
}
// File: 12-main.js

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
});
