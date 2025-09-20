// =================================================================
// --- INLINE EDITING WORKFLOW (enhanced with add/insert flows) ---
// =================================================================

/** tiny helper */
function _rand() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// -----------------------------------------------------------------
// --- INLINE EDIT SESSION TRACKING / REFRESH COORDINATION HELPERS ---
// -----------------------------------------------------------------

const activeEditContainers = new Set();
let activeInlineEditCount = 0;
const activeProcessLocks = new Set();
let cachedEditLockModal = null;

function getEditLockModalElements() {
    if (cachedEditLockModal) return cachedEditLockModal;
    const modal = document.getElementById('editing-locked-modal');
    if (!modal) {
        cachedEditLockModal = null;
        return null;
    }

    cachedEditLockModal = {
        modal,
        closeIcon: modal.querySelector('#editing-locked-modal-close'),
        confirmButton: modal.querySelector('#editing-locked-modal-understood-btn'),
        messageEl: modal.querySelector('#editing-locked-modal-text'),
    };

    return cachedEditLockModal;
}

function showEditingLockedModal(message = 'Uploads or score generation are currently in progress. Please wait until they finish before editing, deleting, or adding items.') {
    const elements = getEditLockModalElements();
    if (!elements) {
        window.alert(message);
        return;
    }

    const { modal, closeIcon, confirmButton, messageEl } = elements;
    if (messageEl) {
        messageEl.textContent = message;
    }

    modal.classList.remove('hidden');

    const controller = new AbortController();
    const { signal } = controller;
    const hide = () => {
        modal.classList.add('hidden');
        controller.abort();
    };

    if (closeIcon) closeIcon.addEventListener('click', hide, { signal });
    if (confirmButton) confirmButton.addEventListener('click', hide, { signal });
    modal.addEventListener('click', (event) => {
        if (event.target === modal) hide();
    }, { signal });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hide();
    }, { signal });
}

function isUploadOrGradingInProgress() {
    return activeProcessLocks.size > 0;
}

function requireEditsUnlocked() {
    if (!isUploadOrGradingInProgress()) {
        return true;
    }
    showEditingLockedModal();
    return false;
}

function closeAllActiveEdits(reason = 'cancel') {
    if (!activeEditContainers.size) return;
    const containers = Array.from(activeEditContainers);
    containers.forEach((container) => {
        try {
            toggleEditMode(container, false, undefined, null, { reason });
        } catch (error) {
            console.warn('Failed to close edit container:', error);
        }
    });
}

function enterProcessingLock(type) {
    const key = type || `process-${Date.now()}`;
    const wasInactive = activeProcessLocks.size === 0;
    activeProcessLocks.add(key);
    if (wasInactive) {
        closeAllActiveEdits('cancel');
    }
    return key;
}

function exitProcessingLock(type) {
    if (!type) return;
    activeProcessLocks.delete(type);
}

function hasOwnDatasetProp(el, key) {
    return !!el && Object.prototype.hasOwnProperty.call(el.dataset || {}, key);
}

function normalizeEditableValue(raw) {
    if (raw === null || raw === undefined) return '';
    return String(raw).replace(/\r\n/g, '\n');
}

const STUDENT_PLACEHOLDER_TEXT = 'Student has not attempted to answer this sub question';

function setOriginalTextDataset(el, value) {
    if (!el) return;
    const normalized = value === undefined || value === null ? '' : String(value);
    try {
        el.dataset.originalText = JSON.stringify(normalized);
    } catch {
        el.dataset.originalText = JSON.stringify(String(normalized));
    }
}

function findSubQuestionIdForStudentDetails(details) {
    if (!details) return null;
    if (details.dataset?.subQuestionId) return details.dataset.subQuestionId;
    const studentCell = details.closest('.grid-cell');
    if (studentCell?.dataset?.subQuestionId) return studentCell.dataset.subQuestionId;
    let walker = studentCell?.previousElementSibling || null;
    while (walker) {
        if (walker.dataset?.subQuestionId) return walker.dataset.subQuestionId;
        walker = walker.previousElementSibling;
    }
    return null;
}

