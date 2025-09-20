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

/**
 * Delegated click handler for inline edit buttons.
 * @param {MouseEvent} event
 */
async function handleEditClick(event) {
    const editButton = event.target.closest('.edit-btn');
    if (!editButton) return;

    if (!requireEditsUnlocked()) return;

    const targetType = editButton.dataset.editTarget;
    let container;
    let fields = null;

    switch (targetType) {
        case 'exam_name':
            container = editButton.parentElement;
            break;
        case 'grading_regulations':
            container = editButton.parentElement.parentElement;
            break;
        case 'question_context':
            container = editButton.closest('.question-block');
            fields = ['context_text', 'extra_comment'];
            break;
        case 'sub_question':
            container = editButton.closest('.grid-cell[data-sub-question-id], .grid-cell'); // staged has no id
            break;
        case 'model_alternative':
            container = editButton.closest('.model-alternative');
            break;
        case 'student_answer':
            container = editButton.closest('.student-answer-item');
            break;
        case 'student_info':
            container = editButton.closest('summary');
            break;
        case 'appendix':
            container = editButton.closest('.modal-content');
            break;
        default:
            return;
    }

    toggleEditMode(container, true, fields, editButton);
}

/**
 * Toggle edit mode. Adds edit-only “add comment / add component” inside alternatives.
 * Also hides the Add Sub-Question button while a sub-q is being edited.
 */
