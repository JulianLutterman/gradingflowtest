// /functions/generate-scan-session/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: corsHeaders
        });
    }
    try {
        if (req.method !== 'POST') {
            return new Response(JSON.stringify({
                error: 'Method Not Allowed'
            }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                },
                status: 405
            });
        }
        const { examId, studentName, studentNumber } = await req.json();
        if (!examId) {
            return new Response(JSON.stringify({
                error: 'Exam ID is required'
            }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                },
                status: 400
            });
        }
        const normalizedName = typeof studentName === 'string' ? studentName.trim() : '';
        const normalizedNumber = typeof studentNumber === 'string' ? studentNumber.trim() : '';
        if (!normalizedName && !normalizedNumber) {
            return new Response(JSON.stringify({
                error: 'A student name or student number is required'
            }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                },
                status: 400
            });
        }
        const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        // --- START: ROBUST STUDENT & STUDENT_EXAM CREATION ---
        const { data: newStudent, error: createStudentError } = await supabaseClient
            .from('students')
            .insert({
                full_name: normalizedName || null,
                student_number: normalizedNumber || null
            })
            .select('id')
            .single();
        if (createStudentError) throw createStudentError;
        const studentId = newStudent.id;
        // Find or create the student_exam record to get its ID
        let studentExamId;
        const { data: existingStudentExam, error: findError } = await supabaseClient.from('student_exams').select('id').eq('student_id', studentId).eq('exam_id', examId).maybeSingle();
        if (findError) throw findError;
        if (existingStudentExam) {
            studentExamId = existingStudentExam.id;
            // If it exists, we must delete the old answers to prevent duplication.
            const { error: deleteError } = await supabaseClient.from('student_answers').delete().eq('student_exam_id', studentExamId);
            if (deleteError) throw deleteError;
        } else {
            const { data: newStudentExam, error: createError } = await supabaseClient.from('student_exams').insert({
                student_id: studentId,
                exam_id: examId,
                status: 'submitted'
            }).select('id').single();
            if (createError) throw createError;
            studentExamId = newStudentExam.id;
        }
        // --- END: ROBUST STUDENT & STUDENT_EXAM CREATION ---
        // Create scan session, now including the student_exam_id
        const { data: scanSession, error: createSessionError } = await supabaseClient.from('scan_sessions').insert({
            exam_id: examId,
            student_id: studentId,
            student_exam_id: studentExamId,
            student_name: normalizedName || null,
            student_number: normalizedNumber || null,
            expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            status: 'pending'
        }).select('session_token') // Only need to return the token to the client
            .single();
        if (createSessionError) throw createSessionError;
        // The client only needs the token to proceed. The important ID is now in the database.
        return new Response(JSON.stringify({
            session_token: scanSession.session_token
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 200
        });
    } catch (error) {
        console.error('Error generating scan session:', error.message);
        return new Response(JSON.stringify({
            error: error.message
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 500
        });
    }
});
