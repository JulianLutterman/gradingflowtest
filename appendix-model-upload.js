// --- APPENDIX / MODEL UPLOAD UI STATE ---
const appendixUploadStateDefaults = {
  status: 'idle',
  buttonText: DEFAULT_APPENDIX_BUTTON_TEXT,
  spinner: false,
  disabled: false,
};
const appendixUploadState = { ...appendixUploadStateDefaults };
let appendixResetTimeout = null;

function applyAppendixUploadState() {
  if (!submitAppendixButton || !submitAppendixButtonText) return;
  submitAppendixButton.disabled = appendixUploadState.disabled;
  showSpinner(appendixUploadState.spinner, spinnerAppendix);
  setButtonText(submitAppendixButtonText, appendixUploadState.buttonText);
}

function setAppendixUploadState(patch) {
  Object.assign(appendixUploadState, patch);
  applyAppendixUploadState();
}

function scheduleAppendixReset(delayMs) {
  if (appendixResetTimeout) clearTimeout(appendixResetTimeout);
  appendixResetTimeout = setTimeout(() => {
    appendixResetTimeout = null;
    Object.assign(appendixUploadState, appendixUploadStateDefaults);
    applyAppendixUploadState();
  }, delayMs);
}

applyAppendixUploadState();
window.applyAppendixUploadState = applyAppendixUploadState;

// --- APPENDIX UPLOAD LOGIC (MODIFIED LOGGING) ---
appendixForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (appendixResetTimeout) {
    clearTimeout(appendixResetTimeout);
    appendixResetTimeout = null;
  }
  setAppendixUploadState({ status: 'processing', disabled: true, spinner: true, buttonText: 'Starting...' });

  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');
  const files = document.getElementById('appendix-files').files;
  let isError = false;
  let lockKey = null;

  if (!examId || files.length === 0) {
    alert('Cannot proceed without an Exam ID and at least one file.');
    setAppendixUploadState({ status: 'idle', disabled: false, spinner: false, buttonText: DEFAULT_APPENDIX_BUTTON_TEXT });
    return;
  }

  try {
    if (typeof window.enterProcessingLock === 'function') {
      lockKey = window.enterProcessingLock('appendix-upload');
    }
    setAppendixUploadState({ buttonText: 'Fetching exam...' });
    const { data: examData, error: fetchError } = await fetchExamDataForAppendixJson(examId);
    if (fetchError) throw new Error(`Could not fetch exam data: ${fetchError.message}`);
    const examStructureForGcf = { questions: examData.questions };

    setAppendixUploadState({ buttonText: 'Thinking... (~2 mins)' });
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('exam_structure', JSON.stringify(examStructureForGcf));
    const gcfResponse = await fetch(APPENDIX_GCF_URL, { method: 'POST', body: formData });
    if (!gcfResponse.ok) {
      const errorText = await gcfResponse.text();
      throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
    }

    setAppendixUploadState({ buttonText: 'Processing...' });
    const zipBlob = await gcfResponse.blob();
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipBlob);
    const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith('.json'));
    if (!jsonFile) throw new Error('No JSON file found in the returned zip.');
    const jsonContent = await jsonFile.async('string');
    const appendixData = JSON.parse(jsonContent);

    setAppendixUploadState({ buttonText: 'Saving...' });
    await processAndUploadAppendices(examId, appendixData.appendices, zip);

    setAppendixUploadState({ buttonText: 'Refreshing data...' });
    appendixForm.reset();
    document.getElementById('appendix-file-display').textContent = 'No files chosen';
    await loadExamDetails(examId);
  } catch (error) {
    setAppendixUploadState({ status: 'error', buttonText: 'Error!', spinner: false });
    console.error(error);
    isError = true;
  } finally {
    if (typeof window.exitProcessingLock === 'function') {
      window.exitProcessingLock(lockKey);
    }
    if (!isError) {
      setAppendixUploadState({ status: 'success', buttonText: 'Success!', spinner: false });
    }
    if (isError) {
      setAppendixUploadState({ status: 'error', spinner: false });
    }
    scheduleAppendixReset(isError ? 5000 : 3000);
  }
});

const modelUploadStateDefaults = {
  status: 'idle',
  buttonText: DEFAULT_MODEL_BUTTON_TEXT,
  spinner: false,
  disabled: false,
};
const modelUploadState = { ...modelUploadStateDefaults };
let modelResetTimeout = null;

