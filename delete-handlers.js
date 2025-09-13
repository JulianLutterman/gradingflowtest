/* Uses globals from config.js/dom.js/load-exam-details.js:
   - sb (Supabase client)
   - loadExamDetails(examId)
*/

(function () {
  const Q_CONTAINER = document.getElementById('questions-container');

  // ---------- Helpers ----------
  function examIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
  }
  function makeBtn(cls, title='Delete') {
    const b = document.createElement('button');
    b.type = 'button';
    // reuse your red circular style
    b.className = `mcq-delete-btn ${cls}`;
    b.title = title;
    b.textContent = '×';
    return b;
  }

  // Wrap two controls top-right inside a cell/box
  function ensureControlStack(hostEl) {
    let stack = hostEl.querySelector('.control-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'control-stack';
      hostEl.appendChild(stack);
    }
    return stack;
  }

  // Model-alt top-right horizontal container (edit left, delete right)
  function ensureInlineControls(hostEl) {
    let wrap = hostEl.querySelector('.inline-controls');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'inline-controls';
      hostEl.appendChild(wrap);
    }
    return wrap;
  }

  // Inject delete buttons where needed (idempotent)
  function injectDeleteButtons() {
    if (!Q_CONTAINER) return;

    // 1) Question delete (far right of title wrapper)
    Q_CONTAINER.querySelectorAll('.question-block').forEach(block => {
      const qid = block.dataset.questionId;
      if (!qid) return;
      const titleWrap = block.querySelector('.question-title-wrapper');
      if (!titleWrap || titleWrap.querySelector('.question-delete-btn')) return;

      const btn = makeBtn('question-delete-btn', 'Delete this question');
      btn.dataset.questionId = qid;

      // ensure space on the right inside the wrapper
      const holder = document.createElement('div');
      holder.style.display = 'flex';
      holder.style.alignItems = 'center';
      holder.style.gap = '8px';

      // move any trailing badge into the holder so delete stays far-right inside wrapper
      const pointsBadge = titleWrap.querySelector('.question-points-badge');
      if (pointsBadge) holder.appendChild(pointsBadge);
      holder.appendChild(btn);
      titleWrap.appendChild(holder);
    });

    // 2) Sub-question delete stacked above edit (inside #sub-q-gridcell)
    Q_CONTAINER.querySelectorAll('#sub-q-gridcell.grid-cell').forEach(cell => {
      const subId = cell.dataset.subQuestionId;
      if (!subId) return;

      const stack = ensureControlStack(cell);

      // Move existing edit button into stack (bottom)
      const editBtn = cell.querySelector('[data-edit-target="sub_question"]');
      if (editBtn && !stack.contains(editBtn)) {
        stack.appendChild(editBtn);
      }

      // Add delete button (top) once
      if (!stack.querySelector('.subq-delete-btn')) {
        const del = makeBtn('subq-delete-btn', 'Delete this sub-question');
        del.dataset.subQuestionId = subId;
        stack.insertBefore(del, stack.firstChild);
      }
    });

    // 3) Model-alternative: edit (left) + delete (right) at top-right
    Q_CONTAINER.querySelectorAll('.model-alternative').forEach(alt => {
      const altId = alt.dataset.alternativeId;
      if (!altId) return;

      let editBtn = alt.querySelector('[data-edit-target="model_alternative"]');
      // ensure a shared inline top-right holder
      const holder = ensureInlineControls(alt);

      // position holder to the top-right
      holder.style.position = 'absolute';
      holder.style.right = '8px';
      holder.style.top = '8px';
      holder.style.display = 'flex';
      holder.style.gap = '6px';

      if (editBtn && !holder.contains(editBtn)) {
        holder.appendChild(editBtn);
      }
      if (!holder.querySelector('.model-alt-delete-btn')) {
        const del = makeBtn('model-alt-delete-btn', 'Delete this answer alternative');
        del.dataset.alternativeId = altId;
        holder.appendChild(del);
      }

      // 4) Model-component delete buttons (shown only during edit)
      alt.querySelectorAll('.model-component').forEach(comp => {
        const compId = comp.dataset.componentId;
        if (!compId) return;
        if (!comp.querySelector('.model-comp-delete-btn')) {
          const del = makeBtn('model-comp-delete-btn', 'Delete this answer component');
          del.dataset.componentId = compId;
          // sit on the far right of the component row
          del.style.marginLeft = '8px';
          comp.appendChild(del);
        }
      });
    });

    // 5) Student dropdown summary: delete whole submission (right of edit)
    Q_CONTAINER.querySelectorAll('.student-answer-dropdown').forEach(dets => {
      const studentId = dets.dataset.studentId;
      if (!studentId) return;
      const summary = dets.querySelector('summary');
      if (!summary) return;

      // right-side controls group
      let ctrl = summary.querySelector('.student-summary-controls');
      if (!ctrl) {
        ctrl = document.createElement('span');
        ctrl.className = 'student-summary-controls';
        ctrl.style.display = 'inline-flex';
        ctrl.style.gap = '6px';
        ctrl.style.marginLeft = 'auto';
        summary.appendChild(ctrl);
      }

      // move existing edit button
      const editBtn = summary.querySelector('[data-edit-target="student_info"]');
      if (editBtn && !ctrl.contains(editBtn)) {
        ctrl.appendChild(editBtn);
      }
      // add delete button (entire submission for exam)
      if (!ctrl.querySelector('.student-delete-btn')) {
        const del = makeBtn('student-delete-btn', 'Delete this student’s submission for this exam');
        del.dataset.studentId = studentId;
        ctrl.appendChild(del);
      }
    });

    // 6) Points delete (to the right of points-badge)
    Q_CONTAINER.querySelectorAll('.student-answer-item').forEach(item => {
      const ansId = item.dataset.answerId;
      if (!ansId) return;
      const badge = item.querySelector('.points-awarded-badge');
      if (!badge) return;

      if (!item.querySelector('.points-delete-btn')) {
        const del = makeBtn('points-delete-btn', 'Clear points & feedback for this answer');
        del.dataset.answerId = ansId;
        del.style.marginLeft = '8px';
        badge.insertAdjacentElement('afterend', del);
      }
    });
  }

  // Keep component delete buttons visible only while editing a model-alternative
  function toggleModelAltEditingState(altEl, isEditing) {
    if (!altEl) return;
    altEl.classList.toggle('is-editing', !!isEditing);
  }

  // ---------- Click handlers ----------
  document.addEventListener('click', async (e) => {
    const examId = examIdFromUrl();
    if (!examId) return;

    const qDel = e.target.closest('.question-delete-btn');
    const sqDel = e.target.closest('.subq-delete-btn');
    const altDel = e.target.closest('.model-alt-delete-btn');
    const compDel = e.target.closest('.model-comp-delete-btn');
    const stuDel = e.target.closest('.student-delete-btn');
    const ptsDel = e.target.closest('.points-delete-btn');

    try {
      if (qDel) {
        const id = qDel.dataset.questionId;
        if (!id) return;
        if (!confirm('Delete this question and all its contents? This cannot be undone.')) return;
        const { error } = await sb.rpc('delete_question_cascade', { p_question_id: id });
        if (error) throw error;
        await loadExamDetails(examId);
        return;
      }

      if (sqDel) {
        const id = sqDel.dataset.subQuestionId;
        if (!id) return;
        if (!confirm('Delete this sub-question (including its model, MCQs, and all related answers)?')) return;
        const { error } = await sb.rpc('delete_sub_question_cascade', { p_sub_question_id: id });
        if (error) throw error;
        await loadExamDetails(examId);
        return;
      }

      if (altDel) {
        const id = altDel.dataset.alternativeId;
        if (!id) return;
        if (!confirm('Delete this model alternative and its components?')) return;
        const { error } = await sb.rpc('delete_model_alternative_cascade', { p_alternative_id: id });
        if (error) throw error;
        await loadExamDetails(examId);
        return;
      }

      if (compDel) {
        const id = compDel.dataset.componentId;
        // If it's unsaved (no id), just remove from DOM during edit
        if (!id) {
          const row = compDel.closest('.model-component');
          if (row) row.remove();
          return;
        }
        if (!confirm('Delete this model component?')) return;
        const { error } = await sb.rpc('delete_model_component', { p_component_id: id });
        if (error) throw error;
        await loadExamDetails(examId);
        return;
      }

      if (stuDel) {
        const studentId = stuDel.dataset.studentId;
        if (!studentId) return;
        if (!confirm('Delete this student’s entire submission for this exam? This removes all their answers and score.')) return;
        const { error } = await sb.rpc('delete_student_submission_for_exam', { p_exam_id: examId, p_student_id: studentId });
        if (error) throw error;
        await loadExamDetails(examId);
        return;
      }

      if (ptsDel) {
        const answerId = ptsDel.dataset.answerId;
        if (!answerId) return;
        if (!confirm('Clear points and feedback for this answer?')) return;
        const { error } = await sb.rpc('clear_points_and_feedback', { p_answer_id: answerId });
        if (error) throw error;
        await loadExamDetails(examId);
        return;
      }

      // When entering edit mode for model alternative, mark it as editing (to show component delete icons)
      const editAlt = e.target.closest('.edit-btn[data-edit-target="model_alternative"]');
      if (editAlt) {
        const alt = editAlt.closest('.model-alternative');
        // toggle after DOM converts spans to inputs
        setTimeout(() => {
          const nowEditing = !!alt.querySelector('.editable-input');
          toggleModelAltEditingState(alt, nowEditing);
        }, 0);
      }

      // Hide component delete icons when Save/Cancel within a model-alternative
      if (e.target.closest('.save-btn') || e.target.closest('.cancel-btn')) {
        const alt = e.target.closest('.model-alternative');
        if (alt) toggleModelAltEditingState(alt, false);
      }
    } catch (err) {
      console.error(err);
      alert(err.message || 'Delete failed.');
    }
  });

  // ---------- Observe and inject whenever content re-renders ----------
  if (Q_CONTAINER) {
    const obs = new MutationObserver(() => injectDeleteButtons());
    obs.observe(Q_CONTAINER, { childList: true, subtree: true });
    // initial pass
    injectDeleteButtons();
  }
})();
