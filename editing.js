// =================================================================
// --- INLINE EDITING WORKFLOW ---
// =================================================================

/**
 * Delegated click handler for inline edit buttons.
 * @param {MouseEvent} event
 */
async function handleEditClick(event) {
  const editButton = event.target.closest('.edit-btn');
  if (!editButton) return;

  // Find the container that holds the editable fields and the button
  const targetType = editButton.dataset.editTarget;
  let container;
  let fields = null; // NEW: To specify which fields to edit

  switch (targetType) {
    case 'exam_name':
      container = editButton.parentElement; // The H1 tag
      break;
    case 'grading_regulations':
      container = editButton.parentElement.parentElement; // The modal text div
      break;
    case 'question_context':
      container = editButton.closest('.question-block');
      fields = ['context_text', 'extra_comment']; // MODIFIED: Specify fields
      break;
    case 'sub_question':
      container = editButton.closest('.grid-cell[data-sub-question-id]');
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

  toggleEditMode(container, true, fields); // MODIFIED: Pass fields to the function
}

/**
 * Toggle edit mode for a container with [data-editable] fields.
 * @param {HTMLElement} container
 * @param {boolean} isEditing
 * @param {string[]|null} fields
 */
function toggleEditMode(container, isEditing, fields = null) {
  // --- START: ADD THIS NEW BLOCK ---
  const editButtonForTargetCheck = container.querySelector('.edit-btn');
  if (editButtonForTargetCheck?.dataset.editTarget === 'student_info') {
    container.classList.toggle('is-editing-summary', isEditing);
  }
  // --- END: ADD THIS NEW BLOCK ---

  container
    .querySelectorAll('.points-badge')
    .forEach((badge) => (badge.style.marginBottom = isEditing ? '0' : ''));
  container
    .querySelectorAll('.points-badge')
    .forEach((badge) => (badge.style.borderRadius = isEditing ? '10px' : ''));
  container
    .querySelectorAll('.points-badge')
    .forEach((badge) => (badge.style.paddingRight = isEditing ? '5px' : ''));
  container
    .querySelectorAll('.points-awarded-badge')
    .forEach((badge) => (badge.style.borderRadius = isEditing ? '10px' : ''));
  container
    .querySelectorAll('.model-component p')
    .forEach((p) => (p.style.height = isEditing ? '-webkit-fill-available' : ''));
  container
    .querySelectorAll('.model-component p')
    .forEach((p) => (p.style.width = isEditing ? 'inherit' : ''));
  container
    .querySelectorAll('.model-component')
    .forEach((div) => (div.style.borderBottom = isEditing ? 'none' : ''));
  container
    .querySelectorAll('.model-component')
    .forEach((div) => (div.style.paddingTop = isEditing ? '0.4rem' : ''));
  container
    .querySelectorAll('.parenthesis')
    .forEach((p) => (p.style.display = isEditing ? 'none' : ''));
  container
    .querySelectorAll('.student-identifier-container')
    .forEach((span) => (span.style.width = isEditing ? '-webkit-fill-available' : ''));
  container
    .querySelectorAll('.student-identifier-container')
    .forEach((span) => (span.style.display = isEditing ? 'flex' : ''));
  container
    .querySelectorAll('.student-identifier-container')
    .forEach((span) => (span.style.flexDirection = isEditing ? 'column' : ''));
  container
    .querySelectorAll('.student-identifier-container')
    .forEach((span) => (span.style.gap = isEditing ? '0.5rem' : ''));

  const editButton = container.querySelector('.edit-btn');
  let editActions = container.querySelector('.edit-actions');

  const selector = fields ? fields.map((field) => `[data-editable="${field}"]`).join(', ') : '[data-editable]';

  if (isEditing) {
    if (editButton) editButton.classList.add('hidden');

    if (!editActions) {
      editActions = document.createElement('div');
      editActions.className = 'edit-actions';
      editActions.innerHTML = `
                <button class="save-btn">Save</button>
                <button class="cancel-btn">Cancel</button>
            `;
      const buttonParent = editButton.closest('.cell-header') || editButton.parentElement;
      buttonParent.appendChild(editActions);
    }
    editActions.classList.remove('hidden');

    const targetType = editButton?.dataset.editTarget;
    if (targetType === 'sub_question') {
      container.style.display = 'block';
    }

    container.querySelectorAll(selector).forEach((el) => {
      const isQuestionContextEdit = editButton.dataset.editTarget === 'question_context';
      if (isQuestionContextEdit && el.dataset.editable === 'extra_comment' && el.closest('.model-alternative')) {
        return;
      }

      // MODIFICATION: Store the rendered HTML for cancel, but use raw text for the input.
      el.dataset.originalValue = el.innerHTML; // Store rendered HTML for perfect cancel

      // --- WITH THIS BLOCK ---
      let rawText;
      try {
        if (el.dataset.originalText !== undefined && el.dataset.originalText !== null) {
          rawText = JSON.parse(el.dataset.originalText);
        } else {
          rawText = el.textContent.trim(); // Fallback if attribute is missing
        }
      } catch (e) {
        rawText = el.dataset.originalText || el.textContent.trim();
      }
      // --- END OF REPLACEMENT ---

      let input;
      const fieldType = el.dataset.editable;

      if (
        ['context_text', 'extra_comment', 'feedback_comment', 'grading_regulations', 'answer_text', 'sub_q_text_content', 'mcq_content', 'app_text'].includes(
          fieldType,
        )
      ) {
        input = document.createElement('textarea');
        input.value = fieldType === 'grading_regulations' ? el.innerHTML : rawText; // Use raw text
        input.rows = Math.max(3, rawText.length / 70);
      } else {
        input = document.createElement('input');
        input.type = fieldType === 'component_points' || fieldType === 'sub_points_awarded' ? 'number' : 'text';
        input.value = rawText; // Use raw text
      }

      input.className = 'editable-input';
      el.innerHTML = '';
      el.appendChild(input);
      if (input.type === 'text') input.select();
      else input.focus();
    });

    editActions.querySelector('.save-btn').onclick = () => saveChanges(container);
    editActions.querySelector('.cancel-btn').onclick = () => toggleEditMode(container, false, fields);

    if (editButton?.dataset.editTarget === 'sub_question') {
        setupMcqEditingUI(container);
    }
  } else {
    if (editButton) editButton.classList.remove('hidden');
    if (editActions) editActions.classList.add('hidden');

    const targetType = editButton?.dataset.editTarget;
    if (targetType === 'sub_question') {
        container.style.display = 'flex';
        teardownMcqEditingUI(container);
    }

    container.querySelectorAll(selector).forEach((el) => {
      const isQuestionContextEdit = editButton.dataset.editTarget === 'question_context';
      if (isQuestionContextEdit && el.dataset.editable === 'extra_comment' && el.closest('.model-alternative')) {
        return;
      }
      if (el.dataset.originalValue) {
        el.innerHTML = el.dataset.originalValue;
      }
    });
  }
}

/**
 * Persist edits to the database and refresh the UI.
 * @param {HTMLElement} container
 */
async function saveChanges(container) {
  const editButton = container.querySelector('.edit-btn');
  const targetType = editButton.dataset.editTarget;
  const examId = new URLSearchParams(window.location.search).get('id');

  try {
    let promises = [];
    switch (targetType) {
      case 'exam_name': {
        const examName = container.querySelector('[data-editable="exam_name"] .editable-input').value;
        promises.push(sb.from('exams').update({ exam_name: examName }).eq('id', editButton.dataset.examId));
        break;
      }
      case 'grading_regulations': {
        const regulations = container.querySelector('[data-editable="grading_regulations"] .editable-input').value;
        promises.push(sb.from('exams').update({ grading_regulations: regulations }).eq('id', editButton.dataset.examId));
        break;
      }
      case 'question_context': {
        const contextUpdates = {};
        const contextTextEl = container.querySelector('[data-editable="context_text"] .editable-input');
        if (contextTextEl) {
          contextUpdates.context_text = contextTextEl.value;
        }
        const allExtraCommentInputs = container.querySelectorAll('[data-editable="extra_comment"] .editable-input');
        allExtraCommentInputs.forEach((input) => {
          if (!input.closest('.model-alternative')) {
            contextUpdates.extra_comment = input.value;
          }
        });
        promises.push(sb.from('questions').update(contextUpdates).eq('id', editButton.dataset.questionId));
        break;
      }
      case 'sub_question': {
          const subQId = editButton.dataset.subQuestionId;

          // 1) Update sub-question text
          const subQTextInput = container.querySelector('[data-editable="sub_q_text_content"] .editable-input');
          const subQText = subQTextInput ? subQTextInput.value : null;
          if (subQText !== null) {
              promises.push(sb.from('sub_questions').update({ sub_q_text_content: subQText }).eq('id', subQId));
          }

          // 2) Build final MCQ list from DOM order and relabel A, B, C, ...
          const mcqContainer = container.querySelector('.mcq-options');
          const optionEls = Array.from(mcqContainer.querySelectorAll('.mcq-option'));

          // Compute letter sequence
          const toLetter = (i) => {
              // 0->A ... 25->Z ... 26->AA
              let s = '';
              i += 1;
              while (i > 0) {
                  const rem = (i - 1) % 26;
                  s = String.fromCharCode(65 + rem) + s;
                  i = Math.floor((i - 1) / 26);
              }
              return s;
          };

          const finalList = optionEls.map((el, idx) => {
              const id = el.dataset.mcqOptionId || null;
              const input = el.querySelector('[data-editable="mcq_content"] .editable-input');
              const content = input ? (input.value || '').trim() : '';
              return {
                  id,
                  mcq_letter: toLetter(idx),
                  mcq_content: content,
              };
          }).filter(item => item.mcq_content !== '');

          // Get original IDs (captured when entering edit mode)
          const originalIds = JSON.parse(container.dataset.originalMcqIds || '[]');

          const presentExistingIds = finalList.filter(x => !!x.id).map(x => x.id);
          const toDeleteIds = originalIds.filter(id => !presentExistingIds.includes(id));

          const toInsert = finalList.filter(x => !x.id).map(x => ({
              sub_question_id: subQId,
              mcq_letter: x.mcq_letter,
              mcq_content: x.mcq_content,
          }));

          const toUpdate = finalList.filter(x => !!x.id);

          // 3) Persist: deletes, updates (including letters), inserts
          if (toDeleteIds.length > 0) {
              promises.push(sb.from('mcq_options').delete().in('id', toDeleteIds));
          }

          for (const upd of toUpdate) {
              promises.push(
                  sb.from('mcq_options')
                      .update({ mcq_letter: upd.mcq_letter, mcq_content: upd.mcq_content })
                      .eq('id', upd.id)
              );
          }

          if (toInsert.length > 0) {
              promises.push(sb.from('mcq_options').insert(toInsert));
          }

          break;
      }
      case 'model_alternative': {
        const altId = editButton.dataset.alternativeId;
        const extraComm = container.querySelector('[data-editable="extra_comment"] .editable-input');
        if (extraComm) {
          promises.push(sb.from('model_alternatives').update({ extra_comment: extraComm.value }).eq('id', altId));
        }
        container.querySelectorAll('.model-component').forEach((compEl) => {
          const compId = compEl.dataset.componentId;
          const compUpdates = {};
          const compText = compEl.querySelector('[data-editable="component_text"] .editable-input');
          const compPoints = compEl.querySelector('[data-editable="component_points"] .editable-input');
          if (compText) compUpdates.component_text = compText.value;
          if (compPoints) compUpdates.component_points = Number(compPoints.value);
          if (Object.keys(compUpdates).length > 0) {
            promises.push(sb.from('model_components').update(compUpdates).eq('id', compId));
          }
        });
        break;
      }
      case 'student_answer': {
        const ansId = editButton.dataset.answerId;
        const ansUpdates = {};
        const ansText = container.querySelector('[data-editable="answer_text"] .editable-input');
        const ansPoints = container.querySelector('[data-editable="sub_points_awarded"] .editable-input');
        const ansFeedback = container.querySelector('[data-editable="feedback_comment"] .editable-input');
        if (ansText) ansUpdates.answer_text = ansText.value;
        if (ansPoints) ansUpdates.sub_points_awarded = Number(ansPoints.value);
        if (ansFeedback) ansUpdates.feedback_comment = ansFeedback.value;
        promises.push(sb.from('student_answers').update(ansUpdates).eq('id', ansId));
        break;
      }
      case 'student_info': {
        const studentId = editButton.dataset.studentId;
        const studentUpdates = {};
        const studentName = container.querySelector('[data-editable="full_name"] .editable-input');
        const studentNumber = container.querySelector('[data-editable="student_number"] .editable-input');
        if (studentName) studentUpdates.full_name = studentName.value;
        if (studentNumber) studentUpdates.student_number = studentNumber.value;
        promises.push(sb.from('students').update(studentUpdates).eq('id', studentId));
        break;
      }
      case 'appendix': {
        container.querySelectorAll('.appendix-item').forEach((item) => {
          const appendixId = item.dataset.appendixId;
          const appTitleInput = item.querySelector('[data-editable="app_title"] .editable-input');
          const appTextInput = item.querySelector('[data-editable="app_text"] .editable-input');

          if (appendixId && appTitleInput && appTextInput) {
            const appTitle = appTitleInput.value;
            const appText = appTextInput.value;

            promises.push(
              sb.from('appendices').update({ app_title: appTitle, app_text: appText }).eq('id', appendixId),
            );
          }
        });
        break;
      }
      default:
        throw new Error('Unknown edit target type.');
    }

    const results = await Promise.all(promises);
    const firstError = results.find((res) => res.error);
    if (firstError) throw firstError.error;

    if (targetType === 'model_alternative') {
      const gridCell = editButton.closest('.grid-cell');
      if (gridCell) {
        const subQId = gridCell.dataset.subQuestionId;
        if (subQId) {
          console.log(`Recalculating exam points based on sub-question: ${subQId}`);
          const { error: rpcError } = await sb.rpc('recalculate_exam_points_from_sub_question', {
            p_sub_question_id: subQId,
          });
          if (rpcError) {
            console.error('Error recalculating exam points:', rpcError);
            alert('Points saved, but an error occurred while updating totals.');
          }
        }
      }
    }

    if (targetType === 'student_answer') {
      const ansId = editButton.dataset.answerId;
      if (ansId) {
        const { data: answerData, error: fetchError } = await sb
          .from('student_answers')
          .select('student_exam_id')
          .eq('id', ansId)
          .single();
        if (fetchError) {
          console.error('Could not fetch student_exam_id for recalculation:', fetchError);
        } else if (answerData && answerData.student_exam_id) {
          const studentExamId = answerData.student_exam_id;
          console.log(`Recalculating total points for student_exam: ${studentExamId}`);
          const { error: rpcError } = await sb.rpc('recalculate_student_total_points', {
            p_student_exam_id: studentExamId,
          });
          if (rpcError) {
            console.error('Error recalculating student total points:', rpcError);
            alert('Points saved, but an error occurred while updating student total.');
          }
        }
      }
    }

    console.log('Save successful for:', targetType);
    await loadExamDetails(examId);

    if (targetType === 'grading_regulations') {
      rulesModalText.innerHTML = `
                <div data-editable="grading_regulations">${marked.parse(currentExamData.grading_regulations)}</div>
                <div class="modal-edit-container">
                     <button id="modal-edit-btn" class="edit-btn" data-edit-target="grading_regulations" data-exam-id="${examId}">
                        ${EDIT_ICON_SVG}
                    </button>
                </div>
            `;
    } else if (targetType === 'appendix') {
      const questionId = editButton.dataset.questionId;
      const questionData = currentExamData.questions.find((q) => q.id == questionId);

      if (questionData && questionData.appendices) {
        const contentHtml = questionData.appendices
          .map(
            (app) =>
              `
                    <div class="appendix-item" data-appendix-id="${app.id}">
                        <h4 data-editable="app_title" data-original-text='${JSON.stringify(app.app_title || '')}'>${app.app_title || 'Appendix Item'}</h4>
                        <p class="formatted-text" data-editable="app_text" data-original-text='${JSON.stringify((app.app_text || '').trim())}'>${
                          (app.app_text || '').trim()
                        }</p>
                        ${app.app_visual ? `<img src="${app.app_visual}" alt="Appendix visual">` : ''}
                    </div>
                `.trim(),
          )
          .join('');

        appendixModalContent.innerHTML = `<div id="appendix-editable-area">${contentHtml}</div>
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
    toggleEditMode(container, false);
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
    if (!mcqContainer) {
        mcqContainer = document.createElement('div');
        mcqContainer.className = 'mcq-options';
        subContent.appendChild(mcqContainer);
    }

    // Save original IDs so we can compute deletions on save
    const originalIds = Array.from(mcqContainer.querySelectorAll('.mcq-option'))
        .map(el => el.dataset.mcqOptionId)
        .filter(Boolean);
    container.dataset.originalMcqIds = JSON.stringify(originalIds);

    const hasOptions = !!mcqContainer.querySelector('.mcq-option');
    if (!hasOptions) {
        // Show a small convert button instead of the full toolbar
        if (!subContent.querySelector('.mcq-convert-btn')) {
            const convertBtn = document.createElement('button');
            convertBtn.type = 'button';
            convertBtn.className = 'mcq-convert-btn';
            convertBtn.textContent = 'Add multiple-choice option';
            convertBtn.addEventListener('click', () => {
                addMcqOption(mcqContainer);
                renumberLetters(mcqContainer);
                convertBtn.remove();           // swap to full toolbar after first option
                makeOptionsInteractive(mcqContainer);
                // then create the normal toolbar:
                const toolbar = document.createElement('div');
                toolbar.className = 'mcq-edit-toolbar';
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.textContent = '+ Add Option';
                addBtn.className = 'pushable-button';
                addBtn.addEventListener('click', () => {
                    addMcqOption(mcqContainer);
                    renumberLetters(mcqContainer);
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
        toolbar.style.display = 'flex';
        toolbar.style.gap = '0.5rem';
        toolbar.style.margin = '0.5rem 0';

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '+ Add Option';
        addBtn.className = 'pushable-button';
        addBtn.addEventListener('click', () => {
            addMcqOption(mcqContainer);
            renumberLetters(mcqContainer);
        });

        toolbar.appendChild(addBtn);
        subContent.appendChild(toolbar);
    }

    // Make existing items draggable and show delete buttons
    makeOptionsInteractive(mcqContainer);

    // Drag-over handling (one listener on the container)
    mcqContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = mcqContainer.querySelector('.dragging');
        if (!dragging) return;

        const afterElement = getDragAfterElement(mcqContainer, e.clientY);
        if (afterElement == null) {
            mcqContainer.appendChild(dragging);
        } else {
            mcqContainer.insertBefore(dragging, afterElement);
        }
    });

    mcqContainer.addEventListener('drop', () => {
        const dragging = mcqContainer.querySelector('.dragging');
        if (dragging) dragging.classList.remove('dragging');
        renumberLetters(mcqContainer);
    });
}

/**
 * Remove edit-only controls/attrs for MCQs
 */
function teardownMcqEditingUI(container) {
    const subContent = container.querySelector('.sub-question-content');
    if (!subContent) return;

    // Remove toolbar
    const toolbar = subContent.querySelector('.mcq-edit-toolbar');
    if (toolbar) toolbar.remove();

    const mcqContainer = subContent.querySelector('.mcq-options');
    if (!mcqContainer) return;

    // Remove drag handles, delete buttons, draggable attrs
    mcqContainer.querySelectorAll('.mcq-option').forEach((opt) => {
        opt.removeAttribute('draggable');
        const handle = opt.querySelector('.drag-handle');
        if (handle) handle.remove();
        const del = opt.querySelector('.mcq-delete-btn');
        if (del) del.remove();
        opt.classList.remove('dragging');
    });

    delete container.dataset.originalMcqIds;
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
            handle.style.marginRight = '0.4rem';
            opt.insertBefore(handle, opt.firstChild);
        }

        // Delete button (added only once)
        if (!opt.querySelector('.mcq-delete-btn')) {
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'mcq-delete-btn';
            del.textContent = 'Delete';
            del.style.marginLeft = '0.5rem';
            del.addEventListener('click', () => {
                opt.remove();
                renumberLetters(mcqContainer);
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

    const input = document.createElement('textarea');
    input.className = 'editable-input';
    input.rows = 2;
    input.placeholder = 'Option text...';
    contentWrapper.appendChild(input);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mcq-delete-btn';
    del.textContent = 'Delete';
    del.style.marginLeft = '0.5rem';
    del.addEventListener('click', () => {
        opt.remove();
        renumberLetters(mcqContainer);
    });

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⋮⋮';
    handle.title = 'Drag to reorder';
    handle.style.cursor = 'grab';
    handle.style.marginRight = '0.4rem';

    opt.appendChild(handle);
    opt.appendChild(letterStrong);
    opt.appendChild(contentWrapper);
    opt.appendChild(del);

    opt.setAttribute('draggable', 'true');
    opt.addEventListener('dragstart', () => opt.classList.add('dragging'));
    opt.addEventListener('dragend', () => opt.classList.remove('dragging'));

    mcqContainer.appendChild(opt);
}

/**
 * Renumber letters by current DOM order (A, B, C... AA...)
 */
function renumberLetters(mcqContainer) {
    const toLetter = (i) => {
        let s = '';
        i += 1;
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