function toggleEditMode(container, isEditing, fields = null, editButtonParam = null, options = {}) {
    const editButton = editButtonParam || container.querySelector('.edit-btn');
    let buttonParent = editButton?.closest('.cell-header') || editButton?.parentElement || container;

    const exitReason = (!isEditing) ? (options?.reason || 'toggle') : null;

    if (isEditing) {
        markContainerEditing(container, true);
        container.dataset.editingFields = fields ? JSON.stringify(fields) : '';
    } else {
        let resolvedFields = fields;
        if ((!resolvedFields || resolvedFields.length === 0) && container.dataset.editingFields !== undefined) {
            try {
                const parsed = JSON.parse(container.dataset.editingFields || '[]');
                resolvedFields = parsed.length ? parsed : null;
            } catch {
                resolvedFields = null;
            }
        }
        if (container.dataset.editingFields !== undefined) delete container.dataset.editingFields;
        fields = resolvedFields;
        markContainerEditing(container, false);
    }

    // Keep Save/Cancel OUT of icon stacks (delete-handlers puts Edit into these wrappers)
    if (
        buttonParent &&
        (
            buttonParent.classList.contains('control-stack') ||       // sub-question top-right stack
            buttonParent.classList.contains('inline-controls') ||     // model-alternative top-right row
            buttonParent.classList.contains('student-summary-controls') // student summary right-side row
        )
    ) {
        buttonParent = container; // append Save/Cancel to the main container instead
    }

    let editActions = buttonParent.querySelector('.edit-actions');
    const targetType = editButton?.dataset.editTarget;

    // Take snapshot BEFORE applying edit-mode styles (keep inline styles so KaTeX stays intact)
    if (isEditing && targetType === 'model_alternative' && !container.dataset.compSnapshotTaken) {
        const comps = Array.from(container.querySelectorAll('.model-component'));
        container.dataset.originalCompIds = JSON.stringify(
            comps.map(el => el.dataset.componentId).filter(Boolean)
        );

        const tempWrap = document.createElement('div');
        comps.forEach(el => {
            const clone = el.cloneNode(true); // IMPORTANT: do NOT remove styles inside
            tempWrap.appendChild(clone);
        });

        container.dataset.modelComponentsOriginalHtml = tempWrap.innerHTML;
        container.dataset.compSnapshotTaken = '1';
    }



    // Already present for student_info:
    if (editButton?.dataset.editTarget === 'student_info') {
        container.classList.toggle('is-editing-summary', isEditing);
    }

    // Add/ensure these toggles:
    if (editButton?.dataset.editTarget === 'sub_question') {
        container.classList.toggle('is-editing', isEditing);
    }
    if (editButton?.dataset.editTarget === 'model_alternative') {
        container.classList.toggle('is-editing', isEditing);
    }
    if (editButton?.dataset.editTarget === 'student_answer') {
        container.classList.toggle('is-editing', isEditing);
    }



    setEditModeStyles(container, isEditing, targetType);

    // Hide/show "Add Sub-Question" button within same question while editing a sub-q
    if (targetType === 'sub_question') {
        const qBlock = container.closest('.question-block');
        const addBtn = qBlock?.querySelector('.add-subq-btn');
        if (addBtn) addBtn.classList.toggle('hidden', isEditing);
    }

        const selector = fields
        ? fields.map((field) => `[data-editable="${field}"]`).join(', ')
        : '[data-editable]';

    if (isEditing) {
        if (editButton) editButton.classList.add('hidden');

        if (!editActions) {
            editActions = document.createElement('div');
            editActions.className = 'edit-actions';
            editActions.innerHTML = `
        <button class="save-btn">Save</button>
        <button class="cancel-btn">Cancel</button>
      `;
            buttonParent.appendChild(editActions);
        }
        editActions.classList.remove('hidden');

        if (targetType === 'sub_question') {
            container.style.display = 'block';
            container.classList.add('is-editing-mcq');
        }

        // Edit-only helpers inside model alternatives
        if (targetType === 'model_alternative') {
            // Take a snapshot of the original components for Cancel restore + deletion tracking on Save
            if (!container.dataset.compSnapshotTaken) {
                const comps = Array.from(container.querySelectorAll('.model-component'));
                container.dataset.originalCompIds = JSON.stringify(
                    comps.map(el => el.dataset.componentId).filter(Boolean)
                );
                const snapshotWrapper = document.createElement('div');
                snapshotWrapper.innerHTML = comps.map(el => el.outerHTML).join('');
                container.dataset.modelComponentsOriginalHtml = snapshotWrapper.innerHTML;
                container.dataset.compSnapshotTaken = '1';
            }


            // Add "Add Comment" button (only if none yet)
            const hasComment = !!container.querySelector('[data-editable="extra_comment"]');
            if (!hasComment && !container.querySelector('.add-alt-comment-btn')) {
                const btn = document.createElement('button');
                btn.className = 'inline-add-btn add-alt-comment-btn';
                btn.type = 'button';
                btn.textContent = 'Add New Comment';
                // Insert between h5 and first component
                const h5 = container.querySelector('h5');
                const firstComp = container.querySelector('.model-component');
                if (h5) {
                    h5.insertAdjacentElement('afterend', btn);
                } else {
                    container.insertBefore(btn, container.firstChild);
                }
                btn.addEventListener('click', () => {
                    if (container.querySelector('[data-editable="extra_comment"]')) return;

                    const p = document.createElement('p');
                    p.className = 'formatted-text';
                    p.innerHTML = `<em><span data-editable="extra_comment" data-original-text=""></span></em>`;

                    // Recompute anchors at click time so we insert in the correct slot
                    const firstComp = container.querySelector('.model-component');
                    const addCompBtn = container.querySelector('.add-model-component-btn');
                    const editActionsEl = (editButton?.closest('.cell-header') || container).querySelector('.edit-actions');
                    const h5 = container.querySelector('h5');

                    if (firstComp) {
                        // Before the first component (same placement as existing alts)
                        container.insertBefore(p, firstComp);
                    } else if (addCompBtn) {
                        // No components yet → place before the Add Component button
                        container.insertBefore(p, addCompBtn);
                    } else if (editActionsEl && editActionsEl.parentElement === container) {
                        // Or before Save/Cancel if they’re inside the alternative container
                        container.insertBefore(p, editActionsEl);
                    } else if (h5) {
                        // Fallback: directly after the Alternative heading
                        h5.insertAdjacentElement('afterend', p);
                    } else {
                        // Last fallback: at the very start
                        container.insertBefore(p, container.firstChild);
                    }

                    // Swap span to a textarea immediately
                    const el = p.querySelector('[data-editable="extra_comment"]');
                    el.dataset.originalValue = '';
                    const ta = document.createElement('textarea');
                    ta.className = 'editable-input';
                    el.innerHTML = '';
                    el.appendChild(ta);
                    ta.focus();

                    // Remove the "Add New Comment" helper button after inserting the field
                    btn.remove();
                });

            }
            // Add "Add Component" button (always in edit mode)
            if (!container.querySelector('.add-model-component-btn')) {
                const addComp = document.createElement('button');
                addComp.className = 'add-model-component-btn add-row-btn';
                addComp.type = 'button';
                addComp.textContent = 'Add New Answer Component';

                // Place the Add Component button just before the Save/Cancel row if present, otherwise at the end
                const editActionsEl = (editButton?.closest('.cell-header') || container).querySelector('.edit-actions');
                if (editActionsEl && editActionsEl.parentElement === container) {
                    container.insertBefore(addComp, editActionsEl);
                } else {
                    container.appendChild(addComp);
                }

                addComp.addEventListener('click', () => {
                    const comp = document.createElement('div');
                    comp.className = 'model-component'; // staged, no data-component-id
                    comp.innerHTML = `
  <p class="formatted-text" data-editable="component_text" data-original-text=""></p>
  <span class="points-badge">Points: <span data-editable="component_points">0</span></span>
`;

                    // Add a delete button right away (visible only in edit mode via CSS)
                    const delBtn = document.createElement('button');
                    delBtn.type = 'button';
                    delBtn.className = 'model-comp-delete-btn';
                    delBtn.textContent = '×';
                    comp.appendChild(delBtn);


                    // Always insert the new component ABOVE the Add button (and thus also above Save/Cancel)
                    container.insertBefore(comp, addComp);
                    // Make sure the new component inherits the edit-mode styles
                    setEditModeStyles(container, true, 'model_alternative');


                    // Convert fields to inputs immediately
                    const textEl = comp.querySelector('[data-editable="component_text"]');
                    const ptsEl = comp.querySelector('[data-editable="component_points"]');
                    [textEl, ptsEl].forEach((el) => {
                        el.dataset.originalValue = el.innerHTML;
                        let input;
                        if (el === ptsEl) {
                            input = document.createElement('input');
                            input.type = 'number';
                            input.value = 0;
                        } else {
                            input = document.createElement('input');
                            input.type = 'text';
                            input.value = 'Type here your answer component';
                        }
                        input.className = 'editable-input';
                        el.innerHTML = '';
                        el.appendChild(input);
                    });
                });
            }
        }

        // Convert editable fields to inputs/textarea
        container.querySelectorAll(selector).forEach((el) => {
            if (targetType === 'question_context' && el.dataset.editable === 'extra_comment' && el.closest('.model-alternative')) {
                return;
            }
            el.dataset.originalValue = el.innerHTML;
            let rawText;
            try {
                if (el.dataset.originalText !== undefined && el.dataset.originalText !== null) {
                    rawText = JSON.parse(el.dataset.originalText);
                } else {
                    rawText = el.textContent.trim();
                }
            } catch {
                rawText = el.dataset.originalText || el.textContent.trim();
            }

            let input;
            const fieldType = el.dataset.editable;
            if (['context_text', 'extra_comment', 'feedback_comment', 'grading_regulations', 'answer_text', 'sub_q_text_content', 'app_text'].includes(fieldType)) {
                input = document.createElement('textarea');
                input.value = (fieldType === 'grading_regulations') ? el.innerHTML : rawText;
                input.rows = Math.max(3, rawText.length / 70);
            } else {
                input = document.createElement('input');
                input.type = (fieldType === 'component_points' || fieldType === 'sub_points_awarded') ? 'number' : 'text';
                input.value = rawText;
            }
            input.className = 'editable-input';
            el.innerHTML = '';
            el.appendChild(input);
            if (input.type === 'text') input.select();
            else input.focus();
        });

        editActions.querySelector('.save-btn').onclick = () => saveChanges(container, editButton);
        editActions.querySelector('.cancel-btn').onclick = () => toggleEditMode(container, false, fields, editButton, { reason: 'cancel' });

        if (targetType === 'sub_question') {
            setupMcqEditingUI(container);
        }
    } else {
        if (editButton) editButton.classList.remove('hidden');
        if (editActions) editActions.classList.add('hidden');

        if (targetType === 'sub_question') {
            container.style.display = 'flex';
            container.classList.remove('is-editing-mcq');
            teardownMcqEditingUI(container);
            if (exitReason === 'cancel') {
                restoreMcqSnapshot(container);
                cleanupMcqDomAfterCancel(container);
            } else {
                clearMcqSnapshotData(container);
            }
        }

        const sel = fields ? fields.map(f => `[data-editable="${f}"]`).join(', ') : '[data-editable]';
        container.querySelectorAll(sel).forEach((el) => {
            if (targetType === 'question_context' && el.dataset.editable === 'extra_comment' && el.closest('.model-alternative')) return;
            if (applyPendingDisplay(el)) {
                return;
            }
            if (el.hasAttribute('data-original-value')) {
                el.innerHTML = el.dataset.originalValue || '';
                el.removeAttribute('data-original-value');
            } else {
                const input = el.querySelector('.editable-input');
                if (input) {
                    const wrapper = input.parentElement;
                    if (wrapper) wrapper.innerHTML = '';
                    else el.innerHTML = '';
                }
            }
        });

        if (targetType === 'model_alternative') {
            // Remove edit-only helpers
            const addComment = container.querySelector('.add-alt-comment-btn');
            if (addComment) addComment.remove();
            const addComp = container.querySelector('.add-model-component-btn');
            if (addComp) addComp.remove();

            if (exitReason === 'cancel') {
                // Remove any newly created (unsaved) components
                container.querySelectorAll('.model-component:not([data-component-id])').forEach((el) => el.remove());

                // Restore original components if a snapshot exists
                if (container.dataset.modelComponentsOriginalHtml) {
                    // Remove all current components
                    container.querySelectorAll('.model-component').forEach(el => el.remove());

                    const html = container.dataset.modelComponentsOriginalHtml;
                    const temp = document.createElement('div');
                    temp.innerHTML = html;

                    // Insert restored components before Save/Cancel (if present) or at the end
                    const ref = (container.querySelector('.edit-actions')?.parentElement === container)
                        ? container.querySelector('.edit-actions')
                        : null;

                    Array.from(temp.children).forEach(child => {
                        if (ref) container.insertBefore(child, ref);
                        else container.appendChild(child);
                    });
                }
            }

            container.querySelectorAll('.model-component, .model-component p, .points-badge').forEach(el => {
                el.removeAttribute('style');
            });

            delete container.dataset.modelComponentsOriginalHtml;
            delete container.dataset.originalCompIds;
            delete container.dataset.compSnapshotTaken;

            if (exitReason === 'cancel') {
                // If the alternative itself was brand-new and user cancelled, remove it
                const isNew = container.dataset.isNew === '1';
                const hasId = !!container.dataset.alternativeId;
                if (isNew && !hasId) {
                    const section = container.closest('.model-answer-section');
                    container.remove();
                    const modelCell = section ? section.closest('.grid-cell') : container.closest('.grid-cell');
                    const addAltBtn = modelCell?.querySelector('.add-model-alt-btn');
                    if (addAltBtn) addAltBtn.classList.remove('hidden');

                    // If this section now has no alternatives, re-show the placeholder
                    if (section && !section.querySelector('.model-alternative')) {
                        let ph = section.querySelector('.no-model-placeholder');
                        if (ph) {
                            ph.classList.remove('hidden');
                        }
                    }
                }
            }
        }



        // If this sub-question row was staged (no id) and cancelled, remove the 3 cells
        if (targetType === 'sub_question' && exitReason === 'cancel') {
            const hasId = !!editButton.dataset.subQuestionId;
            if (!hasId) {
                // This container is the sub-q cell; remove its two sibling cells (model + student) immediately following it
                const modelCell = container.nextElementSibling;
                const studentCell = modelCell?.nextElementSibling;
                container.remove();
                if (modelCell) modelCell.remove();
                if (studentCell) studentCell.remove();
            }
        }

        // If new student edit was cancelled, remove all staged copies across sub-qs
        if (targetType === 'student_info' && exitReason === 'cancel') {
            const token = editButton.dataset.newStudentToken;
            const hasId = !!editButton.dataset.studentId;
            if (token && !hasId) {
                questionsContainer.querySelectorAll(`[data-new-student-token="${token}"]`).forEach(el => {
                    const originCell = container.closest('.grid-cell');
                    const addBtn = originCell?.querySelector('.add-student-btn');
                    if (addBtn) addBtn.classList.remove('hidden');
                    const details = el.closest('.student-answer-dropdown');
                    if (details) details.remove();
                });
            }
        }

        if (targetType === 'student_answer') {
            delete container.dataset.clearPointsFeedback;
            container.classList.remove('points-cleared');
        }



        // If new question context was cancelled, remove the staged question block
        if (targetType === 'question_context' && exitReason === 'cancel') {
            const isNewQ = container?.dataset?.isNewQuestion === '1';
            const hasQid = !!editButton.dataset.questionId;
            if (isNewQ && !hasQid) {
                container.remove();
                const globalAddBtn = questionsContainer.querySelector('.add-question-btn');
                if (globalAddBtn) globalAddBtn.classList.remove('hidden');
            }
        }

        // Re-show Add Sub-Question for this question (if we hid it)
        if (targetType === 'sub_question') {
            const qBlock = container.closest('.question-block');
            const addBtn = qBlock?.querySelector('.add-subq-btn');
            if (addBtn) addBtn.classList.remove('hidden');
        }
    }
}