function applyModelUploadState() {
  if (!submitModelButton || !submitModelButtonText) return;
  submitModelButton.disabled = modelUploadState.disabled;
  showSpinner(modelUploadState.spinner, spinnerModel);
  setButtonText(submitModelButtonText, modelUploadState.buttonText);
}

function setModelUploadState(patch) {
  Object.assign(modelUploadState, patch);
  applyModelUploadState();
}

function scheduleModelReset(delayMs) {
  if (modelResetTimeout) clearTimeout(modelResetTimeout);
  modelResetTimeout = setTimeout(() => {
    modelResetTimeout = null;
    Object.assign(modelUploadState, modelUploadStateDefaults);
    applyModelUploadState();
  }, delayMs);
}

applyModelUploadState();
window.applyModelUploadState = applyModelUploadState;

function prepareModelExamSnapshot(questions = []) {
  const subQuestionLookup = {};
  const sanitizedQuestions = questions.map((question) => {
    const sanitizedSubQuestions = (question.sub_questions || []).map((subQuestion) => {
      if (subQuestion?.id) {
        if (!subQuestionLookup[question.question_number]) {
          subQuestionLookup[question.question_number] = {};
        }
        subQuestionLookup[question.question_number][subQuestion.sub_q_text_content] = subQuestion.id;
      }
      return { sub_q_text_content: subQuestion.sub_q_text_content };
    });
    return {
      question_number: question.question_number,
      sub_questions: sanitizedSubQuestions,
    };
  });

  return { subQuestionLookup, sanitizedQuestions };
}

// --- ANSWER MODEL UPLOAD LOGIC (MODIFIED LOGGING) ---
modelForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (modelResetTimeout) {
    clearTimeout(modelResetTimeout);
    modelResetTimeout = null;
  }
  setModelUploadState({ status: 'processing', disabled: true, spinner: true, buttonText: 'Starting...' });

  const urlParams = new URLSearchParams(window.location.search);
  const examId = urlParams.get('id');
  const files = document.getElementById('model-files').files;
  let isError = false;
  let lockKey = null;

  if (!examId || files.length === 0) {
    alert('Cannot proceed without an Exam ID and at least one file.');
    setModelUploadState({ status: 'idle', disabled: false, spinner: false, buttonText: DEFAULT_MODEL_BUTTON_TEXT });
    return;
  }

  try {
    if (typeof window.enterProcessingLock === 'function') {
      lockKey = window.enterProcessingLock('model-upload');
    }
    setModelUploadState({ buttonText: 'Fetching exam...' });
    const { data: examStructure, error: fetchError } = await fetchExamDataForModelJson(examId);
    if (fetchError) throw new Error(`Could not fetch exam data for model: ${fetchError.message}`);
    const { subQuestionLookup, sanitizedQuestions } = prepareModelExamSnapshot(examStructure || []);
    const examStructureForGcf = { questions: sanitizedQuestions };

    setModelUploadState({ buttonText: 'Thinking... (~4 mins)' });
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    formData.append('exam_structure', JSON.stringify(examStructureForGcf));
    const gcfResponse = await fetch(MODEL_GCF_URL, { method: 'POST', body: formData });
    if (!gcfResponse.ok) {
      const errorText = await gcfResponse.text();
      throw new Error(`Cloud function failed: ${gcfResponse.statusText} - ${errorText}`);
    }

    setModelUploadState({ buttonText: 'Processing...' });
    const zipBlob = await gcfResponse.blob();
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipBlob);
    const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith('.json'));
    if (!jsonFile) throw new Error('No JSON file found in the returned zip.');
    const jsonContent = await jsonFile.async('string');
    const modelData = JSON.parse(jsonContent);

    setModelUploadState({ buttonText: 'Saving...' });
    await processAndUploadModel(examId, modelData.questions, zip, subQuestionLookup);

    setModelUploadState({ buttonText: 'Refreshing data...' });
    modelForm.reset();
    document.getElementById('model-file-display').textContent = 'No files chosen';
    await loadExamDetails(examId);
  } catch (error) {
    setModelUploadState({ status: 'error', buttonText: 'Error!', spinner: false });
    console.error(error);
    isError = true;
  } finally {
    if (typeof window.exitProcessingLock === 'function') {
      window.exitProcessingLock(lockKey);
    }
    if (!isError) {
      setModelUploadState({ status: 'success', buttonText: 'Success!', spinner: false });
    }
    if (isError) {
      setModelUploadState({ status: 'error', spinner: false });
    }
    scheduleModelReset(isError ? 5000 : 3000);
  }
});

