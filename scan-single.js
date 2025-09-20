const singleScanDefaultState = {
  status: 'idle',
  buttonText: DEFAULT_SCAN_BUTTON_TEXT,
  spinner: false,
  disabled: false,
  showScanLinkArea: false,
  directUploadDisabled: true,
  scanUrl: '',
  sessionToken: null,
};
const singleScanState = { ...singleScanDefaultState };
let singleScanResetTimeout = null;

function applySingleScanState() {
  if (!generateScanLinkButton || !generateScanLinkButtonText) return;
  generateScanLinkButton.disabled = singleScanState.disabled;
  showSpinner(singleScanState.spinner, spinnerStudent);
  setButtonText(generateScanLinkButtonText, singleScanState.buttonText);

  if (singleScanState.showScanLinkArea) {
    scanLinkArea.classList.remove('hidden');
  } else {
    scanLinkArea.classList.add('hidden');
    scanLinkArea.classList.remove('hiding');
  }

  if (directUploadInput) {
    directUploadInput.disabled = singleScanState.directUploadDisabled;
  }

  if (singleScanState.scanUrl) {
    scanUrlLink.href = singleScanState.scanUrl;
    scanUrlLink.textContent = singleScanState.scanUrl;
  } else {
    scanUrlLink.href = '#';
    scanUrlLink.textContent = '';
  }
}

function setSingleScanState(patch) {
  Object.assign(singleScanState, patch);
  applySingleScanState();
}

function resetSingleScanState() {
  Object.assign(singleScanState, singleScanDefaultState);
  applySingleScanState();
}

function clearSingleScanResetTimer() {
  if (singleScanResetTimeout) {
    clearTimeout(singleScanResetTimeout);
    singleScanResetTimeout = null;
  }
}

function scheduleSingleScanReset(delayMs) {
  clearSingleScanResetTimer();
  singleScanResetTimeout = setTimeout(() => {
    resetSingleScanForm();
    setSingleScanSessionToken(null);
    resetSingleScanState();
    singleScanResetTimeout = null;
  }, delayMs);
}

function resetSingleScanForm() {
  if (studentAnswersForm) {
    studentAnswersForm.reset();
  }
  if (directUploadInput) {
    directUploadInput.value = '';
  }
}

function setSingleScanSessionToken(token) {
  currentScanSessionToken = token;
  singleScanState.sessionToken = token;
}

function isSingleScanProcessing() {
  return singleScanState.status === 'processing' || singleScanState.status === 'uploading';
}

function isSingleScanWaiting() {
  return singleScanState.status === 'waiting' || singleScanState.status === 'creating';
}

async function cancelSingleScanSession(reason = 'cancelled') {
  if (isSingleScanProcessing()) {
    return false;
  }

  stopScanPolling();
  clearSingleScanResetTimer();

  const token = singleScanState.sessionToken || currentScanSessionToken;
  if (token) {
    try {
      await sb.from('scan_sessions').update({ status: 'cancelled', error_message: reason }).eq('session_token', token);
    } catch (error) {
      console.warn('Failed to cancel scan session:', error);
    }
  }

  setSingleScanSessionToken(null);
  resetSingleScanForm();
  resetSingleScanState();
  return true;
}

applySingleScanState();
window.applySingleScanState = applySingleScanState;
window.cancelSingleScanSession = cancelSingleScanSession;
window.getSingleScanState = () => ({ ...singleScanState });

function prepareExamSnapshot(questions = []) {
  const subQuestionLookup = {};
  const sanitizedQuestions = questions.map((question) => {
    const safeSubQuestions = (question.sub_questions || []).map((subQuestion) => {
      if (subQuestion?.id) {
        if (!subQuestionLookup[question.question_number]) {
          subQuestionLookup[question.question_number] = {};
        }
        subQuestionLookup[question.question_number][subQuestion.sub_q_text_content] = subQuestion.id;
      }
      return { sub_q_text_content: subQuestion.sub_q_text_content };
    });
    return {
      question_number: question.question_number,
      sub_questions: safeSubQuestions,
    };
  });

  return { subQuestionLookup, sanitizedQuestions };
}

