// =================================================================
// --- MULTI-STUDENT UPLOAD WORKFLOW ---
// =================================================================

const multiScanSessionStateDefaults = {
  status: 'idle',
  disabled: false,
  showQr: false,
  startButtonHidden: false,
  sessionToken: null,
};
const multiScanSessionState = { ...multiScanSessionStateDefaults };

const multiScanProcessStateDefaults = {
  status: 'hidden',
  buttonText: 'Process All Submissions',
  spinner: false,
  disabled: false,
  visible: false,
};
const multiScanProcessState = { ...multiScanProcessStateDefaults };
let multiScanProcessResetTimeout = null;

const multiDirectProcessStateDefaults = {
  status: 'idle',
  buttonText: 'Process All Submissions',
  spinner: false,
  disabled: false,
};
const multiDirectProcessState = { ...multiDirectProcessStateDefaults };
let multiDirectProcessResetTimeout = null;

const multiBulkProcessStateDefaults = {
  status: 'idle',
  buttonText: 'Process Bulk PDF',
  spinner: false,
  disabled: false,
};
const multiBulkProcessState = { ...multiBulkProcessStateDefaults };
let multiBulkProcessResetTimeout = null;

function applyMultiScanSessionState() {
  if (!multiScanStartButton || !multiScanAddRowButton) return;
  multiScanStartButton.disabled = multiScanSessionState.disabled;
  multiScanAddRowButton.disabled = multiScanSessionState.disabled;
  multiScanStartButton.classList.toggle('hidden', multiScanSessionState.startButtonHidden);
  multiScanQrArea.classList.toggle('hidden', !multiScanSessionState.showQr);

  if (!multiScanSessionState.showQr) {
    multiScanUrlLink.href = '#';
    multiScanUrlLink.textContent = '';
    if (multiQrcodeCanvas && typeof multiQrcodeCanvas.getContext === 'function') {
      const ctx = multiQrcodeCanvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, multiQrcodeCanvas.width, multiQrcodeCanvas.height);
      }
    }
  }
}

function setMultiScanSessionState(patch) {
  Object.assign(multiScanSessionState, patch);
  applyMultiScanSessionState();
}

function resetMultiScanSessionState() {
  Object.assign(multiScanSessionState, multiScanSessionStateDefaults);
  applyMultiScanSessionState();
}

function applyMultiScanProcessState() {
  if (!multiScanProcessButton || !multiScanProcessButtonText) return;
  multiScanProcessButton.disabled = multiScanProcessState.disabled;
  showSpinner(multiScanProcessState.spinner, spinnerMultiProcess);
  multiScanProcessButtonText.textContent = multiScanProcessState.buttonText;
  multiScanProcessButton.classList.toggle('hidden', !multiScanProcessState.visible);
}

function setMultiScanProcessState(patch) {
  Object.assign(multiScanProcessState, patch);
  applyMultiScanProcessState();
}

function scheduleMultiScanProcessReset(delayMs) {
  if (multiScanProcessResetTimeout) clearTimeout(multiScanProcessResetTimeout);
  multiScanProcessResetTimeout = setTimeout(() => {
    multiScanProcessResetTimeout = null;
    Object.assign(multiScanProcessState, multiScanProcessStateDefaults);
    applyMultiScanProcessState();
  }, delayMs);
}

function applyMultiDirectProcessState() {
  if (!multiDirectProcessButton || !multiDirectProcessButtonText) return;
  multiDirectProcessButton.disabled = multiDirectProcessState.disabled;
  showSpinner(multiDirectProcessState.spinner, spinnerMultiDirectProcess);
  multiDirectProcessButtonText.textContent = multiDirectProcessState.buttonText;
}

function setMultiDirectProcessState(patch) {
  Object.assign(multiDirectProcessState, patch);
  applyMultiDirectProcessState();
}

function scheduleMultiDirectProcessReset(delayMs) {
  if (multiDirectProcessResetTimeout) clearTimeout(multiDirectProcessResetTimeout);
  multiDirectProcessResetTimeout = setTimeout(() => {
    multiDirectProcessResetTimeout = null;
    Object.assign(multiDirectProcessState, multiDirectProcessStateDefaults);
    applyMultiDirectProcessState();
  }, delayMs);
}

