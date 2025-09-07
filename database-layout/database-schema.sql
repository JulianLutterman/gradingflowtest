-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.appendices (
  orig_llm_app_title text,
  orig_llm_app_text text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  question_id uuid NOT NULL DEFAULT gen_random_uuid(),
  app_title text,
  app_text text,
  app_visual text,
  CONSTRAINT appendices_pkey PRIMARY KEY (id),
  CONSTRAINT appendices_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.exams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  orig_llm_grading_regulations text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  teacher_id uuid NOT NULL,
  exam_name text NOT NULL,
  max_total_points bigint,
  grading_regulations text,
  CONSTRAINT exams_pkey PRIMARY KEY (id),
  CONSTRAINT exams_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id)
);
CREATE TABLE public.mcq_options (
  orig_llm_mcq_content text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sub_question_id uuid NOT NULL,
  mcq_letter text NOT NULL,
  mcq_content text NOT NULL,
  CONSTRAINT mcq_options_pkey PRIMARY KEY (id),
  CONSTRAINT mcq_options_sub_question_id_fkey FOREIGN KEY (sub_question_id) REFERENCES public.sub_questions(id)
);
CREATE TABLE public.model_alternatives (
  sub_question_id uuid NOT NULL,
  alternative_number bigint,
  orig_llm_extra_comment text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  extra_comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT model_alternatives_pkey PRIMARY KEY (id),
  CONSTRAINT model_alternatives_sub_question_id_fkey FOREIGN KEY (sub_question_id) REFERENCES public.sub_questions(id)
);
CREATE TABLE public.model_components (
  component_order bigint,
  component_text text,
  component_visual text,
  component_points bigint NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  orig_llm_component_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  orig_llm_component_points bigint,
  alternative_id uuid NOT NULL,
  CONSTRAINT model_components_pkey PRIMARY KEY (id),
  CONSTRAINT answer_components_alternative_id_fkey FOREIGN KEY (alternative_id) REFERENCES public.model_alternatives(id)
);
CREATE TABLE public.multi_scan_sessions (
  exam_id uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  session_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending'::text,
  CONSTRAINT multi_scan_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT multi_scan_sessions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id)
);
CREATE TABLE public.multi_scan_students (
  multi_scan_session_id uuid NOT NULL,
  student_name text,
  student_number text,
  student_id uuid,
  uploaded_image_paths jsonb,
  order integer NOT NULL,
  student_exam_id uuid,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'::text,
  CONSTRAINT multi_scan_students_pkey PRIMARY KEY (id),
  CONSTRAINT multi_scan_students_student_exam_id_fkey FOREIGN KEY (student_exam_id) REFERENCES public.student_exams(id),
  CONSTRAINT multi_scan_students_multi_scan_session_id_fkey FOREIGN KEY (multi_scan_session_id) REFERENCES public.multi_scan_sessions(id),
  CONSTRAINT multi_scan_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.questions (
  orig_llm_context_text text,
  orig_llm_extra_comment text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  exam_id uuid NOT NULL,
  question_number text,
  max_total_points bigint,
  context_text text,
  context_visual text,
  extra_comment text,
  CONSTRAINT questions_pkey PRIMARY KEY (id),
  CONSTRAINT questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id)
);
CREATE TABLE public.scan_sessions (
  student_id uuid NOT NULL,
  student_name text,
  student_number text,
  updated_at timestamp with time zone DEFAULT now(),
  error_message text,
  session_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  student_exam_id uuid,
  uploaded_image_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  exam_id uuid NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT scan_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT scan_sessions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id),
  CONSTRAINT scan_sessions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT scan_sessions_student_exam_id_fkey FOREIGN KEY (student_exam_id) REFERENCES public.student_exams(id)
);
CREATE TABLE public.student_answers (
  sub_question_id uuid NOT NULL,
  answer_text text,
  answer_visual text,
  sub_points_awarded bigint,
  orig_llm_answer_text text,
  orig_llm_sub_points_awarded bigint,
  feedback_comment text,
  orig_llm_feedback_comment text,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  student_exam_id uuid NOT NULL,
  CONSTRAINT student_answers_pkey PRIMARY KEY (id),
  CONSTRAINT student_answers_student_exam_id_fkey FOREIGN KEY (student_exam_id) REFERENCES public.student_exams(id),
  CONSTRAINT student_answers_sub_question_id_fkey FOREIGN KEY (sub_question_id) REFERENCES public.sub_questions(id)
);
CREATE TABLE public.student_exams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  student_id uuid NOT NULL,
  exam_id uuid NOT NULL,
  status text,
  total_points_awarded bigint,
  final_grade text,
  CONSTRAINT student_exams_pkey PRIMARY KEY (id),
  CONSTRAINT student_exams_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT student_exams_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id)
);
CREATE TABLE public.students (
  student_number text,
  email text UNIQUE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  full_name text,
  CONSTRAINT students_pkey PRIMARY KEY (id)
);
CREATE TABLE public.sub_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  orig_llm_sub_q_text_content text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sub_q_text_content text,
  max_sub_points bigint,
  question_id uuid NOT NULL,
  sub_question_order bigint NOT NULL,
  CONSTRAINT sub_questions_pkey PRIMARY KEY (id),
  CONSTRAINT sub_questions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id)
);
CREATE TABLE public.teachers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  full_name text,
  email text UNIQUE,
  CONSTRAINT teachers_pkey PRIMARY KEY (id)
);