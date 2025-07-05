// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const APPENDIX_GCF_URL = 'https://add-appendix-232485517114.europe-west1.run.app';
const MODEL_GCF_URL = 'https://add-model-232485517114.europe-west1.run.app';
const STUDENT_ANSWERS_GCF_URL = 'https://add-student-answers-232485517114.europe-west1.run.app';
const GRADING_GCF_URL = 'https://generate-points-232485517114.europe-west1.run.app';
const STORAGE_BUCKET = 'exam-visuals';

// --- NEW: Supabase Edge Function URLs ---
// You will need to deploy these functions to your Supabase project
const GENERATE_SCAN_SESSION_URL = `${SUPABASE_URL}/functions/v1/generate-scan-session`;
const PROCESS_SCANNED_SESSION_URL = `${SUPABASE_URL}/functions/v1/process-scanned-session`;
// Base URL for the mobile scanning page (adjust if your Vercel deployment is different)
const SCAN_PAGE_BASE_URL = `${window.location.origin}/scan.html`;


// --- SUPABASE CLIENT ---
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM ELEMENTS ---
const examNameTitle = document.getElementById('exam-name-title');
const questionsContainer = document.getElementById('questions-container');
// Appendix Form
const appendixForm = document.getElementById('appendix-form');
const submitAppendixButton = document.getElementById('submit-appendix-button');
const submitAppendixButtonText = document.getElementById('submit-appendix-button-text'); // NEW
const spinnerAppendix = document.getElementById('spinner-appendix');
// Model Form
const modelForm = document.getElementById('model-form');
const submitModelButton = document.getElementById('submit-model-button');
const submitModelButtonText = document.getElementById('submit-model-button-text'); // NEW
const spinnerModel = document.getElementById('spinner-model');
// Modals
const rulesModal = document.getElementById('rules-modal');
const rulesModalText = document.getElementById('rules-modal-text');
const rulesModalClose = document.getElementById('rules-modal-close');
const appendixModal = document.getElementById('appendix-modal');
const appendixModalContent = document.getElementById('appendix-modal-content');
const appendixModalClose = document.getElementById('appendix-modal-close');
// Student Answers Form (Modified)
const studentAnswersForm = document.getElementById('student-answers-form');
const generateScanLinkButton = document.getElementById('generate-scan-link-button');
const generateScanLinkButtonText = document.getElementById('generate-scan-link-button-text'); // NEW
const scanLinkArea = document.getElementById('scan-link-area');
const qrcodeCanvas = document.getElementById('qrcode-canvas');
const scanUrlLink = document.getElementById('scan-url');
const spinnerStudent = document.getElementById('spinner-student');
// Grading Elements
const gradeAllButton = document.getElementById('grade-all-button');
const gradeAllButtonText = document.getElementById('grade-all-button-text');
const spinnerGrading = document.getElementById('spinner-grading');

// Global variable to store the current scan session token
let currentScanSessionToken = null;
// ADD these new global variables:
let scanPollingInterval = null;
let scanProcessingTimeout = null;

// NEW: Global constants for default button texts
const DEFAULT_GRADING_BUTTON_TEXT = 'Grade All Ungraded Submissions';
const DEFAULT_APPENDIX_BUTTON_TEXT = 'Process and Upload Appendix';
const DEFAULT_MODEL_BUTTON_TEXT = 'Process and Upload Answer Model';
const DEFAULT_SCAN_BUTTON_TEXT = 'Generate Scan Link';


// --- HELPER FUNCTIONS ---
const showSpinner = (show, targetSpinner) => { targetSpinner.classList.toggle('hidden', !show); };

// NEW: Generic helper to update a button's text
const setButtonText = (buttonTextElement, message) => {
    if (buttonTextElement) {
        buttonTextElement.textContent = message;
    }
    // Also log to console for a persistent history of status changes
    console.log(`UI Status: ${message}`);
};

// Renamed for clarity
const updateGradingButtonText = (message) => {
    if (gradeAllButtonText) {
        gradeAllButtonText.textContent = message;
    }
    console.log(`Grading Status: ${message}`);
};

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

