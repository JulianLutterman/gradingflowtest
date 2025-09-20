-- Helper to find an existing student or create a new one.
CREATE OR REPLACE FUNCTION find_or_create_student(p_full_name text, p_student_number text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student_id uuid;
BEGIN
    INSERT INTO public.students (full_name, student_number)
    VALUES (p_full_name, p_student_number)
    RETURNING students.id INTO v_student_id;

    RETURN QUERY SELECT v_student_id;
END;
$$;