function syncNewMcqOptionIds(container, insertedRows = []) {
    if (!container) return;
    const mcqContainer = container.querySelector('.mcq-options');
    if (!mcqContainer) return;

    if (Array.isArray(insertedRows) && insertedRows.length) {
        const newOptions = Array.from(mcqContainer.querySelectorAll('.mcq-option')).filter(opt => !opt.dataset.mcqOptionId);
        insertedRows.forEach((row, idx) => {
            const opt = newOptions[idx];
            if (!opt || !row) return;
            opt.dataset.mcqOptionId = row.id;
            const letterEl = opt.querySelector('.mcq-letter');
            if (letterEl && row.mcq_letter) {
                letterEl.textContent = row.mcq_letter;
            }
        });
    }

    renumberLetters(mcqContainer);
    setUniformMcqLetterWidth(mcqContainer);
}

function ensureSubQuestionRowHasIds(container, subQuestionId) {
    if (!container || !subQuestionId) return;

    container.dataset.subQuestionId = subQuestionId;
    const editBtn = container.querySelector('.edit-btn[data-edit-target="sub_question"]');
    if (editBtn) {
        editBtn.dataset.subQuestionId = subQuestionId;
    }

    const modelCell = container.nextElementSibling;
    if (modelCell) {
        modelCell.dataset.subQuestionId = subQuestionId;
        if (!modelCell.id) modelCell.id = 'alt-model-gridcell';
        let addAltBtn = modelCell.querySelector('.add-model-alt-btn');
        if (!addAltBtn) {
            addAltBtn = document.createElement('button');
            addAltBtn.type = 'button';
            addAltBtn.className = 'add-model-alt-btn add-row-btn';
            addAltBtn.textContent = 'Add New Answer Alternative';
            modelCell.appendChild(addAltBtn);
        }
        addAltBtn.dataset.subQuestionId = subQuestionId;
        addAltBtn.classList.remove('hidden');
    }

    const studentCell = modelCell?.nextElementSibling;
    if (studentCell) {
        studentCell.dataset.subQuestionId = subQuestionId;
    }
}

function ensureModelAlternativeIdentifiers(container, alternativeId = null) {
    if (!container) return;

    if (alternativeId) {
        container.dataset.alternativeId = alternativeId;
    }

    const editBtn = container.querySelector('.edit-btn[data-edit-target="model_alternative"]');
    if (editBtn) {
        if (alternativeId) editBtn.dataset.alternativeId = alternativeId;
        if (!editBtn.dataset.subQuestionId) {
            const parentCell = container.closest('#alt-model-gridcell, .grid-cell');
            const subId = parentCell?.dataset?.subQuestionId;
            if (subId) editBtn.dataset.subQuestionId = subId;
        }
    }

    const parentCell = container.closest('#alt-model-gridcell, .grid-cell');
    const addAltBtn = parentCell?.querySelector('.add-model-alt-btn');
    if (addAltBtn) {
        const subId = parentCell?.dataset?.subQuestionId;
        if (subId) addAltBtn.dataset.subQuestionId = subId;
        addAltBtn.classList.remove('hidden');
    }

    container.removeAttribute('data-is-new');
}

