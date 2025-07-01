// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const APPENDIX_GCF_URL = 'https://add-appendix-232485517114.europe-west1.run.app';
const MODEL_GCF_URL = 'https://add-model-232485517114.europe-west1.run.app';
const STUDENT_ANSWERS_GCF_URL = 'https://add-student-answers-232485517114.europe-west1.run.app';
const GRADING_GCF_URL = 'https://generate-points-232485517114.europe-west1.run.app';
const STORAGE_BUCKET = 'exam-visuals';

// --- NEW: Supabase Edge Function URLs ---
const GENERATE_SCAN_SESSION_URL = `${SUPABASE_URL}/functions/v1/generate-scan-session`;
// Base URL for the mobile scanning page
const SCAN_PAGE_BASE_URL = `${window.location.origin}/scan.html`;

// --- SUPABASE CLIENT ---
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM ELEMENT VARIABLES ---
// These are declared here and will be assigned their values once the DOM is loaded.
let examNameTitle, questionsContainer, appendixForm, submitAppendixButton, statusLogAppendix, spinnerAppendix, modelForm, submitModelButton, statusLogModel, spinnerModel, rulesModal, rulesModalText, rulesModalClose, appendixModal, appendixModalContent, appendixModalClose, studentAnswersForm, generateScanLinkButton, scanLinkArea, qrcodeCanvas, scanUrlLink, statusLogStudent, spinnerStudent, gradeAllButton, spinnerGrading, statusLogGrading, showRulesButton;


// Global variable to store the current scan session token
let currentScanSessionToken = null;
let scanPollingInterval = null;
let scanProcessingTimeout = null;

// --- HELPER FUNCTIONS ---
const log = (message, targetLog) => {
    console.log(message);
    targetLog.textContent += `\n> ${message}`;
    targetLog.scrollTop = targetLog.scrollHeight;
};
const clearLog = (message, targetLog) => { targetLog.textContent = `> ${message}`; };
const showSpinner = (show, targetSpinner) => { targetSpinner.classList.toggle('hidden', !show); };

function getFilenameFromUrl(url) {
    if (!url) return null;
    try {
        const path = new URL(url).pathname;
        const parts = path.split('/');
        return decodeURIComponent(parts[parts.length - 1]);
    } catch (e) {
        console.error("Could not parse URL to get filename:", url, e);
        return null;
    }
}

// --- MAIN EXECUTION ---
// All code that interacts with the DOM is placed inside this event listener.
document.addEventListener('DOMContentLoaded', async () => {
    // --- INITIALIZE DOM ELEMENTS ---
    examNameTitle = document.getElementById('exam-name-title');
    questionsContainer = document.getElementById('questions-container');
    showRulesButton = document.getElementById('show-rules-button');
    // Appendix Form
    appendixForm = document.getElementById('appendix-form');
    submitAppendixButton = document.getElementById('submit-appendix-button');
    statusLogAppendix = document.getElementById('status-log-appendix');
    spinnerAppendix = document.getElementById('spinner-appendix');
    // Model Form
    modelForm = document.getElementById('model-form');
    submitModelButton = document.getElementById('submit-model-button');
    statusLogModel = document.getElementById('status-log-model');
    spinnerModel = document.getElementById('spinner-model');
    // Modals
    rulesModal = document.getElementById('rules-modal');
    rulesModalText = document.getElementById('rules-modal-text');
    rulesModalClose = document.getElementById('rules-modal-close');
    appendixModal = document.getElementById('appendix-modal');
    appendixModalContent = document.getElementById('appendix-modal-content');
    appendixModalClose = document.getElementById('appendix-modal-close');
    // Student Answers Form
    studentAnswersForm = document.getElementById('student-answers-form');
    generateScanLinkButton = document.getElementById('generate-scan-link-button');
    scanLinkArea = document.getElementById('scan-link-area');
    qrcodeCanvas = document.getElementById('qrcode-canvas');
    scanUrlLink = document.getElementById('scan-url');
    statusLogStudent = document.getElementById('status-log-student');
    spinnerStudent = document.getElementById('spinner-student');
    // Grading Elements
    gradeAllButton = document.getElementById('grade-all-button');
    spinnerGrading = document.getElementById('spinner-grading');
    statusLogGrading = document.getElementById('status-log-grading');

    // --- ATTACH EVENT LISTENERS ---
    // Modal Closing Logic
    [rulesModal, appendixModal].forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.add('hidden');
        });
    });
    [rulesModalClose, appendixModalClose].forEach(button => {
        button.addEventListener('click', () => button.closest('.modal-overlay').classList.add('hidden'));
    });

    // Form and Button Listeners
    appendixForm.addEventListener('submit', handleAppendixSubmit);
    modelForm.addEventListener('submit', handleModelSubmit);
    generateScanLinkButton.addEventListener('click', handleGenerateScanLink);
    gradeAllButton.addEventListener('click', handleGradeAll);

    // Cleanup on page leave
    window.addEventListener('beforeunload', () => {
        stopScanPolling();
    });

    // --- INITIAL PAGE LOAD ---
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');

    if (!examId) {
        examNameTitle.textContent = "Error: No Exam ID provided.";
        questionsContainer.innerHTML = '<p>Please return to the main page and select an exam.</p>';
        // Hide all upload forms
        document.querySelectorAll('.container').forEach(c => {
            if (c.querySelector('form') || c.querySelector('#grade-all-button')) {
                c.classList.add('hidden');
            }
        });
        return;
    }

    await loadExamDetails(examId);
});


// --- EVENT HANDLER FUNCTIONS ---

