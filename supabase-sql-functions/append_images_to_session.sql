-- This function securely appends new image URLs to a session's existing list
-- and updates its status. It's designed to be called from the client-side.

CREATE OR REPLACE FUNCTION append_images_to_session(session_id_arg uuid, new_urls_arg jsonb)
RETURNS void -- It either works or throws an error, no need to return data
LANGUAGE plpgsql
SECURITY DEFINER -- IMPORTANT: Runs with admin privileges to bypass RLS
AS $$
BEGIN
    UPDATE public.scan_sessions
    SET
        -- The '||' operator is the standard way to concatenate two jsonb arrays in PostgreSQL
        uploaded_image_paths = uploaded_image_paths || new_urls_arg,
        status = 'uploaded',
        updated_at = now() -- It's good practice to update this timestamp
    WHERE
        id = session_id_arg;
END;
$$;