function ensureQuestionHasAddSubButton(questionBlock) {
    if (!questionBlock) return null;

    const subGrid = questionBlock.querySelector('.sub-question-grid');
    if (!subGrid) return null;

    let addFooterCell = subGrid.querySelector('.grid-cell.grid-footer');
    if (!addFooterCell) {
        addFooterCell = document.createElement('div');
        addFooterCell.className = 'grid-cell grid-footer';
        subGrid.appendChild(addFooterCell);
    }

    let addBtn = addFooterCell.querySelector('.add-subq-btn');
    if (!addBtn) {
        addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'add-subq-btn add-row-btn';
        addBtn.textContent = 'Add New Sub-Question';
        addFooterCell.appendChild(addBtn);
    }

    return addBtn;
}

function applyQuestionMetadataAfterInsert(questionBlock, editButton, questionId) {
    if (!questionBlock || !questionId) return;

    questionBlock.dataset.questionId = String(questionId);
    if ('isNewQuestion' in questionBlock.dataset) {
        delete questionBlock.dataset.isNewQuestion;
    }

    if (editButton) {
        editButton.dataset.questionId = String(questionId);
        if (editButton.dataset.questionNumber) {
            delete editButton.dataset.questionNumber;
        }
    }

    const addBtn = ensureQuestionHasAddSubButton(questionBlock);
    if (addBtn) {
        addBtn.dataset.questionId = String(questionId);
        addBtn.classList.remove('hidden');
    }

    if (questionsContainer) {
        const globalAddBtn = questionsContainer.querySelector('.add-question-btn');
        if (globalAddBtn) {
            globalAddBtn.classList.remove('hidden');
        }
    }
}

function syncNewModelComponentIds(container, insertedRows = []) {
    if (!container || !Array.isArray(insertedRows) || insertedRows.length === 0) return;
    const newComponents = Array.from(container.querySelectorAll('.model-component')).filter(comp => !comp.dataset.componentId);
    insertedRows.forEach((row, idx) => {
        const comp = newComponents[idx];
        if (!comp || !row) return;
        comp.dataset.componentId = row.id;
        const pointsEl = comp.querySelector('[data-editable="component_points"]');
        if (pointsEl) {
            try {
                pointsEl.dataset.originalText = JSON.stringify(String(row.component_points ?? pointsEl.textContent ?? '0'));
            } catch {
                pointsEl.dataset.originalText = JSON.stringify(String(row.component_points ?? '0'));
            }
        }
    });
}

/**
 * Persist edits / inserts to the database and refresh the UI.
 */