async function handleAppendixSubmit(e) {
    e.preventDefault();
    submitAppendixButton.disabled = true;
    showSpinner(true, spinnerAppendix);
    clearLog('Starting appendix processing...', statusLogAppendix);
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const files = document.getElementById('appendix-files').files;
    if (!examId || files.length === 0) {
        alert('Cannot proceed without an Exam ID and at least one file.');
        submitAppendixButton.disabled = false;
        showSpinner(false, spinnerAppendix);
        return;
    }
    try {
        log('Fetching current exam structure...', statusLogAppendix);
        const { data: examData, error: fetchError } = await fetchExamDataForAppendixJson(examId);
        if (fetchError) throw new Error(`Could not fetch exam data: ${fetchError.message}`);
        const examStructureForGcf = { questions: examData.questions };
        log('Uploading appendix files and exam structure to processing service...', statusLogAppendix);
        const formData = new FormData();
        for (const file of files) { formData.append('files', file); }
        formData.append('exam_structure', JSON.stringify(examStructureForGcf));
        const gcfResponse = await fetch(APPENDIX_GCF_URL, { method: 'POST', body: formData });
        if (!gcfResponse.ok) {
            const errorText = await gcfResponse.text();
            throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
        }
        log('Processing service returned success. Unzipping results...', statusLogAppendix);
        const zipBlob = await gcfResponse.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(zipBlob);
        const jsonFile = Object.values(zip.files).find(file => file.name.endsWith('.json'));
        if (!jsonFile) throw new Error("No JSON file found in the returned zip.");
        const jsonContent = await jsonFile.async('string');
        const appendixData = JSON.parse(jsonContent);
        log('Successfully parsed appendix structure from JSON.', statusLogAppendix);
        await processAndUploadAppendices(examId, appendixData.appendices, zip);
        log('✅ Appendix successfully uploaded and linked to questions!', statusLogAppendix);
        appendixForm.reset();
        await loadExamDetails(examId);
    } catch (error) {
        log(`❌ An error occurred: ${error.message}`, statusLogAppendix);
        console.error(error);
    } finally {
        submitAppendixButton.disabled = false;
        showSpinner(false, spinnerAppendix);
    }
}

async function handleModelSubmit(e) {
    e.preventDefault();
    submitModelButton.disabled = true;
    showSpinner(true, spinnerModel);
    clearLog('Starting answer model processing...', statusLogModel);
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const files = document.getElementById('model-files').files;
    if (!examId || files.length === 0) {
        alert('Cannot proceed without an Exam ID and at least one file.');
        submitModelButton.disabled = false;
        showSpinner(false, spinnerModel);
        return;
    }
    try {
        log('Fetching exam structure for model processing...', statusLogModel);
        const { data: examStructure, error: fetchError } = await fetchExamDataForModelJson(examId);
        if (fetchError) throw new Error(`Could not fetch exam data for model: ${fetchError.message}`);
        const examStructureForGcf = { questions: examStructure };
        log('Uploading model files and exam structure to processing service...', statusLogModel);
        const formData = new FormData();
        for (const file of files) { formData.append('files', file); }
        formData.append('exam_structure', JSON.stringify(examStructureForGcf));
        const gcfResponse = await fetch(MODEL_GCF_URL, { method: 'POST', body: formData });
        if (!gcfResponse.ok) {
            const errorText = await gcfResponse.text();
            throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
        }
        log('Processing service returned success. Unzipping results...', statusLogModel);
        const zipBlob = await gcfResponse.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(zipBlob);
        const jsonFile = Object.values(zip.files).find(file => file.name.endsWith('.json'));
        if (!jsonFile) throw new Error("No JSON file found in the returned zip.");
        const jsonContent = await jsonFile.async('string');
        const modelData = JSON.parse(jsonContent);
        log('Successfully parsed answer model from JSON.', statusLogModel);
        await processAndUploadModel(examId, modelData.questions, zip);
        log('✅ Answer Model successfully uploaded and saved!', statusLogModel);
        modelForm.reset();
        await loadExamDetails(examId);
    } catch (error) {
        log(`❌ An error occurred: ${error.message}`, statusLogModel);
        console.error(error);
    } finally {
        submitModelButton.disabled = false;
        showSpinner(false, spinnerModel);
    }
}

