let multiUploadUiInitialized = false;

function showSingleStudentForm() {
  submissionChoiceContainer.classList.add('hidden');
  studentAnswersForm.classList.remove('hidden');
  backToSubmissionChoice.classList.remove('hidden');
}

function resetSingleStudentUploadState() {
  studentAnswersForm.classList.add('hidden');
  submissionChoiceContainer.classList.remove('hidden');
  backToSubmissionChoice.classList.add('hidden');

  if (typeof stopScanPolling === 'function') {
    stopScanPolling();
  }
  studentAnswersForm.reset();
  scanLinkArea.classList.add('hidden');
  generateScanLinkButton.disabled = false;
  setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
  showSpinner(false, spinnerStudent);
  if (directUploadInput) {
    directUploadInput.disabled = false;
    directUploadInput.value = '';
  }
}

function handleMultiUploadModalClick(event) {
  if (event.target === multiUploadModal) {
    multiUploadModal.classList.add('hidden');
    return;
  }

  if (event.target.closest('.back-to-multi-choice-btn')) {
    resetMultiUploadState();
  }
}

function handleMultiDirectFileLabelChange(event) {
  if (!event.target.matches('#direct-student-table input[type="file"]')) return;

  const fileInput = event.target;
  const files = fileInput.files;
  const label = fileInput.nextElementSibling;

  if (!label) return;

  if (files && files.length > 0) {
    label.textContent = files.length === 1 ? `1 file` : `${files.length} files`;
  } else {
    label.textContent = 'Choose Files';
  }
}

function resetMultiUploadState({ preserveSession = false } = {}) {
  multiUploadChoiceArea.classList.remove('hidden');
  multiScanArea.classList.add('hidden');
  multiDirectUploadArea.classList.add('hidden');

  multiScanTableContainer.innerHTML = '';
  multiDirectUploadTableContainer.innerHTML = '';

  multiScanQrArea.classList.add('hidden');
  multiScanStartButton.classList.remove('hidden');
  multiScanStartButton.disabled = false;
  multiScanAddRowButton.disabled = false;

  multiScanProcessButton.classList.add('hidden');
  multiScanProcessButton.disabled = false;
  multiScanProcessButton.onclick = null;
  showSpinner(false, spinnerMultiProcess);
  setButtonText(multiScanProcessButtonText, DEFAULT_MULTI_PROCESS_BUTTON_TEXT);

  multiDirectProcessButton.disabled = false;
  showSpinner(false, spinnerMultiDirectProcess);
  setButtonText(multiDirectProcessButtonText, DEFAULT_MULTI_PROCESS_BUTTON_TEXT);

  if (!preserveSession) {
    if (multiScanPollingInterval) clearInterval(multiScanPollingInterval);
    multiScanPollingInterval = null;
    currentMultiScanSession = null;
  }
}

window.resetMultiUploadState = resetMultiUploadState;

function restoreMultiScanSessionUi() {
  if (!currentMultiScanSession || !Array.isArray(currentMultiScanSession.students)) {
    return false;
  }

  const students = currentMultiScanSession.students;
  if (students.length === 0) {
    return false;
  }

  multiUploadChoiceArea.classList.add('hidden');
  multiScanArea.classList.remove('hidden');

  generateStudentTable('scan', students.length);
  const tableRows = document.querySelectorAll('#scan-student-table tbody tr');
  let allUploaded = true;

  students.forEach((student, index) => {
    const row = tableRows[index];
    if (!row) return;

    row.dataset.studentId = student.id || '';
    const nameInput = row.querySelector('.student-name-input');
    const numberInput = row.querySelector('.student-number-input');
    if (nameInput) nameInput.value = student.student_name || '';
    if (numberInput) numberInput.value = student.student_number || '';

    const statusCell = row.querySelector('.status-cell');
    if (statusCell) {
      const status = (student.status || 'pending').toLowerCase();
      const capitalized = status.charAt(0).toUpperCase() + status.slice(1);
      statusCell.textContent = capitalized;
      if (status === 'uploaded') {
        statusCell.style.color = 'var(--color-green-pastel)';
        statusCell.style.fontWeight = 'bold';
      } else {
        statusCell.style.color = '';
        statusCell.style.fontWeight = '';
        allUploaded = false;
      }
    }
  });

  multiScanAddRowButton.disabled = true;
  multiScanStartButton.classList.add('hidden');

  if (currentMultiScanSession.session_token) {
    const scanUrl = `${MULTI_SCAN_PAGE_BASE_URL}?token=${currentMultiScanSession.session_token}`;
    if (typeof QRious === 'function') {
      new QRious({ element: multiQrcodeCanvas, value: scanUrl, size: 200 });
    }
    multiScanUrlLink.href = scanUrl;
    multiScanUrlLink.textContent = 'Open Link in New Tab';
    multiScanQrArea.classList.remove('hidden');
  }

  multiScanProcessButton.onclick = () => handleProcessAllSubmissions('scan');
  if (allUploaded) {
    multiScanProcessButton.classList.remove('hidden');
  } else {
    multiScanProcessButton.classList.add('hidden');
  }

  return true;
}

function setupMultiUploadUi() {
  if (multiUploadUiInitialized) return;

  multiUploadModal.addEventListener('click', handleMultiUploadModalClick);
  multiUploadModalClose.addEventListener('click', () => multiUploadModal.classList.add('hidden'));
  chooseSingleStudentButton.addEventListener('click', showSingleStudentForm);
  backToSubmissionChoice.addEventListener('click', resetSingleStudentUploadState);
  chooseMultiStudentButton.addEventListener('click', () => {
    multiUploadModal.classList.remove('hidden');
    resetMultiUploadState({ preserveSession: true });
    if (currentMultiScanSession?.session_token) {
      restoreMultiScanSessionUi();
    }
  });
  multiScanButton.addEventListener('click', () => {
    resetMultiUploadState();
    multiUploadChoiceArea.classList.add('hidden');
    multiScanArea.classList.remove('hidden');
    generateStudentTable('scan');
  });
  multiDirectUploadButton.addEventListener('click', () => {
    resetMultiUploadState({ preserveSession: true });
    multiUploadChoiceArea.classList.add('hidden');
    multiDirectUploadArea.classList.remove('hidden');
    generateStudentTable('direct');
  });
  multiScanAddRowButton.addEventListener('click', () => addStudentTableRow('scan'));
  multiDirectAddRowButton.addEventListener('click', () => addStudentTableRow('direct'));
  multiScanStartButton.addEventListener('click', handleStartMultiScan);
  multiDirectProcessButton.addEventListener('click', handleProcessAllDirectUploads);
  multiDirectUploadArea.addEventListener('change', handleMultiDirectFileLabelChange);

  resetMultiUploadState({ preserveSession: true });
  resetSingleStudentUploadState();
  multiUploadUiInitialized = true;
}

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

  setupMultiUploadUi();

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

  if (!multiUploadModal.classList.contains('hidden') && currentMultiScanSession?.session_token) {
    restoreMultiScanSessionUi();
  }
}
