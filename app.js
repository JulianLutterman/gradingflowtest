// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const GCF_URL = 'https://exam-structurer-232485517114.europe-west1.run.app';
const STORAGE_BUCKET = 'exam-visuals';

// --- SUPABASE CLIENT ---
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM ELEMENTS ---
const logoutButton = document.getElementById('logout-button');
const userEmailSpan = document.getElementById('user-email');
const examForm = document.getElementById('exam-form');
const submitExamButton = document.getElementById('submit-exam-button');
const submitExamButtonText = document.getElementById('submit-exam-button-text');
const spinnerExam = document.getElementById('spinner-exam');
const examCardsContainer = document.getElementById('exam-cards-container');
const confirmModal = document.getElementById('confirm-modal');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalText = document.getElementById('confirm-modal-text');
const confirmModalConfirmBtn = document.getElementById('confirm-modal-confirm-btn');
const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');
const confirmModalCloseBtn = document.getElementById('confirm-modal-close');

// --- CONSTANTS ---
const DEFAULT_EXAM_BUTTON_TEXT = 'Process and Upload Exam';

// ADD THIS FUNCTION
/**
 * Sanitizes a filename by replacing spaces and %20 with underscores.
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
    if (!filename) return '';
    // Replaces one or more whitespace characters or "%20" with a single underscore
    return filename.replace(/[\s%20]+/g, '_');
}

// --- HELPER FUNCTIONS ---
const setButtonText = (message) => {
    if (submitExamButtonText) submitExamButtonText.textContent = message;
    console.log(`UI Status: ${message}`);
};

const showExamSpinner = (show) => {
    spinnerExam.classList.toggle('hidden', !show);
};

function setupFileInputFeedback(inputId, displayId) {
    const fileInput = document.getElementById(inputId);
    const fileDisplay = document.getElementById(displayId);
    if (fileInput && fileDisplay) {
        fileInput.addEventListener('change', () => {
            const files = fileInput.files;
            if (files.length > 1) fileDisplay.textContent = `${files.length} files selected`;
            else if (files.length === 1) fileDisplay.textContent = files[0].name;
            else fileDisplay.textContent = 'No files chosen';
        });
    }
}

function makeTrashButton(className = 'exam-delete-btn', title = 'Delete exam') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `
        <!--
        category: System
        tags: [bin, litter, recycle, remove, delete, throw, away, waste]
        version: "1.46"
        unicode: "ef88"
        -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#14110f"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 7h16" />
          <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
          <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
          <path d="M10 12l4 4m0 -4l-4 4" />
        </svg>
    `;
    return button;
}

function showConfirmModal(message, title = 'Confirm Action') {
    return new Promise((resolve) => {
        if (!confirmModal || !confirmModalTitle || !confirmModalText || !confirmModalConfirmBtn || !confirmModalCancelBtn || !confirmModalCloseBtn) {
            console.error('Confirmation modal elements missing. Falling back to native confirm dialog.');
            resolve(window.confirm(message));
            return;
        }

        confirmModalTitle.textContent = title;
        confirmModalText.textContent = message;
        confirmModal.classList.remove('hidden');

        const controller = new AbortController();
        const { signal } = controller;

        const close = (result) => {
            confirmModal.classList.add('hidden');
            controller.abort();
            resolve(result);
        };

        confirmModalConfirmBtn.addEventListener('click', () => close(true), { signal });
        confirmModalCancelBtn.addEventListener('click', () => close(false), { signal });
        confirmModalCloseBtn.addEventListener('click', () => close(false), { signal });
        confirmModal.addEventListener('click', (event) => {
            if (event.target === confirmModal) close(false);
        }, { signal });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') close(false);
        }, { signal });
    });
}

// --- AUTH STATE & DATA LOADING ---
// Check auth state when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session }, error } = await sb.auth.getSession();

    if (error || !session) {
        // If there's an error or no session, redirect to login
        window.location.href = 'login.html';
        return; // Stop further execution
    }

    // If session exists, setup the page
    userEmailSpan.textContent = session.user.email;
    await loadExams();
    setupFileInputFeedback('exam-files', 'exam-file-display');
});

// Listen for sign-out events
sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        window.location.href = 'login.html';
    }
});

logoutButton.addEventListener('click', async () => {
    await sb.auth.signOut();
});

// --- EXAM LISTING FUNCTION ---
async function loadExams() {
    examCardsContainer.innerHTML = '<p>Loading exams...</p>';
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { data: exams, error } = await sb
        .from('exams')
        .select('id, exam_name, created_at')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        examCardsContainer.innerHTML = `<p style="color: red;">Error loading exams: ${error.message}</p>`;
        return;
    }

    if (exams.length === 0) {
        examCardsContainer.innerHTML = '<p>You have not uploaded any exams yet.</p>';
        return;
    }

    examCardsContainer.innerHTML = ''; // Clear loading message
    exams.forEach(exam => {
        const card = document.createElement('article');
        card.className = 'exam-card';

        const deleteBtn = makeTrashButton();
        deleteBtn.dataset.examId = exam.id;
        deleteBtn.dataset.examName = exam.exam_name;
        card.appendChild(deleteBtn);

        const link = document.createElement('a');
        link.href = `exam.html?id=${exam.id}`;
        link.className = 'exam-card-link';

        const title = document.createElement('h3');
        title.textContent = exam.exam_name;
        const uploaded = document.createElement('p');
        uploaded.textContent = `Uploaded on: ${new Date(exam.created_at).toLocaleDateString()}`;

        link.appendChild(title);
        link.appendChild(uploaded);

        card.appendChild(link);
        examCardsContainer.appendChild(card);
    });
}

// --- EXAM PROCESSING LOGIC ---
examForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitExamButton.disabled = true;
    showExamSpinner(true);
    setButtonText('Starting...');
    let isError = false;

    const examName = document.getElementById('exam-name').value;
    const files = document.getElementById('exam-files').files;

    if (!examName || files.length === 0) {
        alert('Please provide an exam name and at least one file.');
        isError = true;
    }

    try {
        if (isError) throw new Error("Form validation failed.");

        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error("User not authenticated.");
        setButtonText('Authenticated...');

        setButtonText('Thinking... (~2 mins)');
        const formData = new FormData();
        for (const file of files) {
            formData.append('files', file);
        }

        const gcfResponse = await fetch(GCF_URL, {
            method: 'POST',
            body: formData,
        });

        if (!gcfResponse.ok) {
            throw new Error(`Cloud function failed with status: ${gcfResponse.statusText}`);
        }

        setButtonText('Unzipping results...');
        const zipBlob = await gcfResponse.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(zipBlob);

        const jsonFile = Object.values(zip.files).find(file => file.name.endsWith('.json'));
        if (!jsonFile) throw new Error("No JSON file found in the returned zip.");

        const jsonContent = await jsonFile.async('string');
        const examData = JSON.parse(jsonContent);
        setButtonText('Parsed exam data...');

        await uploadExamToSupabase(user.id, examName, examData, zip, setButtonText);

        setButtonText('Refreshing list...');
        examForm.reset();
        document.getElementById('exam-file-display').textContent = 'No files chosen'; // Reset file display
        await loadExams();

    } catch (error) {
        isError = true;
        setButtonText('Error! See console.');
        console.error(`An error occurred: ${error.message}`);
        console.error(error);
    } finally {
        if (!isError) {
            setButtonText('Success!');
        }
        showExamSpinner(false);
        setTimeout(() => {
            submitExamButton.disabled = false;
            setButtonText(DEFAULT_EXAM_BUTTON_TEXT);
        }, isError ? 5000 : 3000);
    }
});

examCardsContainer.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.exam-delete-btn');
    if (!deleteBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const examId = deleteBtn.dataset.examId;
    if (!examId) return;

    const examName = (deleteBtn.dataset.examName || '').trim();
    const confirmed = await showConfirmModal(
        `Delete the exam${examName ? ` "${examName}"` : ''} and all associated questions, student submissions, and scans? This cannot be undone.`,
        'Delete Exam',
    );
    if (!confirmed) return;

    deleteBtn.disabled = true;
    try {
        const { error } = await sb.rpc('delete_exam_cascade', { p_exam_id: examId });
        if (error) throw error;
        await loadExams();
    } catch (rpcError) {
        console.error('Failed to delete exam:', rpcError);
        alert('Failed to delete the exam. Please try again.');
    } finally {
        deleteBtn.disabled = false;
    }
});

async function uploadExamToSupabase(teacherId, examName, examData, zip, setButtonText) {
    // This function remains the same as in your original code
    const maxTotalPoints = examData.exam.questions.reduce((sum, q) => sum + (q.max_total_points || 0), 0);
    setButtonText('Creating exam entry...');
    const { data: exam, error: examError } = await sb
        .from('exams')
        .insert({
            teacher_id: teacherId,
            exam_name: examName,
            max_total_points: maxTotalPoints
        })
        .select('id')
        .single();

    if (examError) throw new Error(`Failed to create exam record: ${examError.message}`);
    const examId = exam.id;
    setButtonText(`Saving exam (ID: ${examId})...`);

    for (const [index, q] of examData.exam.questions.entries()) {
        setButtonText(`Saving Q#${q.question_number} (${index + 1}/${examData.exam.questions.length})`);
        let contextVisualUrl = null;

        if (q.context_visual) {
            const visualFile = zip.file(q.context_visual);
            if (visualFile) {
                const sanitizedFilename = sanitizeFilename(q.context_visual);
                const filePath = `public/${examId}/${Date.now()}_${sanitizedFilename}`;
                const fileBlob = await visualFile.async('blob');
                const fileExtension = q.context_visual.split('.').pop().toLowerCase();
                const mimeType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
                const fileToUpload = new File([fileBlob], sanitizedFilename, { type: mimeType });

                const { error: uploadError } = await sb.storage
                    .from(STORAGE_BUCKET)
                    .upload(filePath, fileToUpload);

                if (uploadError) throw new Error(`Failed to upload ${q.context_visual}: ${uploadError.message}`);

                const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
                contextVisualUrl = urlData.publicUrl;
            } else {
                console.warn(`Warning: Visual file ${q.context_visual} not found in zip.`);
            }
        }

        const { data: question, error: questionError } = await sb
            .from('questions')
            .insert({
                exam_id: examId,
                question_number: q.question_number,
                max_total_points: q.max_total_points,
                context_text: q.context_text,
                orig_llm_context_text: q.context_text,
                context_visual: contextVisualUrl,
                extra_comment: q.extra_comment,
                orig_llm_extra_comment: q.extra_comment
            })
            .select('id')
            .single();

        if (questionError) throw new Error(`Failed to insert question ${q.question_number}: ${questionError.message}`);
        const questionId = question.id;

        if (q.sub_questions) {
            // Establish a fallback counter if the JSON doesn't include sub_question_order
            let fallbackOrder = 1;

            for (const sq of q.sub_questions) {
                const subQuestionOrder = Number.isFinite(+sq.sub_question_order) ? +sq.sub_question_order : fallbackOrder++;

                const { data: subQuestion, error: subQError } = await sb
                    .from('sub_questions')
                    .insert({
                        question_id: questionId,
                        sub_q_text_content: sq.sub_q_text_content,
                        orig_llm_sub_q_text_content: sq.sub_q_text_content,
                        max_sub_points: sq.max_sub_points,
                        sub_question_order: subQuestionOrder,
                    })
                    .select('id')
                    .single();

                if (subQError) throw new Error(`Failed to insert sub-question: ${subQError.message}`);
                const subQuestionId = subQuestion.id;

                if (sq.mcq_options) {
                    const mcqOptionsToInsert = sq.mcq_options.map(opt => ({
                        sub_question_id: subQuestionId,
                        mcq_letter: opt.mcq_letter,
                        mcq_content: opt.mcq_content,
                        orig_llm_mcq_content: opt.mcq_content
                    }));
                    const { error: mcqError } = await sb.from('mcq_options').insert(mcqOptionsToInsert);
                    if (mcqError) throw new Error(`Failed to insert MCQ options: ${mcqError.message}`);
                }
            }
        }
    }

}
