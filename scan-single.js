// --- STUDENT SCAN LINK GENERATION (MODIFIED LOGGING) ---

const uploadStatusContexts = (() => {
  const createContext = (textElement) => ({
    setStatus(message) {
      if (!message) return;
      if (textElement) {
        setButtonText(textElement, message);
      } else {
        console.log(`[Upload] ${message}`);
      }
    },
  });

  const contexts = {
    singleScan: createContext(generateScanLinkButtonText),
    multiScan:
      typeof multiScanProcessButtonText !== 'undefined'
        ? createContext(multiScanProcessButtonText)
        : createContext(null),
    multiDirect:
      typeof multiDirectProcessButtonText !== 'undefined'
        ? createContext(multiDirectProcessButtonText)
        : createContext(null),
  };

  contexts.none = {
    setStatus(message) {
      if (!message) return;
      console.log(`[Upload] ${message}`);
    },
  };

  return contexts;
})();

window.uploadStatusContexts = uploadStatusContexts;

function getStatusContextOrDefault(context) {
  if (context && typeof context.setStatus === 'function') {
    return context;
  }
  return uploadStatusContexts.none;
}
generateScanLinkButton.addEventListener('click', async () => {
  generateScanLinkButton.disabled = true;
  showSpinner(true, spinnerStudent);
  setButtonText(generateScanLinkButtonText, 'Generating link...');

  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');
  const studentName = document.getElementById('student-name').value.trim();
  const studentNumber = document.getElementById('student-number').value.trim();

  if (!studentName && !studentNumber) {
    alert('Please provide a student name or student number.');
    generateScanLinkButton.disabled = false;
    showSpinner(false, spinnerStudent);
    setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
    return;
  }
  if (!examId) {
    alert('Cannot proceed without an Exam ID.');
    generateScanLinkButton.disabled = false;
    showSpinner(false, spinnerStudent);
    setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
    return;
  }

  try {
    setButtonText(generateScanLinkButtonText, 'Creating session...');
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
    currentScanSessionToken = session_token;

    const scanUrl = `${SCAN_PAGE_BASE_URL}?token=${session_token}`;

    new QRious({
      element: qrcodeCanvas,
      value: scanUrl,
      size: 200,
    });

    scanUrlLink.href = scanUrl;
    scanUrlLink.textContent = scanUrl;
    scanLinkArea.classList.remove('hidden');
    scanLinkArea.classList.remove('hiding');

    showSpinner(false, spinnerStudent);
    setButtonText(generateScanLinkButtonText, 'Waiting for your scan...');

    startScanPolling(examId);
  } catch (error) {
    setButtonText(generateScanLinkButtonText, 'Error! Make sure to add both name & student number');
    console.error(error);
    showSpinner(false, spinnerStudent);
    setTimeout(() => {
      generateScanLinkButton.disabled = false;
      setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
    }, 5000);
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
  directUploadInput.disabled = true;
  setButtonText(generateScanLinkButtonText, 'Uploading...');
  showSpinner(true, spinnerStudent);

  if (scanLinkArea && !scanLinkArea.classList.contains('hiding')) {
    scanLinkArea.classList.add('hiding');
    setTimeout(() => {
      scanLinkArea.classList.add('hidden');
      scanLinkArea.classList.remove('hiding');
    }, 600);
  }

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

    await processScannedAnswers(examId, sessionForProcessing);
  } catch (error) {
    console.error('Direct upload failed:', error);
    setButtonText(generateScanLinkButtonText, 'Upload Error!');
    showSpinner(false, spinnerStudent);
    setTimeout(() => {
      generateScanLinkButton.disabled = false;
      setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
      currentScanSessionToken = null;
      directUploadInput.disabled = false;
      event.target.value = '';
    }, 5000);
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
    setButtonText(generateScanLinkButtonText, 'Timed out.');
    setTimeout(() => {
      generateScanLinkButton.disabled = false;
      setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
      scanLinkArea.classList.add('hidden');
    }, 4000);
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
      setButtonText(generateScanLinkButtonText, 'Images detected!');

      if (scanLinkArea && !scanLinkArea.classList.contains('hiding')) {
        scanLinkArea.classList.add('hiding');
        setTimeout(() => {
          scanLinkArea.classList.add('hidden');
          scanLinkArea.classList.remove('hiding');
        }, 600);
      }

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
async function processScannedAnswersBackground(
  scanSession,
  examId,
  statusContext = uploadStatusContexts.singleScan,
) {
  const statusUpdater = getStatusContextOrDefault(statusContext);
  try {
    statusUpdater.setStatus('Fetching exam...');
    const { data: examStructure, error: fetchExamError } = await sb
      .from('questions')
      .select(`question_number, sub_questions(sub_q_text_content)`)
      .eq('exam_id', examId)
      .order('question_number', { ascending: true });

    if (fetchExamError) throw fetchExamError;
    const examStructureForGcf = { questions: examStructure };

    statusUpdater.setStatus('Downloading images...');
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

    statusUpdater.setStatus('Thinking... (~4 mins)');
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

      statusUpdater.setStatus('Parsing results...');
      const zipBlob = await gcfResponse.blob();
      const jszip = new JSZip();
      const zip = await jszip.loadAsync(zipBlob);
      const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith('.json') && !file.dir);
      if (!jsonFile) throw new Error('Could not find JSON in ZIP response.');
      const jsonContent = await jsonFile.async('string');
      const responseData = JSON.parse(jsonContent);

      statusUpdater.setStatus('Saving answers...');
      await saveStudentAnswersFromScan(scanSession, examId, responseData, zip, statusUpdater);

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
    statusUpdater.setStatus(`Failed: ${error.message}`);
    throw error;
  }
}

/**
 * Drives the full scan processing lifecycle per session.
 * @param {string} examId
 * @param {any|null} preloadedSession
 */
async function processScannedAnswers(examId, preloadedSession = null) {
  showSpinner(true, spinnerStudent);
  setButtonText(generateScanLinkButtonText, 'Processing...');
  let isError = false;
  let scanSession;

  try {
    if (preloadedSession) {
      scanSession = preloadedSession;
    } else {
      const sessionToken = currentScanSessionToken;
      if (!sessionToken || !examId) throw new Error('Session token and Exam ID are required');

      const { data: rpcResult, error: sessionError } = await sb.rpc('get_session_details_by_token', { token_arg: sessionToken });
      if (sessionError) throw new Error(`Failed to fetch session details: ${sessionError.message}`);
      scanSession = rpcResult?.[0];
    }

    if (!scanSession) throw new Error('Scan session not found or expired.');
    if (new Date(scanSession.expires_at) < new Date()) throw new Error('Scan session has expired.');

    await sb.from('scan_sessions').update({ status: 'processing' }).eq('id', scanSession.id);

    if (!scanSession.uploaded_image_paths || scanSession.uploaded_image_paths.length === 0) {
      await sb.from('scan_sessions').update({ status: 'completed' }).eq('id', scanSession.id);
      setButtonText(generateScanLinkButtonText, 'No images uploaded.');
    } else {
      await processScannedAnswersBackground(scanSession, examId, uploadStatusContexts.singleScan);
      setButtonText(generateScanLinkButtonText, 'Processed!');
    }

    await loadExamDetails(examId);
  } catch (error) {
    console.error('Error processing scanned session:', error.message);
    setButtonText(generateScanLinkButtonText, 'Error!');
    isError = true;
    if (scanSession?.id) {
      await sb.from('scan_sessions').update({ status: 'failed', error_message: error.message }).eq('id', scanSession.id);
    }
  } finally {
    showSpinner(false, spinnerStudent);
    setTimeout(() => {
      studentAnswersForm.reset();
      generateScanLinkButton.disabled = false;
      setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
      currentScanSessionToken = null;
      if (directUploadInput) {
        directUploadInput.disabled = false;
        directUploadInput.value = '';
      }
    }, isError ? 5000 : 3000);
  }
}

/**
 * Persist answers extracted from scan into DB.
 * @param {any} scanSession
 * @param {string} examId
 * @param {any} responseData
 * @param {JSZip} zip
 */
async function saveStudentAnswersFromScan(scanSession, examId, responseData, zip, statusContext) {
  const statusUpdater = getStatusContextOrDefault(statusContext);
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

  const { data: dbQuestions, error: fetchQError } = await sb
    .from('questions')
    .select('id, question_number, sub_questions(id, sub_q_text_content)')
    .eq('exam_id', examId);
  if (fetchQError) throw new Error(`Could not fetch exam structure for matching: ${fetchQError.message}`);

  const subQuestionLookup = dbQuestions.reduce((qMap, q) => {
    qMap[q.question_number] = q.sub_questions.reduce((sqMap, sq) => {
      sqMap[sq.sub_q_text_content] = sq.id;
      return sqMap;
    }, {});
    return qMap;
  }, {});

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
              statusUpdater.setStatus(`Uploading ${visualFilename}...`);
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
