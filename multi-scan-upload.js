// =================================================================
// --- MULTI-STUDENT UPLOAD WORKFLOW ---
// =================================================================


/**
 * Generate the student table for scan or direct uploads.
 * @param {'scan'|'direct'} type
 * @param {number} rowCount
 */
function generateStudentTable(type, rowCount = 10) {
  const container = type === 'scan' ? multiScanTableContainer : multiDirectUploadTableContainer;
  const tableId = `${type}-student-table`;

  let tableHtml = `<table id="${tableId}"><thead><tr>
        <th style="width: 3%;">#</th>
        <th style="width: 37%;">Student Name</th>
        <th style="width: 30%;">Student Number</th>
        <th style="width: 25%;">${type === 'scan' ? 'Status' : 'Files'}</th>
        <th style="width: 5%;"></th>
    </tr></thead><tbody>`;

  for (let i = 0; i < rowCount; i++) {
    tableHtml += generateStudentTableRowHtml(i, type);
  }

  tableHtml += `</tbody></table>`;
  container.innerHTML = tableHtml;

  container.addEventListener('click', function (event) {
    if (event.target.classList.contains('delete-row-btn')) {
      handleDeleteRow(event.target, tableId);
    }
  });
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
      : `<td>
             <input type="file" id="${fileInputId}" class="file-input-hidden direct-upload-input" accept=".pdf,image/*" multiple>
             <label for="${fileInputId}" class="file-input-label">Choose Files</label>
           </td>`;

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
  multiScanStartButton.disabled = true;
  multiScanAddRowButton.disabled = true;
  const rows = document.querySelectorAll('#scan-student-table tbody tr');
  const students = Array.from(rows)
    .map((row) => ({
      studentName: row.querySelector('.student-name-input').value.trim(),
      studentNumber: row.querySelector('.student-number-input').value.trim(),
    }))
    .filter((s) => s.studentName || s.studentNumber);

  if (students.length === 0) {
    alert('Please fill in at least one student name or number.');
    multiScanStartButton.disabled = false;
    multiScanAddRowButton.disabled = false;
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
    multiScanQrArea.classList.remove('hidden');
    multiScanStartButton.classList.add('hidden');
    startMultiScanPolling();
  } catch (error) {
    console.error('Failed to create multi-scan session:', error);
    alert(`Error: ${error.message}`);
    multiScanStartButton.disabled = false;
    multiScanAddRowButton.disabled = false;
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

          multiScanProcessButton.classList.remove('hidden');
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
 * Process all submissions (scan or direct) in the modal.
 * @param {'scan'|'direct'} type
 */
async function handleProcessAllSubmissions(type) {
  const processButton = type === 'scan' ? multiScanProcessButton : multiDirectProcessButton;
  const spinner = type === 'scan' ? spinnerMultiProcess : spinnerMultiDirectProcess;
  const buttonText = type === 'scan' ? multiScanProcessButtonText : multiDirectProcessButtonText;
  let isError = false; // Add a flag to track success/failure

  processButton.disabled = true;
  showSpinner(true, spinner);
  setButtonText(buttonText, 'Processing...');

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
    processButton.disabled = false;
    showSpinner(false, spinner);
    setButtonText(buttonText, 'Process All Submissions');
    return;
  }

    try {
        setButtonText(buttonText, `Processing ${submissions.length} submissions (~4 mins)...`);
        const processingPromises = submissions.map((sub) => processSingleSubmission(examId, sub, type));
        await Promise.all(processingPromises);

        setButtonText(buttonText, 'All processed! Refreshing...');
        await loadExamDetails(examId);
        setTimeout(() => multiUploadModal.classList.add('hidden'), 2000);
    } catch (error) {
        console.error('Error during multi-submission processing:', error);
        setButtonText(buttonText, 'Error! See console.');
        isError = true; // Set flag on error
    } finally {
        // START: MODIFICATION - Remove the timeout and reset logic
        showSpinner(false, spinner);
        // END: MODIFICATION
        // START: MODIFICATION
        // After a delay to show the final message, reset the button's state.
        // This ensures it's re-enabled and ready for another use.
        setTimeout(() => {
            processButton.disabled = false;
            setButtonText(buttonText, 'Process All Submissions');
        }, isError ? 10000 : 5000); // Longer delay on error, shorter on success
        // END: MODIFICATION
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
    if (type === 'direct') {
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