function setupFileInputFeedback(inputId, displayId) {
    const fileInput = document.getElementById(inputId);
    const fileDisplay = document.getElementById(displayId);

    if (fileInput && fileDisplay) {
        fileInput.addEventListener('change', () => {
            const files = fileInput.files;
            if (files.length > 0) {
                if (files.length === 1) {
                    fileDisplay.textContent = files[0].name;
                } else {
                    fileDisplay.textContent = `${files.length} files selected`;
                }
            } else {
                fileDisplay.textContent = 'No files chosen';
            }
        });
    }
}

// --- MAIN LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
    setupFileInputFeedback('appendix-files', 'appendix-file-display');
    setupFileInputFeedback('model-files', 'model-file-display');

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');

    if (!examId) {
        examNameTitle.textContent = "Error: No Exam ID provided.";
        questionsContainer.innerHTML = '<p>Please return to the main page and select an exam.</p>';
        document.querySelectorAll('.container').forEach(c => {
            if (c.querySelector('form') || c.querySelector('#grade-all-button')) {
                c.classList.add('hidden');
            }
        });
        return;
    }

    await loadExamDetails(examId);

    [rulesModal, appendixModal].forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) modal.classList.add('hidden');
        });
    });
    [rulesModalClose, appendixModalClose].forEach(button => {
        button.addEventListener('click', () => button.closest('.modal-overlay').classList.add('hidden'));
    });
});

