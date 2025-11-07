let examUiInitialized = false;
let loadExamDetailsRequestToken = 0;

/**
 * Load exam details, wire modal and multi-upload events, and render.
 * @param {string} examId
 */
async function loadExamDetails(examId) {
  const requestToken = ++loadExamDetailsRequestToken;
  const { data: examData, error } = await fetchFullExamDetails(examId);

  if (requestToken < loadExamDetailsRequestToken) {
    return;
  }

  if (error) {
    examNameTitle.textContent = 'Error Loading Exam';
    questionsContainer.innerHTML = `<p>Could not load exam details: ${error.message}</p>`;
    return;
  }

  if (!examUiInitialized) {
    examUiInitialized = true;

    const showMultiUploadChoice = () => {
      multiScanArea.classList.add('hidden');
      multiDirectUploadArea.classList.add('hidden');
      if (multiBulkUploadArea) {
        multiBulkUploadArea.classList.add('hidden');
      }
      multiUploadChoiceArea.classList.remove('hidden');
    };

    const showMultiScanArea = ({ regenerate = false } = {}) => {
      multiUploadChoiceArea.classList.add('hidden');
      multiDirectUploadArea.classList.add('hidden');
      if (multiBulkUploadArea) {
        multiBulkUploadArea.classList.add('hidden');
      }
      multiScanArea.classList.remove('hidden');
      if (regenerate || !multiScanTableContainer.querySelector('table')) {
        generateStudentTable('scan');
      }
      applyMultiScanSessionState();
      applyMultiScanProcessState();
    };

    const showMultiDirectArea = ({ regenerate = false } = {}) => {
      multiUploadChoiceArea.classList.add('hidden');
      multiScanArea.classList.add('hidden');
      if (multiBulkUploadArea) {
        multiBulkUploadArea.classList.add('hidden');
      }
      multiDirectUploadArea.classList.remove('hidden');
      if (regenerate || !multiDirectUploadTableContainer.querySelector('table')) {
        generateStudentTable('direct');
      }
      applyMultiDirectProcessState();
    };

    const showMultiBulkArea = ({ regenerate = false } = {}) => {
      multiUploadChoiceArea.classList.add('hidden');
      multiScanArea.classList.add('hidden');
      multiDirectUploadArea.classList.add('hidden');
      if (multiBulkUploadArea) {
        multiBulkUploadArea.classList.remove('hidden');
      }
      if (regenerate || !multiBulkUploadTableContainer.querySelector('table')) {
        generateStudentTable('bulk');
      }
      applyMultiBulkProcessState();
    };

    const restoreMultiUploadView = () => {
      const scanProcessState = window.getMultiScanProcessState ? window.getMultiScanProcessState() : null;
      const scanSessionState = window.getMultiScanSessionState ? window.getMultiScanSessionState() : null;
      const directProcessState = window.getMultiDirectProcessState ? window.getMultiDirectProcessState() : null;
      const bulkProcessState = window.getMultiBulkProcessState ? window.getMultiBulkProcessState() : null;

      if (scanProcessState && (scanProcessState.status === 'processing' || scanProcessState.status === 'success' || scanProcessState.status === 'error' || scanProcessState.visible)) {
        showMultiScanArea();
        return;
      }
      if (scanSessionState && scanSessionState.sessionToken) {
        showMultiScanArea();
        return;
      }
      if (directProcessState && (directProcessState.status === 'processing' || directProcessState.status === 'error' || directProcessState.status === 'success')) {
        showMultiDirectArea();
        return;
      }
      if (bulkProcessState && (bulkProcessState.status === 'processing' || bulkProcessState.status === 'error' || bulkProcessState.status === 'success')) {
        showMultiBulkArea();
        return;
      }
      showMultiUploadChoice();
    };

    const handleMultiUploadBack = async () => {
      const scanProcessState = window.getMultiScanProcessState ? window.getMultiScanProcessState() : null;
      const canCancelScan = !scanProcessState || scanProcessState.status !== 'processing';
      if (canCancelScan) {
        await cancelMultiScanSession('cancelled');
      }
      showMultiUploadChoice();
    };

    const handleMultiUploadModalClose = async () => {
      await handleMultiUploadBack();
      multiUploadModal.classList.add('hidden');
    };

    multiUploadModal.addEventListener('click', async (event) => {
      if (event.target === multiUploadModal) {
        await handleMultiUploadModalClose();
      }

      if (event.target.closest('.back-to-multi-choice-btn')) {
        await handleMultiUploadBack();
      }
    });
    multiUploadModalClose.addEventListener('click', handleMultiUploadModalClose);

    chooseSingleStudentButton.addEventListener('click', () => {
      submissionChoiceContainer.classList.add('hidden');
      studentAnswersForm.classList.remove('hidden');
      backToSubmissionChoice.classList.remove('hidden');
      applySingleScanState();
    });

    backToSubmissionChoice.addEventListener('click', async () => {
      const singleState = window.getSingleScanState ? window.getSingleScanState() : null;
      if (!singleState || (singleState.status !== 'processing' && singleState.status !== 'uploading')) {
        await cancelSingleScanSession('cancelled_by_user');
      }
      studentAnswersForm.classList.add('hidden');
      submissionChoiceContainer.classList.remove('hidden');
      backToSubmissionChoice.classList.add('hidden');
      applySingleScanState();
    });

    chooseMultiStudentButton.addEventListener('click', () => {
      multiUploadModal.classList.remove('hidden');
      restoreMultiUploadView();
    });

    multiScanButton.addEventListener('click', () => {
      showMultiScanArea({ regenerate: true });
    });
    multiDirectUploadButton.addEventListener('click', () => {
      showMultiDirectArea({ regenerate: true });
    });
    if (multiBulkUploadButton) {
      multiBulkUploadButton.addEventListener('click', () => {
        showMultiBulkArea({ regenerate: true });
      });
    }

    multiScanAddRowButton.addEventListener('click', () => addStudentTableRow('scan'));
    multiDirectAddRowButton.addEventListener('click', () => addStudentTableRow('direct'));
    if (multiBulkAddRowButton) {
      multiBulkAddRowButton.addEventListener('click', () => addStudentTableRow('bulk'));
    }
    multiScanStartButton.addEventListener('click', handleStartMultiScan);
    multiDirectProcessButton.addEventListener('click', handleProcessAllDirectUploads);
    if (multiBulkProcessButton) {
      multiBulkProcessButton.addEventListener('click', () => handleProcessAllSubmissions('bulk'));
    }

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
    if (multiBulkUploadArea) {
      multiBulkUploadArea.addEventListener('change', (event) => {
        if (event.target.matches('#bulk-pdf-input')) {
          const files = event.target.files;
          if (bulkPdfInputLabel) {
            bulkPdfInputLabel.textContent = files && files.length > 0 ? files[0].name : 'Choose Bulk PDF';
          }
        }
      });
    }
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

    applyAppendixUploadState();
    applyModelUploadState();
    applySingleScanState();
    applyMultiScanSessionState();
    applyMultiScanProcessState();
    applyMultiDirectProcessState();
    applyMultiBulkProcessState();

}


async function refreshExamDataCache(examId) {
  if (!examId) {
    return { data: null, error: new Error('Missing exam ID') };
  }

  const { data, error } = await fetchFullExamDetails(examId);
  if (!error && data) {
    currentExamData = data;
  }

  return { data: data ?? null, error: error ?? null };
}

window.refreshExamDataCache = refreshExamDataCache;
