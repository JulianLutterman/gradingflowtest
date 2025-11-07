/**
 * Control visibility of rules and grades buttons based on current data.
 * @param {string} examId
 */
async function checkAndShowActionButtons(examId) {
  // Handle "Show Grading Regulations" button
  const showRulesButton = document.getElementById('show-rules-button');
  if (currentExamData && currentExamData.grading_regulations) {
    showRulesButton.classList.remove('hidden');
    showRulesButton.onclick = () => {
      // MODIFIED: Add edit button to modal
      rulesModalText.innerHTML = `
                <div data-editable="grading_regulations">${marked.parse(currentExamData.grading_regulations)}</div>
                <div class="modal-edit-container">
                     <button id="modal-edit-btn" class="edit-btn" data-edit-target="grading_regulations" data-exam-id="${examId}">
                        ${EDIT_ICON_SVG}
                    </button>
                </div>
            `;
      rulesModal.classList.remove('hidden');
    };
  } else {
    showRulesButton.classList.add('hidden');
  }

  // Handle "Show Grades" button
  try {
    const { count, error } = await sb
      .from('student_exams')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', examId)
      .not('total_points_awarded', 'is', null);

    if (error) throw error;

    if (count > 0) {
      showGradesButton.classList.remove('hidden');
    } else {
      showGradesButton.classList.add('hidden');
    }
  } catch (error) {
    console.error('Could not check for graded exams:', error);
    showGradesButton.classList.add('hidden');
  }
}

/**
 * Fetch and display student grades in a modal.
 */
async function handleShowGradesClick() {
  gradesModalTableContainer.innerHTML = '<p>Loading grades...</p>';
  gradesModal.classList.remove('hidden');

  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');

  if (!examId) {
    gradesModalTableContainer.innerHTML = '<p>Error: Exam ID not found.</p>';
    return;
  }

  try {
    const { data: grades, error } = await sb
      .from('student_exams')
      .select('total_points_awarded, students(full_name, student_number)')
      .eq('exam_id', examId)
      .not('total_points_awarded', 'is', null)
      .order('full_name', { foreignTable: 'students', ascending: true });

    if (error) throw error;

    if (grades && grades.length > 0) {
      const maxPoints = currentExamData?.max_total_points ?? '?';
      let tableHtml = `
                <table>
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>Student Number</th>
                            <th>Points</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
      grades.forEach((grade) => {
        const student = grade.students || {};
        tableHtml += `
                    <tr>
                        <td>${student.full_name || 'N/A'}</td>
                        <td>${student.student_number || 'N/A'}</td>
                        <td>${grade.total_points_awarded} / ${maxPoints}</td>
                    </tr>
                `;
      });
      tableHtml += `</tbody></table>`;
      gradesModalTableContainer.innerHTML = tableHtml;
    } else {
      gradesModalTableContainer.innerHTML = '<p>No graded submissions found.</p>';
    }
  } catch (error) {
    console.error('Error fetching grades:', error);
    gradesModalTableContainer.innerHTML = `<p>Error fetching grades: ${error.message}</p>`;
  }
}
