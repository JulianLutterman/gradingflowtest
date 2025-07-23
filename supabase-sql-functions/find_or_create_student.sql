-- Helper to find an existing student or create a new one.
CREATE OR REPLACE FUNCTION find_or_create_student(p_full_name text, p_student_number text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student_id uuid;
BEGIN
    SELECT s.id INTO v_student_id
    FROM public.students s
    WHERE (p_student_number IS NOT NULL AND s.student_number = p_student_number)
       OR (p_full_name IS NOT NULL AND s.full_name = p_full_name)
    LIMIT 1;

    IF v_student_id IS NULL THEN
        INSERT INTO public.students (full_name, student_number)
        VALUES (p_full_name, p_student_number)
        RETURNING students.id INTO v_student_id;
    END IF;

    RETURN QUERY SELECT v_student_id;
END;
$$;