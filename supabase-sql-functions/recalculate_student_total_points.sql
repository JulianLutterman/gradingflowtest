CREATE OR REPLACE FUNCTION recalculate_student_total_points(p_student_exam_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_total_points BIGINT;
BEGIN
    -- Step 1: Calculate the new total_points_awarded for the given student_exam
    SELECT COALESCE(SUM(sub_points_awarded), 0)
    INTO v_new_total_points
    FROM public.student_answers
    WHERE student_exam_id = p_student_exam_id;

    -- Step 2: Update the student_exams table
    UPDATE public.student_exams
    SET total_points_awarded = v_new_total_points
    WHERE id = p_student_exam_id;
END;
$$;
