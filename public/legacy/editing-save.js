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

async function saveExamName({ container, editButton }) {
    const examNameInput = container.querySelector('[data-editable="exam_name"] .editable-input');
    const examName = examNameInput ? examNameInput.value : '';
    const { error } = await sb
        .from('exams')
        .update({ exam_name: examName })
        .eq('id', editButton.dataset.examId);
    if (error) throw error;
    return {};
}

async function saveGradingRegulations({ container, editButton }) {
    const regulationsInput = container.querySelector('[data-editable="grading_regulations"] .editable-input');
    const grading_regulations = regulationsInput ? regulationsInput.value : '';
    const { error } = await sb
        .from('exams')
        .update({ grading_regulations })
        .eq('id', editButton.dataset.examId);
    if (error) throw error;
    return {};
}

async function saveQuestionContext({ container, editButton, examId }) {
    const contextUpdates = {};
    const ctx = container.querySelector('[data-editable="context_text"] .editable-input');
    if (ctx) contextUpdates.context_text = ctx.value;
    const allExtraCommentInputs = container.querySelectorAll('[data-editable="extra_comment"] .editable-input');
    allExtraCommentInputs.forEach((input) => {
        if (!input.closest('.model-alternative')) contextUpdates.extra_comment = input.value;
    });

    let createdQuestionId = null;
    const existingQid = editButton.dataset.questionId;
    if (existingQid) {
        const { error } = await sb.from('questions').update(contextUpdates).eq('id', existingQid);
        if (error) throw error;
        createdQuestionId = existingQid;
    } else {
        const qNum = editButton.dataset.questionNumber || '1';
        const payload = { exam_id: examId, question_number: qNum, ...contextUpdates };
        const { data: insertedQuestion, error } = await sb
            .from('questions')
            .insert(payload)
            .select('id')
            .single();
        if (error) throw error;
        createdQuestionId = insertedQuestion?.id || null;
    }

    return { createdQuestionId };
}

async function saveSubQuestion({ container, editButton, examId }) {
    const subQId = editButton.dataset.subQuestionId;
    const subQTextInput = container.querySelector('[data-editable="sub_q_text_content"] .editable-input');
    const subQText = subQTextInput ? subQTextInput.value : null;

    const mcqContainer = container.querySelector('.mcq-options');
    const optionEls = Array.from(mcqContainer ? mcqContainer.querySelectorAll('.mcq-option') : []);
    const toLetter = (i) => {
        let s = '';
        i += 1;
        while (i > 0) {
            const r = (i - 1) % 26;
            s = String.fromCharCode(65 + r) + s;
            i = Math.floor((i - 1) / 26);
        }
        return s;
    };
    const finalList = optionEls
        .map((el, idx) => {
            const id = el.dataset.mcqOptionId || null;
            const input = el.querySelector('[data-editable="mcq_content"] .editable-input');
            const content = input ? (input.value || '').trim() : '';
            return { id, mcq_letter: toLetter(idx), mcq_content: content };
        })
        .filter(x => x.mcq_content !== '');

    let insertedMcqRows = [];
    let resolvedSubQuestionId = subQId || null;

    if (subQId) {
        if (subQText !== null) {
            const { error } = await sb.from('sub_questions').update({ sub_q_text_content: subQText }).eq('id', subQId);
            if (error) throw error;
        }

        const originalIds = JSON.parse(container.dataset.originalMcqIds || '[]');
        const presentIds = finalList.filter(x => !!x.id).map(x => x.id);
        const toDeleteIds = originalIds.filter(id => !presentIds.includes(id));
        if (toDeleteIds.length) {
            const { error } = await sb.from('mcq_options').delete().in('id', toDeleteIds);
            if (error) throw error;
        }

        for (const existing of finalList.filter(x => !!x.id)) {
            const { error } = await sb
                .from('mcq_options')
                .update({ mcq_letter: existing.mcq_letter, mcq_content: existing.mcq_content })
                .eq('id', existing.id);
            if (error) throw error;
        }

        const inserts = finalList
            .filter(x => !x.id)
            .map(x => ({
                sub_question_id: subQId,
                mcq_letter: x.mcq_letter,
                mcq_content: x.mcq_content,
            }));
        if (inserts.length) {
            const { data, error } = await sb
                .from('mcq_options')
                .insert(inserts)
                .select('id, mcq_letter')
                .order('id', { ascending: true });
            if (error) throw error;
            insertedMcqRows = data || [];
        }
    } else {
        const questionId = editButton.dataset.questionId;
        if (!questionId) throw new Error('Missing question_id for new sub-question');

        let nextOrder = 1;
        try {
            const { data: latest, error } = await sb
                .from('sub_questions')
                .select('sub_question_order')
                .eq('question_id', questionId)
                .order('sub_question_order', { ascending: false })
                .limit(1);
            if (error) throw error;
            if (latest && latest.length) nextOrder = Number(latest[0].sub_question_order || 0) + 1;
        } catch (e) {
            console.warn('Could not compute next sub_question_order; defaulting to 1', e);
        }

        const { data: insertedSub, error } = await sb
            .from('sub_questions')
            .insert({
                question_id: questionId,
                sub_q_text_content: subQText || '',
                sub_question_order: nextOrder,
            })
            .select('id')
            .single();
        if (error) throw error;
        const newSubId = insertedSub.id;
        resolvedSubQuestionId = newSubId;

        if (finalList.length) {
            const mcqPayload = finalList.map(x => ({
                sub_question_id: newSubId,
                mcq_letter: x.mcq_letter,
                mcq_content: x.mcq_content,
            }));
            const { data: mcqInserted, error: mcqErr } = await sb
                .from('mcq_options')
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
                feedback_comment: null,
            }));
            const { error: ansErr } = await sb.from('student_answers').insert(ansPayload);
            if (ansErr) throw ansErr;
        }
    }

    ensureSubQuestionRowHasIds(container, resolvedSubQuestionId || subQId);
    syncNewMcqOptionIds(container, insertedMcqRows);

    return {};
}

