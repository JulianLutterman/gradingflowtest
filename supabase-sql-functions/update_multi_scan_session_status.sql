-- This function updates the status of the main multi_scan_session.
CREATE OR REPLACE FUNCTION update_multi_scan_session_status(
    session_token_arg uuid,
    new_status_arg text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.multi_scan_sessions
    SET status = new_status_arg
    WHERE session_token = session_token_arg;
END;
$$;