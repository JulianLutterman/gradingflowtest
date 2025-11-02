// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const APPENDIX_GCF_URL = 'https://add-appendix-232485517114.europe-west1.run.app';
const MODEL_GCF_URL = 'https://add-model-232485517114.europe-west1.run.app';
const STUDENT_ANSWERS_GCF_URL = 'https://add-student-answers-232485517114.europe-west1.run.app';
const GRADING_GCF_URL = 'https://generate-points-232485517114.europe-west1.run.app';
const BULK_BOUNDARY_GCF_URL = 'https://bulk-submission-boundaries-232485517114.europe-west1.run.app';
const STORAGE_BUCKET = 'exam-visuals';

// Gemini API (set GEMINI_API_KEY before using streaming follow-ups)
const GEMINI_API_KEY = (() => {
  if (typeof window !== 'undefined') {
    const fromWindow = window.__GEMINI_API_KEY__ || window.GEMINI_API_KEY;
    if (fromWindow) {
      return String(fromWindow);
    }
  }

  if (typeof globalThis !== 'undefined') {
    const fromGlobal = globalThis.__GEMINI_API_KEY__;
    if (fromGlobal) {
      return String(fromGlobal);
    }
  }

  if (typeof process !== 'undefined' && process.env) {
    const {
      GEMINI_API_KEY: envKey,
      NEXT_PUBLIC_GEMINI_API_KEY: nextPublicKey,
      VERCEL_GEMINI_API_KEY: vercelKey,
    } = process.env;
    const resolved = envKey || nextPublicKey || vercelKey;
    if (resolved) {
      if (typeof window !== 'undefined') {
        window.__GEMINI_API_KEY__ = resolved;
      }
      return String(resolved);
    }
  }

  return '';
})();

(function configureGeminiApiKeyAccess() {
  const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

  const state = {
    value: normalize(GEMINI_API_KEY),
    pending: null,
  };

  const assign = (value) => {
    state.value = normalize(value);

    if (state.value) {
      if (typeof window !== 'undefined') {
        window.__GEMINI_API_KEY__ = state.value;
        window.GEMINI_API_KEY = state.value;
      }
      if (typeof globalThis !== 'undefined') {
        globalThis.__GEMINI_API_KEY__ = state.value;
      }
    }

    return state.value;
  };

  assign(state.value);

  const fetchFromServer = async () => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      return '';
    }

    try {
      const response = await fetch('/api/gemini-key', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return assign('');
        }

        throw new Error(
          `Failed to retrieve Gemini API key (${response.status} ${response.statusText}).`
        );
      }

      const payload = await response.json();
      return assign(payload && payload.geminiApiKey);
    } catch (error) {
      console.error('Unable to load Gemini API key from /api/gemini-key.', error);
      throw error;
    }
  };

  globalThis.getGeminiApiKey = function getGeminiApiKey() {
    return state.value;
  };

  globalThis.ensureGeminiApiKey = async function ensureGeminiApiKey() {
    if (state.value) {
      return state.value;
    }

    if (!state.pending) {
      state.pending = fetchFromServer().finally(() => {
        state.pending = null;
      });
    }

    return state.pending;
  };
})();

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

// ... after the getFilenameFromUrl function ...

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

/**
 * Wire up an input[type=file] to echo selection in a display element.
 * @param {string} inputId
 * @param {string} displayId
 */
// ... rest of the file
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