function applyMultiBulkProcessState() {
  if (!multiBulkProcessButton || !multiBulkProcessButtonText) return;
  multiBulkProcessButton.disabled = multiBulkProcessState.disabled;
  showSpinner(multiBulkProcessState.spinner, spinnerMultiBulkProcess);
  multiBulkProcessButtonText.textContent = multiBulkProcessState.buttonText;
}

function setMultiBulkProcessState(patch) {
  Object.assign(multiBulkProcessState, patch);
  applyMultiBulkProcessState();
}

function scheduleMultiBulkProcessReset(delayMs) {
  if (multiBulkProcessResetTimeout) clearTimeout(multiBulkProcessResetTimeout);
  multiBulkProcessResetTimeout = setTimeout(() => {
    multiBulkProcessResetTimeout = null;
    Object.assign(multiBulkProcessState, multiBulkProcessStateDefaults);
    applyMultiBulkProcessState();
  }, delayMs);
}

applyMultiScanSessionState();
applyMultiScanProcessState();
applyMultiDirectProcessState();
applyMultiBulkProcessState();
window.applyMultiScanSessionState = applyMultiScanSessionState;
window.applyMultiScanProcessState = applyMultiScanProcessState;
window.applyMultiDirectProcessState = applyMultiDirectProcessState;
window.applyMultiBulkProcessState = applyMultiBulkProcessState;
window.getMultiScanProcessState = () => ({ ...multiScanProcessState });
window.getMultiDirectProcessState = () => ({ ...multiDirectProcessState });
window.getMultiScanSessionState = () => ({ ...multiScanSessionState });
window.getMultiBulkProcessState = () => ({ ...multiBulkProcessState });

async function cancelMultiScanSession(reason = 'cancelled') {
  if (multiScanProcessState.status === 'processing') {
    return false;
  }

  if (multiScanPollingInterval) {
    clearInterval(multiScanPollingInterval);
    multiScanPollingInterval = null;
  }

  if (currentMultiScanSession?.session_token) {
    try {
      await sb.rpc('update_multi_scan_session_status', {
        session_token_arg: currentMultiScanSession.session_token,
        new_status_arg: reason,
      });
    } catch (error) {
      console.warn('Failed to update multi-scan session status during cancel:', error);
    }
  }

  currentMultiScanSession = null;
  resetMultiScanSessionState();
  if (multiScanProcessResetTimeout) {
    clearTimeout(multiScanProcessResetTimeout);
    multiScanProcessResetTimeout = null;
  }
  Object.assign(multiScanProcessState, multiScanProcessStateDefaults);
  applyMultiScanProcessState();
  if (multiScanTableContainer) {
    multiScanTableContainer.innerHTML = '';
  }
  return true;
}

window.cancelMultiScanSession = cancelMultiScanSession;


/**
 * Generate the student table for scan or direct uploads.
 * @param {'scan'|'direct'} type
 * @param {number} rowCount
 */
function generateStudentTable(type, rowCount = 10) {
  const container =
    type === 'scan'
      ? multiScanTableContainer
      : type === 'direct'
      ? multiDirectUploadTableContainer
      : multiBulkUploadTableContainer;
  if (!container) return;
  const tableId = `${type}-student-table`;
  const columnDefinitions =
    type === 'bulk'
      ? [
          { header: '#', width: '3%' },
          { header: 'Student Name', width: '47%' },
          { header: 'Student Number', width: '45%' },
          { header: '', width: '5%' },
        ]
      : [
          { header: '#', width: '3%' },
          { header: 'Student Name', width: '37%' },
          { header: 'Student Number', width: '30%' },
          { header: type === 'scan' ? 'Status' : 'Files', width: '25%' },
          { header: '', width: '5%' },
        ];

  let tableHtml = `<table id="${tableId}"><thead><tr>`;
  tableHtml += columnDefinitions
    .map((column) => `<th style="width: ${column.width};">${column.header}</th>`)
    .join('');
  tableHtml += `</tr></thead><tbody>`;

  for (let i = 0; i < rowCount; i++) {
    tableHtml += generateStudentTableRowHtml(i, type);
  }

  tableHtml += `</tbody></table>`;
  container.innerHTML = tableHtml;

  if (!container.dataset.listenerAttached) {
    container.addEventListener('click', function (event) {
      if (event.target.classList.contains('delete-row-btn')) {
        handleDeleteRow(event.target, tableId);
      }
    });
    container.dataset.listenerAttached = 'true';
  }
}