async function saveChanges(container, editButton) {
    const targetType = editButton.dataset.editTarget;
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');

    try {
        const commitEditedValues = () => {
            container.querySelectorAll('[data-editable]').forEach((el) => {
                const input = el.querySelector('.editable-input');
                if (!input) return;
                const fieldType = el.dataset.editable || '';
                const rawValue = input.value ?? '';
                const normalizedValue = normalizeEditableValue(rawValue);
                try {
                    el.dataset.originalText = JSON.stringify(normalizedValue);
                } catch {
                    el.dataset.originalText = JSON.stringify(String(normalizedValue));
                }
                stagePendingDisplay(el, fieldType, normalizedValue);
            });
        };

        let createdQuestionId = null;
        let results;
        switch (targetType) {
            case 'exam_name': {
                const examName = container.querySelector('[data-editable="exam_name"] .editable-input').value;
                results = await sb.from('exams').update({ exam_name: examName }).eq('id', editButton.dataset.examId);
                if (results.error) throw results.error;
                break;
            }

            case 'grading_regulations': {
                const regulations = container.querySelector('[data-editable="grading_regulations"] .editable-input').value;
                results = await sb.from('exams').update({ grading_regulations: regulations }).eq('id', editButton.dataset.examId);
                if (results.error) throw results.error;
                break;
            }

            case 'question_context': {
                const contextUpdates = {};
                const ctx = container.querySelector('[data-editable="context_text"] .editable-input');
                if (ctx) contextUpdates.context_text = ctx.value;
                const allExtraCommentInputs = container.querySelectorAll('[data-editable="extra_comment"] .editable-input');
                allExtraCommentInputs.forEach((input) => {
                    if (!input.closest('.model-alternative')) contextUpdates.extra_comment = input.value;
                });

                const existingQid = editButton.dataset.questionId;
                if (existingQid) {
                    const res = await sb.from('questions').update(contextUpdates).eq('id', existingQid);
                    if (res.error) throw res.error;
                    createdQuestionId = existingQid;
                } else {
                    // INSERT new question
                    const qNum = editButton.dataset.questionNumber || '1';
                    const payload = { exam_id: examId, question_number: qNum, ...contextUpdates };
                    const { data: insertedQuestion, error: insertErr } = await sb
                        .from('questions')
                        .insert(payload)
                        .select('id')
                        .single();
                    if (insertErr) throw insertErr;
                    createdQuestionId = insertedQuestion?.id || null;
                }
                break;
            }

            case 'sub_question': {
                const subQId = editButton.dataset.subQuestionId;
                const subQTextInput = container.querySelector('[data-editable="sub_q_text_content"] .editable-input');
                const subQText = subQTextInput ? subQTextInput.value : null;

                const mcqContainer = container.querySelector('.mcq-options');
                const optionEls = Array.from(mcqContainer ? mcqContainer.querySelectorAll('.mcq-option') : []);
                const toLetter = (i) => { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
                const finalList = optionEls.map((el, idx) => {
                    const id = el.dataset.mcqOptionId || null;
                    const input = el.querySelector('[data-editable="mcq_content"] .editable-input');
                    const content = input ? (input.value || '').trim() : '';
                    return { id, mcq_letter: toLetter(idx), mcq_content: content };
                }).filter(x => x.mcq_content !== '');

                let insertedMcqRows = [];
                let resolvedSubQuestionId = subQId || null;

                if (subQId) {
                    if (subQText !== null) {
                        const { error: updateErr } = await sb.from('sub_questions').update({ sub_q_text_content: subQText }).eq('id', subQId);
                        if (updateErr) throw updateErr;
                    }

                    const originalIds = JSON.parse(container.dataset.originalMcqIds || '[]');
                    const presentIds = finalList.filter(x => !!x.id).map(x => x.id);
                    const toDeleteIds = originalIds.filter(id => !presentIds.includes(id));
                    if (toDeleteIds.length) {
                        const { error: deleteErr } = await sb.from('mcq_options').delete().in('id', toDeleteIds);
                        if (deleteErr) throw deleteErr;
                    }

                    for (const existing of finalList.filter(x => !!x.id)) {
                        const { error: optErr } = await sb.from('mcq_options')
                            .update({ mcq_letter: existing.mcq_letter, mcq_content: existing.mcq_content })
                            .eq('id', existing.id);
                        if (optErr) throw optErr;
                    }

                    const inserts = finalList.filter(x => !x.id).map(x => ({
                        sub_question_id: subQId,
                        mcq_letter: x.mcq_letter,
                        mcq_content: x.mcq_content
                    }));
                    if (inserts.length) {
                        const { data: insertedData, error: insertErr } = await sb.from('mcq_options')
                            .insert(inserts)
                            .select('id, mcq_letter')
                            .order('id', { ascending: true });
                        if (insertErr) throw insertErr;
                        insertedMcqRows = insertedData || [];
                    }
                } else {
                    const questionId = editButton.dataset.questionId;
                    if (!questionId) throw new Error('Missing question_id for new sub-question');

                    let nextOrder = 1;
                    try {
                        const { data: latest, error: latestErr } = await sb
                            .from('sub_questions')
                            .select('sub_question_order')
                            .eq('question_id', questionId)
                            .order('sub_question_order', { ascending: false })
                            .limit(1);
                        if (latestErr) throw latestErr;
                        if (latest && latest.length) nextOrder = Number(latest[0].sub_question_order || 0) + 1;
                    } catch (e) {
                        console.warn('Could not compute next sub_question_order; defaulting to 1', e);
                    }

                    const { data: insertedSub, error: insErr } = await sb.from('sub_questions')
                        .insert({
                            question_id: questionId,
                            sub_q_text_content: subQText || '',
                            sub_question_order: nextOrder
                        })
                        .select('id')
                        .single();
                    if (insErr) throw insErr;
                    const newSubId = insertedSub.id;
                    resolvedSubQuestionId = newSubId;

                    if (finalList.length) {
                        const mcqPayload = finalList.map(x => ({
                            sub_question_id: newSubId,
                            mcq_letter: x.mcq_letter,
                            mcq_content: x.mcq_content
                        }));
                        const { data: mcqInserted, error: mcqErr } = await sb.from('mcq_options')
                            .insert(mcqPayload)
                            .select('id, mcq_letter')
                            .order('id', { ascending: true });
                        if (mcqErr) throw mcqErr;
                        insertedMcqRows = mcqInserted || [];
                    }

                    const { data: stuExams, error: seErr } = await sb.from('student_exams').select('id').eq('exam_id', examId);
                    if (seErr) throw seErr;
                    if (stuExams && stuExams.length) {
                        const placeholder = STUDENT_PLACEHOLDER_TEXT;
                        const ansPayload = stuExams.map(se => ({
                            student_exam_id: se.id,
                            sub_question_id: newSubId,
                            answer_text: placeholder,
                            sub_points_awarded: null,
                            feedback_comment: null
                        }));
                        const { error: ansErr } = await sb.from('student_answers').insert(ansPayload);
                        if (ansErr) throw ansErr;
                    }
                }

                ensureSubQuestionRowHasIds(container, resolvedSubQuestionId || subQId);
                syncNewMcqOptionIds(container, insertedMcqRows);
                break;
            }

            case 'model_alternative': {
                const altId = editButton.dataset.alternativeId;
                const subQId = editButton.dataset.subQuestionId || editButton.closest('.grid-cell')?.dataset?.subQuestionId;

                let resolvedAltId = altId || null;
                let insertedComponentRows = [];

                if (altId) {
                    const extraComm = container.querySelector('[data-editable="extra_comment"] .editable-input');
                    if (extraComm) {
                        const { error: altErr } = await sb.from('model_alternatives').update({ extra_comment: extraComm.value }).eq('id', altId);
                        if (altErr) throw altErr;
                    }

                    const compEls = Array.from(container.querySelectorAll('.model-component'));
                    const originalIds = JSON.parse(container.dataset.originalCompIds || '[]');
                    const presentIds = compEls.map(el => el.dataset.componentId).filter(Boolean);
                    const toDeleteIds = originalIds.filter(id => !presentIds.includes(id));
                    if (toDeleteIds.length) {
                        const { error: deleteErr } = await sb.from('model_components').delete().in('id', toDeleteIds);
                        if (deleteErr) throw deleteErr;
                    }

                    let order = 1;
                    const insertPayload = [];
                    for (const compEl of compEls) {
                        const id = compEl.dataset.componentId || null;
                        const compText = compEl.querySelector('[data-editable="component_text"] .editable-input')?.value ?? null;
                        const compPointsStr = compEl.querySelector('[data-editable="component_points"] .editable-input')?.value ?? '0';
                        const compPoints = Number(compPointsStr) || 0;

                        if (id) {
                            const { error: updErr } = await sb.from('model_components')
                                .update({ component_text: compText, component_points: compPoints, component_order: order })
                                .eq('id', id);
                            if (updErr) throw updErr;
                        } else {
                            insertPayload.push({
                                alternative_id: altId,
                                component_text: compText,
                                component_points: compPoints,
                                component_order: order
                            });
                        }
                        order += 1;
                    }

                    if (insertPayload.length) {
                        const { data: insertedData, error: insertErr } = await sb.from('model_components')
                            .insert(insertPayload)
                            .select('id, component_order, component_points')
                            .order('component_order', { ascending: true });
                        if (insertErr) throw insertErr;
                        insertedComponentRows = insertedData || [];
                    }
                } else {
                    if (!subQId) throw new Error('Missing sub_question_id for new alternative');
                    const { count, error: countErr } = await sb
                        .from('model_alternatives')
                        .select('*', { head: true, count: 'exact' })
                        .eq('sub_question_id', subQId);
                    if (countErr) throw countErr;
                    const altNum = (count || 0) + 1;

                    let extraCommentVal = null;
                    const extraComm = container.querySelector('[data-editable="extra_comment"] .editable-input');
                    if (extraComm) extraCommentVal = extraComm.value;

                    const { data: insertedAlt, error: altInsertErr } = await sb.from('model_alternatives')
                        .insert({ sub_question_id: subQId, alternative_number: altNum, extra_comment: extraCommentVal })
                        .select('id')
                        .single();
                    if (altInsertErr) throw altInsertErr;
                    const newAltId = insertedAlt.id;
                    resolvedAltId = newAltId;

                    const compEls = Array.from(container.querySelectorAll('.model-component'));
                    if (compEls.length) {
                        let order = 1;
                        const payload = compEls.map(compEl => {
                            const compText = compEl.querySelector('[data-editable="component_text"] .editable-input')?.value ?? null;
                            const compPointsStr = compEl.querySelector('[data-editable="component_points"] .editable-input')?.value ?? '0';
                            const compPoints = Number(compPointsStr) || 0;
                            return { alternative_id: newAltId, component_text: compText, component_points: compPoints, component_order: order++ };
                        });
                        const { data: insertedComponents, error: compErr } = await sb.from('model_components')
                            .insert(payload)
                            .select('id, component_order, component_points')
                            .order('component_order', { ascending: true });
                        if (compErr) throw compErr;
                        insertedComponentRows = insertedComponents || [];
                    }

                    const heading = container.querySelector('h5');
                    if (heading) heading.textContent = `Alternative ${altNum}`;
                }

                ensureModelAlternativeIdentifiers(container, resolvedAltId || altId);
                syncNewModelComponentIds(container, insertedComponentRows);

                if (subQId) {
                    const { error: rpcError } = await sb.rpc('recalculate_exam_points_from_sub_question', { p_sub_question_id: subQId });
                    if (rpcError) {
                        console.error('Error recalculating exam points:', rpcError);
                        alert('Points saved, but totals could not be recalculated.');
                    }
                }
                break;
            }

            case 'student_answer': {
                const ansId = editButton.dataset.answerId;
                const ansUpdates = {};

                const ansText = container.querySelector('[data-editable="answer_text"] .editable-input');
                const ansPointsInput = container.querySelector('[data-editable="sub_points_awarded"] .editable-input');
                const ansFeedback = container.querySelector('[data-editable="feedback_comment"] .editable-input');

                if (ansText) ansUpdates.answer_text = ansText.value;

                if (container.dataset.clearPointsFeedback === '1') {
                    ansUpdates.sub_points_awarded = null;
                    ansUpdates.feedback_comment = null;
                } else {
                    if (ansPointsInput) {
                        const v = ansPointsInput.value;
                        ansUpdates.sub_points_awarded = (v === '' || v === null) ? null : Number(v);
                    }
                    if (ansFeedback) {
                        const v = ansFeedback.value;
                        ansUpdates.feedback_comment = (v === '') ? null : v;
                    }
                }


                const res = await sb.from('student_answers').update(ansUpdates).eq('id', ansId);
                if (res.error) throw res.error;

                // Recalc total after save
                if (ansId) {
                    const { data: answerData, error: fetchError } = await sb.from('student_answers').select('student_exam_id').eq('id', ansId).single();
                    if (!fetchError && answerData?.student_exam_id) {
                        await sb.rpc('recalculate_student_total_points', { p_student_exam_id: answerData.student_exam_id });
                    }
                }

                break;
            }

            case 'student_info': {
                const studentId = editButton.dataset.studentId;
                const stagedToken = editButton.dataset.newStudentToken || null;
                const nameEl = container.querySelector('[data-editable="full_name"] .editable-input');
                const numEl = container.querySelector('[data-editable="student_number"] .editable-input');
                const full_name = nameEl ? nameEl.value : null;
                const student_number = numEl ? numEl.value : null;

                if (studentId) {
                    // UPDATE existing student
                    const res = await sb.from('students').update({ full_name, student_number }).eq('id', studentId);
                    if (res.error) throw res.error;

                    applyStudentDetailsUpdates({
                        studentId,
                        fullName: full_name ?? '',
                        studentNumber: student_number ?? '',
                    });
                } else {
                    // INSERT new student + linkage + placeholders
                    const sIns = await sb.from('students').insert({ full_name, student_number }).select('id').single();
                    if (sIns.error) throw sIns.error;
                    const newStudentId = sIns.data.id;

                    const seIns = await sb
                        .from('student_exams')
                        .insert({ student_id: newStudentId, exam_id: examId })
                        .select('id')
                        .single();
                    if (seIns.error) throw seIns.error;
                    const studentExamId = seIns.data.id;

                    // All existing sub-questions for this exam
                    const { data: subQs, error: sqErr } = await sb
                        .from('sub_questions')
                        .select('id, questions!inner ( exam_id )')
                        .eq('questions.exam_id', examId);
                    if (sqErr) throw sqErr;

                    let insertedAnswers = [];
                    if (subQs && subQs.length) {
                        const payload = subQs.map(sq => ({
                            student_exam_id: studentExamId,
                            sub_question_id: sq.id,
                            answer_text: STUDENT_PLACEHOLDER_TEXT,
                            sub_points_awarded: null,
                            feedback_comment: null
                        }));
                        const insAns = await sb
                            .from('student_answers')
                            .insert(payload)
                            .select('id, sub_question_id, answer_text');
                        if (insAns.error) throw insAns.error;
                        insertedAnswers = insAns.data || [];
                    }

                    applyStudentDetailsUpdates({
                        studentId: newStudentId,
                        token: stagedToken,
                        answersData: insertedAnswers,
                        fullName: full_name ?? '',
                        studentNumber: student_number ?? '',
                    });

                    editButton.dataset.studentId = newStudentId;
                    if (stagedToken) delete editButton.dataset.newStudentToken;

                    // Tell the UI to auto-select this newly added student after reload
                    window.__selectStudentAfterReload = newStudentId;
                }
                break;
            }


            case 'appendix': {
                const items = container.querySelectorAll('.appendix-item');
                for (const item of items) {
                    const appendixId = item.dataset.appendixId;
                    const appTitleInput = item.querySelector('[data-editable="app_title"] .editable-input');
                    const appTextInput = item.querySelector('[data-editable="app_text"] .editable-input');
                    if (appendixId && appTitleInput && appTextInput) {
                        const res = await sb.from('appendices').update({ app_title: appTitleInput.value, app_text: appTextInput.value }).eq('id', appendixId);
                        if (res.error) throw res.error;
                    }
                }
                break;
            }

            default:
                throw new Error('Unknown edit target type.');
        }

        if (targetType === 'question_context' && createdQuestionId) {
            applyQuestionMetadataAfterInsert(container, editButton, createdQuestionId);
        }

        commitEditedValues();
        toggleEditMode(container, false, undefined, editButton, { reason: 'commit' });

        let refreshError = null;
        if (typeof window.refreshExamDataCache === 'function') {
            try {
                const result = await window.refreshExamDataCache(examId);
                refreshError = result?.error || null;
            } catch (refreshErr) {
                refreshError = refreshErr;
            }
        } else if (typeof loadExamDetails === 'function') {
            await loadExamDetails(examId);
        }

        if (refreshError) {
            console.warn('Failed to refresh exam data cache after save:', refreshError);
        }

        // Post-save modal refreshes you already had:
        if (targetType === 'grading_regulations') {
            rulesModalText.innerHTML = `
        <div data-editable="grading_regulations">${marked.parse(currentExamData.grading_regulations)}</div>
        <div class="modal-edit-container">
          <button id="modal-edit-btn" class="edit-btn" data-edit-target="grading_regulations" data-exam-id="${examId}">${EDIT_ICON_SVG}</button>
        </div>
      `;
        } else if (targetType === 'appendix') {
            // recompose appendix modal for same question
            const questionId = editButton.dataset.questionId;
            const questionData = currentExamData.questions.find(q => q.id == questionId);
            if (questionData?.appendices) {
                const contentHtml = questionData.appendices.map(app => `
          <div class="appendix-item" data-appendix-id="${app.id}">
            <h4 data-editable="app_title" data-original-text='${JSON.stringify(app.app_title || '')}'>${app.app_title || 'Appendix Item'}</h4>
            <p class="formatted-text" data-editable="app_text" data-original-text='${JSON.stringify((app.app_text || '').trim())}'>${(app.app_text || '').trim()}</p>
            ${app.app_visual ? `<img src="${app.app_visual}" alt="Appendix visual">` : ''}
          </div>
        `.trim()).join('');
                appendixModalContent.innerHTML = `
          <div id="appendix-editable-area">${contentHtml}</div>
          <div class="modal-edit-container">
            <button id="modal-edit-btn" class="edit-btn" data-edit-target="appendix" data-question-id="${questionId}">
              ${EDIT_ICON_SVG}
            </button>
          </div>`;
                renderMathInElement(appendixModalContent, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\$$', right: '\$$', display: false },
                        { left: '\$$', right: '\$$', display: true },
                    ],
                    throwOnError: false,
                });
            }
        }
    } catch (error) {
        console.error('Save failed:', error);
        alert(`Error saving changes: ${error.message}`);
        toggleEditMode(container, true, null, editButton);
    }
}

