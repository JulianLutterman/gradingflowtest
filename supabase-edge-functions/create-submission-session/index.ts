// /functions/create-submission-session/index.ts
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
        const { examId, studentName, studentNumber, uploadedImagePaths } = await req.json();
        if (!examId || !studentName && !studentNumber) {
            return new Response(JSON.stringify({
                error: 'Exam ID and student identifier are required'
            }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                },
                status: 400
            });
        }
        const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        // --- This logic is already correct for finding/creating student and student_exam ---
        const { data: newStudent, error: createError } = await supabaseClient.from('students').insert({
            full_name: studentName || null,
            student_number: studentNumber || null
        }).select('id').single();
        if (createError) throw new Error(`Error creating new student: ${createError.message}`);
        const studentId = newStudent.id;
        let studentExamId;
        const { data: existingStudentExam, error: findError } = await supabaseClient.from('student_exams').select('id').eq('student_id', studentId).eq('exam_id', examId).maybeSingle();
        if (findError) throw findError;
        if (existingStudentExam) {
            studentExamId = existingStudentExam.id;
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
        // --- End of correct logic ---
        // Create the scan_session record, now with student_exam_id
        const { data: newSession, error: sessionError } = await supabaseClient.from('scan_sessions').insert({
            exam_id: examId,
            student_id: studentId,
            student_exam_id: studentExamId,
            student_name: studentName,
            student_number: studentNumber,
            uploaded_image_paths: uploadedImagePaths || [],
            status: 'uploaded',
            expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString()
        }).select('*') // Select all columns of the new session
            .single();
        if (sessionError) throw new Error(`Failed to create submission session: ${sessionError.message}`);
        // The newSession object from the DB now contains student_exam_id,
        // so the original response payload logic is still valid and now more robust.
        return new Response(JSON.stringify(newSession), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 200
        });
    } catch (error) {
        console.error('Error in create-submission-session:', error.message);
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
