-- QUESTION (deletes: appendices, sub_questions, mcq_options, model_alternatives, model_components, student_answers; then question)
create or replace function delete_question_cascade(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exam_id uuid;
begin
  select exam_id into v_exam_id from public.questions where id = p_question_id;

  -- children of sub_questions
  delete from public.mcq_options
  using public.sub_questions sq
  where mcq_options.sub_question_id = sq.id and sq.question_id = p_question_id;

  delete from public.model_components mc
  using public.model_alternatives ma, public.sub_questions sq
  where mc.alternative_id = ma.id and ma.sub_question_id = sq.id and sq.question_id = p_question_id;

  delete from public.model_alternatives ma
  using public.sub_questions sq
  where ma.sub_question_id = sq.id and sq.question_id = p_question_id;

  delete from public.student_answers sa
  using public.sub_questions sq
  where sa.sub_question_id = sq.id and sq.question_id = p_question_id;

  -- question-level children
  delete from public.appendices where question_id = p_question_id;
  delete from public.sub_questions where question_id = p_question_id;

  -- finally the question
  delete from public.questions where id = p_question_id;

  -- recompute exam total
  if v_exam_id is not null then
    update public.exams e
      set max_total_points = coalesce((
        select sum(q.max_total_points) from public.questions q where q.exam_id = v_exam_id
      ), 0)
    where e.id = v_exam_id;
  end if;
end;
$$;

-- SUB-QUESTION (deletes: mcq_options, model_components, model_alternatives, student_answers; then the sub_question)
create or replace function delete_sub_question_cascade(p_sub_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question_id uuid;
  v_exam_id uuid;
begin
  select question_id into v_question_id from public.sub_questions where id = p_sub_question_id;

  delete from public.mcq_options where sub_question_id = p_sub_question_id;

  delete from public.model_components mc
  using public.model_alternatives ma
  where mc.alternative_id = ma.id and ma.sub_question_id = p_sub_question_id;

  delete from public.model_alternatives where sub_question_id = p_sub_question_id;

  delete from public.student_answers where sub_question_id = p_sub_question_id;

  delete from public.sub_questions where id = p_sub_question_id;

  if v_question_id is not null then
    -- recompute question total
    update public.questions q
      set max_total_points = coalesce((
        select sum(sq.max_sub_points) from public.sub_questions sq where sq.question_id = v_question_id
      ), 0)
    where q.id = v_question_id;

    -- exam id
    select exam_id into v_exam_id from public.questions where id = v_question_id;

    if v_exam_id is not null then
      update public.exams e
        set max_total_points = coalesce((
          select sum(q2.max_total_points) from public.questions q2 where q2.exam_id = v_exam_id
        ), 0)
      where e.id = v_exam_id;
    end if;
  end if;
end;
$$;

-- MODEL ALTERNATIVE (deletes: components; then alternative; then recompute sub-question/question/exam totals)
create or replace function delete_model_alternative_cascade(p_alternative_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub_question_id uuid;
begin
  select sub_question_id into v_sub_question_id from public.model_alternatives where id = p_alternative_id;
  delete from public.model_components where alternative_id = p_alternative_id;
  delete from public.model_alternatives where id = p_alternative_id;

  if v_sub_question_id is not null then
    -- use your existing recompute pipeline
    perform recalculate_exam_points_from_sub_question(v_sub_question_id);
  end if;
end;
$$;

-- MODEL COMPONENT (delete one component; recompute totals up the chain)
create or replace function delete_model_component(p_component_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alt_id uuid;
  v_sub_question_id uuid;
begin
  select alternative_id into v_alt_id from public.model_components where id = p_component_id;
  delete from public.model_components where id = p_component_id;

  if v_alt_id is not null then
    select sub_question_id into v_sub_question_id from public.model_alternatives where id = v_alt_id;
    if v_sub_question_id is not null then
      perform recalculate_exam_points_from_sub_question(v_sub_question_id);
    end if;
  end if;
end;
$$;

-- STUDENT submission for an exam (remove answers + student_exam; keep the student profile)
create or replace function delete_student_submission_for_exam(p_exam_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.student_exams
  where exam_id = p_exam_id and student_id = p_student_id;

  if v_ids is null or array_length(v_ids,1) is null then
    return;
  end if;

  -- detach references that would block delete (nullable FKs)
  update public.scan_sessions set student_exam_id = null where student_exam_id = any(v_ids);
  update public.multi_scan_students set student_exam_id = null where student_exam_id = any(v_ids);

  -- delete children
  delete from public.student_answers where student_exam_id = any(v_ids);

  -- delete parent
  delete from public.student_exams where id = any(v_ids);
end;
$$;

-- Clear points + feedback for a specific student_answer and recompute total for that student_exam
create or replace function clear_points_and_feedback(p_answer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_exam_id uuid;
begin
  select student_exam_id into v_student_exam_id from public.student_answers where id = p_answer_id;

  update public.student_answers
    set sub_points_awarded = null,
        orig_llm_sub_points_awarded = null,
        feedback_comment = null,
        orig_llm_feedback_comment = null
  where id = p_answer_id;

  if v_student_exam_id is not null then
    perform recalculate_student_total_points(v_student_exam_id);
  end if;
end;
$$;
