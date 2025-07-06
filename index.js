// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const GCF_URL = 'https://exam-structurer-232485517114.europe-west1.run.app';
const STORAGE_BUCKET = 'exam-visuals';

// --- SUPABASE CLIENT ---
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM ELEMENTS ---
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginView = document.getElementById('login-view');
const signupView = document.getElementById('signup-view');
const showSignup = document.getElementById('show-signup');
const showLogin = document.getElementById('show-login');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const logoutButton = document.getElementById('logout-button');
const userEmailSpan = document.getElementById('user-email');
const examForm = document.getElementById('exam-form');
const submitExamButton = document.getElementById('submit-exam-button');
// NEW DOM ELEMENTS for button state
const submitExamButtonText = document.getElementById('submit-exam-button-text');
const spinnerExam = document.getElementById('spinner-exam');
// Exam List DOM Elements
const examListSection = document.getElementById('exam-list-section');
const examCardsContainer = document.getElementById('exam-cards-container');

// --- CONSTANTS ---
const DEFAULT_EXAM_BUTTON_TEXT = 'Process and Upload Exam';

// --- HELPER FUNCTIONS ---
// NEW: Helper to update the button's text
const setButtonText = (message) => {
    if (submitExamButtonText) {
        submitExamButtonText.textContent = message;
    }
    console.log(`UI Status: ${message}`);
};

// NEW: Helper to show/hide the spinner inside the button
const showExamSpinner = (show) => {
    spinnerExam.classList.toggle('hidden', !show);
};


// --- NEW: EXAM LISTING FUNCTION ---
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
        const card = document.createElement('a');
        card.href = `exam.html?id=${exam.id}`;
        card.className = 'exam-card';
        card.innerHTML = `
            <h3>${exam.exam_name}</h3>
            <p>Uploaded on: ${new Date(exam.created_at).toLocaleDateString()}</p>
        `;
        examCardsContainer.appendChild(card);
    });
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

// --- AUTHENTICATION LOGIC ---
showSignup.addEventListener('click', () => {
    loginView.classList.add('hidden');
    signupView.classList.remove('hidden');
});

showLogin.addEventListener('click', () => {
    signupView.classList.add('hidden');
    loginView.classList.remove('hidden');
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
    });

    if (error) {
        alert(`Signup Error: ${error.message}`);
    } else {
        alert('Signup successful! Please check your email to verify your account.');
        signupForm.reset();
        showLogin.click();
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) alert(`Login Error: ${error.message}`);
    else loginForm.reset();
});

logoutButton.addEventListener('click', async () => {
    await sb.auth.signOut();
});

// Listen for auth state changes
sb.auth.onAuthStateChange((event, session) => {
    if (session) {
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        examListSection.classList.remove('hidden'); // Show exam list
        userEmailSpan.textContent = session.user.email;
        loadExams(); // Load exams on login
    } else {
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        examListSection.classList.add('hidden'); // Hide exam list
        userEmailSpan.textContent = '';
        examCardsContainer.innerHTML = ''; // Clear exams on logout
    }
});

// --- EXAM PROCESSING LOGIC (REFACTORED) ---
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
        isError = true; // Treat this as an error for the finally block
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
        await loadExams(); // Refresh the exam list

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

async function uploadExamToSupabase(teacherId, examName, examData, zip, setButtonText) {
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
                const filePath = `public/${examId}/${Date.now()}_${q.context_visual}`;
                const fileBlob = await visualFile.async('blob');
                const fileExtension = q.context_visual.split('.').pop().toLowerCase();
                const mimeType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
                const fileToUpload = new File([fileBlob], q.context_visual, { type: mimeType });

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
                context_visual: contextVisualUrl,
                extra_comment: q.extra_comment
            })
            .select('id')
            .single();

        if (questionError) throw new Error(`Failed to insert question ${q.question_number}: ${questionError.message}`);
        const questionId = question.id;

        if (q.sub_questions) {
            for (const sq of q.sub_questions) {
                const { data: subQuestion, error: subQError } = await sb
                    .from('sub_questions')
                    .insert({
                        question_id: questionId,
                        sub_q_text_content: sq.sub_q_text_content,
                        max_sub_points: sq.max_sub_points,
                    })
                    .select('id')
                    .single();

                if (subQError) throw new Error(`Failed to insert sub-question: ${subQError.message}`);
                const subQuestionId = subQuestion.id;

                if (sq.mcq_options) {
                    const mcqOptionsToInsert = sq.mcq_options.map(opt => ({
                        sub_question_id: subQuestionId,
                        mcq_letter: opt.mcq_letter,
                        mcq_content: opt.mcq_content
                    }));
                    const { error: mcqError } = await sb.from('mcq_options').insert(mcqOptionsToInsert);
                    if (mcqError) throw new Error(`Failed to insert MCQ options: ${mcqError.message}`);
                }
            }
        }
    }
}

// --- MAIN LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
    setupFileInputFeedback('exam-files', 'exam-file-display');
});