async function handleGenerateScanLink() {
    generateScanLinkButton.disabled = true;
    showSpinner(true, spinnerStudent);
    clearLog('Generating scan link...', statusLogStudent);

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const studentName = document.getElementById('student-name').value.trim();
    const studentNumber = document.getElementById('student-number').value.trim();

    if (!studentName && !studentNumber) {
        alert('Please provide a student name or student number.');
        generateScanLinkButton.disabled = false;
        showSpinner(false, spinnerStudent);
        return;
    }
    if (!examId) {
        alert('Cannot proceed without an Exam ID.');
        generateScanLinkButton.disabled = false;
        showSpinner(false, spinnerStudent);
        return;
    }

    try {
        log('Calling Edge Function to create scan session...', statusLogStudent);
        const response = await fetch(GENERATE_SCAN_SESSION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ examId, studentName, studentNumber })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to generate scan session: ${errorData.message || response.statusText}`);
        }

        const { session_token } = await response.json();
        currentScanSessionToken = session_token;

        const scanUrl = `${SCAN_PAGE_BASE_URL}?token=${session_token}`;

        log('Scan session created. Generating QR code...', statusLogStudent);
        new QRious({
            element: qrcodeCanvas,
            value: scanUrl,
            size: 200
        });

        scanUrlLink.href = scanUrl;
        scanUrlLink.textContent = scanUrl;
        scanLinkArea.classList.remove('hidden');

        log('QR code and link generated. Waiting for student to scan and upload...', statusLogStudent);
        log('Monitoring for uploaded images (will auto-process when ready)...', statusLogStudent);

        // Start polling for status changes
        startScanPolling(examId);

    } catch (error) {
        log(`❌ An error occurred: ${error.message}`, statusLogStudent);
        console.error(error);
        generateScanLinkButton.disabled = false;
        showSpinner(false, spinnerStudent);
    }
}

async function handleGradeAll(e) {
    e.preventDefault();
    gradeAllButton.disabled = true;
    showSpinner(true, spinnerGrading);
    clearLog('Starting grading process...', statusLogGrading);
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');

    try {
        log('Finding ungraded submissions...', statusLogGrading);
        const { data: ungradedExams, error: findError } = await sb
            .from('student_exams')
            .select('id, students(full_name, student_number)')
            .eq('exam_id', examId)
            .is('total_points_awarded', null);

        if (findError) throw findError;
        if (!ungradedExams || ungradedExams.length === 0) {
            log('✅ No new ungraded submissions found.', statusLogGrading);
            gradeAllButton.disabled = false;
            showSpinner(false, spinnerGrading);
            return;
        }
        log(`Found ${ungradedExams.length} ungraded submission(s). Preparing data for grading...`, statusLogGrading);

        const gradingPromises = ungradedExams.map(studentExam => {
            const studentIdentifier = studentExam.students.full_name || studentExam.students.student_number;
            return processSingleStudent(examId, studentExam.id, studentIdentifier);
        });

        const results = await Promise.all(gradingPromises);

        let successCount = 0;
        results.forEach(result => {
            if (result.status === 'success') {
                successCount++;
            } else {
                log(`❌ Grading failed for student exam ${result.studentExamId}: ${result.error}`, statusLogGrading);
            }
        });

        log(`✅ Successfully graded and saved ${successCount} of ${ungradedExams.length} submissions.`, statusLogGrading);
        log('Refreshing page data...', statusLogGrading);
        await loadExamDetails(examId);

    } catch (error) {
        log(`❌ A critical error occurred during the grading process: ${error.message}`, statusLogGrading);
        console.error(error);
    } finally {
        gradeAllButton.disabled = false;
        showSpinner(false, spinnerGrading);
    }
}


// --- CORE LOGIC FUNCTIONS ---

async function loadExamDetails(examId) {
    const { data: examData, error } = await fetchFullExamDetails(examId);

    if (error) {
        examNameTitle.textContent = "Error Loading Exam";
        questionsContainer.innerHTML = `<p>Could not load exam details: ${error.message}</p>`;
        return;
    }

    examNameTitle.textContent = examData.exam_name;

    if (examData.grading_regulations) {
        showRulesButton.classList.remove('hidden');
        showRulesButton.onclick = () => {
            rulesModalText.innerHTML = marked.parse(examData.grading_regulations);
            rulesModal.classList.remove('hidden');
        };
    } else {
        showRulesButton.classList.add('hidden');
    }

    renderExam(examData.questions);
}

function renderExam(questions) {
    questionsContainer.innerHTML = '';
    if (!questions || questions.length === 0) {
        questionsContainer.innerHTML = '<p>This exam has no questions yet.</p>';
        return;
    }

    questions.sort((a, b) => a.question_number.localeCompare(b.question_number, undefined, { numeric: true }));

    questions.forEach(q => {
        const questionBlock = document.createElement('div');
        questionBlock.className = 'question-block';

        // --- Appendix Button ---
        let appendixButtonHtml = '';
        if (q.appendices && q.appendices.length > 0) {
            const appendixData = JSON.stringify(q.appendices);
            appendixButtonHtml = `<button class="appendix-button" data-appendix='${appendixData}'>Show Appendix</button>`;
        }

        // --- Grid Layout ---
        let gridHtml = '';
        if (q.sub_questions && q.sub_questions.length > 0) {
            const subQuestionCells = q.sub_questions.map(sq => {
                // --- Column 1: Sub-Question ---
                let mcqHtml = '';
                if (sq.mcq_options && sq.mcq_options.length > 0) {
                    mcqHtml = sq.mcq_options.map(opt => `<div class="mcq-option"><strong>${opt.mcq_letter}:</strong> <span class="formatted-text">${opt.mcq_content}</span></div>`).join('');
                }
                const subQCell = `<div class="grid-cell"><div class="sub-question-content"><p class="formatted-text"><strong>${sq.sub_q_text_content || ''}</strong></p>${mcqHtml}</div></div>`;

                // --- Column 2: Model Answer ---
                let modelAnswerHtml = 'No model answer provided.';
                if (sq.model_alternatives && sq.model_alternatives.length > 0) {
                    sq.model_alternatives.sort((a, b) => a.alternative_number - b.alternative_number);
                    const alternativesHtml = sq.model_alternatives.map(alt => {
                        if (alt.model_components) alt.model_components.sort((a, b) => a.component_order - b.component_order);
                        const componentsHtml = alt.model_components.map(comp => `
                            <div class="model-component">
                                ${comp.component_text ? `<p class="formatted-text">${comp.component_text}</p>` : ''}
                                ${comp.component_visual ? `<img src="${comp.component_visual}" alt="Model component visual">` : ''}
                                <span class="points-badge">Points: ${comp.component_points}</span>
                            </div>`).join('');
                        return `<div class="model-alternative"><h5>Alternative ${alt.alternative_number}</h5>${alt.extra_comment ? `<p class="formatted-text"><em>${alt.extra_comment}</em></p>` : ''}${componentsHtml}</div>`;
                    }).join('');
                    modelAnswerHtml = `<div class="model-answer-section">${alternativesHtml}</div>`;
                }
                const modelCell = `<div class="grid-cell">${modelAnswerHtml}</div>`;

                // --- Column 3: Student Answers ---
                let studentAnswersHtml = 'No answers submitted.';
                if (sq.student_answers && sq.student_answers.length > 0) {
                    const answersByStudent = sq.student_answers.reduce((acc, ans) => {
                        const student = ans.student_exams?.students;
                        if (!student) return acc;
                        const studentKey = student.full_name || student.student_number;
                        if (!acc[studentKey]) {
                            acc[studentKey] = { info: student, answers: [] };
                        }
                        acc[studentKey].answers.push(ans);
                        return acc;
                    }, {});

                    const studentDropdowns = Object.values(answersByStudent).map(studentData => {
                        const studentIdentifier = studentData.info.full_name ? `${studentData.info.full_name} (${studentData.info.student_number || 'No number'})` : studentData.info.student_number;
                        const answersContent = studentData.answers.map(ans => {
                            const correctedText = ans.answer_text ? ans.answer_text.replace(/\\n/g, '\n') : '';
                            const pointsHtml = ans.sub_points_awarded !== null ? `<div class="points-awarded-badge">Points: ${ans.sub_points_awarded} / ${sq.max_sub_points || '?'}</div>` : '';
                            const feedbackHtml = ans.feedback_comment ? `<div class="feedback-comment formatted-text">${ans.feedback_comment}</div>` : '';
                            return `
                                <div class="student-answer-item">
                                    ${correctedText ? `<p class="formatted-text">${correctedText}</p>` : ''}
                                    ${ans.answer_visual ? `<img src="${ans.answer_visual}" alt="Student answer visual" class="student-answer-visual">` : ''}
                                    ${pointsHtml}
                                    ${feedbackHtml}
                                </div>`;
                        }).join('');
                        return `<details class="student-answer-dropdown"><summary>${studentIdentifier}</summary>${answersContent}</details>`;
                    }).join('');
                    studentAnswersHtml = `<div class="student-answers-section">${studentDropdowns}</div>`;
                }
                const studentCell = `<div class="grid-cell">${studentAnswersHtml}</div>`;

                return subQCell + modelCell + studentCell;
            }).join('');

            gridHtml = `
                <div class="sub-question-grid">
                    <div class="grid-header">Sub-Question</div>
                    <div class="grid-header">Model Answer</div>
                    <div class="grid-header">Student Answers</div>
                    ${subQuestionCells}
                </div>`;
        }

        questionBlock.innerHTML = `
            <div class="question-header">
                <span>Question ${q.question_number}</span>
                ${appendixButtonHtml}
            </div>
            <p class="formatted-text">${q.context_text || ''}</p>
            ${q.context_visual ? `<img src="${q.context_visual}" alt="Visual for question ${q.question_number}" class="context-visual">` : ''}
            ${q.extra_comment ? `<p class="formatted-text"><em>${q.extra_comment}</em></p>` : ''}
            ${gridHtml}
        `;
        questionsContainer.appendChild(questionBlock);
    });

    // Add event listeners for the new appendix buttons
    document.querySelectorAll('.appendix-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const appendices = JSON.parse(e.target.dataset.appendix);
            const contentHtml = appendices.map(app => `
                <h4>${app.app_title || 'Appendix Item'}</h4>
                <p>${app.app_text || ''}</p>
                ${app.app_visual ? `<img src="${app.app_visual}" alt="Appendix visual">` : ''}
                <hr>
            `).join('');
            appendixModalContent.innerHTML = contentHtml;
            appendixModal.classList.remove('hidden');
        });
    });

    renderMathInElement(questionsContainer, {
        delimiters: [
            { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false },
            { left: '\$$', right: '\$$', display: false }, { left: '\$$', right: '\$$', display: true }
        ],
        throwOnError: false
    });
}

// --- SCAN POLLING AND PROCESSING LOGIC ---
function startScanPolling(examId) {
    // Clear any existing polling
    stopScanPolling();

    // Set up 10-minute timeout
    scanProcessingTimeout = setTimeout(() => {
        stopScanPolling();
        log('⏰ Scan session timed out after 10 minutes. Please try again if needed.', statusLogStudent);
        generateScanLinkButton.disabled = false;
        showSpinner(false, spinnerStudent);
    }, 10 * 60 * 1000);

    // Start polling every 5 seconds
    scanPollingInterval = setInterval(async () => {
        try {
            await checkScanStatus(examId);
        } catch (error) {
            console.error('Error during scan polling:', error);
        }
    }, 5000);
}

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

async function checkScanStatus(examId) {
    if (!currentScanSessionToken) return;

    try {
        const { data: scanSession, error } = await sb
            .from('scan_sessions')
            .select('*')
            .eq('session_token', currentScanSessionToken)
            .maybeSingle(); // CORRECT: Use maybeSingle() to allow for 0 or 1 result

        if (error) {
            // This will now only catch legitimate database/network errors, not "0 rows found".
            console.error('Failed to check scan status:', error);
            stopScanPolling(); // Stop polling if a real error occurs.
            return;
        }

        // If scanSession is not null, a record was found.
        if (scanSession) {
            // Check if its status has been updated to 'uploaded'
            if (scanSession.status === 'uploaded') {
                log('📸 Images detected! Starting automatic processing...', statusLogStudent);
                stopScanPolling(); // Stop polling, we found what we needed.
                await processScannedAnswers(examId, scanSession);
            }
            // If status is 'pending' or something else, the poll will just run again later.
        }
        // If scanSession is null, it means the record wasn't found yet.
        // We do nothing and let the polling continue.

    } catch (error) {
        // This catches any other unexpected JS errors within the function.
        console.error('Error during scan status check:', error);
        stopScanPolling();
    }
}

async function processScannedAnswers(examId, scanSession) {
    try {
        log('Processing scanned answers...', statusLogStudent);

        // Update session status to processing
        await sb.from('scan_sessions').update({ status: 'processing' }).eq('id', scanSession.id);

        // Check if images exist
        if (!scanSession.uploaded_image_paths || scanSession.uploaded_image_paths.length === 0) {
            await sb.from('scan_sessions').update({ status: 'completed' }).eq('id', scanSession.id);
            log('No images uploaded for this session.', statusLogStudent);
            return;
        }

        // Fetch exam structure for the GCF
        log('Fetching exam structure for processing...', statusLogStudent);
        const { data: examStructure, error: fetchExamError } = await sb
            .from('questions')
            .select(`
                question_number,
                sub_questions (
                    sub_q_text_content
                )
            `)
            .eq('exam_id', examId)
            .order('question_number', { ascending: true });

        if (fetchExamError) throw fetchExamError;

        const examStructureForGcf = { questions: examStructure };

        // Prepare form data for GCF
        log('Downloading and preparing images for processing...', statusLogStudent);
        const formData = new FormData();
        formData.append('exam_structure', JSON.stringify(examStructureForGcf));

        // Download images and add to form data
        const downloadPromises = scanSession.uploaded_image_paths.map(async (imageUrl) => {
            const filename = imageUrl.split('/').pop();
            try {
                const { data: imageBlob, error: downloadError } = await sb.storage
                    .from(STORAGE_BUCKET)
                    .download(`temp_scans/${scanSession.session_token}/${filename}`);

                if (downloadError) {
                    console.warn(`Failed to download image ${filename}: ${downloadError.message}`);
                    return null;
                }
                return { filename, blob: imageBlob };
            } catch (error) {
                console.warn(`Error downloading image ${filename}:`, error);
                return null;
            }
        });

        const downloadResults = await Promise.allSettled(downloadPromises);
        downloadResults.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
                const { filename, blob } = result.value;
                formData.append('files', blob, filename);
            }
        });

        // Call GCF with timeout handling
        log('Calling external Cloud Function for processing...', statusLogStudent);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

        try {
            const gcfResponse = await fetch(STUDENT_ANSWERS_GCF_URL, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!gcfResponse.ok) {
                const errorText = await gcfResponse.text();
                throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
            }

            // Process ZIP response from GCF
            log('Processing service returned success. Unzipping results...', statusLogStudent);
            const zipBlob = await gcfResponse.blob();
            const jszip = new JSZip();
            const zip = await jszip.loadAsync(zipBlob);

            // Find the JSON file within the zip
            const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith('.json') && !file.dir);
            if (!jsonFile) {
                throw new Error('Could not find the JSON file inside the ZIP response from the GCF.');
            }

            // Read and parse JSON content
            const jsonContent = await jsonFile.async('string');
            const responseData = JSON.parse(jsonContent);

            log('Successfully parsed student answers from JSON.', statusLogStudent);

            // Process the response and save to student_answers table
            await saveStudentAnswers(scanSession, examId, responseData);

            // Update scan session status to completed
            await sb.from('scan_sessions').update({ status: 'completed' }).eq('id', scanSession.id);

            // Clean up temp files (non-blocking)
            cleanupTempFiles(scanSession).catch(console.error);

            log('✅ Scanned answers processed successfully!', statusLogStudent);

            // Clean up UI
            studentAnswersForm.reset();
            scanLinkArea.classList.add('hidden');
            currentScanSessionToken = null;

            // Reload exam details to show new answers
            await loadExamDetails(examId);

        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Processing timed out - please try again with fewer or smaller images');
            }
            throw error;
        }

    } catch (error) {
        log(`❌ An error occurred during processing: ${error.message}`, statusLogStudent);
        console.error('Processing failed:', error);

        // Update session status to failed
        try {
            await sb.from('scan_sessions').update({
                status: 'failed',
                error_message: error.message
            }).eq('id', scanSession.id);
        } catch (updateError) {
            console.error('Failed to update session status to failed:', updateError.message);
        }
    } finally {
        generateScanLinkButton.disabled = false;
        showSpinner(false, spinnerStudent);
    }
}

// --- DATA FETCHING AND PROCESSING FUNCTIONS ---

async function fetchFullExamDetails(examId) {
    return sb
        .from('exams')
        .select(`
            exam_name,
            grading_regulations,
            questions (
                id, question_number, context_text, context_visual, extra_comment,
                appendices ( app_title, app_text, app_visual ),
                sub_questions (
                    id, sub_q_text_content, max_sub_points,
                    mcq_options ( mcq_letter, mcq_content ),
                    model_alternatives (
                        alternative_number, extra_comment,
                        model_components ( component_text, component_visual, component_points, component_order )
                    ),
                    student_answers (
                        answer_text, answer_visual, sub_points_awarded, feedback_comment,
                        student_exams (
                            students ( full_name, student_number )
                        )
                    )
                )
            )
        `)
        .eq('id', examId)
        .single();
}

async function fetchExamDataForAppendixJson(examId) {
    return sb.from('exams').select(`exam_name, questions (id, question_number, context_text, extra_comment, sub_questions (sub_q_text_content, mcq_options (mcq_letter, mcq_content)))`).eq('id', examId).single();
}

async function fetchExamDataForModelJson(examId) {
    return sb.from('questions').select(`question_number, sub_questions (sub_q_text_content)`).eq('exam_id', examId).order('question_number', { ascending: true });
}

async function processAndUploadAppendices(examId, appendices, zip) {
    log('Preparing to save appendices to database...', statusLogAppendix);
    const { data: questions, error: qError } = await sb.from('questions').select('id, question_number').eq('exam_id', examId);
    if (qError) throw new Error(`Could not fetch question IDs: ${qError.message}`);
    const questionMap = new Map(questions.map(q => [q.question_number, q.id]));
    const appendicesToInsert = [];
    for (const app of appendices) {
        const questionId = questionMap.get(app.question_number);
        if (!questionId) {
            log(`⚠️ Warning: Could not find question_id for question_number "${app.question_number}". Skipping this appendix.`, statusLogAppendix);
            continue;
        }
        let appVisualUrl = null;
        if (app.app_visual) {
            const visualFile = zip.file(app.app_visual);
            if (visualFile) {
                log(`Uploading appendix visual: ${app.app_visual}`, statusLogAppendix);
                const filePath = `public/${examId}/appendices/${Date.now()}_${app.app_visual}`;
                const fileBlob = await visualFile.async('blob');
                const fileToUpload = new File([fileBlob], app.app_visual, { type: `image/${app.app_visual.split('.').pop()}` });
                const { error: uploadError } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, fileToUpload);
                if (uploadError) throw new Error(`Failed to upload ${app.app_visual}: ${uploadError.message}`);
                const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
                appVisualUrl = urlData.publicUrl;
                log(`Visual uploaded to: ${appVisualUrl}`, statusLogAppendix);
            } else {
                log(`⚠️ Warning: Visual file ${app.app_visual} not found in zip.`, statusLogAppendix);
            }
        }
        appendicesToInsert.push({ question_id: questionId, app_title: app.app_title, app_text: app.app_text, app_visual: appVisualUrl });
    }
    if (appendicesToInsert.length > 0) {
        log(`Inserting ${appendicesToInsert.length} appendix records...`, statusLogAppendix);
        const { error: insertError } = await sb.from('appendices').insert(appendicesToInsert);
        if (insertError) throw new Error(`Failed to insert appendices: ${insertError.message}`);
    } else {
        log('No valid appendices were found to insert.', statusLogAppendix);
    }
}

async function processAndUploadModel(examId, modelQuestions, zip) {
    log('Matching model data to existing questions...', statusLogModel);

    const rulesFile = zip.file('grading_rules.txt');
    if (rulesFile) {
        try {
            log('Found grading_rules.txt. Reading content...', statusLogModel);
            const rulesContent = await rulesFile.async('string');
            log('Updating exam with grading regulations...', statusLogModel);
            const { error: updateError } = await sb
                .from('exams')
                .update({ grading_regulations: rulesContent })
                .eq('id', examId);

            if (updateError) {
                throw updateError;
            }
            log('Successfully saved grading regulations.', statusLogModel);
        } catch (error) {
            log(`⚠️ Warning: Could not save grading regulations: ${error.message}`, statusLogModel);
        }
    } else {
        log('No grading_rules.txt found in the zip file. Skipping regulations update.', statusLogModel);
    }

    const { data: dbQuestions, error: fetchError } = await sb.from('questions').select('id, question_number, sub_questions(id, sub_q_text_content)').eq('exam_id', examId);
    if (fetchError) throw new Error(`Could not fetch exam structure for matching: ${fetchError.message}`);
    const subQuestionLookup = dbQuestions.reduce((qMap, q) => {
        qMap[q.question_number] = q.sub_questions.reduce((sqMap, sq) => { sqMap[sq.sub_q_text_content] = sq.id; return sqMap; }, {});
        return qMap;
    }, {});
    for (const q_model of modelQuestions) {
        for (const sq_model of q_model.sub_questions) {
            const sub_question_id = subQuestionLookup[q_model.question_number]?.[sq_model.sub_q_text_content];
            if (!sub_question_id) {
                log(`⚠️ Warning: Could not find matching sub-question for Q#${q_model.question_number}. Skipping.`, statusLogModel);
                continue;
            }
            if (!sq_model.model_alternatives || sq_model.model_alternatives.length === 0) continue;
            log(`Processing model for Q#${q_model.question_number}...`, statusLogModel);
            for (const alt_model of sq_model.model_alternatives) {
                const { data: newAlternative, error: altError } = await sb.from('model_alternatives').insert({ sub_question_id: sub_question_id, alternative_number: alt_model.alternative_number, extra_comment: alt_model.extra_comment }).select('id').single();
                if (altError) throw new Error(`Failed to insert model alternative: ${altError.message}`);
                const alternative_id = newAlternative.id;
                if (!alt_model.model_components || alt_model.model_components.length === 0) continue;
                const componentsToInsert = [];
                for (const comp_model of alt_model.model_components) {
                    let componentVisualUrl = null;
                    if (comp_model.component_visual) {
                        const visualFile = zip.file(comp_model.component_visual);
                        if (visualFile) {
                            log(`  - Uploading model visual: ${comp_model.component_visual}`, statusLogModel);
                            const filePath = `public/${examId}/models/${Date.now()}_${comp_model.component_visual}`;
                            const fileBlob = await visualFile.async('blob');
                            const fileToUpload = new File([fileBlob], comp_model.component_visual, { type: `image/${comp_model.component_visual.split('.').pop()}` });
                            const { error: uploadError } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, fileToUpload);
                            if (uploadError) throw new Error(`Failed to upload ${comp_model.component_visual}: ${uploadError.message}`);
                            const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
                            componentVisualUrl = urlData.publicUrl;
                        } else {
                            log(`  - ⚠️ Warning: Visual file ${comp_model.component_visual} not found in zip.`, statusLogModel);
                        }
                    }
                    componentsToInsert.push({ alternative_id: alternative_id, component_text: comp_model.component_text, component_visual: componentVisualUrl, component_points: comp_model.component_points, component_order: comp_model.component_order });
                }
                if (componentsToInsert.length > 0) {
                    log(`  - Inserting ${componentsToInsert.length} model components...`, statusLogModel);
                    const { error: compError } = await sb.from('model_components').insert(componentsToInsert);
                    if (compError) throw new Error(`Failed to insert model components: ${compError.message}`);
                }
            }
        }
    }
}

