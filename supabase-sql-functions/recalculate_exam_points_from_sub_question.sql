CREATE OR REPLACE FUNCTION recalculate_exam_points_from_sub_question(p_sub_question_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_question_id UUID;
    v_exam_id UUID;
    v_new_max_sub_points BIGINT;
    v_new_question_total BIGINT;
    v_new_exam_total BIGINT;
BEGIN
    -- Step 1: Calculate the new max_sub_points for the given sub_question
    -- This is the maximum sum of points from any single answer alternative.
    SELECT COALESCE(MAX(alternative_total), 0)
    INTO v_new_max_sub_points
    FROM (
        SELECT SUM(mc.component_points) as alternative_total
        FROM public.model_alternatives ma
        JOIN public.model_components mc ON ma.id = mc.alternative_id
        WHERE ma.sub_question_id = p_sub_question_id
        GROUP BY ma.id
    ) as alternative_sums;

    -- Step 2: Update the sub_question and get its parent question_id
    UPDATE public.sub_questions
    SET max_sub_points = v_new_max_sub_points
    WHERE id = p_sub_question_id
    RETURNING question_id INTO v_question_id;

    -- If the sub-question was found and updated, proceed to update the parent question
    IF v_question_id IS NOT NULL THEN
        -- Step 3: Calculate the new max_total_points for the parent question
        SELECT COALESCE(SUM(max_sub_points), 0)
        INTO v_new_question_total
        FROM public.sub_questions
        WHERE question_id = v_question_id;

        -- Step 4: Update the question and get its parent exam_id
        UPDATE public.questions
        SET max_total_points = v_new_question_total
        WHERE id = v_question_id
        RETURNING exam_id INTO v_exam_id;

        -- If the question was found and updated, proceed to update the parent exam
        IF v_exam_id IS NOT NULL THEN
            -- Step 5: Calculate the new max_total_points for the parent exam
            SELECT COALESCE(SUM(max_total_points), 0)
            INTO v_new_exam_total
            FROM public.questions
            WHERE exam_id = v_exam_id;

            -- Step 6: Update the exam
            UPDATE public.exams
            SET max_total_points = v_new_exam_total
            WHERE id = v_exam_id;
        END IF;
    END IF;
END;
$$;