async function loadExamDetails(examId) {
    const { data: examData, error } = await fetchFullExamDetails(examId);

    if (error) {
        examNameTitle.textContent = "Error Loading Exam";
        questionsContainer.innerHTML = `<p>Could not load exam details: ${error.message}</p>`;
        return;
    }

    examNameTitle.textContent = examData.exam_name;

    const showRulesButton = document.getElementById('show-rules-button');
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

        let appendixButtonHtml = '';
        if (q.appendices && q.appendices.length > 0) {
            const appendixData = JSON.stringify(q.appendices);
            appendixButtonHtml = `<button class="appendix-button" data-appendix='${appendixData}'>Show Appendix</button>`;
        }

        let gridHtml = '';
        if (q.sub_questions && q.sub_questions.length > 0) {
            const subQuestionCells = q.sub_questions.map(sq => {
                let mcqHtml = '';
                if (sq.mcq_options && sq.mcq_options.length > 0) {
                    mcqHtml = sq.mcq_options.map(opt => `<div class="mcq-option"><strong>${opt.mcq_letter}:</strong> <span class="formatted-text">${opt.mcq_content}</span></div>`).join('');
                }
                const subQCell = `<div class="grid-cell"><div class="sub-question-content"><p class="formatted-text"><strong>${sq.sub_q_text_content || ''}</strong></p>${mcqHtml}</div></div>`;

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

// --- APPENDIX UPLOAD LOGIC (MODIFIED LOGGING) ---
appendixForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitAppendixButton.disabled = true;
    showSpinner(true, spinnerAppendix);
    setButtonText(submitAppendixButtonText, 'Starting...');

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const files = document.getElementById('appendix-files').files;
    let isError = false;

    if (!examId || files.length === 0) {
        alert('Cannot proceed without an Exam ID and at least one file.');
        submitAppendixButton.disabled = false;
        showSpinner(false, spinnerAppendix);
        setButtonText(submitAppendixButtonText, DEFAULT_APPENDIX_BUTTON_TEXT);
        return;
    }

    try {
        setButtonText(submitAppendixButtonText, 'Fetching exam...');
        const { data: examData, error: fetchError } = await fetchExamDataForAppendixJson(examId);
        if (fetchError) throw new Error(`Could not fetch exam data: ${fetchError.message}`);
        const examStructureForGcf = { questions: examData.questions };

        setButtonText(submitAppendixButtonText, 'Thinking... (may take 1 minute)');
        const formData = new FormData();
        for (const file of files) { formData.append('files', file); }
        formData.append('exam_structure', JSON.stringify(examStructureForGcf));
        const gcfResponse = await fetch(APPENDIX_GCF_URL, { method: 'POST', body: formData });
        if (!gcfResponse.ok) {
            const errorText = await gcfResponse.text();
            throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
        }

        setButtonText(submitAppendixButtonText, 'Processing...');
        const zipBlob = await gcfResponse.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(zipBlob);
        const jsonFile = Object.values(zip.files).find(file => file.name.endsWith('.json'));
        if (!jsonFile) throw new Error("No JSON file found in the returned zip.");
        const jsonContent = await jsonFile.async('string');
        const appendixData = JSON.parse(jsonContent);

        setButtonText(submitAppendixButtonText, 'Saving...');
        await processAndUploadAppendices(examId, appendixData.appendices, zip);

        setButtonText(submitAppendixButtonText, 'Refreshing data...');
        appendixForm.reset();
        document.getElementById('appendix-file-display').textContent = 'No files chosen';
        await loadExamDetails(examId);

    } catch (error) {
        setButtonText(submitAppendixButtonText, `Error!`);
        console.error(error);
        isError = true;
    } finally {
        if (!isError) {
            setButtonText(submitAppendixButtonText, 'Success!');
        }
        showSpinner(false, spinnerAppendix);
        setTimeout(() => {
            submitAppendixButton.disabled = false;
            setButtonText(submitAppendixButtonText, DEFAULT_APPENDIX_BUTTON_TEXT);
        }, isError ? 5000 : 3000);
    }
});

// --- ANSWER MODEL UPLOAD LOGIC (MODIFIED LOGGING) ---
modelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitModelButton.disabled = true;
    showSpinner(true, spinnerModel);
    setButtonText(submitModelButtonText, 'Starting...');

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const files = document.getElementById('model-files').files;
    let isError = false;

    if (!examId || files.length === 0) {
        alert('Cannot proceed without an Exam ID and at least one file.');
        submitModelButton.disabled = false;
        showSpinner(false, spinnerModel);
        setButtonText(submitModelButtonText, DEFAULT_MODEL_BUTTON_TEXT);
        return;
    }

    try {
        setButtonText(submitModelButtonText, 'Fetching exam...');
        const { data: examStructure, error: fetchError } = await fetchExamDataForModelJson(examId);
        if (fetchError) throw new Error(`Could not fetch exam data for model: ${fetchError.message}`);
        const examStructureForGcf = { questions: examStructure };

        setButtonText(submitModelButtonText, 'Thinking... (may take 4 mins)');
        const formData = new FormData();
        for (const file of files) { formData.append('files', file); }
        formData.append('exam_structure', JSON.stringify(examStructureForGcf));
        const gcfResponse = await fetch(MODEL_GCF_URL, { method: 'POST', body: formData });
        if (!gcfResponse.ok) {
            const errorText = await gcfResponse.text();
            throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
        }

        setButtonText(submitModelButtonText, 'Processing...');
        const zipBlob = await gcfResponse.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(zipBlob);
        const jsonFile = Object.values(zip.files).find(file => file.name.endsWith('.json'));
        if (!jsonFile) throw new Error("No JSON file found in the returned zip.");
        const jsonContent = await jsonFile.async('string');
        const modelData = JSON.parse(jsonContent);

        setButtonText(submitModelButtonText, 'Saving...');
        await processAndUploadModel(examId, modelData.questions, zip);

        setButtonText(submitModelButtonText, 'Refreshing data...');
        modelForm.reset();
        document.getElementById('model-file-display').textContent = 'No files chosen';
        await loadExamDetails(examId);

    } catch (error) {
        setButtonText(submitModelButtonText, `Error!`);
        console.error(error);
        isError = true;
    } finally {
        if (!isError) {
            setButtonText(submitModelButtonText, 'Success!');
        }
        showSpinner(false, spinnerModel);
        setTimeout(() => {
            submitModelButton.disabled = false;
            setButtonText(submitModelButtonText, DEFAULT_MODEL_BUTTON_TEXT);
        }, isError ? 5000 : 3000);
    }
});

// --- STUDENT SCAN LINK GENERATION (MODIFIED LOGGING) ---
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

        new QRious({
            element: qrcodeCanvas,
            value: scanUrl,
            size: 200
        });

        scanUrlLink.href = scanUrl;
        scanUrlLink.textContent = scanUrl;
        scanLinkArea.classList.remove('hidden');

        showSpinner(false, spinnerStudent); // Hide spinner, but keep button disabled
        setButtonText(generateScanLinkButtonText, 'Waiting for your scan...');

        startScanPolling(examId);

    } catch (error) {
        setButtonText(generateScanLinkButtonText, 'Error!');
        console.error(error);
        showSpinner(false, spinnerStudent);
        setTimeout(() => {
            generateScanLinkButton.disabled = false;
            setButtonText(generateScanLinkButtonText, DEFAULT_SCAN_BUTTON_TEXT);
        }, 5000);
    }
});