async function saveStudentAnswers(scanSession, examId, responseData) {
    let studentExamId;

    // Find or create student_exam record
    const { data: existingStudentExam, error: seError } = await sb
        .from('student_exams')
        .select('id')
        .eq('student_id', scanSession.student_id)
        .eq('exam_id', examId)
        .maybeSingle();

    if (seError) throw new Error(`Error finding student_exam record: ${seError.message}`);

    if (existingStudentExam) {
        studentExamId = existingStudentExam.id;
        // Delete existing answers
        await sb.from('student_answers').delete().eq('student_exam_id', studentExamId);
    } else {
        const { data: newStudentExam, error: createSeError } = await sb
            .from('student_exams')
            .insert({
                student_id: scanSession.student_id,
                exam_id: examId,
                status: 'submitted'
            })
            .select('id')
            .single();

        if (createSeError) throw new Error(`Could not create student_exam record: ${createSeError.message}`);
        studentExamId = newStudentExam.id;
    }

    // Fetch database questions for matching
    const { data: dbQuestions, error: fetchQError } = await sb
        .from('questions')
        .select('id, question_number, sub_questions(id, sub_q_text_content)')
        .eq('exam_id', examId);

    if (fetchQError) throw new Error(`Could not fetch exam structure for matching: ${fetchQError.message}`);

    // Create lookup map for sub-questions
    const subQuestionLookup = dbQuestions.reduce((qMap, q) => {
        qMap[q.question_number] = q.sub_questions.reduce((sqMap, sq) => {
            sqMap[sq.sub_q_text_content] = sq.id;
            return sqMap;
        }, {});
        return qMap;
    }, {});

    // Prepare answers for insertion
    const answersToInsert = [];

    for (const q_res of responseData.questions) {
        for (const sq_res of q_res.sub_questions) {
            const sub_question_id = subQuestionLookup[q_res.question_number]?.[sq_res.sub_q_text_content];
            if (!sub_question_id) {
                console.warn(`Warning: Could not find matching sub-question for Q#${q_res.question_number}. Skipping.`);
                continue;
            }

            if (sq_res.student_answers) {
                answersToInsert.push({
                    student_exam_id: studentExamId,
                    sub_question_id: sub_question_id,
                    answer_text: sq_res.student_answers.answer_text || null,
                    answer_visual: sq_res.student_answers.answer_visual || null
                });
            }
        }
    }

    // Batch insert answers
    if (answersToInsert.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < answersToInsert.length; i += batchSize) {
            const batch = answersToInsert.slice(i, i + batchSize);
            const { error: insertError } = await sb.from('student_answers').insert(batch);
            if (insertError) throw new Error(`Failed to insert student answers batch: ${insertError.message}`);
        }
    }
}