/**
 * Generate a single student table row.
 * @param {number} index
 * @param {'scan'|'direct'} type
 * @returns {string}
 */
function generateStudentTableRowHtml(index, type) {
  const fileInputId = `direct-upload-row-${index}`;
  const rowAttributes = `data-row-index="${index}" data-student-id=""`;

  const actionCell =
    type === 'scan'
      ? `<td class="status-cell">Pending</td>`
      : type === 'direct'
      ? `<td>
             <input type="file" id="${fileInputId}" class="file-input-hidden direct-upload-input" accept=".pdf,image/*" multiple>
             <label for="${fileInputId}" class="file-input-label">Choose Files</label>
           </td>`
      : '';

  return `<tr ${rowAttributes}>
        <td>${index + 1}</td>
        <td><input type="text" class="student-name-input" placeholder="e.g., Jane Doe"></td>
        <td><input type="text" class="student-number-input" placeholder="e.g., s1234567"></td>
        ${actionCell}
        <td><button type="button" class="delete-row-btn">×</button></td>
    </tr>`;
}

/**
 * Append a new row to the student table.
 * @param {'scan'|'direct'} type
 */
function addStudentTableRow(type) {
  const table = document.getElementById(`${type}-student-table`).getElementsByTagName('tbody')[0];
  const newIndex = table.rows.length;
  table.insertAdjacentHTML('beforeend', generateStudentTableRowHtml(newIndex, type));
}

/**
 * Create a multi-scan session and start polling.
 */
async function handleStartMultiScan() {
  setMultiScanSessionState({ status: 'starting', disabled: true });
  const rows = document.querySelectorAll('#scan-student-table tbody tr');
  const students = Array.from(rows)
    .map((row) => ({
      studentName: row.querySelector('.student-name-input').value.trim(),
      studentNumber: row.querySelector('.student-number-input').value.trim(),
    }))
    .filter((s) => s.studentName || s.studentNumber);

  if (students.length === 0) {
    alert('Please fill in at least one student name or number.');
    resetMultiScanSessionState();
    return;
  }

  const examId = new URLSearchParams(window.location.search).get('id');

  try {
    const { data, error } = await sb.rpc('create_multi_scan_session', {
      exam_id_arg: examId,
      students_arg: students,
    });
    if (error) throw error;

    currentMultiScanSession = data;

    if (data.students && data.students.length > 0) {
      const tableRows = document.querySelectorAll('#scan-student-table tbody tr');
      data.students.forEach((student, index) => {
        const row = tableRows[index];
        if (row) {
          row.dataset.studentId = student.id;
        }
      });
    }

    const scanUrl = `${MULTI_SCAN_PAGE_BASE_URL}?token=${data.session_token}`;

    new QRious({ element: multiQrcodeCanvas, value: scanUrl, size: 200 });
    multiScanUrlLink.href = scanUrl;
    multiScanUrlLink.textContent = 'Open Link in New Tab';
    setMultiScanSessionState({
      status: 'waiting',
      disabled: true,
      startButtonHidden: true,
      showQr: true,
      sessionToken: data.session_token,
    });
    Object.assign(multiScanProcessState, multiScanProcessStateDefaults);
    applyMultiScanProcessState();
    startMultiScanPolling();
  } catch (error) {
    console.error('Failed to create multi-scan session:', error);
    alert(`Error: ${error.message}`);
    resetMultiScanSessionState();
  }
}

/**
 * Handle the deletion of a table row (visual only).
 * @param {HTMLElement} buttonElement
 * @param {string} tableId
 */
function handleDeleteRow(buttonElement, tableId) {
  const row = buttonElement.closest('tr');
  if (row) {
    row.remove();
    renumberTableRows(tableId);
  }
}

/**
 * Visually re-number table rows after deletion.
 * @param {string} tableId
 */
function renumberTableRows(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');

  rows.forEach((row, index) => {
    const numberCell = row.cells[0];
    if (numberCell) {
      numberCell.textContent = index + 1;
    }
  });
}

/**
 * Poll for multi-scan session updates and unlock processing when all uploaded.
 */
