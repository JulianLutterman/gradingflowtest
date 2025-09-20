// FILE: grading.js

// --- AUTOMATIC GRADING LOGIC (REFACTORED) ---
gradeAllButton.addEventListener('click', async (e) => {
  e.preventDefault();
  gradeAllButton.disabled = true;
  showSpinner(true, spinnerGrading);
  updateGradingButtonText('Starting...');

  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');
  let finalMessage = '';
  let isError = false;
  let lockKey = null;

  try {
    if (typeof window.enterProcessingLock === 'function') {
      lockKey = window.enterProcessingLock('grading');
    }
    updateGradingButtonText('Finding submissions...');
    
    // START OF CHANGE: Switched from checking points to checking status
    const { data: ungradedExams, error: findError } = await sb
      .from('student_exams')
      .select('id, students(full_name, student_number)')
      .eq('exam_id', examId)
      .eq('status', 'submitted'); // <-- This is the corrected line
    // END OF CHANGE

    if (findError) throw findError;

    if (!ungradedExams || ungradedExams.length === 0) {
      finalMessage = 'No new submissions found.';
      return;
    }

    updateGradingButtonText(`Grading ${ungradedExams.length} submission(s)...\n(~1 min)`);

    const gradingPromises = ungradedExams.map((studentExam) => {
      const studentIdentifier = studentExam.students.full_name || studentExam.students.student_number;
      return processSingleStudent(examId, studentExam.id, studentIdentifier);
    });

    const results = await Promise.all(gradingPromises);

    const successCount = results.filter((r) => r.status === 'success').length;
    const failureCount = results.length - successCount;

    if (failureCount > 0) {
      finalMessage = `Graded ${successCount}, ${failureCount} failed.`;
    } else {
      finalMessage = `All ${successCount} submissions graded.`;
    }

    updateGradingButtonText('Refreshing data...');
    await loadExamDetails(examId);
  } catch (error) {
    console.error(error);
    finalMessage = `Critical Error. See console.`;
    isError = true;
  } finally {
    if (typeof window.exitProcessingLock === 'function') {
      window.exitProcessingLock(lockKey);
    }
    updateGradingButtonText(finalMessage);
    showSpinner(false, spinnerGrading);

    setTimeout(() => {
      gradeAllButton.disabled = false;
      updateGradingButtonText(DEFAULT_GRADING_BUTTON_TEXT);
    }, isError ? 5000 : 3000);
  }
});

/**
 * Process grading for a single student_exam.
 * @param {string} examId
 * @param {string} studentExamId
 * @param {string} studentIdentifier
 * @returns {Promise<{status: 'success'|'error', studentExamId: string, error?: string}>}
 */
async function processSingleStudent(examId, studentExamId, studentIdentifier) {
  try {
    console.log(`Fetching data for ${studentIdentifier}...`);
    const { data: gradingData, error: dataError } = await fetchGradingDataForStudent(examId, studentExamId);
    if (dataError) throw new Error(`Data fetch failed: ${dataError.message}`);
    if (!gradingData || !gradingData.questions || gradingData.questions.length === 0) {
      console.log(`No answer data found for ${studentIdentifier}. Marking as graded with 0 points.`);
      await sb.from('student_exams').update({ total_points_awarded: 0, status: 'graded' }).eq('id', studentExamId);
      return { status: 'success', studentExamId };
    }

    const imageUrls = new Set();
    const subQuestionAnswerIdMap = new Map();

    JSON.stringify(gradingData, (key, value) => {
      if (value && typeof value === 'string' && value.startsWith('http')) {
        if (key === 'context_visual' || key === 'component_visual' || key === 'answer_visual') {
          imageUrls.add(value);
        }
      }
      if (key === 'sub_questions' && Array.isArray(value)) {
        value.forEach((sq) => {
          if (sq.id && sq.student_answers && sq.student_answers.length > 0) {
            subQuestionAnswerIdMap.set(sq.id, sq.student_answers[0].id);
          }
        });
      }
      return value;
    });

    const imageBlobs = new Map();
    const fetchImagePromises = Array.from(imageUrls).map(async (url) => {
      const filename = getFilenameFromUrl(url);
      if (filename) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
        const blob = await response.blob();
        imageBlobs.set(filename, blob);
      }
    });
    await Promise.all(fetchImagePromises);
    console.log(`Fetched ${imageBlobs.size} unique images for ${studentIdentifier}.`);

    console.log(`Sending data to AI for grading (${studentIdentifier})...`);
    const gcfResponse = await callGradingGcf(gradingData, imageBlobs);

    await updateGradingResultsInDb(studentExamId, gcfResponse, subQuestionAnswerIdMap);
    console.log(`Saved results for ${studentIdentifier}.`);

    return { status: 'success', studentExamId };
  } catch (error) {
    console.error(`Error processing student_exam ${studentExamId}:`, error);
    return { status: 'error', studentExamId, error: error.message };
  }
}