async function cleanupTempFiles(scanSession) {
    try {
        const pathsToDelete = scanSession.uploaded_image_paths.map((url) => {
            const filename = url.split('/').pop();
            return `temp_scans/${scanSession.session_token}/${filename}`;
        });

        if (pathsToDelete.length > 0) {
            await sb.storage.from(STORAGE_BUCKET).remove(pathsToDelete);
        }
    } catch (error) {
        console.error('Failed to cleanup temp files:', error);
        // Don't throw - this is non-critical
    }
}

// --- GRADING HELPER FUNCTIONS ---
async function processSingleStudent(examId, studentExamId, studentIdentifier) {
    try {
        // A. Fetch the data in the required JSON structure
        log(`Fetching data for ${studentIdentifier}...`, statusLogGrading);
        const { data: gradingData, error: dataError } = await fetchGradingDataForStudent(examId, studentExamId);
        if (dataError) throw new Error(`Data fetch failed: ${dataError.message}`);
        if (!gradingData || !gradingData.questions || gradingData.questions.length === 0) {
            log(`No answer data found for ${studentIdentifier}. Marking as graded with 0 points.`, statusLogGrading);
            await sb.from('student_exams').update({ total_points_awarded: 0, status: 'graded' }).eq('id', studentExamId);
            return { status: 'success', studentExamId };
        }

        // B. Collect all image URLs and fetch them, and build sub-question ID map
        const imageUrls = new Set();
        const subQuestionAnswerIdMap = new Map(); // Map<sub_question_id, student_answer_id>

        JSON.stringify(gradingData, (key, value) => {
            if (value && typeof value === 'string' && value.startsWith('http')) {
                if (key === 'context_visual' || key === 'component_visual' || key === 'answer_visual') {
                    imageUrls.add(value);
                }
            }
            if (key === 'sub_questions' && Array.isArray(value)) {
                value.forEach(sq => {
                    if (sq.id && sq.student_answers && sq.student_answers.length > 0) {
                        subQuestionAnswerIdMap.set(sq.id, sq.student_answers[0].id);
                    }
                });
            }
            return value;
        });

        const imageBlobs = new Map(); // Map<filename, blob>
        const fetchImagePromises = Array.from(imageUrls).map(async (url) => {
            const filename = getFilenameFromUrl(url);
            if (filename) {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
                const blob = await response.blob();
                imageBlobs.set(filename, blob);
            }
        });
        await Promise.all(fetchImagePromises);
        log(`Fetched ${imageBlobs.size} unique images for ${studentIdentifier}.`, statusLogGrading);

        // C. Call the GCF
        log(`Sending data to AI for grading (${studentIdentifier})...`, statusLogGrading);
        const gcfResponse = await callGradingGcf(gradingData, imageBlobs);

        // D. Process the response and update the DB
        await updateGradingResultsInDb(studentExamId, gcfResponse, subQuestionAnswerIdMap);
        log(`✅ Saved results for ${studentIdentifier}.`, statusLogGrading);

        return { status: 'success', studentExamId };
    } catch (error) {
        console.error(`Error processing student_exam ${studentExamId}:`, error);
        return { status: 'error', studentExamId, error: error.message };
    }
}

