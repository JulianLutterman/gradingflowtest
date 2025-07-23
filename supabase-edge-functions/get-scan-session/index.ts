import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req) => {
    const allowedOrigin = req.headers.get('origin');
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin || '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                'Access-Control-Max-Age': '86400'
            }
        });
    }
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({
            error: 'Method Not Allowed'
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': allowedOrigin || '*'
            },
            status: 405
        });
    }
    const url = new URL(req.url);
    const sessionToken = url.searchParams.get('token');
    if (!sessionToken) {
        return new Response(JSON.stringify({
            error: 'Session token is required'
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': allowedOrigin || '*'
            },
            status: 400
        });
    }
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    try {
        const { data: session, error } = await supabaseClient.from('scan_sessions').select('id,student_id,student_exam_id,session_token,student_name,student_number,uploaded_image_paths,status,expires_at').eq('session_token', sessionToken).single();
        if (error) {
            console.error('Database error:', error);
            return new Response(JSON.stringify({
                error: 'Session not found or expired'
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': allowedOrigin || '*'
                },
                status: 404
            });
        }
        // Check if session is expired
        const now = new Date();
        const expiresAt = new Date(session.expires_at);
        if (now > expiresAt) {
            return new Response(JSON.stringify({
                error: 'Session has expired'
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': allowedOrigin || '*'
                },
                status: 410
            });
        }
        return new Response(JSON.stringify(session), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': allowedOrigin || '*'
            },
            status: 200
        });
    } catch (error) {
        console.error('Error fetching scan session:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error'
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': allowedOrigin || '*'
            },
            status: 500
        });
    }
});
