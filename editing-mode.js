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
    if (isEditing && targetType === 'model_alternative') {
        captureModelAlternativeSnapshot(container);
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
            captureModelAlternativeSnapshot(container);

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

function captureModelAlternativeSnapshot(container) {
    if (!container || container.dataset.compSnapshotTaken) return;
    const comps = Array.from(container.querySelectorAll('.model-component'));
    container.dataset.originalCompIds = JSON.stringify(
        comps.map(el => el.dataset.componentId).filter(Boolean)
    );

    const tempWrap = document.createElement('div');
    comps.forEach((el) => {
        const clone = el.cloneNode(true);
        tempWrap.appendChild(clone);
    });

    container.dataset.modelComponentsOriginalHtml = tempWrap.innerHTML;
    container.dataset.compSnapshotTaken = '1';
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

window.handleEditClick = handleEditClick;
window.toggleEditMode = toggleEditMode;