async function fetchGradingDataForStudent(examId, studentExamId) {
    // 1. Fetch the base exam structure with model answers etc.
    const { data: examBase, error: baseError } = await sb
        .from('exams')
        .select(`
            grading_regulations,
            questions (
                question_number, max_total_points, context_text, context_visual, extra_comment,
                sub_questions (
                    id, sub_q_text_content, max_sub_points,
                    mcq_options ( mcq_letter, mcq_content ),
                    model_alternatives (
                        alternative_number, extra_comment,
                        model_components ( component_text, component_visual, component_points )
                    )
                )
            )
        `)
        .eq('id', examId)
        .single();

    if (baseError) throw baseError;

    // 2. Fetch all answers for this specific student exam.
    const { data: studentAnswers, error: answersError } = await sb
        .from('student_answers')
        .select('id, sub_question_id, answer_text, answer_visual')
        .eq('student_exam_id', studentExamId);

    if (answersError) throw answersError;

    // 3. Create a map for easy lookup.
    const answersMap = new Map(studentAnswers.map(ans => [ans.sub_question_id, {
        id: ans.id,
        answer_text: ans.answer_text,
        answer_visual: ans.answer_visual
    }]));

    // 4. Inject the student answers into the base structure.
    examBase.questions.forEach(q => {
        q.sub_questions.forEach(sq => {
            const studentAns = answersMap.get(sq.id);
            // The GCF expects an array for student_answers
            sq.student_answers = studentAns ? [studentAns] : [];
        });
    });

    return { data: examBase, error: null };
}