// --- AUTOMATIC GRADING LOGIC (REFACTORED) ---
gradeAllButton.addEventListener('click', async (e) => {
    e.preventDefault();
    gradeAllButton.disabled = true;
    showSpinner(true, spinnerGrading);
    updateGradingButtonText('Starting...');

    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    let finalMessage = '';
    let isError = false;

    try {
        updateGradingButtonText('Finding submissions...');
        const { data: ungradedExams, error: findError } = await sb
            .from('student_exams')
            .select('id, students(full_name, student_number)')
            .eq('exam_id', examId)
            .is('total_points_awarded', null);

        if (findError) throw findError;

        if (!ungradedExams || ungradedExams.length === 0) {
            finalMessage = 'No new submissions found.';
            return;
        }

        updateGradingButtonText(`Grading ${ungradedExams.length} submission(s)...\n(may take 1 minute)`);


        const gradingPromises = ungradedExams.map(studentExam => {
            const studentIdentifier = studentExam.students.full_name || studentExam.students.student_number;
            return processSingleStudent(examId, studentExam.id, studentIdentifier);
        });

        const results = await Promise.all(gradingPromises);

        const successCount = results.filter(r => r.status === 'success').length;
        const failureCount = results.length - successCount;

        if (failureCount > 0) {
            finalMessage = `Graded ${successCount}, ${failureCount} failed.`;
        } else {
            finalMessage = `All ${successCount} submissions graded.`;
        }

        updateGradingButtonText('Refreshing data...');
        await loadExamDetails(examId);

    } catch (error) {
        console.error(error);
        finalMessage = `Critical Error. See console.`;
        isError = true;
    } finally {
        updateGradingButtonText(finalMessage);
        showSpinner(false, spinnerGrading);

        setTimeout(() => {
            gradeAllButton.disabled = false;
            updateGradingButtonText(DEFAULT_GRADING_BUTTON_TEXT);
        }, isError ? 5000 : 3000);
    }
});


// --- DATA FETCHING FUNCTIONS (UNCHANGED) ---
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

// --- DATA PROCESSING AND UPLOAD FUNCTIONS ---

async function processAndUploadModel(examId, modelQuestions, zip) {
    setButtonText(submitModelButtonText, 'Processing rules...');
    const rulesFile = zip.file('grading_rules.txt');
    if (rulesFile) {
        try {
            const rulesContent = await rulesFile.async('string');
            const { error: updateError } = await sb
                .from('exams')
                .update({ grading_regulations: rulesContent })
                .eq('id', examId);
            if (updateError) throw updateError;
        } catch (error) {
            console.warn(`Could not save grading regulations: ${error.message}`);
        }
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
                console.warn(`Could not find matching sub-question for Q#${q_model.question_number}. Skipping.`);
                continue;
            }

            if (sq_model.model_alternatives && sq_model.model_alternatives.length > 0) {
                let primaryAlternative = sq_model.model_alternatives.find(alt => alt.alternative_number === 1) || sq_model.model_alternatives[0];
                if (primaryAlternative && primaryAlternative.model_components?.length > 0) {
                    const calculatedMaxPoints = primaryAlternative.model_components.reduce((sum, comp) => sum + (Number(comp.component_points) || 0), 0);
                    const { error: updatePointsError } = await sb.from('sub_questions').update({ max_sub_points: calculatedMaxPoints }).eq('id', sub_question_id);
                    if (updatePointsError) console.warn(`Could not update max_sub_points for sub-question ID ${sub_question_id}: ${updatePointsError.message}`);
                }
            }

            if (!sq_model.model_alternatives || sq_model.model_alternatives.length === 0) continue;
            setButtonText(submitModelButtonText, `Saving Q#${q_model.question_number}...`);
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
                            const filePath = `public/${examId}/models/${Date.now()}_${comp_model.component_visual}`;
                            const fileBlob = await visualFile.async('blob');
                            const fileToUpload = new File([fileBlob], comp_model.component_visual, { type: `image/${comp_model.component_visual.split('.').pop()}` });
                            const { error: uploadError } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, fileToUpload);
                            if (uploadError) throw new Error(`Failed to upload ${comp_model.component_visual}: ${uploadError.message}`);
                            const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
                            componentVisualUrl = urlData.publicUrl;
                        } else {
                            console.warn(`Visual file ${comp_model.component_visual} not found in zip.`);
                        }
                    }
                    componentsToInsert.push({ alternative_id: alternative_id, component_text: comp_model.component_text, component_visual: componentVisualUrl, component_points: comp_model.component_points, component_order: comp_model.component_order });
                }
                if (componentsToInsert.length > 0) {
                    const { error: compError } = await sb.from('model_components').insert(componentsToInsert);
                    if (compError) throw new Error(`Failed to insert model components: ${compError.message}`);
                }
            }
        }
    }
}

