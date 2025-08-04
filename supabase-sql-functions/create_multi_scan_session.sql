-- Creates a multi-scan session and its associated student entries.
CREATE OR REPLACE FUNCTION create_multi_scan_session(
    exam_id_arg uuid,
    students_arg jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_session_id uuid;
    new_session_token uuid;
    student_data jsonb;
    student_order integer := 0;
    created_student_records jsonb[] := '{}';
    new_student_record jsonb;
BEGIN
    INSERT INTO public.multi_scan_sessions (exam_id, expires_at)
    VALUES (exam_id_arg, now() + interval '2 hours')
    RETURNING id, session_token INTO new_session_id, new_session_token;

    FOR student_data IN SELECT * FROM jsonb_array_elements(students_arg)
    LOOP
        student_order := student_order + 1;
        INSERT INTO public.multi_scan_students (multi_scan_session_id, student_name, student_number, "order")
        VALUES (
            new_session_id,
            student_data->>'studentName',
            student_data->>'studentNumber',
            student_order
        )
        RETURNING jsonb_build_object('id', id, 'order', "order") INTO new_student_record;
        created_student_records := array_append(created_student_records, new_student_record);
    END LOOP;

    RETURN jsonb_build_object(
        'session_token', new_session_token,
        'students', to_jsonb(created_student_records)
    );
END;
$$;