async function callGradingGcf(gradingData, imageBlobs) {
    const formData = new FormData();
    formData.append('grading_data', JSON.stringify(gradingData));

    for (const [filename, blob] of imageBlobs.entries()) {
        formData.append(filename, blob, filename);
    }

    const response = await fetch(GRADING_GCF_URL, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grading service failed: ${response.statusText} - ${errorText}`);
    }
    return response.json();
}

async function updateGradingResultsInDb(studentExamId, gcfResponse, subQuestionToAnswerIdMap) {
    const answerUpdates = [];
    let totalPoints = 0;

    if (!gcfResponse || !gcfResponse.questions) {
        throw new Error("Invalid response from grading service.");
    }

    // The GCF now returns the full question structure
    const allSubQuestionResults = gcfResponse.questions.flatMap(q => q.sub_questions || []);

    for (const subQResult of allSubQuestionResults) {
        // Use the reliable sub_question_id for matching
        const studentAnswerId = subQuestionToAnswerIdMap.get(subQResult.sub_question_id);

        if (studentAnswerId && subQResult.student_answers) {
            const points = Number(subQResult.student_answers.sub_points_awarded) || 0;
            const feedback = subQResult.student_answers.feedback_comment || '';

            answerUpdates.push({
                id: studentAnswerId,
                sub_points_awarded: points,
                feedback_comment: feedback
            });
            totalPoints += points;
        } else if (subQResult.student_answers && subQResult.student_answers.feedback_comment.startsWith("ERROR:")) {
            // Log errors from the GCF if a sub-question failed to grade
            log(`⚠️ GCF Error on sub-question ID ${subQResult.sub_question_id}: ${subQResult.student_answers.feedback_comment}`, statusLogGrading);
        }
    }

    if (answerUpdates.length > 0) {
        const updatePromises = answerUpdates.map(update =>
            sb.from('student_answers')
                .update({
                    sub_points_awarded: update.sub_points_awarded,
                    feedback_comment: update.feedback_comment
                })
                .eq('id', update.id)
        );
        const results = await Promise.all(updatePromises);
        const firstErrorResult = results.find(res => res.error);
        if (firstErrorResult) {
            throw new Error(`Failed to save grading results: ${firstErrorResult.error.message}`);
        }
    }

    const { error: examUpdateError } = await sb
        .from('student_exams')
        .update({
            total_points_awarded: totalPoints,
            status: 'graded'
        })
        .eq('id', studentExamId);

    if (examUpdateError) throw new Error(`Failed to update final score: ${examUpdateError.message}`);
}