// --- GRADING HELPER FUNCTIONS (REFACTORED) ---

async function processSingleStudent(examId, studentExamId, studentIdentifier) {
    try {
        console.log(`Fetching data for ${studentIdentifier}...`);
        const { data: gradingData, error: dataError } = await fetchGradingDataForStudent(examId, studentExamId);
        if (dataError) throw new Error(`Data fetch failed: ${dataError.message}`);
        if (!gradingData || !gradingData.questions || gradingData.questions.length === 0) {
            console.log(`No answer data found for ${studentIdentifier}. Marking as graded with 0 points.`);
            await sb.from('student_exams').update({ total_points_awarded: 0, status: 'graded' }).eq('id', studentExamId);
            return { status: 'success', studentExamId };
        }

        const imageUrls = new Set();
        const subQuestionAnswerIdMap = new Map();

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

        const imageBlobs = new Map();
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
        console.log(`Fetched ${imageBlobs.size} unique images for ${studentIdentifier}.`);

        console.log(`Sending data to AI for grading (${studentIdentifier})...`);
        const gcfResponse = await callGradingGcf(gradingData, imageBlobs);

        await updateGradingResultsInDb(studentExamId, gcfResponse, subQuestionAnswerIdMap);
        console.log(`Saved results for ${studentIdentifier}.`);

        return { status: 'success', studentExamId };
    } catch (error) {
        console.error(`Error processing student_exam ${studentExamId}:`, error);
        return { status: 'error', studentExamId, error: error.message };
    }
}

