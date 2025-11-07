import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';

const externalScripts = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js',
];

const legacyScripts = [
  '/legacy/config.js',
  '/legacy/dom.js',
  '/legacy/helpers-fetching.js',
  '/legacy/grades-ui.js',
  '/legacy/editing-core.js',
  '/legacy/editing-mcq.js',
  '/legacy/editing-save.js',
  '/legacy/editing-mode.js',
  '/legacy/delete-handlers.js',
  '/legacy/render-exam.js',
  '/legacy/feedback-followup.js',
  '/legacy/student-view.js',
  '/legacy/appendix-model-upload.js',
  '/legacy/grading.js',
  '/legacy/scan-single.js',
  '/legacy/multi-scan-upload.js',
  '/legacy/load-exam-details.js',
  '/legacy/main.js',
];

const katexStylesheet = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

function ensureStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) {
    return () => {};
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return () => {
    document.head.removeChild(link);
  };
}

function ExamPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => ensureStylesheet(katexStylesheet), []);

  useEffect(() => {
    if (examId) {
      const search = new URLSearchParams(window.location.search);
      if (search.get('id') !== examId) {
        search.set('id', examId);
        const newUrl = `${window.location.pathname}?${search.toString()}${window.location.hash}`;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [examId]);

  const scriptList = useMemo(() => [...externalScripts, ...legacyScripts], []);

  const { status: scriptsStatus } = useLegacyScripts(scriptList, {
    active: !!user,
    onLoaded: () => {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js';
      }
      setTimeout(() => {
        document.dispatchEvent(new Event('DOMContentLoaded'));
      }, 0);
    },
  });

  useEffect(() => {
    return () => {
      window.dispatchEvent(new Event('legacy-exam-unmounted'));
    };
  }, []);

  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="page page-exam">
      <div className="container" id="title-container">
        <div className="title-wrapper">
          <div id="title-wrapper-left">
            <button
              type="button"
              className="back-button-container"
              onClick={() => navigate('/')}
              aria-label="Back to dashboard"
            >
              <svg viewBox="5 6 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 12H18M6 12L11 7M6 12L11 17" stroke="#14110F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h1 id="exam-name-title">Loading Exam...</h1>
          </div>
          <div id="title-wrapper-right">
            <div id="student-view-controls" className="student-view-controls">
              <div className="custom-dropdown" id="studentViewDropdown">
                <button type="button" className="dropdown-btn" id="studentViewBtn">
                  View All Students
                </button>
                <div className="dropdown-menu" id="studentViewMenu" />
              </div>
            </div>

            <button id="show-rules-button" className="hidden" type="button">
              Show Grading Regulations
            </button>
            <button id="show-grades-button" className="hidden pushable-button" type="button">
              Show Points
            </button>
            <button id="delete-exam-button" type="button">
              Delete Exam
            </button>
          </div>
        </div>
      </div>

      <div className="actions-grid-container">
        <div className="container">
          <h2 id="h2-bottom">Upload Answer Model</h2>
          <form id="model-form">
            <div className="form-group">
              <label htmlFor="model-files">Answer Model File(s) (PDF/Images)</label>
              <input
                type="file"
                id="model-files"
                className="file-input-hidden"
                accept=".pdf,image/*"
                multiple
                required
              />
              <label htmlFor="model-files" className="file-input-label">
                Choose Files
              </label>
              <span id="model-file-display" className="file-name-display">
                No files chosen
              </span>
            </div>
            <button className="pushable-button" type="submit" id="submit-model-button">
              <div id="spinner-model" className="spinner spinner-light hidden" />
              <span id="submit-model-button-text">Add Answer Model</span>
            </button>
          </form>
        </div>

        <div className="container">
          <h2 id="h2-bottom">Upload Appendix</h2>
          <form id="appendix-form">
            <div className="form-group">
              <label htmlFor="appendix-files">Appendix File(s) (PDF/Images)</label>
              <input
                type="file"
                id="appendix-files"
                className="file-input-hidden"
                accept=".pdf,image/*"
                multiple
                required
              />
              <label htmlFor="appendix-files" className="file-input-label">
                Choose Files
              </label>
              <span id="appendix-file-display" className="file-name-display">
                No files chosen
              </span>
            </div>
            <button className="pushable-button" type="submit" id="submit-appendix-button">
              <div id="spinner-appendix" className="spinner spinner-light hidden" />
              <span id="submit-appendix-button-text">Add Appendix</span>
            </button>
          </form>
        </div>

        <div className="container">
          <div id="h2-bottom" className="submission-header-wrapper">
            <button id="back-to-submission-choice" className="back-button-container hidden" type="button">
              <svg viewBox="5 6 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 12H18M6 12L11 7M6 12L11 17" stroke="#14110F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <h2>Upload Submissions</h2>
          </div>
          <div id="submission-choice-container">
            <button className="pushable-button" type="button" id="choose-single-student-button">
              Upload Single Submission
            </button>
            <button className="pushable-button" type="button" id="choose-multi-student-button">
              Upload Multiple Submissions
            </button>
          </div>

          <form id="student-answers-form" className="hidden">
            <div className="form-group">
              <label htmlFor="student-name">Student Full Name</label>
              <input type="text" id="student-name" placeholder="e.g., Jane Doe" />
            </div>
            <div className="form-group">
              <label htmlFor="student-number">Student Number</label>
              <input type="text" id="student-number" placeholder="e.g., s1234567" />
            </div>
            <button className="pushable-button" type="button" id="generate-scan-link-button">
              <div id="spinner-student" className="spinner spinner-light hidden" />
              <span id="generate-scan-link-button-text">Scan Answers</span>
            </button>
            <div id="scan-link-area" className="hidden">
              <p>Scan this QR code with your phone to upload answers:</p>
              <canvas id="qrcode-canvas" style={{ width: '200px', height: '200px', margin: '1rem auto', display: 'block' }} />
              <a id="scan-url" href="#" target="_blank" rel="noreferrer" />
              <p style={{ margin: '1.5rem 0 0.5rem 0', fontWeight: 'bold' }}>Or upload files directly:</p>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <input
                  type="file"
                  id="direct-upload-files"
                  className="file-input-hidden"
                  accept=".pdf,image/*"
                  multiple
                />
                <label htmlFor="direct-upload-files" className="file-input-label">
                  Choose Files to Upload
                </label>
              </div>
            </div>
          </form>
        </div>

        <button className="container pushable-button" id="grade-all-button" type="button">
          <div id="spinner-grading" className="spinner spinner-light hidden" />
          <span id="grade-all-button-text">Grade New Submissions</span>
        </button>
      </div>

      <div className="container" id="main-container">
        <div id="questions-container" />
      </div>

      <div id="rules-modal" className="modal-overlay hidden">
        <div className="modal-content">
          <span className="modal-close" id="rules-modal-close">
            ×
          </span>
          <h2>Grading Regulations</h2>
          <div id="rules-modal-text" className="formatted-text" />
        </div>
      </div>

      <div id="appendix-modal" className="modal-overlay hidden">
        <div className="modal-content">
          <span className="modal-close" id="appendix-modal-close">
            ×
          </span>
          <h2 id="appendix-modal-title">Appendix</h2>
          <div id="appendix-modal-content" className="formatted-text" />
        </div>
      </div>

      <div id="grades-modal" className="modal-overlay hidden">
        <div className="modal-content">
          <span className="modal-close" id="grades-modal-close">
            ×
          </span>
          <h2>Student Grades</h2>
          <div id="grades-modal-table-container" className="formatted-text" />
        </div>
      </div>

      <div id="multi-upload-modal" className="modal-overlay hidden">
        <div className="modal-content">
          <span className="modal-close" id="multi-upload-modal-close">
            ×
          </span>
          <h2>Upload Multiple Submissions</h2>
          <div id="multi-upload-choice-area">
            <button className="pushable-button" id="multi-scan-button" type="button">
              Scan with Phone
            </button>
            <button className="pushable-button" id="multi-direct-upload-button" type="button">
              Direct File Upload
            </button>
            <button className="pushable-button" id="multi-bulk-upload-button" type="button">
              Single Bulk PDF Upload
            </button>
          </div>

          <div id="multi-scan-area" className="hidden">
            <div className="modal-section-header">
              <button className="back-button-container modal-back-button back-to-multi-choice-btn" type="button">
                <svg viewBox="5 6 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 12H18M6 12L11 7M6 12L11 17" stroke="#14110F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <h3>Scan with Phone</h3>
            </div>
            <div id="multi-scan-table-container" />
            <button className="add-row-btn" id="multi-scan-add-row-button" type="button">
              Add Row
            </button>
            <div id="multi-scan-qr-area" className="hidden">
              <p>Scan this QR code with your phone to begin scanning for all students:</p>
              <canvas id="multi-qrcode-canvas" />
              <a id="multi-scan-url" href="#" target="_blank" rel="noreferrer" />
            </div>
            <button className="pushable-button" id="multi-scan-start-button" type="button">
              Start Scanning Session
            </button>
            <button className="pushable-button hidden" id="multi-scan-process-button" type="button">
              <div id="spinner-multi-process" className="spinner spinner-light hidden" />
              <span id="multi-scan-process-button-text">Process All Submissions</span>
            </button>
          </div>

          <div id="multi-direct-upload-area" className="hidden">
            <div className="modal-section-header">
              <button className="back-button-container modal-back-button back-to-multi-choice-btn" type="button">
                <svg viewBox="5 6 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 12H18M6 12L11 7M6 12L11 17" stroke="#14110F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <h3>Direct File Upload</h3>
            </div>
            <div id="multi-direct-upload-table-container" />
            <button className="add-row-btn" id="multi-direct-add-row-button" type="button">
              Add Row
            </button>
            <button className="pushable-button" id="multi-direct-process-button" type="button">
              <div id="spinner-multi-direct-process" className="spinner spinner-light hidden" />
              <span id="multi-direct-process-button-text">Process All Submissions</span>
            </button>
          </div>

          <div id="multi-bulk-upload-area" className="hidden">
            <div className="modal-section-header">
              <button className="back-button-container modal-back-button back-to-multi-choice-btn" type="button">
                <svg viewBox="5 6 14 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 12H18M6 12L11 7M6 12L11 17" stroke="#14110F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <h3>Bulk PDF Upload</h3>
            </div>
            <div className="bulk-upload-file-picker">
              <input type="file" id="bulk-pdf-input" className="file-input-hidden" accept=".pdf" />
              <label htmlFor="bulk-pdf-input" className="file-input-label" id="bulk-pdf-input-label">
                Choose Bulk PDF
                <p className="file-input-helper-text">
                  Upload a single PDF that contains all student submissions in order.
                </p>
              </label>
            </div>
            <div id="multi-bulk-upload-table-container" />
            <button className="add-row-btn" id="multi-bulk-add-row-button" type="button">
              Add Row
            </button>
            <button className="pushable-button" id="multi-bulk-process-button" type="button">
              <div id="spinner-multi-bulk-process" className="spinner spinner-light hidden" />
              <span id="multi-bulk-process-button-text">Process Bulk PDF</span>
            </button>
          </div>
        </div>
      </div>

      <div id="editing-locked-modal" className="modal-overlay hidden">
        <div className="modal-content confirm-modal-content">
          <span className="modal-close" id="editing-locked-modal-close">
            ×
          </span>
          <h3>Action Unavailable</h3>
          <p id="editing-locked-modal-text">
            Uploads or score generation are currently in progress. Please wait until they finish before editing, deleting, or adding items.
          </p>
          <div className="confirm-modal-actions">
            <button id="editing-locked-modal-understood-btn" className="save-btn" type="button">
              Understood
            </button>
          </div>
        </div>
      </div>

      <div id="confirm-modal" className="modal-overlay hidden">
        <div className="modal-content confirm-modal-content">
          <span className="modal-close" id="confirm-modal-close">
            ×
          </span>
          <h3 id="confirm-modal-title">Confirm Action</h3>
          <p id="confirm-modal-text">Are you sure?</p>
          <div className="confirm-modal-actions">
            <button id="confirm-modal-cancel-btn" className="cancel-btn" type="button">
              Cancel
            </button>
            <button id="confirm-modal-confirm-btn" className="save-btn danger" type="button">
              Confirm
            </button>
          </div>
        </div>
      </div>

      {scriptsStatus === 'loading' && (
        <div className="container" style={{ marginTop: '2rem' }}>
          Initialising exam workspace…
        </div>
      )}
      {scriptsStatus === 'error' && (
        <div className="container" style={{ marginTop: '2rem', color: 'red' }}>
          Failed to load legacy exam scripts. Please reload the page.
        </div>
      )}
    </div>
  );
}

export default ExamPage;