/**
 * Process and upload appendices after GCF response.
 * @param {string} examId
 * @param {Array<any>} appendices
 * @param {JSZip} zip
 */
async function processAndUploadAppendices(examId, appendices, zip) {
  setAppendixUploadState({ buttonText: 'Matching appendices...' });
  const { data: questions, error: qError } = await sb.from('questions').select('id, question_number').eq('exam_id', examId);
  if (qError) throw new Error(`Could not fetch question IDs: ${qError.message}`);

  const questionMap = new Map(questions.map((q) => [q.question_number, q.id]));
  const appendicesToInsert = [];

  for (const app of appendices) {
    const questionId = questionMap.get(app.question_number);
    if (!questionId) {
      console.warn(
        `Warning: Could not find question_id for question_number "${app.question_number}". Skipping this appendix.`,
      );
      continue;
    }

    let appVisualUrl = null;
    if (app.app_visual) {
      const visualFile = zip.file(app.app_visual);
      if (visualFile) {
        setAppendixUploadState({ buttonText: 'Uploading visuals...' });
        const sanitizedFilename = sanitizeFilename(app.app_visual);
        const filePath = `public/${examId}/appendices/${Date.now()}_${sanitizedFilename}`;
        const fileBlob = await visualFile.async('blob');
        const fileToUpload = new File([fileBlob], sanitizedFilename, { type: `image/${app.app_visual.split('.').pop()}` });

        const { error: uploadError } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, fileToUpload);
        if (uploadError) throw new Error(`Failed to upload ${app.app_visual}: ${uploadError.message}`);

        const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        appVisualUrl = urlData.publicUrl;
        console.log(`Visual uploaded to: ${appVisualUrl}`);
      } else {
        console.warn(`Warning: Visual file ${app.app_visual} not found in zip.`);
      }
    }
    appendicesToInsert.push({
      question_id: questionId,
      app_title: app.app_title,
      orig_llm_app_title: app.app_title,
      app_text: app.app_text,
      orig_llm_app_text: app.app_text,
      app_visual: appVisualUrl,
    });
  }

  if (appendicesToInsert.length > 0) {
    setAppendixUploadState({ buttonText: `Saving ${appendicesToInsert.length} records...` });
    const { error: insertError } = await sb.from('appendices').insert(appendicesToInsert);
    if (insertError) throw new Error(`Failed to insert appendices: ${insertError.message}`);
  } else {
    console.log('No valid appendices were found to insert.');
  }
}

/**
 * Process and upload model questions (alternatives, components) after GCF response.
 * @param {string} examId
 * @param {Array<any>} modelQuestions
 * @param {JSZip} zip
 */