function applyStudentDetailsUpdates({ studentId = null, token = null, answersData = [], fullName, studentNumber } = {}) {
    if (!questionsContainer) return;
    const selector = token
        ? `.student-answer-dropdown[data-new-student-token="${token}"]`
        : (studentId ? `.student-answer-dropdown[data-student-id="${studentId}"]` : '.student-answer-dropdown');
    const detailsList = questionsContainer.querySelectorAll(selector);
    if (!detailsList.length) {
        if (token) {
            const originBtn = questionsContainer.querySelector(`.add-student-btn[data-new-student-token="${token}"]`);
            if (originBtn) {
                originBtn.classList.remove('hidden');
                delete originBtn.dataset.newStudentToken;
            }
        }
        return;
    }

    const answersBySub = new Map();
    if (Array.isArray(answersData)) {
        answersData.forEach((row) => {
            if (row && row.sub_question_id) {
                answersBySub.set(String(row.sub_question_id), row);
            }
        });
    }

    const normalizedName = fullName !== undefined ? normalizeEditableValue(fullName ?? '') : undefined;
    const normalizedNumber = studentNumber !== undefined ? normalizeEditableValue(studentNumber ?? '') : undefined;

    detailsList.forEach((details) => {
        if (studentId !== null && studentId !== undefined) {
            details.dataset.studentId = String(studentId);
        }
        if (token) {
            delete details.dataset.newStudentToken;
        }

        const summaryBtn = details.querySelector('.edit-btn[data-edit-target="student_info"]');
        if (summaryBtn) {
            if (studentId !== null && studentId !== undefined) {
                summaryBtn.dataset.studentId = String(studentId);
            }
            if (token) {
                delete summaryBtn.dataset.newStudentToken;
            }
        }

        const nameEl = details.querySelector('[data-editable="full_name"]');
        if (nameEl && normalizedName !== undefined) {
            setOriginalTextDataset(nameEl, normalizedName);
            if (nameEl.querySelector('.editable-input')) {
                stagePendingDisplay(nameEl, 'full_name', normalizedName);
            } else {
                nameEl.textContent = normalizedName;
            }
        }

        const numberEl = details.querySelector('[data-editable="student_number"]');
        if (numberEl && normalizedNumber !== undefined) {
            setOriginalTextDataset(numberEl, normalizedNumber);
            const displayNumber = normalizedNumber || 'No number';
            if (numberEl.querySelector('.editable-input')) {
                stagePendingDisplay(numberEl, 'student_number', displayNumber);
            } else {
                numberEl.textContent = displayNumber;
            }
        }

        const subId = findSubQuestionIdForStudentDetails(details);
        if (subId) {
            details.dataset.subQuestionId = String(subId);
        }
        const answerRow = subId ? answersBySub.get(String(subId)) : null;
        const answerItem = details.querySelector('.student-answer-item');
        if (!answerItem) return;

        if (answerRow?.id) {
            answerItem.dataset.answerId = String(answerRow.id);
        }

        let editBtn = answerItem.querySelector('.edit-btn[data-edit-target="student_answer"]');
        if (answerRow?.id) {
            if (!editBtn) {
                editBtn = document.createElement('button');
                editBtn.id = 'student-answer-edit-btn';
                editBtn.className = 'edit-btn';
                editBtn.dataset.editTarget = 'student_answer';
                editBtn.dataset.answerId = String(answerRow.id);
                editBtn.innerHTML = EDIT_ICON_SVG;
                answerItem.insertBefore(editBtn, answerItem.firstChild);
            } else {
                editBtn.dataset.answerId = String(answerRow.id);
            }
        }

        // Remove any static placeholder text nodes we injected during staging
        answerItem.querySelectorAll(':scope > p.formatted-text:not([data-editable])').forEach((placeholder) => {
            placeholder.remove();
        });

        let answerTextEl = answerItem.querySelector('[data-editable="answer_text"]');
        if (!answerTextEl) {
            answerTextEl = document.createElement('p');
            answerTextEl.className = 'formatted-text';
            answerTextEl.dataset.editable = 'answer_text';
            answerItem.appendChild(answerTextEl);
        } else {
            answerTextEl.dataset.editable = 'answer_text';
        }

        const rawAnswer = answerRow?.answer_text ?? '';
        const normalizedAnswer = normalizeEditableValue(rawAnswer);
        const displayAnswer = normalizedAnswer || STUDENT_PLACEHOLDER_TEXT;
        answerTextEl.textContent = displayAnswer;
        setOriginalTextDataset(answerTextEl, normalizedAnswer);
    });

    if (token) {
        const originBtn = questionsContainer.querySelector(`.add-student-btn[data-new-student-token="${token}"]`);
        if (originBtn) {
            originBtn.classList.remove('hidden');
            delete originBtn.dataset.newStudentToken;
        }
    }
}



function stagePendingDisplay(el, fieldType, rawValue) {
    if (!el) return;

    const normalized = normalizeEditableValue(rawValue);
    el.dataset.pendingDisplayValue = normalized;

    switch (fieldType) {
        case 'grading_regulations':
            el.dataset.pendingDisplayFormat = 'markdown';
            break;
        case 'component_points':
        case 'sub_points_awarded':
            el.dataset.pendingDisplayFormat = 'number';
            break;
        default:
            delete el.dataset.pendingDisplayFormat;
            break;
    }
}

function applyPendingDisplay(el) {
    if (!hasOwnDatasetProp(el, 'pendingDisplayValue')) {
        return false;
    }

    const value = el.dataset.pendingDisplayValue;
    const format = el.dataset.pendingDisplayFormat || 'text';

    if (format === 'markdown' && typeof marked === 'object' && typeof marked.parse === 'function') {
        el.innerHTML = marked.parse(value);
    } else if (format === 'number') {
        el.textContent = value;
    } else if (format === 'html') {
        el.innerHTML = value;
    } else {
        el.textContent = value;
    }

    delete el.dataset.pendingDisplayValue;
    delete el.dataset.pendingDisplayFormat;
    if (el.hasAttribute('data-original-value')) {
        el.removeAttribute('data-original-value');
    }
    return true;
}

function markContainerEditing(container, isEditing) {
    if (!container) return;

    const isTracked = activeEditContainers.has(container);

    if (isEditing && !isTracked) {
        activeEditContainers.add(container);
        activeInlineEditCount += 1;
    } else if (!isEditing && isTracked) {
        activeEditContainers.delete(container);
        activeInlineEditCount = Math.max(0, activeInlineEditCount - 1);
    }
}
window.isEditSessionActive = () => activeInlineEditCount > 0;
window.requireEditsUnlocked = requireEditsUnlocked;
window.showEditingLockedModal = showEditingLockedModal;
window.enterProcessingLock = enterProcessingLock;
window.exitProcessingLock = exitProcessingLock;
window.isUploadOrGradingInProgress = isUploadOrGradingInProgress;
window.closeAllActiveEdits = closeAllActiveEdits;