async function fetchGradingDataForStudent(examId, studentExamId) {
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

    const { data: studentAnswers, error: answersError } = await sb
        .from('student_answers')
        .select('id, sub_question_id, answer_text, answer_visual')
        .eq('student_exam_id', studentExamId);

    if (answersError) throw answersError;

    const answersMap = new Map(studentAnswers.map(ans => [ans.sub_question_id, {
        id: ans.id,
        answer_text: ans.answer_text,
        answer_visual: ans.answer_visual
    }]));

    examBase.questions.forEach(q => {
        q.sub_questions.forEach(sq => {
            const studentAns = answersMap.get(sq.id);
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

    const allSubQuestionResults = gcfResponse.questions.flatMap(q => q.sub_questions || []);

    for (const subQResult of allSubQuestionResults) {
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
            console.warn(`GCF Error on sub-question ID ${subQResult.sub_question_id}: ${subQResult.student_answers.feedback_comment}`);
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


/**
* Starts polling the scan session for status changes
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
 * Stops the polling and clears timeouts
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
 * Checks the current status of the scan session
 */
// REPLACE the existing checkScanStatus function in exam.js with this:
async function checkScanStatus(examId) {
    if (!currentScanSessionToken) return;

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/get-scan-session?token=${currentScanSessionToken}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });

        if (!response.ok) {
            console.error('Failed to check scan status:', response.statusText);
            return;
        }

        const session = await response.json();

        if (session.status === 'uploaded') {
            setButtonText(generateScanLinkButtonText, 'Images detected!');
            stopScanPolling();

            // Animate out the QR code area
            scanLinkArea.classList.add('hiding');
            setTimeout(() => {
                scanLinkArea.classList.add('hidden');
                scanLinkArea.classList.remove('hiding'); // Reset for next time
            }, 500); // Duration should match CSS transition

            // Continue processing in the background
            await processScannedAnswers(examId);
        }

    } catch (error) {
        console.error('Error checking scan status:', error);
    }
}

/**
 * Processes the scanned answers (moved from the old button click handler)
 */
async function processScannedAnswersBackground(scanSession, examId) {
    try {
        setButtonText(generateScanLinkButtonText, 'Fetching exam...');
        const { data: examStructure, error: fetchExamError } = await sb
            .from('questions')
            .select(`question_number, sub_questions(sub_q_text_content)`)
            .eq('exam_id', examId)
            .order('question_number', { ascending: true });

        if (fetchExamError) throw fetchExamError;
        const examStructureForGcf = { questions: examStructure };

        setButtonText(generateScanLinkButtonText, 'Downloading images...');
        const formData = new FormData();
        formData.append('exam_structure', JSON.stringify(examStructureForGcf));

        const downloadPromises = scanSession.uploaded_image_paths.map(async (imageUrl) => {
            const filename = imageUrl.split('/').pop();
            const { data: imageBlob, error: downloadError } = await sb.storage
                .from(STORAGE_BUCKET)
                .download(`temp_scans/${currentScanSessionToken}/${filename}`);
            if (downloadError) {
                console.warn(`Failed to download image ${filename}: ${downloadError.message}`);
                return null;
            }
            return { filename, blob: imageBlob };
        });

        const downloadResults = await Promise.allSettled(downloadPromises);
        downloadResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                formData.append('files', result.value.blob, result.value.filename);
            }
        });

        setButtonText(generateScanLinkButtonText, 'Thinking... (may take 4 minutes)');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

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

            setButtonText(generateScanLinkButtonText, 'Parsing results...');
            const zipBlob = await gcfResponse.blob();
            const jszip = new JSZip();
            const zip = await jszip.loadAsync(zipBlob);
            const jsonFile = Object.values(zip.files).find(file => file.name.endsWith('.json') && !file.dir);
            if (!jsonFile) throw new Error('Could not find JSON in ZIP response.');
            const jsonContent = await jsonFile.async('string');
            const responseData = JSON.parse(jsonContent);

            setButtonText(generateScanLinkButtonText, 'Saving answers...');
            await saveStudentAnswersFromScan(scanSession, examId, responseData);

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

async function processScannedAnswers(examId) {
    showSpinner(true, spinnerStudent);
    setButtonText(generateScanLinkButtonText, 'Processing...');
    let isError = false;
    let scanSession;

    try {
        const sessionToken = currentScanSessionToken;
        if (!sessionToken || !examId) throw new Error('Session token and Exam ID are required');

        const { data: rpcResult, error: sessionError } = await sb
            .rpc('get_session_details_by_token', { token_arg: sessionToken });
        if (sessionError) throw new Error(`Failed to fetch session details: ${sessionError.message}`);
        scanSession = rpcResult?.[0];
        if (!scanSession) throw new Error('Scan session not found or expired.');
        if (new Date(scanSession.expires_at) < new Date()) throw new Error('Scan session has expired.');

        await sb.from('scan_sessions').update({ status: 'processing' }).eq('id', scanSession.id);

        if (!scanSession.uploaded_image_paths || scanSession.uploaded_image_paths.length === 0) {
            await sb.from('scan_sessions').update({ status: 'completed' }).eq('id', scanSession.id);
            setButtonText(generateScanLinkButtonText, 'No images uploaded.');
        } else {
            await processScannedAnswersBackground(scanSession, examId);
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
    }
}

// Function for saving student answers (migrated from Edge Function)
async function saveStudentAnswersFromScan(scanSession, examId, responseData) {
    let studentExamId;

    const { data: existingStudentExam, error: seError } = await sb
        .from('student_exams')
        .select('id')
        .eq('student_id', scanSession.student_id)
        .eq('exam_id', examId)
        .maybeSingle();

    if (seError) throw new Error(`Error finding student_exam record: ${seError.message}`);

    if (existingStudentExam) {
        studentExamId = existingStudentExam.id;
        await sb.from('student_answers').delete().eq('student_exam_id', studentExamId);
    } else {
        const { data: newStudentExam, error: createSeError } = await sb
            .from('student_exams')
            .insert({ student_id: scanSession.student_id, exam_id: examId, status: 'submitted' })
            .select('id')
            .single();
        if (createSeError) throw new Error(`Could not create student_exam record: ${createSeError.message}`);
        studentExamId = newStudentExam.id;
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
        const pathsToDelete = scanSession.uploaded_image_paths.map(url => {
            const filename = url.split('/').pop();
            return `temp_scans/${currentScanSessionToken}/${filename}`;
        });

        if (pathsToDelete.length > 0) {
            await sb.storage.from(STORAGE_BUCKET).remove(pathsToDelete);
        }
    } catch (error) {
        console.error('Failed to cleanup temp files:', error);
    }
}

window.addEventListener('beforeunload', () => {
    stopScanPolling();
});
