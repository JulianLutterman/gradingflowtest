// --- DOM ELEMENTS ---
const examNameTitle = document.getElementById('exam-name-title');
const questionsContainer = document.getElementById('questions-container');
// Appendix Form
const appendixForm = document.getElementById('appendix-form');
const submitAppendixButton = document.getElementById('submit-appendix-button');
const submitAppendixButtonText = document.getElementById('submit-appendix-button-text');
const spinnerAppendix = document.getElementById('spinner-appendix');
// Model Form
const modelForm = document.getElementById('model-form');
const submitModelButton = document.getElementById('submit-model-button');
const submitModelButtonText = document.getElementById('submit-model-button-text');
const spinnerModel = document.getElementById('spinner-model');
// Modals
const rulesModal = document.getElementById('rules-modal');
const rulesModalText = document.getElementById('rules-modal-text');
const rulesModalClose = document.getElementById('rules-modal-close');
const appendixModal = document.getElementById('appendix-modal');
const appendixModalContent = document.getElementById('appendix-modal-content');
const appendixModalClose = document.getElementById('appendix-modal-close');
const showGradesButton = document.getElementById('show-grades-button');
const gradesModal = document.getElementById('grades-modal');
const gradesModalTableContainer = document.getElementById('grades-modal-table-container');
const gradesModalClose = document.getElementById('grades-modal-close');
// Student Answers Form
const studentAnswersForm = document.getElementById('student-answers-form');
const generateScanLinkButton = document.getElementById('generate-scan-link-button');
const generateScanLinkButtonText = document.getElementById('generate-scan-link-button-text');
const scanLinkArea = document.getElementById('scan-link-area');
const qrcodeCanvas = document.getElementById('qrcode-canvas');
const scanUrlLink = document.getElementById('scan-url');
const spinnerStudent = document.getElementById('spinner-student');
const directUploadInput = document.getElementById('direct-upload-files');
// Grading Elements
const gradeAllButton = document.getElementById('grade-all-button');
const gradeAllButtonText = document.getElementById('grade-all-button-text');
const spinnerGrading = document.getElementById('spinner-grading');

// Multi-Scan
const submissionChoiceContainer = document.getElementById('submission-choice-container');
const chooseSingleStudentButton = document.getElementById('choose-single-student-button');
const chooseMultiStudentButton = document.getElementById('choose-multi-student-button');
const multiUploadModal = document.getElementById('multi-upload-modal');
const multiUploadModalClose = document.getElementById('multi-upload-modal-close');
const multiUploadChoiceArea = document.getElementById('multi-upload-choice-area');
const multiScanButton = document.getElementById('multi-scan-button');
const multiDirectUploadButton = document.getElementById('multi-direct-upload-button');
const multiBulkUploadButton = document.getElementById('multi-bulk-upload-button');
const multiScanArea = document.getElementById('multi-scan-area');
const multiScanTableContainer = document.getElementById('multi-scan-table-container');
const multiScanAddRowButton = document.getElementById('multi-scan-add-row-button');
const multiScanStartButton = document.getElementById('multi-scan-start-button');
const multiScanQrArea = document.getElementById('multi-scan-qr-area');
const multiQrcodeCanvas = document.getElementById('multi-qrcode-canvas');
const multiScanUrlLink = document.getElementById('multi-scan-url');
const multiScanProcessButton = document.getElementById('multi-scan-process-button');
const spinnerMultiProcess = document.getElementById('spinner-multi-process');
const multiScanProcessButtonText = document.getElementById('multi-scan-process-button-text');
const multiDirectUploadArea = document.getElementById('multi-direct-upload-area');
const multiDirectUploadTableContainer = document.getElementById('multi-direct-upload-table-container');
const multiDirectAddRowButton = document.getElementById('multi-direct-add-row-button');
const multiDirectProcessButton = document.getElementById('multi-direct-process-button');
const spinnerMultiDirectProcess = document.getElementById('spinner-multi-direct-process');
const multiDirectProcessButtonText = document.getElementById('multi-direct-process-button-text');
const multiBulkUploadArea = document.getElementById('multi-bulk-upload-area');
const multiBulkUploadTableContainer = document.getElementById('multi-bulk-upload-table-container');
const multiBulkAddRowButton = document.getElementById('multi-bulk-add-row-button');
const multiBulkProcessButton = document.getElementById('multi-bulk-process-button');
const spinnerMultiBulkProcess = document.getElementById('spinner-multi-bulk-process');
const multiBulkProcessButtonText = document.getElementById('multi-bulk-process-button-text');
const bulkPdfInput = document.getElementById('bulk-pdf-input');
const bulkPdfInputLabel = document.getElementById('bulk-pdf-input-label');
const backToSubmissionChoice = document.getElementById('back-to-submission-choice');
