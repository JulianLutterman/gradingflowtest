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
    b.className = `${cls}`;
    b.title = title;
    b.setAttribute('aria-label', 'Delete'); // accessibility
    b.innerHTML = `
        <!--
        category: System
        tags: [bin, litter, recycle, remove, delete, throw, away, waste]
        version: "1.46"
        unicode: "ef88"
        -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#14110f"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M4 7h16" />
          <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
          <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
          <path d="M10 12l4 4m0 -4l-4 4" />
        </svg>
    `;
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

      // 1) Question delete (always far right of the header)
      Q_CONTAINER.querySelectorAll('.question-block').forEach(block => {
          const qid = block.dataset.questionId;
          if (!qid) return;

          const header = block.querySelector('.question-header');
          if (!header) return;

          // Ensure a right-side container inside the header
          let rightWrap = header.querySelector('.question-header-right');
          if (!rightWrap) {
              rightWrap = document.createElement('div');
              rightWrap.className = 'question-header-right';
              header.appendChild(rightWrap);
          }

          // Move any appendix button into the rightWrap (it’s rendered directly in header)
          const appendixBtn = header.querySelector('.appendix-button');
          if (appendixBtn && !rightWrap.contains(appendixBtn)) {
              rightWrap.appendChild(appendixBtn);
          }

          // Add the delete button if missing
          if (!rightWrap.querySelector('.question-delete-btn')) {
              const btn = makeBtn('question-delete-btn', 'Delete this question');
              btn.dataset.questionId = qid;
              rightWrap.appendChild(btn);
          }
      });


    // 2) Sub-question delete stacked above edit (inside #sub-q-gridcell)
    Q_CONTAINER.querySelectorAll('#sub-q-gridcell.grid-cell').forEach(cell => {
      const subId = cell.dataset.subQuestionId;
      if (!subId) return;

      const stack = ensureControlStack(cell);

        // First, add the delete button to the top
        if (!stack.querySelector('.sub-q-delete-btn')) {
            const del = makeBtn('sub-q-delete-btn', 'Delete this sub-question');
            del.dataset.subQuestionId = subId;
            stack.prepend(del); // or stack.insertBefore(del, stack.firstChild);
        }

        // Then, move the edit button, which will place it *above* the delete button
        const editBtn = cell.querySelector('[data-edit-target="sub_question"]');
        if (editBtn && !stack.contains(editBtn)) {
            stack.prepend(editBtn); // or stack.insertBefore(editBtn, stack.firstChild);
        }
    });

    // 3) Model-alternative: edit (left) + delete (right) at top-right
    Q_CONTAINER.querySelectorAll('.model-alternative').forEach(alt => {
      const altId = alt.dataset.alternativeId;
      if (!altId) return;

      let editBtn = alt.querySelector('[data-edit-target="model_alternative"]');
      // ensure a shared inline top-right holder
      const holder = ensureInlineControls(alt);

      if (editBtn && !holder.contains(editBtn)) {
        holder.appendChild(editBtn);
      }
      if (!holder.querySelector('.model-alt-delete-btn')) {
        const del = makeBtn('model-alt-delete-btn', 'Delete this answer alternative');
        del.dataset.alternativeId = altId;
        holder.appendChild(del);
      }

        alt.querySelectorAll('.model-component').forEach(comp => {
            const compId = comp.dataset.componentId || null;
            if (!comp.querySelector('.model-comp-delete-btn')) {
                const del = makeBtn('model-comp-delete-btn', 'Delete this answer component');
                del.textContent = '×';
                if (compId) del.dataset.componentId = compId;
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
        ctrl.style.gap = '2px';
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

      // 6) Points delete button lives next to the points badge (inside a flex row)
      Q_CONTAINER.querySelectorAll('.student-answer-item').forEach(item => {
          const ansId = item.dataset.answerId;
          if (!ansId) return;
          const badge = item.querySelector('.points-awarded-badge');
          if (!badge) return;

          // Ensure wrapper row exists (render adds it; but just in case, create it)
          let row = item.querySelector('.points-row');
          if (!row) {
              row = document.createElement('div');
              row.className = 'points-row';
              badge.parentElement?.insertBefore(row, badge);
              row.appendChild(badge);
          }

          if (!row.querySelector('.points-delete-btn')) {
              const del = makeBtn('points-delete-btn', 'Clear points & feedback (only saved on “Save”)');
              del.textContent = '×';
              del.dataset.answerId = ansId;
              row.appendChild(del);
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
    const sqDel = e.target.closest('.sub-q-delete-btn');
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
            // Only allow deleting model components *while editing* the alternative.
            const altEl = compDel.closest('.model-alternative');
            const isEditing = !!altEl?.classList.contains('is-editing') || !!altEl?.querySelector('.editable-input');

            const row = compDel.closest('.model-component');
            if (!row) return;

            if (!isEditing) {
                alert('You can delete components while editing the alternative. Click the edit icon first.');
                return;
            }

            // Edit-mode: remove from DOM only (persist on Save)
            row.remove();
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
            const item = ptsDel.closest('.student-answer-item');
            if (!item) return;

            const isEditing = !!item.classList.contains('is-editing') || !!item.querySelector('.editable-input');
            if (!isEditing) {
                alert('Enter edit mode to clear points & feedback.');
                return;
            }

            // Mark intent to clear on Save and hide visuals now
            item.dataset.clearPointsFeedback = '1';
            item.classList.add('points-cleared');
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