function startMultiScanPolling() {
  if (multiScanPollingInterval) clearInterval(multiScanPollingInterval);
  multiScanPollingInterval = setInterval(async () => {
    if (!currentMultiScanSession?.session_token) {
      clearInterval(multiScanPollingInterval);
      return;
    }
    try {
      const { data: sessionData, error } = await sb.rpc('get_multi_scan_session_by_token', {
        token_arg: currentMultiScanSession.session_token,
      });
      if (error) throw error;

      if (sessionData?.students) {
        let allUploaded = true;

        sessionData.students.forEach((student) => {
          const row = document.querySelector(`tr[data-student-id="${student.id}"]`);
          if (row) {
            const statusCell = row.querySelector('.status-cell');
            if (statusCell) {
              statusCell.textContent = student.status.charAt(0).toUpperCase() + student.status.slice(1);
              if (student.status === 'uploaded') {
                statusCell.style.color = 'var(--color-green-pastel)';
                statusCell.style.fontWeight = 'bold';
              }
            }
          }
          if (student.status !== 'uploaded') {
            allUploaded = false;
          }
        });

        if (allUploaded) {
          clearInterval(multiScanPollingInterval);

          try {
            await sb.rpc('update_multi_scan_session_status', {
              session_token_arg: currentMultiScanSession.session_token,
              new_status_arg: 'completed',
            });
            console.log('Multi-scan session status updated to completed.');
          } catch (rpcError) {
            console.error('Failed to update session status:', rpcError);
          }

          setMultiScanSessionState({ showQr: false, startButtonHidden: true });
          setMultiScanProcessState({
            status: 'ready',
            visible: true,
            disabled: false,
            spinner: false,
            buttonText: 'Process All Submissions',
          });
          multiScanProcessButton.onclick = () => handleProcessAllSubmissions('scan');
        }
      }
    } catch (err) {
      console.error('Polling error:', err);
      clearInterval(multiScanPollingInterval);
    }
  }, 5000);
}

/**
 * Proxy to process all direct uploads.
 */
async function handleProcessAllDirectUploads() {
  await handleProcessAllSubmissions('direct');
}

/**
 * Process all submissions (scan, direct, or bulk) in the modal.
 * @param {'scan'|'direct'|'bulk'} type
 */