async function saveModelAlternative({ container, editButton }) {
    const altId = editButton.dataset.alternativeId;
    const subQId = editButton.dataset.subQuestionId || editButton.closest('.grid-cell')?.dataset?.subQuestionId;

    let resolvedAltId = altId || null;
    let insertedComponentRows = [];

    if (altId) {
        const extraComm = container.querySelector('[data-editable="extra_comment"] .editable-input');
        if (extraComm) {
            const { error } = await sb
                .from('model_alternatives')
                .update({ extra_comment: extraComm.value })
                .eq('id', altId);
            if (error) throw error;
        }

        const compEls = Array.from(container.querySelectorAll('.model-component'));
        const originalIds = JSON.parse(container.dataset.originalCompIds || '[]');
        const presentIds = compEls.map(el => el.dataset.componentId).filter(Boolean);
        const toDeleteIds = originalIds.filter(id => !presentIds.includes(id));
        if (toDeleteIds.length) {
            const { error } = await sb.from('model_components').delete().in('id', toDeleteIds);
            if (error) throw error;
        }

        let order = 1;
        const insertPayload = [];
        for (const compEl of compEls) {
            const id = compEl.dataset.componentId || null;
            const compText = compEl.querySelector('[data-editable="component_text"] .editable-input')?.value ?? null;
            const compPointsStr = compEl.querySelector('[data-editable="component_points"] .editable-input')?.value ?? '0';
            const compPoints = Number(compPointsStr) || 0;

            if (id) {
                const { error } = await sb
                    .from('model_components')
                    .update({ component_text: compText, component_points: compPoints, component_order: order })
                    .eq('id', id);
                if (error) throw error;
            } else {
                insertPayload.push({
                    alternative_id: altId,
                    component_text: compText,
                    component_points: compPoints,
                    component_order: order,
                });
            }
            order += 1;
        }

        if (insertPayload.length) {
            const { data: insertedData, error } = await sb
                .from('model_components')
                .insert(insertPayload)
                .select('id, component_order, component_points')
                .order('component_order', { ascending: true });
            if (error) throw error;
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

        const { data: insertedAlt, error: altInsertErr } = await sb
            .from('model_alternatives')
            .insert({ sub_question_id: subQId, alternative_number: altNum, extra_comment: extraCommentVal })
            .select('id')
            .single();
        if (altInsertErr) throw altInsertErr;
        const newAltId = insertedAlt.id;
        resolvedAltId = newAltId;

        const compEls = Array.from(container.querySelectorAll('.model-component'));
        if (compEls.length) {
            let order = 1;
            const payload = compEls.map((compEl) => {
                const compText = compEl.querySelector('[data-editable="component_text"] .editable-input')?.value ?? null;
                const compPointsStr = compEl.querySelector('[data-editable="component_points"] .editable-input')?.value ?? '0';
                const compPoints = Number(compPointsStr) || 0;
                return {
                    alternative_id: newAltId,
                    component_text: compText,
                    component_points: compPoints,
                    component_order: order++,
                };
            });
            const { data: insertedComponents, error: compErr } = await sb
                .from('model_components')
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

    return {};
}

async function saveStudentAnswer({ container, editButton }) {
    const ansId = editButton.dataset.answerId || editButton.dataset.studentAnswerId;
    if (!ansId) throw new Error('Missing student answer id');

    const ansText = container.querySelector('[data-editable="answer_text"] .editable-input');
    const ansPointsInput = container.querySelector('[data-editable="sub_points_awarded"] .editable-input');
    const ansFeedback = container.querySelector('[data-editable="feedback_comment"] .editable-input');

    const ansUpdates = {};
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

    if (ansId) {
        const { data: answerData, error: fetchError } = await sb
            .from('student_answers')
            .select('student_exam_id')
            .eq('id', ansId)
            .single();
        if (!fetchError && answerData?.student_exam_id) {
            await sb.rpc('recalculate_student_total_points', { p_student_exam_id: answerData.student_exam_id });
        }
    }

    return {};
}

async function saveStudentInfo({ container, editButton, examId }) {
    const studentId = editButton.dataset.studentId;
    const stagedToken = editButton.dataset.newStudentToken || null;
    const nameEl = container.querySelector('[data-editable="full_name"] .editable-input');
    const numEl = container.querySelector('[data-editable="student_number"] .editable-input');
    const full_name = nameEl ? nameEl.value : null;
    const student_number = numEl ? numEl.value : null;

    if (studentId) {
        const res = await sb.from('students').update({ full_name, student_number }).eq('id', studentId);
        if (res.error) throw res.error;

        applyStudentDetailsUpdates({
            studentId,
            fullName: full_name ?? '',
            studentNumber: student_number ?? '',
        });
        return {};
    }

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

    const { data: subQs, error: sqErr } = await sb
        .from('sub_questions')
        .select('id, questions!inner ( exam_id )')
        .eq('questions.exam_id', examId);
    if (sqErr) throw sqErr;

    let insertedAnswers = [];
    if (subQs && subQs.length) {
        const payload = subQs.map((sq) => ({
            student_exam_id: studentExamId,
            sub_question_id: sq.id,
            answer_text: STUDENT_PLACEHOLDER_TEXT,
            sub_points_awarded: null,
            feedback_comment: null,
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
    window.__selectStudentAfterReload = newStudentId;

    return {};
}

async function saveAppendix({ container }) {
    const items = container.querySelectorAll('.appendix-item');
    for (const item of items) {
        const appendixId = item.dataset.appendixId;
        const appTitleInput = item.querySelector('[data-editable="app_title"] .editable-input');
        const appTextInput = item.querySelector('[data-editable="app_text"] .editable-input');
        if (appendixId && appTitleInput && appTextInput) {
            const res = await sb
                .from('appendices')
                .update({ app_title: appTitleInput.value, app_text: appTextInput.value })
                .eq('id', appendixId);
            if (res.error) throw res.error;
        }
    }
    return {};
}

const saveHandlers = {
    exam_name: saveExamName,
    grading_regulations: saveGradingRegulations,
    question_context: saveQuestionContext,
    sub_question: saveSubQuestion,
    model_alternative: saveModelAlternative,
    student_answer: saveStudentAnswer,
    student_info: saveStudentInfo,
    appendix: saveAppendix,
};

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

        const handler = saveHandlers[targetType];
        if (!handler) {
            throw new Error('Unknown edit target type.');
        }

        const handlerResult = await handler({ container, editButton, examId, targetType }) || {};
        const { createdQuestionId } = handlerResult;

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
