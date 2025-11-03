import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { supabase } from '../services/supabaseClient.js';
import { sanitizeFilename } from '../utils/files.js';

const GCF_URL = 'https://exam-structurer-232485517114.europe-west1.run.app';
const STORAGE_BUCKET = 'exam-visuals';
const DEFAULT_EXAM_BUTTON_TEXT = 'Process and Upload Exam';

function DashboardPage() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [exams, setExams] = useState([]);
  const [loadingExams, setLoadingExams] = useState(true);
  const [examsError, setExamsError] = useState('');
  const [uploadStatus, setUploadStatus] = useState(DEFAULT_EXAM_BUTTON_TEXT);
  const [uploading, setUploading] = useState(false);
  const [selectedFilesDisplay, setSelectedFilesDisplay] = useState('No files chosen');
  const [confirmState, setConfirmState] = useState({ examId: null, examName: '', open: false });
  const [statusLog, setStatusLog] = useState([]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [user, loading, navigate]);

  const addStatus = useCallback((message, { log = true } = {}) => {
    if (log) {
      setStatusLog((prev) => [message, ...prev.slice(0, 9)]);
    }
    setUploadStatus(message);
  }, []);

  const loadExams = useCallback(async () => {
    if (!user) return;
    setLoadingExams(true);
    setExamsError('');

    const { data, error } = await supabase
      .from('exams')
      .select('id, exam_name, created_at')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      setExamsError(error.message);
      setExams([]);
    } else {
      setExams(data ?? []);
    }
    setLoadingExams(false);
  }, [user]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const handleFilesChange = useCallback((event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      setSelectedFilesDisplay('No files chosen');
    } else if (files.length === 1) {
      setSelectedFilesDisplay(files[0].name);
    } else {
      setSelectedFilesDisplay(`${files.length} files selected`);
    }
  }, []);

  const handleUpload = useCallback(
    async (event) => {
      event.preventDefault();
      if (uploading) return;

      const form = event.target.closest('form');
      const examName = form.examName.value.trim();
      const files = form.examFiles.files;

      if (!examName || !files || files.length === 0) {
        window.alert('Please provide an exam name and at least one file.');
        return;
      }

      setUploading(true);
      addStatus('Starting...');

      try {
        if (!user) {
          throw new Error('User not authenticated.');
        }

        addStatus('Thinking... (~2 mins)');
        const formData = new FormData();
        for (const file of files) {
          formData.append('files', file);
        }

        const gcfResponse = await fetch(GCF_URL, {
          method: 'POST',
          body: formData,
        });

        if (!gcfResponse.ok) {
          throw new Error(`Cloud function failed with status: ${gcfResponse.statusText}`);
        }

        addStatus('Unzipping results...');
        const zipBlob = await gcfResponse.blob();
        const zip = await JSZip.loadAsync(zipBlob);

        const jsonFile = Object.values(zip.files).find((file) => file.name.endsWith('.json'));
        if (!jsonFile) throw new Error('No JSON file found in the returned zip.');

        const jsonContent = await jsonFile.async('string');
        const examData = JSON.parse(jsonContent);
        addStatus('Parsed exam data...');

        await uploadExamToSupabase({
          examData,
          teacherId: user.id,
          examName,
          zip,
          setStatus: addStatus,
        });

        addStatus('Refreshing list...');
        form.reset();
        setSelectedFilesDisplay('No files chosen');
        await loadExams();
        addStatus('Success!');
      } catch (error) {
        console.error('An error occurred while uploading exam', error);
        addStatus('Error! See console.');
        window.alert(`An error occurred: ${error.message}`);
      } finally {
        setTimeout(() => {
          addStatus(DEFAULT_EXAM_BUTTON_TEXT, { log: false });
          setUploading(false);
        }, 2000);
      }
    },
    [addStatus, loadExams, uploading, user],
  );

  const handleDeleteExam = useCallback(
    async (examId) => {
      try {
        const { error } = await supabase.rpc('delete_exam_cascade', { p_exam_id: examId });
        if (error) throw error;
        await loadExams();
      } catch (err) {
        console.error('Failed to delete exam', err);
        window.alert('Failed to delete the exam. Please try again.');
      }
    },
    [loadExams],
  );

  const pendingDeletionExam = useMemo(() => {
    if (!confirmState.open) return null;
    return exams.find((exam) => exam.id === confirmState.examId) ?? null;
  }, [confirmState, exams]);

  if (loading) {
    return (
      <div className="container" style={{ marginTop: '3rem' }}>
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="page page-dashboard">
      <header className="container" id="app-header">
        <span>{user.email}</span>
        <button type="button" onClick={signOut}>
          Logout
        </button>
      </header>

      <section className="container">
        <h2>Upload New Exam</h2>
        <form id="exam-form" onSubmit={handleUpload}>
          <div className="form-group">
            <label htmlFor="exam-name">Exam Name</label>
            <input type="text" id="exam-name" name="examName" placeholder="e.g., Physics Midterm 2024" required />
          </div>

          <div className="form-group">
            <label htmlFor="exam-files">Exam File(s) (PDF/Images)</label>
            <input
              type="file"
              id="exam-files"
              name="examFiles"
              className="file-input-hidden"
              accept=".pdf,image/*"
              multiple
              required
              onChange={handleFilesChange}
            />
            <label htmlFor="exam-files" className="file-input-label">
              Choose Files
            </label>
            <span className="file-name-display">{selectedFilesDisplay}</span>
          </div>

          <button type="submit" id="submit-exam-button" disabled={uploading} className="pushable-button">
            {uploading && <Spinner light />}
            <span>{uploadStatus}</span>
          </button>
        </form>
      </section>

      <section className="container">
        <h2>Your Exams</h2>
        {loadingExams ? (
          <p>Loading exams...</p>
        ) : examsError ? (
          <p style={{ color: 'red' }}>Error loading exams: {examsError}</p>
        ) : exams.length === 0 ? (
          <p>You have not uploaded any exams yet.</p>
        ) : (
          <div className="exam-cards-container">
            {exams.map((exam) => (
              <article className="exam-card" key={exam.id}>
                <button
                  type="button"
                  className="exam-delete-btn"
                  aria-label="Delete exam"
                  onClick={() =>
                    setConfirmState({ examId: exam.id, examName: exam.exam_name, open: true })
                  }
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#14110f"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M4 7h16" />
                    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    <path d="M10 12l4 4m0 -4l-4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="exam-card-link"
                  onClick={() => navigate(`/exams/${exam.id}`)}
                >
                  <h3>{exam.exam_name}</h3>
                  <p>Uploaded on: {new Date(exam.created_at).toLocaleDateString()}</p>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="container" aria-live="polite">
        <h2>Status Log</h2>
        {statusLog.length === 0 ? (
          <p>No status updates yet.</p>
        ) : (
          <ol className="status-log">
            {statusLog.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>
        )}
      </section>

      <ConfirmDialog
        open={confirmState.open}
        title="Delete Exam"
        description={
          pendingDeletionExam
            ? `Delete the exam "${pendingDeletionExam.exam_name}" and all associated data? This cannot be undone.`
            : 'Delete this exam and all associated data? This cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmState({ examId: null, examName: '', open: false });
          if (confirmState.examId) {
            void handleDeleteExam(confirmState.examId);
          }
        }}
        onCancel={() => setConfirmState({ examId: null, examName: '', open: false })}
      />
    </div>
  );
}

export default DashboardPage;

async function uploadExamToSupabase({ examData, teacherId, examName, zip, setStatus }) {
  const maxTotalPoints = examData.exam.questions.reduce(
    (sum, q) => sum + (q.max_total_points || 0),
    0,
  );

  setStatus('Creating exam entry...');
  const { data: exam, error: examError } = await supabase
    .from('exams')
    .insert({
      teacher_id: teacherId,
      exam_name: examName,
      max_total_points: maxTotalPoints,
    })
    .select('id')
    .single();

  if (examError) throw new Error(`Failed to create exam record: ${examError.message}`);
  const examId = exam.id;
  setStatus(`Saving exam (ID: ${examId})...`);

  for (const [index, q] of examData.exam.questions.entries()) {
    setStatus(`Saving Q#${q.question_number} (${index + 1}/${examData.exam.questions.length})`);
    let contextVisualUrl = null;

    if (q.context_visual) {
      const visualFile = zip.file(q.context_visual);
      if (visualFile) {
        const sanitizedFilename = sanitizeFilename(q.context_visual);
        const filePath = `public/${examId}/${Date.now()}_${sanitizedFilename}`;
        const fileBlob = await visualFile.async('blob');
        const fileExtension = q.context_visual.split('.').pop().toLowerCase();
        const mimeType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
        const fileToUpload = new File([fileBlob], sanitizedFilename, { type: mimeType });

        const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, fileToUpload);
        if (uploadError) throw new Error(`Failed to upload ${q.context_visual}: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        contextVisualUrl = urlData.publicUrl;
      } else {
        console.warn(`Visual file ${q.context_visual} not found in zip.`);
      }
    }

    const { data: question, error: questionError } = await supabase
      .from('questions')
      .insert({
        exam_id: examId,
        question_number: q.question_number,
        max_total_points: q.max_total_points,
        context_text: q.context_text,
        orig_llm_context_text: q.context_text,
        context_visual: contextVisualUrl,
        extra_comment: q.extra_comment,
        orig_llm_extra_comment: q.extra_comment,
      })
      .select('id')
      .single();

    if (questionError) throw new Error(`Failed to insert question ${q.question_number}: ${questionError.message}`);
    const questionId = question.id;

    if (q.sub_questions) {
      let fallbackOrder = 1;
      for (const sq of q.sub_questions) {
        const subQuestionOrder = Number.isFinite(+sq.sub_question_order) ? +sq.sub_question_order : fallbackOrder++;

        const { data: subQuestion, error: subQError } = await supabase
          .from('sub_questions')
          .insert({
            question_id: questionId,
            sub_q_text_content: sq.sub_q_text_content,
            orig_llm_sub_q_text_content: sq.sub_q_text_content,
            max_sub_points: sq.max_sub_points,
            sub_question_order: subQuestionOrder,
          })
          .select('id')
          .single();

        if (subQError) throw new Error(`Failed to insert sub-question: ${subQError.message}`);
        const subQuestionId = subQuestion.id;

        if (sq.mcq_options) {
          const mcqOptionsToInsert = sq.mcq_options.map((opt) => ({
            sub_question_id: subQuestionId,
            mcq_letter: opt.mcq_letter,
            mcq_content: opt.mcq_content,
            orig_llm_mcq_content: opt.mcq_content,
          }));
          const { error: mcqError } = await supabase.from('mcq_options').insert(mcqOptionsToInsert);
          if (mcqError) throw new Error(`Failed to insert MCQ options: ${mcqError.message}`);
        }
      }
    }
  }
}