/**
 * Add drag/drop, add, and delete controls for MCQs within a sub-question container
 * @param {HTMLElement} container - the .grid-cell[data-sub-question-id]
 */
function setupMcqEditingUI(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    let mcqContainer = subContent.querySelector('.mcq-options');
    const hadContainer = !!mcqContainer;
    if (!mcqContainer) {
        mcqContainer = document.createElement('div');
        mcqContainer.className = 'mcq-options';
        subContent.appendChild(mcqContainer);
    }

    // 🔒 Take a one-time snapshot of the original MCQ HTML for cancel restore
    if (!container.dataset.mcqSnapshotTaken) {
        container.dataset.mcqHadContainer = hadContainer ? '1' : '0';
        container.dataset.mcqOriginalHtml = mcqContainer.innerHTML || '';
        container.dataset.mcqSnapshotTaken = '1';
    }

    // Save original option IDs (for save/delete logic, optional)
    const originalIds = Array.from(mcqContainer.querySelectorAll('.mcq-option'))
        .map(el => el.dataset.mcqOptionId)
        .filter(Boolean);
    container.dataset.originalMcqIds = JSON.stringify(originalIds);

    // store for cancel cleanup
    container.dataset.originalMcqIds = JSON.stringify(originalIds);
    container.dataset.mcqHadContainer = hadContainer ? '1' : '0';
    container.dataset.mcqOriginalCount = String(originalIds.length);


    const hasOptions = !!mcqContainer.querySelector('.mcq-option');
    if (!hasOptions) {
        // Show a small convert button instead of the full toolbar
        if (!subContent.querySelector('.mcq-convert-btn')) {
            const convertBtn = document.createElement('button');
            convertBtn.type = 'button';
            convertBtn.className = 'mcq-convert-btn';
            convertBtn.textContent = 'Add Multiple-Choice Options';
            convertBtn.addEventListener('click', () => {
                addMcqOption(mcqContainer);
                renumberLetters(mcqContainer);
                setUniformMcqLetterWidth(mcqContainer); // ← NEW
                convertBtn.remove();           // swap to full toolbar after first option
                makeOptionsInteractive(mcqContainer);
                // then create the normal toolbar:
                const toolbar = document.createElement('div');
                toolbar.className = 'mcq-edit-toolbar';
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.textContent = 'Add New Multiple-Choice Option';
                addBtn.className = 'mcq-convert-btn';
                addBtn.addEventListener('click', () => {
                    addMcqOption(mcqContainer);
                    renumberLetters(mcqContainer);
                    setUniformMcqLetterWidth(mcqContainer); // ← NEW
                });
                toolbar.appendChild(addBtn);
                subContent.appendChild(toolbar);
            });
            subContent.appendChild(convertBtn);
        }
        return; // don’t build the full toolbar yet
    }


    // Add toolbar (Add Option)
    if (!subContent.querySelector('.mcq-edit-toolbar')) {
        const toolbar = document.createElement('div');
        toolbar.className = 'mcq-edit-toolbar';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = 'Add New Multiple-Choice Option';
        addBtn.className = 'mcq-convert-btn';
        addBtn.addEventListener('click', () => {
            addMcqOption(mcqContainer);
            renumberLetters(mcqContainer);
        });

        toolbar.appendChild(addBtn);
        subContent.appendChild(toolbar);
    }

    // Make existing items draggable and show delete buttons
    makeOptionsInteractive(mcqContainer);
    setUniformMcqLetterWidth(mcqContainer); // ← NEW


    // Drag-and-drop plumbing
    // (Store handler refs on the container so we can remove them on teardown)
    if (mcqContainer._dragoverHandler) {
        mcqContainer.removeEventListener('dragover', mcqContainer._dragoverHandler);
    }
    if (mcqContainer._dropHandler) {
        mcqContainer.removeEventListener('drop', mcqContainer._dropHandler);
    }

    mcqContainer._dragoverHandler = (e) => {
        e.preventDefault();
        const dragging = mcqContainer.querySelector('.dragging');
        if (!dragging) return;

        const afterElement = getDragAfterElement(mcqContainer, e.clientY);
        if (afterElement == null) {
            mcqContainer.appendChild(dragging);
        } else {
            mcqContainer.insertBefore(dragging, afterElement);
        }
    };
    mcqContainer._dropHandler = () => {
        const dragging = mcqContainer.querySelector('.dragging');
        if (dragging) dragging.classList.remove('dragging');
        renumberLetters(mcqContainer);
    };

    mcqContainer.addEventListener('dragover', mcqContainer._dragoverHandler);
    mcqContainer.addEventListener('drop', mcqContainer._dropHandler);

}

