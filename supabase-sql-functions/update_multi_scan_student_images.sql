-- Updates a single student's record within a multi-scan session.
CREATE OR REPLACE FUNCTION update_multi_scan_student_images(
    student_id_arg uuid,
    session_token_arg uuid,
    new_urls_arg jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_id_from_token uuid;
BEGIN
    SELECT mss.id INTO session_id_from_token
    FROM public.multi_scan_sessions mss
    JOIN public.multi_scan_students mstud ON mstud.multi_scan_session_id = mss.id
    WHERE mss.session_token = session_token_arg AND mstud.id = student_id_arg;

    IF session_id_from_token IS NULL THEN
        RAISE EXCEPTION 'Invalid session token or student ID mismatch.';
    END IF;

    UPDATE public.multi_scan_students
    SET
        uploaded_image_paths = new_urls_arg,
        status = 'uploaded'
    WHERE
        id = student_id_arg;
END;
$$;