async function processAndUploadModel(examId, modelQuestions, zip, precomputedLookup = null) {
  setModelUploadState({ buttonText: 'Processing rules...' });
  const rulesFile = zip.file('grading_rules.txt');
  if (rulesFile) {
    try {
      const rulesContent = await rulesFile.async('string');
      const { error: updateError } = await sb
        .from('exams')
        .update({
          grading_regulations: rulesContent,
          orig_llm_grading_regulations: rulesContent,
        })
        .eq('id', examId);
      if (updateError) throw updateError;
    } catch (error) {
      console.warn(`Could not save grading regulations: ${error.message}`);
    }
  }

  let subQuestionLookup = precomputedLookup;
  if (!subQuestionLookup) {
    const { data: dbQuestions, error: fetchError } = await sb
      .from('questions')
      .select('id, question_number, sub_questions(id, sub_q_text_content)')
      .eq('exam_id', examId);
    if (fetchError) throw new Error(`Could not fetch exam structure for matching: ${fetchError.message}`);
    subQuestionLookup = dbQuestions.reduce((qMap, q) => {
      qMap[q.question_number] = q.sub_questions.reduce((sqMap, sq) => {
        sqMap[sq.sub_q_text_content] = sq.id;
        return sqMap;
      }, {});
      return qMap;
    }, {});
  }

  for (const q_model of modelQuestions) {
    for (const sq_model of q_model.sub_questions) {
      const sub_question_id = subQuestionLookup[q_model.question_number]?.[sq_model.sub_q_text_content];
      if (!sub_question_id) {
        console.warn(`Could not find matching sub-question for Q#${q_model.question_number}. Skipping.`);
        continue;
      }

      if (sq_model.model_alternatives && sq_model.model_alternatives.length > 0) {
        let primaryAlternative =
          sq_model.model_alternatives.find((alt) => alt.alternative_number === 1) || sq_model.model_alternatives[0];
        if (primaryAlternative && primaryAlternative.model_components?.length > 0) {
          const calculatedMaxPoints = primaryAlternative.model_components.reduce(
            (sum, comp) => sum + (Number(comp.component_points) || 0),
            0,
          );
          const { error: updatePointsError } = await sb
            .from('sub_questions')
            .update({ max_sub_points: calculatedMaxPoints })
            .eq('id', sub_question_id);
          if (updatePointsError)
            console.warn(
              `Could not update max_sub_points for sub-question ID ${sub_question_id}: ${updatePointsError.message}`,
            );
        }
      }

      if (!sq_model.model_alternatives || sq_model.model_alternatives.length === 0) continue;
      setModelUploadState({ buttonText: `Saving Q#${q_model.question_number}...` });
      for (const alt_model of sq_model.model_alternatives) {
        const { data: newAlternative, error: altError } = await sb
          .from('model_alternatives')
          .insert({
            sub_question_id: sub_question_id,
            alternative_number: alt_model.alternative_number,
            extra_comment: alt_model.extra_comment,
            orig_llm_extra_comment: alt_model.extra_comment,
          })
          .select('id')
          .single();
        if (altError) throw new Error(`Failed to insert model alternative: ${altError.message}`);
        const alternative_id = newAlternative.id;
        if (!alt_model.model_components || alt_model.model_components.length === 0) continue;
        const componentsToInsert = [];
        for (const comp_model of alt_model.model_components) {
          let componentVisualUrl = null;
          if (comp_model.component_visual) {
            const visualFile = zip.file(comp_model.component_visual);
            if (visualFile) {
              const sanitizedFilename = sanitizeFilename(comp_model.component_visual);
              const filePath = `public/${examId}/models/${Date.now()}_${sanitizedFilename}`;
              const fileBlob = await visualFile.async('blob');
              const fileToUpload = new File([fileBlob], sanitizedFilename, {
                  type: `image/${comp_model.component_visual.split('.').pop()}`,
              });
              const { error: uploadError } = await sb.storage.from(STORAGE_BUCKET).upload(filePath, fileToUpload);
              if (uploadError) throw new Error(`Failed to upload ${comp_model.component_visual}: ${uploadError.message}`);
              const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
              componentVisualUrl = urlData.publicUrl;
            } else {
              console.warn(`Visual file ${comp_model.component_visual} not found in zip.`);
            }
          }
          componentsToInsert.push({
            alternative_id: alternative_id,
            component_text: comp_model.component_text,
            orig_llm_component_text: comp_model.component_text,
            component_visual: componentVisualUrl,
            component_points: comp_model.component_points,
            orig_llm_component_points: comp_model.component_points,
            component_order: comp_model.component_order,
          });
        }
        if (componentsToInsert.length > 0) {
          const { error: compError } = await sb.from('model_components').insert(componentsToInsert);
          if (compError) throw new Error(`Failed to insert model components: ${compError.message}`);
        }
      }
    }
  }

  // --- NEW: RECALCULATE AND UPDATE TOTAL POINTS ---
  setModelUploadState({ buttonText: 'Recalculating totals...' });

  const { data: questionsWithSubPoints, error: refetchError } = await sb
    .from('questions')
    .select('id, sub_questions(max_sub_points)')
    .eq('exam_id', examId);

  if (refetchError) {
    throw new Error(`Could not re-fetch questions to update totals: ${refetchError.message}`);
  }

  let newExamTotalPoints = 0;
  const questionUpdatePromises = [];

  for (const question of questionsWithSubPoints) {
    const newQuestionTotal = question.sub_questions.reduce((sum, sq) => {
      return sum + (Number(sq.max_sub_points) || 0);
    }, 0);

    newExamTotalPoints += newQuestionTotal;

    questionUpdatePromises.push(sb.from('questions').update({ max_total_points: newQuestionTotal }).eq('id', question.id));
  }

  if (questionUpdatePromises.length > 0) {
    const questionUpdateResults = await Promise.all(questionUpdatePromises);
    const firstError = questionUpdateResults.find((res) => res.error);
    if (firstError) {
      throw new Error(`Failed to update question totals: ${firstError.error.message}`);
    }
  }

  const { error: examUpdateError } = await sb.from('exams').update({ max_total_points: newExamTotalPoints }).eq('id', examId);

  if (examUpdateError) {
    throw new Error(`Failed to update the exam's total points: ${examUpdateError.message}`);
  }

  console.log(`Successfully recalculated and updated totals. New exam total: ${newExamTotalPoints}`);
}
