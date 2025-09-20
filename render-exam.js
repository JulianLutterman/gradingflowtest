/**
 * Render the exam questions, appendices, models, and student answers.
 * Also renders add-buttons:
 *  - Add Sub-Question (bottom of sub-q column)
 *  - Add Model Alternative (bottom of each sub-q model column)
 *  - Add Student (bottom of each sub-q student column)
 *  - Add Question (below last question)
 */
function renderExam(questions) {
    questionsContainer.innerHTML = '';
    if (!questions || questions.length === 0) {
        questionsContainer.innerHTML = '<p>This exam has no questions yet.</p>';
        // Render global "Add Question" even if none exist
        const urlParams = new URLSearchParams(window.location.search);
        const examId = urlParams.get('id');
        const addQWrap = document.createElement('div');
        addQWrap.innerHTML = `
      <div style="display:flex;margin:1rem 0 0;">
        <button class="add-question-btn add-row-btn" data-exam-id="${examId}">Add New Question</button>
      </div>
    `;
        questionsContainer.appendChild(addQWrap);
        return;
    }

    // Sort by human/numeric question number
    questions.sort((a, b) => a.question_number.localeCompare(b.question_number, undefined, { numeric: true }));

    questions.forEach((q, idx) => {
        const questionBlock = document.createElement('div');
        questionBlock.className = 'question-block';
        questionBlock.dataset.questionId = q.id;

        let appendixButtonHtml = '';
        if (q.appendices && q.appendices.length > 0) {
            const buttonId = `appendix-btn-${q.id}`;
            appendixButtonHtml = `<button id="${buttonId}" class="appendix-button">Show Appendix</button>`;
        }

        const orderedSubQs = [...(q.sub_questions || [])]
            .sort((a, b) => {
                const aa = Number.isFinite(+a.sub_question_order) ? +a.sub_question_order : Number.MAX_SAFE_INTEGER;
                const bb = Number.isFinite(+b.sub_question_order) ? +b.sub_question_order : Number.MAX_SAFE_INTEGER;
                if (aa !== bb) return aa - bb;
                // deterministic fallback if orders collide or are missing
                return (a.id || '').localeCompare(b.id || '');
            });

        const subRows = orderedSubQs.map((sq) => {
            // MCQ (kept container even if empty for editing)
            const mcqHtml = (sq.mcq_options && sq.mcq_options.length > 0)
                ? (`<div class="mcq-options">${[...sq.mcq_options].sort((a, b) => (a.mcq_letter || '').localeCompare(b.mcq_letter || ''))
                        .map(opt => `
                <div class="mcq-option" data-mcq-option-id="${opt.id}">
                  <strong class="mcq-letter">${opt.mcq_letter || ''}:</strong>
                  <span class="formatted-text" data-editable="mcq_content" data-original-text='${JSON.stringify(opt.mcq_content || '')}'>${opt.mcq_content || ''}</span>
                </div>
              `).join('')
                    }</div>`)
                : `<div class="mcq-options"></div>`;

            const subCell = `
        <div id="sub-q-gridcell" class="grid-cell" data-sub-question-id="${sq.id}">
          <div class="sub-question-content">
            <p class="formatted-text">
              <strong data-editable="sub_q_text_content" data-original-text="${sq.sub_q_text_content || ''}">
                ${sq.sub_q_text_content || ''}
              </strong>
            </p>
            ${mcqHtml}
          </div>
          <button id="sub-q-edit-btn" class="edit-btn" data-edit-target="sub_question" data-sub-question-id="${sq.id}">
            ${EDIT_ICON_SVG}
          </button>
        </div>`;

            // Model alternative list
            // Model alternative list (always render a container, with a hideable placeholder)
            let alternativesSection = `
              <div class="model-answer-section">
                ${(sq.model_alternatives && sq.model_alternatives.length > 0)
                                ? (
                                    [...sq.model_alternatives]
                                        .sort((a, b) => a.alternative_number - b.alternative_number)
                                        .map(alt => {
                                            const comps = (alt.model_components || []).sort((a, b) => a.component_order - b.component_order);
                                            const compsHtml = comps.map(comp => `
                            <div class="model-component" data-component-id="${comp.id}">
                              ${comp.component_text ? `<p class="formatted-text" data-editable="component_text" data-original-text="${comp.component_text || ''}">${comp.component_text}</p>` : ''}
                              ${comp.component_visual ? `<img src="${comp.component_visual}" alt="Model component visual">` : ''}
                              <span class="points-badge">Points: <span data-editable="component_points">${comp.component_points}</span></span>
                            </div>
                          `).join('');
                                            return `
                            <div class="model-alternative" data-alternative-id="${alt.id}">
                              <button id="model-alt-edit-btn" class="edit-btn" data-edit-target="model_alternative" data-alternative-id="${alt.id}">${EDIT_ICON_SVG}</button>
                              <h5>Alternative ${alt.alternative_number}</h5>
                              ${alt.extra_comment ? `<p class="formatted-text"><em><span data-editable="extra_comment" data-original-text="${alt.extra_comment || ''}">${alt.extra_comment}</span></em></p>` : ''}
                              ${compsHtml}
                            </div>
                          `;
                                        }).join('')
                                )
                                : ''
                            }
              </div>
            `;

                        const modelCell = `
              <div id="alt-model-gridcell" class="grid-cell" data-sub-question-id="${sq.id}">
                ${alternativesSection}
                <button class="add-model-alt-btn add-row-btn" data-sub-question-id="${sq.id}">Add New Answer Alternative</button>
              </div>
            `;


            // Student answers
            let studentAnswersHtml = '';
            if (sq.student_answers && sq.student_answers.length > 0) {
                const answersByStudent = sq.student_answers.reduce((acc, ans) => {
                    const student = ans.student_exams?.students;
                    if (!student) return acc;
                    const k = student.id;
                    (acc[k] ||= { info: student, answers: [] }).answers.push(ans);
                    return acc;
                }, {});
                studentAnswersHtml = Object.values(answersByStudent).map(studentData => {
                    const idf = `
            <span data-editable="full_name">${studentData.info.full_name || ''}</span>
            <span class="parenthesis">(</span><span data-editable="student_number">${studentData.info.student_number || 'No number'}</span><span class="parenthesis">)</span>
          `;
                    const answersContent = studentData.answers.map(ans => {
                        const corrected = ans.answer_text ? ans.answer_text.replace(/\\n/g, '\n') : '';
                        const pointsHtml = (ans.sub_points_awarded !== null)
                            ? `<div class="points-row">
                                   <div class="points-awarded-badge">Points: <span data-editable="sub_points_awarded">${ans.sub_points_awarded}</span>/${sq.max_sub_points || '?'}</div>
                                 </div>`
                            : '';
                        const feedbackHtml = ans.feedback_comment
                            ? `<div class="feedback-comment formatted-text" data-editable="feedback_comment" data-original-text="${ans.feedback_comment || ''}">${ans.feedback_comment}</div>`
                            : '';
                        return `
              <div class="student-answer-item" data-answer-id="${ans.id}">
                <button id="student-answer-edit-btn" class="edit-btn" data-edit-target="student_answer" data-answer-id="${ans.id}">${EDIT_ICON_SVG}</button>
                ${corrected ? `<p class="formatted-text" data-editable="answer_text" data-original-text="${ans.answer_text || ''}">${corrected}</p>` : ''}
                ${ans.answer_visual ? `<img src="${ans.answer_visual}" alt="Student answer visual" class="student-answer-visual">` : ''}
                ${pointsHtml}
                ${feedbackHtml}
              </div>
            `;
                    }).join('');
                    return `
            <details class="student-answer-dropdown" data-student-id="${studentData.info.id}">
              <summary>
                <span class="student-identifier-container">${idf}</span>
                <button id="student-name-edit-btn" class="edit-btn" data-edit-target="student_info" data-student-id="${studentData.info.id}">${EDIT_ICON_SVG}</button>
              </summary>
              ${answersContent}
            </details>
          `;
                }).join('');
            }

            // Add Student button under this sub-q
            const urlParams = new URLSearchParams(window.location.search);
            const examId = urlParams.get('id');
            const studentCell = `
        <div id="student-answer-gridcell" class="grid-cell" data-sub-question-id="${sq.id}">
          ${studentAnswersHtml}
          <button class="add-student-btn add-row-btn" data-exam-id="${examId}">Add New Student Submission</button>
        </div>`;

            return subCell + modelCell + studentCell;
        }).join('');

        // Sub-q grid (plus "Add Sub-Question" button at bottom of the sub-q column)
        const subGrid = `
      <div class="sub-question-grid">
        <div class="grid-header">Sub-Question</div>
        <div class="grid-header">Model Answer</div>
        <div class="grid-header">Student Answers</div>
        ${subRows || ''}
        <div class="grid-cell grid-footer">
          <button class="add-subq-btn add-row-btn" data-question-id="${q.id}">Add New Sub-Question</button>
        </div>
        <div class="grid-cell grid-footer"></div>
        <div class="grid-cell grid-footer"></div>
      </div>
    `;

        const pointsBadgeHtml = q.max_total_points ? `<span class="question-points-badge">Points: ${q.max_total_points}</span>` : '';

        questionBlock.innerHTML = `
      <div class="question-header">
        <div class="question-title-wrapper">
          <span>Question ${q.question_number}</span>
          ${pointsBadgeHtml}
        </div>
        ${appendixButtonHtml}
      </div>
      <div class="question-context-text">
        <p class="formatted-text" data-editable="context_text" data-original-text="${q.context_text || ''}" style="flex-grow:1;margin-top:0;">${q.context_text || ''}</p>
        <button class="edit-btn" data-edit-target="question_context" data-question-id="${q.id}">${EDIT_ICON_SVG}</button>
      </div>
      ${q.context_visual ? `<img src="${q.context_visual}" alt="Visual for question ${q.question_number}" class="context-visual">` : ''}
      ${q.extra_comment ? `<p class="formatted-text"><em><span data-editable="extra_comment" data-original-text="${q.extra_comment || ''}">${q.extra_comment}</span></em></p>` : ''}
      ${subGrid}
    `;
        questionsContainer.appendChild(questionBlock);
    });

    // Append global Add Question button
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const addQWrap = document.createElement('div');
    addQWrap.innerHTML = `
    <div style="display:flex;margin:1rem 0 0;">
      <button class="add-question-btn add-row-btn" data-exam-id="${examId}">Add New Question</button>
    </div>
  `;
    questionsContainer.appendChild(addQWrap);

    // Wire Appendix modal openers
    questions.forEach((q) => {
        if (q.appendices && q.appendices.length > 0) {
            const buttonId = `appendix-btn-${q.id}`;
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', () => {
                    const appendices = q.appendices;
                    const questionId = q.id;
                    const contentHtml = appendices.map(app => `
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
                    appendixModal.classList.remove('hidden');
                });
            }
        }
    });

    renderMathInElement(questionsContainer, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\$$', right: '\$$', display: false },
            { left: '\$$', right: '\$$', display: true },
        ],
        throwOnError: false,
    });
}

/* ====== STAGING HELPERS (invoked by main.js event delegation) ====== */

/** Make a random token for linking staged DOMs (e.g., staged student across sub-qs) */
function _randToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Collect unique students visible in current exam data */
function _collectCurrentStudents() {
    const set = new Map();
    if (!currentExamData?.questions) return [];
    currentExamData.questions.forEach(q => {
        (q.sub_questions || []).forEach(sq => {
            (sq.student_answers || []).forEach(ans => {
                const s = ans.student_exams?.students;
                if (s && !set.has(s.id)) set.set(s.id, s);
            });
        });
    });
    return Array.from(set.values());
}

/** Stage a new sub-question row for a given questionId and auto-enter edit */
function stageNewSubQuestion(questionId) {
    const qBlock = questionsContainer.querySelector(`.question-block[data-question-id="${questionId}"]`);
    if (!qBlock) return;

    // Ensure grid exists
    let grid = qBlock.querySelector('.sub-question-grid');
    if (!grid) {
        // Create headers and 3 columns if missing
        grid = document.createElement('div');
        grid.className = 'sub-question-grid';
        grid.innerHTML = `
      <div class="grid-header">Sub-Question</div>
      <div class="grid-header">Model Answer</div>
      <div class="grid-header">Student Answers</div>
    `;
        qBlock.appendChild(grid);
    }

    // Insert row before the footer three cells if present
    const footer = grid.querySelector('.grid-footer')?.parentElement ? Array.from(grid.children).slice(-3) : [];
    footer.forEach(el => el.remove());

    // Sub cell
    const subCell = document.createElement('div');
    subCell.id = 'sub-q-gridcell';
    subCell.className = 'grid-cell';
    // No data-sub-question-id (staged)
    subCell.innerHTML = `
    <div class="sub-question-content">
      <p class="formatted-text">
        <strong data-editable="sub_q_text_content" data-original-text=""></strong>
      </p>
      <div class="mcq-options"></div>
    </div>
    <button id="sub-q-edit-btn" class="edit-btn" data-edit-target="sub_question" data-question-id="${questionId}">
      ${EDIT_ICON_SVG}
    </button>
  `;
    grid.appendChild(subCell);

    // Model cell with empty section + add alt button
    const modelCell = document.createElement('div');
    modelCell.className = 'grid-cell';
    modelCell.innerHTML = `
      <div class="model-answer-section"></div>
      <!-- No "Add Answer Alternative" button while this sub-question is staged/unsaved -->
    `;
    grid.appendChild(modelCell);


    // Student cell: placeholders for each student
    const studentCell = document.createElement('div');
    studentCell.className = 'grid-cell';
    const students = _collectCurrentStudents();
    if (students.length === 0) {
        studentCell.innerHTML = ``;
    } else {
        const html = students.map(s => `
      <details class="student-answer-dropdown" data-student-id="${s.id}">
        <summary>
          <span class="student-identifier-container"><span data-editable="full_name">${s.full_name || ''}</span> <span class="parenthesis">(</span><span data-editable="student_number">${s.student_number || 'No number'}</span><span class="parenthesis">)</span></span>
          <button id="student-name-edit-btn" class="edit-btn" data-edit-target="student_info" data-student-id="${s.id}">${EDIT_ICON_SVG}</button>
        </summary>
        <div class="student-answer-item">
          <p class="formatted-text"><em>Student has not attempted to answer this sub question</em></p>
        </div>
      </details>
    `).join('');
        studentCell.innerHTML = html;
    }
    // Add student button
    const urlParams = new URLSearchParams(window.location.search);
    const examId = urlParams.get('id');
    const addStudBtn = document.createElement('button');
    addStudBtn.className = 'add-student-btn add-row-btn';
    addStudBtn.dataset.examId = examId;
    addStudBtn.textContent = 'Add New Student Submission';
    studentCell.appendChild(addStudBtn);
    grid.appendChild(studentCell);

    // Re-append footer
    grid.insertAdjacentHTML('beforeend', `
    <div class="grid-cell grid-footer">
      <button class="add-subq-btn add-row-btn" data-question-id="${questionId}">Add New Sub-Question</button>
    </div>
    <div class="grid-cell grid-footer"></div>
    <div class="grid-cell grid-footer"></div>
  `);

    // Auto-enter edit mode for this new sub-question
    const editBtn = subCell.querySelector('.edit-btn');
    toggleEditMode(subCell, true, null, editBtn);
}

/** Stage a new student across the exam (DOM only). Auto-enter edit for the name in the clicked row. */
function stageNewStudent(examId, originButton) {
    const token = _randToken();

    // Hide ONLY the button in the grid-cell where user clicked
    if (originButton) {
        originButton.classList.add('hidden');
        originButton.dataset.newStudentToken = token;
    }

    // We target student cells by looking for cells that contain the .add-student-btn
    const studentCells = questionsContainer.querySelectorAll('.sub-question-grid .grid-cell');

    studentCells.forEach((cell) => {
        const addBtn = cell.querySelector('.add-student-btn');
        if (!addBtn) return; // skip non-student columns or headers/footers

        const wrapper = document.createElement('details');
        wrapper.className = 'student-answer-dropdown';
        wrapper.dataset.newStudentToken = token;

        let subId = cell.dataset.subQuestionId || null;
        if (!subId) {
            const modelCell = cell.previousElementSibling || null;
            const subCell = modelCell ? modelCell.previousElementSibling : null;
            const candidate = subCell && subCell.dataset ? subCell.dataset.subQuestionId : null;
            if (candidate) subId = candidate;
        }
        if (subId) wrapper.dataset.subQuestionId = subId;

        wrapper.open = true;
        wrapper.innerHTML = `
      <summary>
        <span class="student-identifier-container">
          <span data-editable="full_name" data-original-text=""></span>
          <span class="parenthesis">(</span>
          <span data-editable="student_number" data-original-text=""></span>
          <span class="parenthesis">)</span>
        </span>
        <button id="student-name-edit-btn" class="edit-btn" data-edit-target="student_info" data-exam-id="${examId}" data-new-student-token="${token}">
          ${EDIT_ICON_SVG}
        </button>
      </summary>
      <div class="student-answer-item">
        <p class="formatted-text"><em>Student has not attempted to answer this sub question</em></p>
      </div>
    `;

        cell.insertBefore(wrapper, addBtn);
    });

    // Enter edit mode for the staged student in the SAME row that was clicked
    let targetEditBtn = null;
    const originCell = originButton?.closest('.grid-cell');
    if (originCell) {
        targetEditBtn = originCell.querySelector(`button[data-new-student-token="${token}"]`);
    }
    if (!targetEditBtn) {
        targetEditBtn = questionsContainer.querySelector(`button[data-new-student-token="${token}"]`);
    }

    if (targetEditBtn) {
        const container = targetEditBtn.closest('summary');
        toggleEditMode(container, true, null, targetEditBtn);
        container?.scrollIntoView({ block: 'nearest' });
    }
}




/** Stage a new model alternative for a sub-question (DOM only) and enter edit */
function stageNewModelAlternative(subQuestionId) {
    // Always prefer the Model (middle) cell for this sub-question
    let targetCell = questionsContainer.querySelector(
        `#alt-model-gridcell.grid-cell[data-sub-question-id="${subQuestionId}"]`
    );

    // Fallback: if not found, try to hop to the sibling after the sub-q cell
    if (!targetCell) {
        const subCell = questionsContainer.querySelector(
            `#sub-q-gridcell.grid-cell[data-sub-question-id="${subQuestionId}"]`
        );
        if (subCell) targetCell = subCell.nextElementSibling;
    }
    if (!targetCell) return;

    let section = targetCell.querySelector('.model-answer-section');
    if (!section) {
        section = document.createElement('div');
        section.className = 'model-answer-section';
        targetCell.insertBefore(section, targetCell.firstChild);
    }

    // Hide the "Add Answer Alternative" button in THIS cell during first-edit
    const addAltBtn = targetCell.querySelector('.add-model-alt-btn');
    if (addAltBtn) addAltBtn.classList.add('hidden');

    // Hide the placeholder (if present)
    const placeholder = section.querySelector('.no-model-placeholder');
    if (placeholder) placeholder.classList.add('hidden');

    const existing = section.querySelectorAll('.model-alternative').length;
    const alt = document.createElement('div');
    alt.className = 'model-alternative';
    alt.dataset.isNew = '1';
    alt.innerHTML = `
    <button id="model-alt-edit-btn" class="edit-btn" data-edit-target="model_alternative" data-sub-question-id="${subQuestionId}">
      ${EDIT_ICON_SVG}
    </button>
    <h5>Alternative ${existing + 1}</h5>
    <!-- extra comment can be added via edit-only button -->
  `;
    section.appendChild(alt);

    const btn = alt.querySelector('.edit-btn');
    toggleEditMode(alt, true, null, btn);
}




/** Stage a new empty question block and enter edit for its context */
function stageNewQuestion(examId) {
    // Compute next question number from current DOM
    const existingNums = Array.from(
        questionsContainer.querySelectorAll('.question-header .question-title-wrapper span')
    )
        .map(el => (el.textContent || '').replace('Question ', '').trim())
        .filter(Boolean);

    let nextNum = '1';
    try {
        const asNum = existingNums.map(x => parseInt(x, 10)).filter(n => !isNaN(n));
        nextNum = String((asNum.length ? Math.max(...asNum) : 0) + 1);
    } catch {
        nextNum = '1';
    }

    const block = document.createElement('div');
    block.className = 'question-block';
    block.dataset.isNewQuestion = '1';
    block.innerHTML = `
    <div class="question-header">
      <div class="question-title-wrapper">
        <span>Question ${nextNum}</span>
      </div>
    </div>
    <div class="question-context-text">
      <p class="formatted-text" data-editable="context_text" data-original-text="" style="flex-grow:1;margin-top:0;"></p>
      <button class="edit-btn" data-edit-target="question_context" data-exam-id="${examId}" data-question-number="${nextNum}">
        ${EDIT_ICON_SVG}
      </button>
    </div>
    <div class="sub-question-grid">
      <div class="grid-header">Sub-Question</div>
      <div class="grid-header">Model Answer</div>
      <div class="grid-header">Student Answers</div>
      <div class="grid-cell grid-footer"></div>
      <div class="grid-cell grid-footer"></div>
      <div class="grid-cell grid-footer"></div>
    </div>
  `;

    // Insert the staged question block just above the global "Add Question" button wrapper
    const globalAddWrap = (() => {
        const allAddBtns = questionsContainer.querySelectorAll('.add-question-btn');
        if (allAddBtns.length) {
            let node = allAddBtns[allAddBtns.length - 1];
            while (node && node.parentElement !== questionsContainer) {
                node = node.parentElement;
            }
            return node || null;
        }
        return null;
    })();

    if (globalAddWrap) {
        questionsContainer.insertBefore(block, globalAddWrap);
    } else {
        questionsContainer.appendChild(block);
    }

    // Hide global "Add New Question" while the staged question is in first-edit
    const globalAddBtn = questionsContainer.querySelector('.add-question-btn');
    if (globalAddBtn) globalAddBtn.classList.add('hidden');

    // Enter edit for question context
    const btn = block.querySelector('.question-context-text .edit-btn');
    toggleEditMode(block, true, ['context_text', 'extra_comment'], btn);
}