async function handleProcessAllSubmissions(type) {
  let isError = false;
  let lockKey = null;

  if (type === 'scan') {
    setMultiScanProcessState({ status: 'processing', visible: true, disabled: true, spinner: true, buttonText: 'Processing...' });
  } else if (type === 'direct') {
    setMultiDirectProcessState({ status: 'processing', disabled: true, spinner: true, buttonText: 'Processing...' });
  } else {
    setMultiBulkProcessState({ status: 'processing', disabled: true, spinner: true, buttonText: 'Analyzing bulk PDF...' });
  }

  const examId = new URLSearchParams(window.location.search).get('id');
  let submissions = [];

  if (type === 'direct') {
    const rows = document.querySelectorAll('#direct-student-table tbody tr');
    submissions = Array.from(rows)
      .map((row) => ({
        studentName: row.querySelector('.student-name-input').value.trim(),
        studentNumber: row.querySelector('.student-number-input').value.trim(),
        files: row.querySelector('input[type="file"]').files,
      }))
      .filter((s) => (s.studentName || s.studentNumber) && s.files.length > 0);
  } else if (type === 'bulk') {
    const rows = document.querySelectorAll('#bulk-student-table tbody tr');
    const students = Array.from(rows)
      .map((row) => ({
        studentName: row.querySelector('.student-name-input').value.trim(),
        studentNumber: row.querySelector('.student-number-input').value.trim(),
      }))
      .filter((s) => s.studentName || s.studentNumber);

    if (students.length === 0) {
      alert('Please provide at least one student for the bulk upload.');
      setMultiBulkProcessState({ status: 'idle', disabled: false, spinner: false, buttonText: 'Process Bulk PDF' });
      return;
    }

    if (!bulkPdfInput || !bulkPdfInput.files || bulkPdfInput.files.length === 0) {
      alert('Please choose the bulk PDF file before processing.');
      setMultiBulkProcessState({ status: 'idle', disabled: false, spinner: false, buttonText: 'Process Bulk PDF' });
      return;
    }

    const bulkPdfFile = bulkPdfInput.files[0];

    try {
      setMultiBulkProcessState({ buttonText: 'Analyzing PDF for student boundaries...', spinner: true });
      const startPages = await requestBulkSubmissionBoundaries(bulkPdfFile, students);
      setMultiBulkProcessState({ buttonText: 'Splitting PDF into submissions...', spinner: true });
      const splitFiles = await splitBulkPdfIntoSubmissions(bulkPdfFile, startPages, students);
      if (splitFiles.length !== students.length) {
        throw new Error(`Expected ${students.length} split file sets but received ${splitFiles.length}.`);
      }
      const invalidSetIndex = splitFiles.findIndex((set) => !Array.isArray(set) || set.length === 0);
      if (invalidSetIndex !== -1) {
        const invalidStudent = students[invalidSetIndex];
        const identifier = invalidStudent?.studentName || invalidStudent?.studentNumber || `#${invalidSetIndex + 1}`;
        throw new Error(`No pages were generated for ${identifier}. Please verify the bulk PDF ordering.`);
      }
      submissions = students.map((student, index) => ({
        studentName: student.studentName,
        studentNumber: student.studentNumber,
        files: splitFiles[index],
      }));
    } catch (bulkError) {
      console.error('Bulk PDF processing failed:', bulkError);
      alert(bulkError.message || 'Failed to process the bulk PDF.');
      setMultiBulkProcessState({ status: 'error', disabled: true, spinner: false, buttonText: 'Error! See console.' });
      scheduleMultiBulkProcessReset(10000);
      return;
    }
  } else {
    const { data } = await sb.rpc('get_multi_scan_session_by_token', { token_arg: currentMultiScanSession.session_token });
    submissions = data.students.map((s) => ({
      studentName: s.student_name,
      studentNumber: s.student_number,
      uploaded_image_paths: s.uploaded_image_paths,
    }));
  }

  if (submissions.length === 0) {
    alert('No valid submissions to process.');
    if (type === 'scan') {
      setMultiScanProcessState({ status: 'ready', visible: true, disabled: false, spinner: false, buttonText: 'Process All Submissions' });
    } else if (type === 'direct') {
      setMultiDirectProcessState({ status: 'idle', disabled: false, spinner: false, buttonText: 'Process All Submissions' });
    } else {
      setMultiBulkProcessState({ status: 'idle', disabled: false, spinner: false, buttonText: 'Process Bulk PDF' });
    }
    return;
  }

  try {
    if (typeof window.enterProcessingLock === 'function') {
      lockKey = window.enterProcessingLock(
        type === 'scan' ? 'multi-scan-upload' : type === 'direct' ? 'multi-direct-upload' : 'multi-bulk-upload'
      );
    }

    if (type === 'scan') {
      setMultiScanProcessState({ buttonText: `Processing ${submissions.length} submissions (~4 mins)...`, spinner: true });
    } else if (type === 'direct') {
      setMultiDirectProcessState({ buttonText: `Processing ${submissions.length} submissions (~4 mins)...`, spinner: true });
    } else {
      setMultiBulkProcessState({ buttonText: `Processing ${submissions.length} submissions (~4 mins)...`, spinner: true });
    }

    const processingPromises = submissions.map((sub) => processSingleSubmission(examId, sub, type));
    await Promise.all(processingPromises);

    if (type === 'scan') {
      setMultiScanProcessState({ buttonText: 'All processed! Refreshing...', spinner: false, disabled: true, visible: true, status: 'success' });
      currentMultiScanSession = null;
      resetMultiScanSessionState();
    } else if (type === 'direct') {
      setMultiDirectProcessState({ buttonText: 'All processed! Refreshing...', spinner: false, disabled: true, status: 'success' });
    } else {
      setMultiBulkProcessState({ buttonText: 'All processed! Refreshing...', spinner: false, disabled: true, status: 'success' });
      if (bulkPdfInput) {
        bulkPdfInput.value = '';
      }
      if (bulkPdfInputLabel) {
        bulkPdfInputLabel.textContent = 'Choose Bulk PDF';
      }
    }

    await loadExamDetails(examId);
    setTimeout(() => multiUploadModal.classList.add('hidden'), 2000);
  } catch (error) {
    console.error('Error during multi-submission processing:', error);
    if (type === 'scan') {
      setMultiScanProcessState({ status: 'error', buttonText: 'Error! See console.', spinner: false, disabled: true, visible: true });
    } else if (type === 'direct') {
      setMultiDirectProcessState({ status: 'error', buttonText: 'Error! See console.', spinner: false, disabled: true });
    } else {
      setMultiBulkProcessState({ status: 'error', buttonText: 'Error! See console.', spinner: false, disabled: true });
    }
    isError = true; // Set flag on error
  } finally {
    if (typeof window.exitProcessingLock === 'function') {
      window.exitProcessingLock(lockKey);
    }

    if (type === 'scan') {
      scheduleMultiScanProcessReset(isError ? 10000 : 5000);
    } else if (type === 'direct') {
      scheduleMultiDirectProcessReset(isError ? 10000 : 5000);
    } else {
      scheduleMultiBulkProcessReset(isError ? 10000 : 5000);
    }
  }
}


