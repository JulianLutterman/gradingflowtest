-- This function securely fetches session details using a token.
-- It's intended to be called by an authenticated user (like a teacher)
-- from exam.js, who might not have direct RLS 'select' access to the session row.
DROP FUNCTION get_session_details_by_token(uuid);

CREATE OR REPLACE FUNCTION get_session_details_by_token(token_arg uuid)
RETURNS TABLE (
    id uuid,
    student_id uuid,
    student_exam_id uuid,
    session_token uuid, -- Add this column to the return type
    student_name text,
    student_number text,
    uploaded_image_paths jsonb,
    expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.student_id,
        s.student_exam_id,
        s.session_token, -- Select the new column
        s.student_name,
        s.student_number,
        s.uploaded_image_paths,
        s.expires_at
    FROM public.scan_sessions s
    WHERE s.session_token = token_arg;
END;
$$;