// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const APPENDIX_GCF_URL = 'https://add-appendix-232485517114.europe-west1.run.app';
const MODEL_GCF_URL = 'https://add-model-232485517114.europe-west1.run.app';
const STUDENT_ANSWERS_GCF_URL = 'https://add-student-answers-232485517114.europe-west1.run.app';
const GRADING_GCF_URL = 'https://generate-points-232485517114.europe-west1.run.app';
const STORAGE_BUCKET = 'exam-visuals';

// --- NEW: Supabase Edge Function URLs ---
const GENERATE_SCAN_SESSION_URL = `${SUPABASE_URL}/functions/v1/generate-scan-session`;
const PROCESS_SCANNED_SESSION_URL = `${SUPABASE_URL}/functions/v1/process-scanned-session`;
const CREATE_SUBMISSION_SESSION_URL = `${SUPABASE_URL}/functions/v1/create-submission-session`;
// Base URL for the mobile scanning page
const SCAN_PAGE_BASE_URL = `${window.location.origin}/scan.html`;

// --- SUPABASE CLIENT ---
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentScanSessionToken = null;
let scanPollingInterval = null;
let scanProcessingTimeout = null;
let currentExamData = null;

// Multi-Scan state
let currentMultiScanSession = null;
let multiScanPollingInterval = null;

// NEW: Global constants for default button texts
const DEFAULT_GRADING_BUTTON_TEXT = 'Grade New Submissions';
const DEFAULT_APPENDIX_BUTTON_TEXT = 'Upload Appendix';
const DEFAULT_MODEL_BUTTON_TEXT = 'Upload Answer Model';
const DEFAULT_SCAN_BUTTON_TEXT = 'Scan Answers';
const MULTI_SCAN_PAGE_BASE_URL = `${window.location.origin}/multi-scan.html`;

const EDIT_ICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#14110f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h-1a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-1" /><path d="M20.385 6.585a2.1 2.1 0 0 0 -2.97 -2.97l-8.415 8.385v3h3l8.385 -8.415z" /><path d="M16 5l3 3" /></svg>`;

// --- HELPER FUNCTIONS ---
/**
 * Toggle a spinner element's visibility.
 * @param {boolean} show
 * @param {HTMLElement} targetSpinner
 */
const showSpinner = (show, targetSpinner) => {
  targetSpinner.classList.toggle('hidden', !show);
};

// ADD THIS HELPER FUNCTION
// Kept for compatibility
const escapeAttr = (str) => (str || '').toString().replace(/"/g, '"');

/**
 * Generic helper to update a button's text and log.
 * @param {HTMLElement} buttonTextElement
 * @param {string} message
 */
const setButtonText = (buttonTextElement, message) => {
  if (buttonTextElement) {
    buttonTextElement.textContent = message;
  }
  console.log(`UI Status: ${message}`);
};

// Renamed for clarity
/**
 * Update the grading button status text and log.
 * @param {string} message
 */
const updateGradingButtonText = (message) => {
  if (gradeAllButtonText) {
    gradeAllButtonText.textContent = message;
  }
  console.log(`Grading Status: ${message}`);
};

/**
 * Extract a filename from a URL string.
 * @param {string} url
 * @returns {string|null}
 */
function getFilenameFromUrl(url) {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/');
    return decodeURIComponent(parts[parts.length - 1]);
  } catch (e) {
    console.error('Could not parse URL to get filename:', url, e);
    return null;
  }
}

/**
 * Wire up an input[type=file] to echo selection in a display element.
 * @param {string} inputId
 * @param {string} displayId
 */
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