function clearMcqSnapshotData(container) {
    if (!container) return;
    delete container.dataset.mcqHadContainer;
    delete container.dataset.mcqOriginalHtml;
    delete container.dataset.originalMcqIds;
    delete container.dataset.mcqSnapshotTaken;
    delete container.dataset.mcqOriginalCount;
}

function restoreMcqSnapshot(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    const hadContainer = container.dataset.mcqHadContainer === '1';
    const originalHtml = container.dataset.mcqOriginalHtml ?? '';

    let mcqContainer = subContent.querySelector('.mcq-options');

    if (hadContainer) {
        if (!mcqContainer) {
            mcqContainer = document.createElement('div');
            mcqContainer.className = 'mcq-options';
            subContent.appendChild(mcqContainer);
        }
        mcqContainer.innerHTML = originalHtml;   // ← bring back exactly what was there
    } else {
        // There wasn't a container before edit; remove any we added
        if (mcqContainer) mcqContainer.remove();
    }

    clearMcqSnapshotData(container);
}


/**
 * Remove edit-only controls/attrs for MCQs
 */
function teardownMcqEditingUI(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    // Remove the lightweight convert button (for zero-options state)
    const convertBtn = subContent.querySelector('.mcq-convert-btn');
    if (convertBtn) convertBtn.remove();

    // Remove the full toolbar
    const toolbar = subContent.querySelector('.mcq-edit-toolbar');
    if (toolbar) toolbar.remove();

    const mcqContainer = subContent.querySelector('.mcq-options');
    if (!mcqContainer) {
        delete container.dataset.originalMcqIds;
        return;
    }

    // Detach DnD listeners that were attached in setup
    if (mcqContainer._dragoverHandler) {
        mcqContainer.removeEventListener('dragover', mcqContainer._dragoverHandler);
        delete mcqContainer._dragoverHandler;
    }
    if (mcqContainer._dropHandler) {
        mcqContainer.removeEventListener('drop', mcqContainer._dropHandler);
        delete mcqContainer._dropHandler;
    }

    // Strip edit-only affordances from each option
    mcqContainer.querySelectorAll('.mcq-option').forEach((opt) => {
        opt.removeAttribute('draggable');
        opt.classList.remove('dragging');
        const handle = opt.querySelector('.drag-handle');
        if (handle) handle.remove();
        const del = opt.querySelector('.mcq-delete-btn');
        if (del) del.remove();
    });

    if (mcqContainer) {
        mcqContainer.style.removeProperty('--mcq-letter-col'); // ← NEW
    }

    delete container.dataset.originalMcqIds;
}

