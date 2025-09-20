// --- DATA FETCHING FUNCTIONS (UNCHANGED) ---
/**
 * Fetches full exam details including questions, sub-questions, appendices, model, and student answers.
 * @param {string} examId
 * @returns {Promise<{data: any, error: any}>}
 */
async function fetchFullExamDetails(examId) {
    return sb
        .from('exams')
        .select(
            `
        exam_name,
        grading_regulations,
        orig_llm_grading_regulations,
        max_total_points, 
        questions (
          id, question_number, max_total_points, context_text, orig_llm_context_text, context_visual, extra_comment, orig_llm_extra_comment,
          appendices ( id, app_title, orig_llm_app_title, app_text, orig_llm_app_text, app_visual ),
          sub_questions (
            id, sub_q_text_content, orig_llm_sub_q_text_content, max_sub_points, sub_question_order,
            mcq_options ( id, mcq_letter, mcq_content, orig_llm_mcq_content ),
            model_alternatives (
              id, alternative_number, extra_comment, orig_llm_extra_comment,
              model_components ( id, component_text, orig_llm_component_text, component_visual, component_points, orig_llm_component_points, component_order )
            ),
            student_answers (
              id, answer_text, orig_llm_answer_text, answer_visual, sub_points_awarded, orig_llm_sub_points_awarded, feedback_comment, orig_llm_feedback_comment,
              student_exams (
                students ( id, full_name, student_number )
              )
            )
          )
        )
      `,
        )
        .eq('id', examId)
        .single();
}


/**
 * Fetch minimal exam data used to build appendix JSON for GCF.
 * @param {string} examId
 * @returns {Promise<{data: any, error: any}>}
 */
async function fetchExamDataForAppendixJson(examId) {
  return sb
    .from('exams')
    .select(
      `exam_name, questions (id, question_number, context_text, extra_comment, sub_questions (sub_q_text_content, mcq_options (mcq_letter, mcq_content)))`,
    )
    .eq('id', examId)
    .single();
}

/**
 * Fetch minimal exam structure for model upload GCF.
 * @param {string} examId
 * @returns {Promise<{data: any, error: any}>}
 */
async function fetchExamDataForModelJson(examId) {
  return sb
    .from('questions')
    .select(`question_number, sub_questions (id, sub_q_text_content)`)
    .eq('exam_id', examId)
    .order('question_number', { ascending: true });
}
