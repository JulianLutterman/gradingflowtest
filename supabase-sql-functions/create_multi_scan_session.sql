-- Fetches a multi-scan session and its students for the multi-scan.html page.
CREATE OR REPLACE FUNCTION get_multi_scan_session_by_token(token_arg uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    session_data jsonb;
    students_data jsonb;
BEGIN
    SELECT to_jsonb(s) INTO session_data
    FROM public.multi_scan_sessions s
    WHERE s.session_token = token_arg AND s.expires_at > now();

    IF session_data IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_agg(to_jsonb(st) ORDER BY st."order") INTO students_data
    FROM public.multi_scan_students st
    WHERE st.multi_scan_session_id = (session_data->>'id')::uuid;

    RETURN jsonb_set(session_data, '{students}', students_data);
END;
$$;