/**
 * Fetch grading data for the student + exam.
 * @param {string} examId
 * @param {string} studentExamId
 * @returns {Promise<{data: any, error: any}>}
 */
async function fetchGradingDataForStudent(examId, studentExamId) {
  const { data: examBase, error: baseError } = await sb
    .from('exams')
    .select(
      `
                                        grading_regulations,
                                        questions (
                                            question_number, max_total_points, context_text, context_visual, extra_comment,
                                            sub_questions (
                                                id, sub_q_text_content, max_sub_points,
                                                mcq_options ( mcq_letter, mcq_content ),
                                                model_alternatives (
                                                    alternative_number, extra_comment,
                                                    model_components ( component_text, component_visual, component_points )
                                                )
                                            )
                                        )
                                    `,
    )
    .eq('id', examId)
    .single();

  if (baseError) throw baseError;

  const { data: studentAnswers, error: answersError } = await sb
    .from('student_answers')
    .select('id, sub_question_id, answer_text, answer_visual')
    .eq('student_exam_id', studentExamId);

  if (answersError) throw answersError;

  const answersMap = new Map(
    studentAnswers.map((ans) => [ans.sub_question_id, { id: ans.id, answer_text: ans.answer_text, answer_visual: ans.answer_visual }]),
  );

  examBase.questions.forEach((q) => {
    q.sub_questions.forEach((sq) => {
      const studentAns = answersMap.get(sq.id);
      sq.student_answers = studentAns ? [studentAns] : [];
    });
  });

  return { data: examBase, error: null };
}

/**
 * Call grading GCF with mixed JSON + files payload.
 * @param {any} gradingData
 * @param {Map<string, Blob>} imageBlobs
 * @returns {Promise<any>}
 */
async function callGradingGcf(gradingData, imageBlobs) {
  const formData = new FormData();
  formData.append('grading_data', JSON.stringify(gradingData));

  for (const [filename, blob] of imageBlobs.entries()) {
    formData.append(filename, blob, filename);
  }

  const response = await fetch(GRADING_GCF_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grading service failed: ${response.statusText} - ${errorText}`);
  }
  return response.json();
}

/**
 * Persist grading results to DB and finalize student_exam status.
 * @param {string} studentExamId
 * @param {any} gcfResponse
 * @param {Map<string, string>} subQuestionToAnswerIdMap
 */
async function updateGradingResultsInDb(studentExamId, gcfResponse, subQuestionToAnswerIdMap) {
  const answerUpdates = [];
  let totalPoints = 0;

  if (!gcfResponse || !gcfResponse.questions) {
    throw new Error('Invalid response from grading service.');
  }

  const allSubQuestionResults = gcfResponse.questions.flatMap((q) => q.sub_questions || []);

  for (const subQResult of allSubQuestionResults) {
    const studentAnswerId = subQuestionToAnswerIdMap.get(subQResult.sub_question_id);

    if (studentAnswerId && subQResult.student_answers) {
      const points = Number(subQResult.student_answers.sub_points_awarded) || 0;
      const feedback = subQResult.student_answers.feedback_comment || '';

      answerUpdates.push({
        id: studentAnswerId,
        sub_points_awarded: points,
        feedback_comment: feedback,
      });
      totalPoints += points;
    } else if (subQResult.student_answers && subQResult.student_answers.feedback_comment.startsWith('ERROR:')) {
      console.warn(
        `GCF Error on sub-question ID ${subQResult.sub_question_id}: ${subQResult.student_answers.feedback_comment}`,
      );
    }
  }

  if (answerUpdates.length > 0) {
    const updatePromises = answerUpdates.map((update) =>
      sb
        .from('student_answers')
        .update({
          sub_points_awarded: update.sub_points_awarded,
          orig_llm_sub_points_awarded: update.sub_points_awarded,
          feedback_comment: update.feedback_comment,
          orig_llm_feedback_comment: update.feedback_comment,
        })
        .eq('id', update.id),
    );
    const results = await Promise.all(updatePromises);
    const firstErrorResult = results.find((res) => res.error);
    if (firstErrorResult) {
      throw new Error(`Failed to save grading results: ${firstErrorResult.error.message}`);
    }
  }

  const { error: examUpdateError } = await sb
    .from('student_exams')
    .update({
      total_points_awarded: totalPoints,
      status: 'graded',
    })
    .eq('id', studentExamId);

  if (examUpdateError) throw new Error(`Failed to update final score: ${examUpdateError.message}`);
}