function cleanupMcqDomAfterCancel(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    const mcqContainer = subContent.querySelector('.mcq-options');
    if (!mcqContainer) return;

    // Remove any options created during this edit session (they won't have db ids)
    mcqContainer.querySelectorAll('.mcq-option').forEach((opt) => {
        if (!opt.dataset.mcqOptionId) {
            opt.remove();
        }
    });

    // If there were originally no options, and none remain now, remove the container (optional)
    const originalIds = JSON.parse(container.dataset.originalMcqIds || '[]');
    const stillHasOption = !!mcqContainer.querySelector('.mcq-option');
    if (originalIds.length === 0 && !stillHasOption) {
        mcqContainer.remove();
    }

    // Clean up flags
    delete container.dataset.originalMcqIds;
    delete container.dataset.mcqHadContainer;
    delete container.dataset.mcqOriginalCount;
}



/**
 * Add drag + delete affordances for each existing .mcq-option (and convert content into inputs if needed)
 */
function makeOptionsInteractive(mcqContainer) {
    Array.from(mcqContainer.querySelectorAll('.mcq-option')).forEach((opt) => {
        // Drag handle (added only once)
        if (!opt.querySelector('.drag-handle')) {
            const handle = document.createElement('span');
            handle.className = 'drag-handle';
            handle.textContent = '⋮⋮';
            handle.title = 'Drag to reorder';
            handle.style.cursor = 'grab';
            opt.insertBefore(handle, opt.firstChild);
        }

        // Delete button (added only once)
        if (!opt.querySelector('.mcq-delete-btn')) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'mcq-delete-btn';
            del.textContent = '×';
            del.addEventListener('click', () => {
                opt.remove();
                renumberLetters(mcqContainer);
                setUniformMcqLetterWidth(mcqContainer); // ← NEW
            });
            opt.appendChild(del);
        }

        // Make draggable
        opt.setAttribute('draggable', 'true');
        opt.addEventListener('dragstart', () => {
            opt.classList.add('dragging');
        });
        opt.addEventListener('dragend', () => {
            opt.classList.remove('dragging');
        });

        // Ensure the letter element has the expected class for renumbering
        let letterEl = opt.querySelector('.mcq-letter');
        if (!letterEl) {
            letterEl = opt.querySelector('strong') || document.createElement('strong');
            letterEl.className = 'mcq-letter';
            if (!letterEl.parentElement) opt.insertBefore(letterEl, opt.children[1] || null);
        }
    });
}

/**
 * Create a new MCQ option row with an editable input immediately
 */
function addMcqOption(mcqContainer) {
    const opt = document.createElement('div');
    opt.className = 'mcq-option';
    // no dataset id => treated as new on save
    const letterStrong = document.createElement('strong');
    letterStrong.className = 'mcq-letter';
    letterStrong.textContent = '?';

    const contentWrapper = document.createElement('span');
    contentWrapper.className = 'formatted-text';
    contentWrapper.dataset.editable = 'mcq_content';

    const input = document.createElement('input');
    input.className = 'editable-input';
    input.type = "text";
    input.placeholder = 'Option text...';
    contentWrapper.appendChild(input);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mcq-delete-btn';
    del.textContent = '×';
    del.addEventListener('click', () => {
        opt.remove();
        renumberLetters(mcqContainer);
    });

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';
    handle.title = 'Drag to reorder';
    handle.style.cursor = 'grab';

    opt.appendChild(handle);
    opt.appendChild(letterStrong);
    opt.appendChild(contentWrapper);
    opt.appendChild(del);

    opt.setAttribute('draggable', 'true');
    opt.addEventListener('dragstart', () => opt.classList.add('dragging'));
    opt.addEventListener('dragend', () => opt.classList.remove('dragging'));

    mcqContainer.appendChild(opt);
}

function setUniformMcqLetterWidth(mcqContainer) {
    const letters = Array.from(mcqContainer.querySelectorAll('.mcq-letter'));
    if (!letters.length) return;

    // Clear any previous inline width so we measure natural width
    letters.forEach(el => (el.style.width = ''));

    // A few extra pixels for breathing room
    const px = 20;
    mcqContainer.style.setProperty('--mcq-letter-col', `${px}px`);
}


/**
 * Renumber letters by current DOM order (A, B, C... AA...)
 */
function renumberLetters(mcqContainer) {
    const toLetter = (i) => {
        let s = ''; i += 1;
        while (i > 0) {
            const rem = (i - 1) % 26;
            s = String.fromCharCode(65 + rem) + s;
            i = Math.floor((i - 1) / 26);
        }
        return s;
    };

    Array.from(mcqContainer.querySelectorAll('.mcq-option')).forEach((opt, idx) => {
        const letterEl = opt.querySelector('.mcq-letter');
        if (letterEl) letterEl.textContent = `${toLetter(idx)}:`;
    });
}


/**
 * Find where to insert the dragged element based on mouse Y
 */
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.mcq-option:not(.dragging)')];
    return draggableElements.reduce(
        (closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        },
        { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
}


function setEditModeStyles(root, isEditing, targetType) {
    const apply = (sel, fn) => root.querySelectorAll(sel).forEach(fn);

    switch (targetType) {
        case 'model_alternative': {
            // Only affect model components inside the model alternative being edited
            apply('.model-component p', el => el.style.height = isEditing ? '-webkit-fill-available' : '');
            apply('.model-component p', el => el.style.width = isEditing ? 'inherit' : '');
            apply('.model-component', el => el.style.borderBottom = isEditing ? 'none' : '');
            apply('.model-component', el => el.style.paddingTop = isEditing ? '0.4rem' : '');
            apply('.points-badge', el => el.style.marginBottom = isEditing ? '0' : '');
            apply('.points-badge', el => el.style.borderRadius = isEditing ? '10px' : '');
            apply('.points-badge', el => el.style.paddingRight = isEditing ? '5px' : '');
            break;
        }
        case 'student_answer':
        case 'student_info': {
            // Only affect the student area being edited
            apply('.points-awarded-badge', el => el.style.borderRadius = isEditing ? '10px' : '');
            apply('.parenthesis', el => el.style.display = isEditing ? 'none' : '');
            apply('.student-identifier-container', el => {
                el.style.width = isEditing ? '-webkit-fill-available' : '';
                el.style.display = isEditing ? 'flex' : '';
                el.style.flexDirection = isEditing ? 'column' : '';
                el.style.gap = isEditing ? '0.5rem' : '';
            });
            break;
        }
        case 'appendix': {
            // Currently no special styles needed; keep as a no-op
            break;
        }
        case 'question_context':
        default: {
            // IMPORTANT: Do NOT touch model/answers when editing context text
            // No style overrides for question context to avoid leakage.
            break;
        }
    }
}