// --- STUDENT SCAN LINK GENERATION (MODIFIED LOGGING) ---
generateScanLinkButton.addEventListener('click', async () => {
  clearSingleScanResetTimer();
  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');
  const studentName = document.getElementById('student-name').value.trim();
  const studentNumber = document.getElementById('student-number').value.trim();

  if (!studentName && !studentNumber) {
    alert('Please provide a student name or student number.');
    setSingleScanState({ status: 'idle', disabled: false, spinner: false, buttonText: DEFAULT_SCAN_BUTTON_TEXT });
    return;
  }
  if (!examId) {
    alert('Cannot proceed without an Exam ID.');
    setSingleScanState({ status: 'idle', disabled: false, spinner: false, buttonText: DEFAULT_SCAN_BUTTON_TEXT });
    return;
  }

  setSingleScanState({
    status: 'creating',
    disabled: true,
    spinner: true,
    buttonText: 'Generating link...',
    showScanLinkArea: false,
    directUploadDisabled: true,
    scanUrl: '',
  });

  try {
    setSingleScanState({ buttonText: 'Creating session...' });
    const response = await fetch(GENERATE_SCAN_SESSION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ examId, studentName, studentNumber }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to generate scan session: ${errorData.message || response.statusText}`);
    }

    const { session_token } = await response.json();
    setSingleScanSessionToken(session_token);

    const scanUrl = `${SCAN_PAGE_BASE_URL}?token=${session_token}`;

    new QRious({
      element: qrcodeCanvas,
      value: scanUrl,
      size: 200,
    });

    setSingleScanState({
      status: 'waiting',
      spinner: false,
      buttonText: 'Waiting for your scan...',
      showScanLinkArea: true,
      disabled: true,
      directUploadDisabled: false,
      scanUrl,
    });

    startScanPolling(examId);
  } catch (error) {
    console.error(error);
    setSingleScanState({ status: 'error', spinner: false, buttonText: 'Error! Please try again.' });
    scheduleSingleScanReset(5000);
  }
});

/**
 * Handles the direct file upload as an alternative to QR scanning.
 * Triggered when user selects files in the input.
 * @param {Event} event
 */
async function handleDirectUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) {
    return;
  }

  if (!currentScanSessionToken) {
    alert('Error: No active scan session. Please click "Scan Answers" again.');
    event.target.value = '';
    return;
  }

  stopScanPolling();
  setSingleScanState({
    status: 'uploading',
    buttonText: 'Uploading...',
    spinner: true,
    showScanLinkArea: false,
    directUploadDisabled: true,
  });

  try {
    const examId = new URLSearchParams(window.location.search).get('id');

    const { data: rpcResult, error: sessionError } = await sb.rpc('get_session_details_by_token', {
      token_arg: currentScanSessionToken,
    });

    if (sessionError || !rpcResult || rpcResult.length === 0) {
      throw new Error(`Could not find active session for token: ${sessionError?.message || 'Not found'}`);
    }
    const sessionDetails = rpcResult[0];
    const sessionId = sessionDetails.id;

    const uploadPromises = [];
    const uploadedFilePaths = [];

    for (const file of files) {
        const sanitizedFilename = sanitizeFilename(file.name);
        const sanitizedFile = new File([file], sanitizedFilename, { type: file.type });
        const filePath = `temp_scans/${currentScanSessionToken}/${sanitizedFilename}`;
        uploadPromises.push(sb.storage.from(STORAGE_BUCKET).upload(filePath, sanitizedFile));
    }
    const results = await Promise.all(uploadPromises);

    for (const result of results) {
      if (result.error) {
        throw new Error(`Failed to upload a file: ${result.error.message}`);
      }
      const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(result.data.path);
      uploadedFilePaths.push(urlData.publicUrl);
    }

    const { error: updateError } = await sb
      .from('scan_sessions')
      .update({
        status: 'uploaded',
        uploaded_image_paths: uploadedFilePaths,
      })
      .eq('id', sessionId);

    if (updateError) {
      throw new Error(`Failed to update scan session status for ID ${sessionId}: ${updateError.message}`);
    }

    const sessionForProcessing = sessionDetails;
    sessionForProcessing.uploaded_image_paths = uploadedFilePaths;
    setSingleScanSessionToken(sessionDetails.session_token || currentScanSessionToken);

    await processScannedAnswers(examId, sessionForProcessing);
  } catch (error) {
    console.error('Direct upload failed:', error);
    setSingleScanState({ status: 'error', buttonText: 'Upload Error!', spinner: false, directUploadDisabled: true });
    event.target.value = '';
    scheduleSingleScanReset(5000);
  }
}

// Add the event listener to the new file input.
directUploadInput.addEventListener('change', handleDirectUpload);

/**
 * Starts polling the scan session for status changes.
 * @param {string} examId
 */
function startScanPolling(examId) {
  stopScanPolling();

  scanProcessingTimeout = setTimeout(() => {
    stopScanPolling();
    setSingleScanState({ status: 'error', buttonText: 'Timed out.', spinner: false, showScanLinkArea: false, directUploadDisabled: true });
    scheduleSingleScanReset(4000);
  }, 10 * 60 * 1000);

  scanPollingInterval = setInterval(async () => {
    try {
      await checkScanStatus(examId);
    } catch (error) {
      console.error('Error during scan polling:', error);
    }
  }, 5000);
}

/**
 * Stops the polling and clears timeouts.
 */
function stopScanPolling() {
  if (scanPollingInterval) {
    clearInterval(scanPollingInterval);
    scanPollingInterval = null;
  }
  if (scanProcessingTimeout) {
    clearTimeout(scanProcessingTimeout);
    scanProcessingTimeout = null;
  }
}

/**
 * Checks the current status of the scan session.
 * @param {string} examId
 */
async function checkScanStatus(examId) {
  if (!currentScanSessionToken) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/get-scan-session?token=${currentScanSessionToken}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });

    if (!response.ok) {
      console.error('Failed to check scan status:', response.statusText);
      return;
    }

    const session = await response.json();

    if (session.status === 'uploaded') {
      setSingleScanSessionToken(session.session_token || currentScanSessionToken);
      setSingleScanState({
        status: 'processing',
        buttonText: 'Images detected!',
        spinner: true,
        showScanLinkArea: false,
        directUploadDisabled: true,
      });

      stopScanPolling();
      await processScannedAnswers(examId, session);
    }
  } catch (error) {
    console.error('Error checking scan status:', error);
  }
}

/**
 * Processes the scanned answers (background worker-like).
 * @param {any} scanSession
 * @param {string} examId
 */
async function processScannedAnswersBackground(scanSession, examId, progressCb = () => {}) {
  try {
    progressCb('Fetching exam...');
    const { data: examStructure, error: fetchExamError } = await sb
      .from('questions')
      .select(`question_number, sub_questions(id, sub_q_text_content)`)
      .eq('exam_id', examId)
      .order('question_number', { ascending: true });

    if (fetchExamError) throw fetchExamError;
    const { subQuestionLookup, sanitizedQuestions } = prepareExamSnapshot(examStructure || []);
    const examStructureForGcf = { questions: sanitizedQuestions };

    progressCb('Downloading images...');
    const formData = new FormData();
    formData.append('exam_structure', JSON.stringify(examStructureForGcf));

    const downloadPromises = scanSession.uploaded_image_paths.map(async (imageUrl) => {
      const url = new URL(imageUrl);
      const objectPath = url.pathname.split(`/public/${STORAGE_BUCKET}/`)[1];

      if (!objectPath) {
        console.warn(`Could not parse object path from URL: ${imageUrl}`);
        return null;
      }

      const { data: imageBlob, error: downloadError } = await sb.storage.from(STORAGE_BUCKET).download(objectPath);

      if (downloadError) {
        const filename = imageUrl.split('/').pop();
        console.warn(`Failed to download image ${filename}:`, downloadError);
        return null;
      }
      return { filename: imageUrl.split('/').pop(), blob: imageBlob };
    });

    const downloadResults = await Promise.all(downloadPromises);
    downloadResults.forEach((result) => {
      if (result) {
        formData.append('files', result.blob, result.filename);
      }
    });

    if (!formData.has('files')) {
      throw new Error('No image files could be downloaded or processed. Aborting GCF call.');
    }

    progressCb('Thinking... (~4 mins)');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      const gcfResponse = await fetch(STUDENT_ANSWERS_GCF_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!gcfResponse.ok) {
        const errorText = await gcfResponse.text();
        throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
      }

      progressCb('Parsing results...');
      const zipBlob = await gcfResponse.blob();
      const jszip = new JSZip();
      const zip = await jszip.loadAsync(zipBlob);
      const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith('.json') && !file.dir);
      if (!jsonFile) throw new Error('Could not find JSON in ZIP response.');
      const jsonContent = await jsonFile.async('string');
      const responseData = JSON.parse(jsonContent);

      progressCb('Saving answers...');
      await saveStudentAnswersFromScan(scanSession, examId, responseData, zip, progressCb, subQuestionLookup);

      await sb.from('scan_sessions').update({ status: 'completed' }).eq('id', scanSession.id);
      cleanupTempFiles(scanSession);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Processing timed out - please try again with fewer/smaller images');
      }
      throw error;
    }
  } catch (error) {
    console.error('Background processing failed:', error);
    throw error;
  }
}

/**
 * Drives the full scan processing lifecycle per session.
 * @param {string} examId
 * @param {any|null} preloadedSession
 */
async function processScannedAnswers(examId, preloadedSession = null) {
  clearSingleScanResetTimer();
  setSingleScanState({
    status: 'processing',
    buttonText: 'Processing...',
    spinner: true,
    disabled: true,
    showScanLinkArea: false,
    directUploadDisabled: true,
  });

  let isError = false;
  let scanSession;
  let lockKey = null;

  try {
    if (typeof window.enterProcessingLock === 'function') {
      lockKey = window.enterProcessingLock('student-upload');
    }
    if (preloadedSession) {
      scanSession = preloadedSession;
      if (scanSession?.session_token) {
        setSingleScanSessionToken(scanSession.session_token);
      }
    } else {
      const sessionToken = currentScanSessionToken;
      if (!sessionToken || !examId) throw new Error('Session token and Exam ID are required');

      const { data: rpcResult, error: sessionError } = await sb.rpc('get_session_details_by_token', { token_arg: sessionToken });
      if (sessionError) throw new Error(`Failed to fetch session details: ${sessionError.message}`);
      scanSession = rpcResult?.[0];
    }

    if (!scanSession) throw new Error('Scan session not found or expired.');
    if (new Date(scanSession.expires_at) < new Date()) throw new Error('Scan session has expired.');

    if (!singleScanState.sessionToken && scanSession.session_token) {
      setSingleScanSessionToken(scanSession.session_token);
    }

    await sb.from('scan_sessions').update({ status: 'processing' }).eq('id', scanSession.id);

    if (!scanSession.uploaded_image_paths || scanSession.uploaded_image_paths.length === 0) {
      await sb.from('scan_sessions').update({ status: 'completed' }).eq('id', scanSession.id);
      setSingleScanState({ status: 'success', buttonText: 'No images uploaded.', spinner: false });
    } else {
      const progressCb = (message) => setSingleScanState({ buttonText: message, spinner: true });
      await processScannedAnswersBackground(scanSession, examId, progressCb);
      setSingleScanState({ status: 'success', buttonText: 'Processed!', spinner: false });
    }

    await loadExamDetails(examId);
  } catch (error) {
    console.error('Error processing scanned session:', error.message);
    setSingleScanState({ status: 'error', buttonText: 'Error!', spinner: false });
    isError = true;
    if (scanSession?.id) {
      await sb.from('scan_sessions').update({ status: 'failed', error_message: error.message }).eq('id', scanSession.id);
    }
  } finally {
    if (typeof window.exitProcessingLock === 'function') {
      window.exitProcessingLock(lockKey);
    }
    scheduleSingleScanReset(isError ? 5000 : 3000);
  }
}

/**
 * Persist answers extracted from scan into DB.
 * @param {any} scanSession
 * @param {string} examId
 * @param {any} responseData
 * @param {JSZip} zip
 */
async function saveStudentAnswersFromScan(
  scanSession,
  examId,
  responseData,
  zip,
  progressCb = () => {},
  precomputedLookup = null,
) {
  const studentExamId = scanSession.student_exam_id;

  if (!studentExamId) {
    throw new Error(
      `Critical error: student_exam_id was not provided for student ${scanSession.student_name || scanSession.student_number}`,
    );
  }

  console.log('Starting to save student answers. GCF Response:', responseData);
  console.log('ZIP file contains:', Object.keys(zip.files));
  console.log(`Using student_exam_id: ${studentExamId}`);

  let processedData = responseData;
  if (Array.isArray(responseData) && responseData.length > 0) {
    processedData = responseData[0];
  }

  let subQuestionLookup = precomputedLookup;
  if (!subQuestionLookup) {
    const { data: dbQuestions, error: fetchQError } = await sb
      .from('questions')
      .select('id, question_number, sub_questions(id, sub_q_text_content)')
      .eq('exam_id', examId);
    if (fetchQError) throw new Error(`Could not fetch exam structure for matching: ${fetchQError.message}`);

    subQuestionLookup = dbQuestions.reduce((qMap, q) => {
      qMap[q.question_number] = q.sub_questions.reduce((sqMap, sq) => {
        sqMap[sq.sub_q_text_content] = sq.id;
        return sqMap;
      }, {});
      return qMap;
    }, {});
  }

  const answersToInsert = [];
  if (!processedData || !processedData.questions || !Array.isArray(processedData.questions)) {
    console.warn('Warning: No valid questions array found in the processed GCF response. Skipping answer insertion.');
  } else {
    for (const q_res of processedData.questions) {
      for (const sq_res of q_res.sub_questions) {
        const sub_question_id = subQuestionLookup[q_res.question_number]?.[sq_res.sub_q_text_content];
        if (!sub_question_id) {
          console.warn(`Warning: Could not find matching sub-question for Q#${q_res.question_number}. Skipping.`);
          continue;
        }

        if (sq_res.student_answers) {
          let answerVisualUrl = null;
          if (sq_res.student_answers.answer_visual) {
            const visualFilename = decodeURIComponent(sq_res.student_answers.answer_visual);
            const visualFile = zip.file(sq_res.student_answers.answer_visual);
            if (visualFile) {
              progressCb(`Uploading ${visualFilename}...`);
              const filePath = `public/${examId}/answers/${studentExamId}/${Date.now()}_${visualFilename}`;
              const fileBlob = await visualFile.async('blob');
              const fileExtension = visualFilename.split('.').pop().toLowerCase();
              let mimeType = 'application/octet-stream';
              if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExtension)) {
                mimeType = `image/${fileExtension}`;
              }
              const fileToUpload = new File([fileBlob], visualFilename, { type: mimeType });
              const { error: uploadError } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, fileToUpload);
              if (uploadError) {
                console.error(`Storage upload failed for ${visualFilename}:`, uploadError);
              } else {
                const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
                answerVisualUrl = urlData.publicUrl;
              }
            } else {
              console.warn(
                `WARNING: Visual file '${sq_res.student_answers.answer_visual}' was in JSON but NOT FOUND in the ZIP.`,
              );
            }
          }
          answersToInsert.push({
            student_exam_id: studentExamId,
            sub_question_id: sub_question_id,
            answer_text: sq_res.student_answers.answer_text || null,
            orig_llm_answer_text: sq_res.student_answers.answer_text || null,
            answer_visual: answerVisualUrl,
          });
        }
      }
    }
  }

  if (answersToInsert.length > 0) {
    console.log('Preparing to insert these answers into DB:', answersToInsert);
    const batchSize = 100;
    for (let i = 0; i < answersToInsert.length; i += batchSize) {
      const batch = answersToInsert.slice(i, i + batchSize);
      const { error: insertError } = await sb.from('student_answers').insert(batch);
      if (insertError) throw new Error(`Failed to insert student answers batch: ${insertError.message}`);
    }
    console.log('SUCCESS: All answers inserted into the database.');
  }
}

/**
 * Cleanup temp files in storage for a given scan session.
 * @param {any} scanSession
 */
async function cleanupTempFiles(scanSession) {
  try {
    const token = scanSession.session_token;
    if (!token) {
      console.warn('Cannot cleanup files: session token is missing.');
      return;
    }

    const pathsToDelete = scanSession.uploaded_image_paths.map((url) => {
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1];
      return `temp_scans/${token}/${filename}`;
    });

    if (pathsToDelete.length > 0) {
      const directoryPath = `temp_scans/${token}`;
      if (!pathsToDelete.includes(directoryPath)) {
        pathsToDelete.push(directoryPath);
      }

      const { data, error } = await sb.storage.from(STORAGE_BUCKET).remove(pathsToDelete);
      if (error) {
        console.error('Partial failure during temp file cleanup:', error);
      } else {
        console.log(`Cleaned up temp files for session ${token}`);
      }
    }
  } catch (error) {
    console.error('Failed to cleanup temp files:', error);
  }
}

window.addEventListener('beforeunload', () => {
  stopScanPolling();
});
