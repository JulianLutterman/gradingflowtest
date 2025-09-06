/**
 * Render the exam questions, appendices, models, and student answers.
 * @param {Array<any>} questions
 */
function renderExam(questions) {
  questionsContainer.innerHTML = '';
  if (!questions || questions.length === 0) {
    questionsContainer.innerHTML = '<p>This exam has no questions yet.</p>';
    return;
  }

  questions.sort((a, b) => a.question_number.localeCompare(b.question_number, undefined, { numeric: true }));

  questions.forEach((q) => {
    const questionBlock = document.createElement('div');
    questionBlock.className = 'question-block';
    questionBlock.dataset.questionId = q.id;

    let appendixButtonHtml = '';
    if (q.appendices && q.appendices.length > 0) {
      const buttonId = `appendix-btn-${q.id}`;
      appendixButtonHtml = `<button id="${buttonId}" class="appendix-button">Show Appendix</button>`;
    }

    let gridHtml = '';
    if (q.sub_questions && q.sub_questions.length > 0) {
      const subQuestionCells = q.sub_questions
        .map((sq) => {
            let mcqHtml = '';
            if (sq.mcq_options && sq.mcq_options.length > 0) {
                // Always render in alphabetical letter order so UI is stable after any save/reload
                const sorted = [...sq.mcq_options].sort((a, b) =>
                    (a.mcq_letter || '').localeCompare(b.mcq_letter || '')
                );

                mcqHtml =
                    `<div class="mcq-options">` +
                    sorted
                        .map(
                            (opt) => `
                              <div class="mcq-option" data-mcq-option-id="${opt.id}">
                                <strong class="mcq-letter">${opt.mcq_letter || ''}:</strong>
                                <span class="formatted-text"
                                      data-editable="mcq_content"
                                      data-original-text='${JSON.stringify(opt.mcq_content || '')}'>${opt.mcq_content || ''}</span>
                              </div>`
                        )
                        .join('') +
                    `</div>`;
            } else {
                // Keep an empty container so editing UI can inject new options
                mcqHtml = `<div class="mcq-options"></div>`;
            }

          const subQCell = `
                    <div id="sub-q-gridcell" class="grid-cell" data-sub-question-id="${sq.id}">
                        <div class="sub-question-content">
                            <p class="formatted-text"><strong data-editable="sub_q_text_content" data-original-text="${
                              sq.sub_q_text_content || ''
                            }">${sq.sub_q_text_content || ''}</strong></p>
                            ${mcqHtml}
                        </div>
                        <button id="sub-q-edit-btn" class="edit-btn" data-edit-target="sub_question" data-sub-question-id="${sq.id}">${EDIT_ICON_SVG}</button>
                    </div>`;

          let modelAnswerHtml = 'No model answer provided.';
          if (sq.model_alternatives && sq.model_alternatives.length > 0) {
            sq.model_alternatives.sort((a, b) => a.alternative_number - b.alternative_number);
            const alternativesHtml = sq.model_alternatives
              .sort((a, b) => a.alternative_number - b.alternative_number)
              .map((alt) => {
                const comps = (alt.model_components || []).sort((a, b) => a.component_order - b.component_order);
            
                const componentsHtml = comps.map((comp) => `
                  <div class="model-component" data-component-id="${comp.id}">
                    ${comp.component_text ? `<p class="formatted-text" data-editable="component_text" data-original-text="${comp.component_text || ''}">${comp.component_text}</p>` : `
                      <p class="formatted-text" data-editable="component_text"></p>`}
                    ${comp.component_visual ? `<img src="${comp.component_visual}" alt="Model component visual">` : ''}
                    <span class="points-badge">Points: <span data-editable="component_points">${comp.component_points}</span></span>
                  </div>
                `).join('');
            
                return `
                  <div class="model-alternative" data-alternative-id="${alt.id}">
                    <button id="model-alt-edit-btn" class="edit-btn" data-edit-target="model_alternative" data-alternative-id="${alt.id}">${EDIT_ICON_SVG}</button>
                    <h5>Alternative ${alt.alternative_number}</h5>
            
                    <!-- Edit-only: add extra comment (shown only if none yet) -->
                    <button type="button"
                            class="inline-add-btn add-alt-comment-btn hidden"
                            data-alternative-id="${alt.id}">
                      + Add comment
                    </button>
            
                    ${alt.extra_comment
                      ? `<p class="formatted-text"><em><span data-editable="extra_comment" data-original-text="${alt.extra_comment || ''}">${alt.extra_comment}</span></em></p>`
                      : ''}
            
                    <!-- Components (wrapped so we can append new ones at the end) -->
                    <div class="model-components-container">
                      ${componentsHtml}
                    </div>
            
                    <!-- Edit-only: add component -->
                    <button type="button"
                            class="mcq-convert-btn add-model-component-btn hidden"
                            data-alternative-id="${alt.id}">
                      + Add Model Component
                    </button>
                  </div>`;
              })
              .join('');
            modelAnswerHtml = `<div class="model-answer-section">${alternativesHtml}</div>`;
          }
          const modelCell = `
            <div class="grid-cell" data-sub-question-id="${sq.id}">
              ${modelAnswerHtml}
              <button type="button"
                      class="mcq-convert-btn add-model-alternative-btn"
                      data-sub-question-id="${sq.id}">
                + Add Model Alternative
              </button>
            </div>`;

          let studentAnswersHtml = 'No answers submitted.';
          if (sq.student_answers && sq.student_answers.length > 0) {
            const answersByStudent = sq.student_answers.reduce((acc, ans) => {
              const student = ans.student_exams?.students;
              if (!student) return acc;
              const studentKey = student.id;
              if (!acc[studentKey]) {
                acc[studentKey] = { info: student, answers: [] };
              }
              acc[studentKey].answers.push(ans);
              return acc;
            }, {});

            const studentDropdowns = Object.values(answersByStudent)
              .map((studentData) => {
                const studentIdentifierHtml = `
                            <span data-editable="full_name">${studentData.info.full_name || ''}</span> 
                            <span class="parenthesis">(</span><span data-editable="student_number">${
                              studentData.info.student_number || 'No number'
                            }</span><span class="parenthesis">)</span>`;

                const answersContent = studentData.answers
                  .map((ans) => {
                    const correctedText = ans.answer_text ? ans.answer_text.replace(/\\n/g, '\n') : '';
                    const pointsHtml =
                      ans.sub_points_awarded !== null
                        ? `<div class="points-awarded-badge">Points: <span data-editable="sub_points_awarded">${ans.sub_points_awarded}</span>/${
                            sq.max_sub_points || '?'
                          }</div>`
                        : '';
                    const feedbackHtml = ans.feedback_comment
                      ? `<div class="feedback-comment formatted-text" data-editable="feedback_comment" data-original-text="${ans.feedback_comment || ''}">${ans.feedback_comment}</div>`
                      : '';
                    return `
                                <div class="student-answer-item" data-answer-id="${ans.id}">
                                    <button id="student-answer-edit-btn" class="edit-btn" data-edit-target="student_answer" data-answer-id="${ans.id}">${EDIT_ICON_SVG}</button>
                                    ${correctedText ? `<p class="formatted-text" data-editable="answer_text" data-original-text="${ans.answer_text || ''}">${correctedText}</p>` : ''}
                                    ${ans.answer_visual ? `<img src="${ans.answer_visual}" alt="Student answer visual" class="student-answer-visual">` : ''}
                                    ${pointsHtml}
                                    ${feedbackHtml}
                                </div>`;
                  })
                  .join('');

                return `
                            <details class="student-answer-dropdown" data-student-id="${studentData.info.id}">
                                <summary>
                                    <span class="student-identifier-container">${studentIdentifierHtml}</span>
                                    <button id="student-name-edit-btn" class="edit-btn" data-edit-target="student_info" data-student-id="${studentData.info.id}">${EDIT_ICON_SVG}</button>
                                </summary>
                                ${answersContent}
                            </details>`;
              })
              .join('');
            studentAnswersHtml = studentDropdowns;
          }
          const examId = new URLSearchParams(window.location.search).get('id');
          const studentCell = `
            <div class="grid-cell">
              ${studentAnswersHtml}
              <button type="button"
                      class="mcq-convert-btn add-student-btn"
                      data-exam-id="${examId}">
                + Add Student
              </button>
            </div>`;

          return subQCell + modelCell + studentCell;
        })
        .join('');

      gridHtml = `
                <div class="sub-question-grid">
                    <div class="grid-header">Sub-Question</div>
                    <div class="grid-header">Model Answer</div>
                    <div class="grid-header">Student Answers</div>
                    ${subQuestionCells}
                </div>`;
    }

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
                <p class="formatted-text" data-editable="context_text" data-original-text="${q.context_text || ''}" style="flex-grow: 1; margin-top: 0;">${
                  q.context_text || ''
                }</p>
                <button class="edit-btn" data-edit-target="question_context" data-question-id="${q.id}">${EDIT_ICON_SVG}</button>
            </div>
            ${q.context_visual ? `<img src="${q.context_visual}" alt="Visual for question ${q.question_number}" class="context-visual">` : ''}
            ${
              q.extra_comment
                ? `<p class="formatted-text"><em><span data-editable="extra_comment" data-original-text="${q.extra_comment || ''}">${q.extra_comment}</span></em></p>`
                : ''
            }
            ${gridHtml}
        `;
    questionsContainer.appendChild(questionBlock);
    // After: questionsContainer.appendChild(questionBlock);
    const leftCells = questionBlock.querySelectorAll('.sub-question-grid .grid-cell#sub-q-gridcell, .sub-question-grid .grid-cell[data-sub-question-id]');
    const subLeftCells = Array.from(leftCells).filter(
      (el) => el.id === 'sub-q-gridcell' && el.hasAttribute('data-sub-question-id') // left column cells
    );
    if (subLeftCells.length) {
      const lastLeft = subLeftCells[subLeftCells.length - 1];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mcq-convert-btn add-sub-question-btn';
      btn.dataset.questionId = q.id;
      btn.textContent = '+ Add Sub-Question';
      lastLeft.appendChild(btn);
    }
  });

  questions.forEach((q) => {
    if (q.appendices && q.appendices.length > 0) {
      const buttonId = `appendix-btn-${q.id}`;
      const button = document.getElementById(buttonId);
      if (button) {
        button.addEventListener('click', () => {
          const appendices = q.appendices;
          const questionId = q.id;
          const contentHtml = appendices
            .map(
              (app) => `
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
          appendixModal.classList.remove('hidden');
        });
      }
    }
  });

  // After all questionBlocks rendered:
  const addQWrap = document.createElement('div');
  addQWrap.style.display = 'flex';
  addQWrap.style.justifyContent = 'center';
  addQWrap.style.margin = '1rem 0 2rem 0';
  
  const addQBtn = document.createElement('button');
  addQBtn.type = 'button';
  addQBtn.className = 'mcq-convert-btn add-full-question-btn';
  addQBtn.style.maxWidth = '320px';
  addQBtn.textContent = '+ Add Question';
  
  addQWrap.appendChild(addQBtn);
  questionsContainer.appendChild(addQWrap);

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