/**
 * Process a single submission for multi-upload (scan/direct).
 * @param {string} examId
 * @param {any} submission
 * @param {'scan'|'direct'} type
 */
async function processSingleSubmission(examId, submission, type) {
  let uploadedFilePaths = [];

  try {
    if (type === 'direct' || type === 'bulk') {
      if (!submission.files || submission.files.length === 0) {
        console.log(`Skipping ${submission.studentName || submission.studentNumber} - no files provided.`);
        return;
      }
        const tempTokenForUpload = generateUUID();
        const uploadPromises = Array.from(submission.files).map((file) => {
            const sanitizedFilename = sanitizeFilename(file.name);
            const sanitizedFile = new File([file], sanitizedFilename, { type: file.type });
            const filePath = `temp_scans/${tempTokenForUpload}/${sanitizedFilename}`;
            return sb.storage.from(STORAGE_BUCKET).upload(filePath, sanitizedFile);
        });
      const results = await Promise.all(uploadPromises);

      uploadedFilePaths = results.map((r) => {
        if (r.error) throw new Error(`File upload failed: ${r.error.message}`);
        return sb.storage.from(STORAGE_BUCKET).getPublicUrl(r.data.path).data.publicUrl;
      });
    } else {
      uploadedFilePaths = submission.uploaded_image_paths;
    }

    const response = await fetch(CREATE_SUBMISSION_SESSION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        examId: examId,
        studentName: submission.studentName,
        studentNumber: submission.studentNumber,
        uploadedImagePaths: uploadedFilePaths,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create submission session on the server.');
    }

    const newSession = await response.json();

    await processScannedAnswersBackground(newSession, examId);

    console.log(`Successfully processed submission for ${submission.studentName || submission.studentNumber}`);
  } catch (error) {
    console.error(`Processing failed for ${submission.studentName || submission.studentNumber}:`, error);
    throw error;
  }
}

async function requestBulkSubmissionBoundaries(pdfFile, students) {
  if (!BULK_BOUNDARY_GCF_URL) {
    throw new Error('Bulk PDF analyzer is not configured.');
  }

  let response;
  try {
    const formData = new FormData();
    formData.append('bulk_pdf', pdfFile, pdfFile.name || 'bulk.pdf');
    if (Array.isArray(students)) {
      formData.append('students', JSON.stringify(students));
    }

    response = await fetch(BULK_BOUNDARY_GCF_URL, {
      method: 'POST',
      body: formData,
    });
  } catch (networkError) {
    throw new Error('Failed to contact the bulk PDF analyzer. Please try again.');
  }

  const responseText = await response.text();

  if (!response.ok) {
    let message = 'Failed to analyze the bulk PDF.';
    try {
      const errorJson = JSON.parse(responseText);
      if (errorJson?.error) {
        message = errorJson.error;
      }
    } catch {
      if (responseText) {
        message = responseText;
      }
    }
    throw new Error(message);
  }

  let payload;
  try {
    payload = JSON.parse(responseText);
  } catch (parseError) {
    throw new Error('Bulk analyzer returned an unreadable response.');
  }

  let startPages = [];
  if (Array.isArray(payload)) {
    startPages = payload;
  } else if (payload && Array.isArray(payload.submission_start_pages)) {
    startPages = payload.submission_start_pages;
  }

  if (!startPages.length) {
    throw new Error('Bulk analyzer did not return any submission start pages.');
  }

  return startPages;
}

