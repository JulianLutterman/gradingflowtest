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
  } else {
    if (editButton) editButton.classList.remove('hidden');
    if (editActions) editActions.classList.add('hidden');

    const targetType = editButton?.dataset.editTarget;
    if (targetType === 'sub_question') {
      container.style.display = 'flex';
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
        const subQText = container.querySelector('[data-editable="sub_q_text_content"] .editable-input').value;
        promises.push(sb.from('sub_questions').update({ sub_q_text_content: subQText }).eq('id', subQId));
        container.querySelectorAll('.mcq-option').forEach((mcqEl) => {
          const mcqId = mcqEl.dataset.mcqOptionId;
          const mcqContent = mcqEl.querySelector('[data-editable="mcq_content"] .editable-input').value;
          promises.push(sb.from('mcq_options').update({ mcq_content: mcqContent }).eq('id', mcqId));
        });
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