async function splitBulkPdfIntoSubmissions(pdfFile, startPages, students) {
  if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== 'function') {
    throw new Error('Unable to split the bulk PDF because PDF.js is unavailable.');
  }

  const roster = Array.isArray(students) ? students : [];
  const pdfBytes = await pdfFile.arrayBuffer();

  const pdfjs = window.pdfjsLib;
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js';
  }
  const pdfJsDocument = await pdfjs.getDocument({ data: pdfBytes }).promise;
  const totalPages = typeof pdfJsDocument.numPages === 'number' ? pdfJsDocument.numPages : 0;

  const sanitizedPages = (Array.isArray(startPages) ? startPages : [])
    .map((page) => parseInt(page, 10))
    .filter((page) => Number.isInteger(page) && page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const uniqueStartPages = Array.from(new Set(sanitizedPages));

  if (!uniqueStartPages.length) {
    throw new Error('No valid page numbers were returned by the bulk analyzer.');
  }

  if (uniqueStartPages[0] !== 1) {
    uniqueStartPages.unshift(1);
  }

  const segments = uniqueStartPages.map((start, index) => {
    const nextStart = uniqueStartPages[index + 1];
    const rawEnd = nextStart ? nextStart - 1 : totalPages;
    return {
      start,
      end: Math.max(start, rawEnd),
    };
  });

  const expectedCount = roster.length || segments.length;

  if (!expectedCount) {
    throw new Error('No students provided to map the bulk PDF submissions.');
  }

  if (segments.length < expectedCount) {
    throw new Error(`Detected only ${segments.length} submission(s) in the PDF, but ${expectedCount} students were provided.`);
  }

  if (segments.length > expectedCount) {
    const truncated = segments.slice(0, expectedCount);
    truncated[truncated.length - 1].end = totalPages;
    segments.length = 0;
    Array.prototype.push.apply(segments, truncated);
  }

  const generatedFileSets = [];

  for (let index = 0; index < expectedCount; index++) {
    const segment = segments[index];
    if (!segment) {
      generatedFileSets.push([]);
      continue;
    }

    const student = roster[index] || {};
    const baseName = buildBulkSubmissionBaseName(student, index);
    const imageFiles = [];

    for (let pageNumber = segment.start; pageNumber <= segment.end; pageNumber++) {
      const page = await pdfJsDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (createdBlob) => {
            if (createdBlob) {
              resolve(createdBlob);
            } else {
              reject(new Error('Failed to convert PDF page to image.'));
            }
          },
          'image/png'
        );
      });

      const pageIndex = pageNumber - segment.start + 1;
      const filename = `${baseName}_page_${pageIndex}.png`;
      imageFiles.push(new File([blob], filename, { type: 'image/png' }));

      canvas.width = 0;
      canvas.height = 0;
      if (typeof page.cleanup === 'function') {
        page.cleanup();
      }
    }

    if (!imageFiles.length) {
      throw new Error(`Failed to split the bulk PDF into individual pages for ${baseName}.`);
    }

    generatedFileSets.push(imageFiles);
  }

  if (typeof pdfJsDocument.destroy === 'function') {
    pdfJsDocument.destroy();
  }

  return generatedFileSets;
}

function buildBulkSubmissionBaseName(student, index) {
  const parts = [];
  const name = (student?.studentName || '').trim();
  const number = (student?.studentNumber || '').trim();

  if (number) {
    parts.push(number);
  }
  if (name) {
    parts.push(name.replace(/\s+/g, '_'));
  }

  let baseName = parts.join('_');
  if (!baseName) {
    baseName = `bulk_submission_${index + 1}`;
  }

  let sanitized = typeof sanitizeFilename === 'function' ? sanitizeFilename(baseName) : baseName;
  if (!sanitized) {
    sanitized = `bulk_submission_${index + 1}`;
  }

  if (sanitized.toLowerCase().endsWith('.pdf')) {
    sanitized = sanitized.slice(0, -4);
  }

  sanitized = `${sanitized}_${index + 1}`;
  sanitized = typeof sanitizeFilename === 'function' ? sanitizeFilename(sanitized) : sanitized;
  if (!sanitized) {
    sanitized = `bulk_submission_${index + 1}`;
  }

  sanitized = sanitized.replace(/\.(png|jpg|jpeg|pdf)$/i, '');

  return sanitized;
}

/**
 * Utility function to generate a UUID for temp paths.
 * @returns {string}
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
