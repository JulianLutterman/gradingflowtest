import os, json, base64, io, concurrent.futures, urllib.request   # + urllib.request
from flask import abort, jsonify, make_response
import functions_framework
from google import genai
from google.genai import types
# ------------------------------------------------------------------



# ---------- CONFIG -------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")      # <-- set!
GEMINI_MODEL   = "gemini-2.5-pro"
# ------------------------------------------------------------------

SYSTEM_PROMPT_TEMPLATE = """{rules}

You will be given a JSON that contains a specific exam question, the
correct answer key/model for that question, and the student's attempt.
TASK:
· For every sub question, add “sub_points_awarded” (integer) and
  “feedback_comment” (concise, same language).

**IMPORTANT RULES FOR FEEDBACK:**
- The “feedback_comment” field MUST NOT be empty.
- If the answer is fully correct and no other feedback is needed, provide a short, positive confirmation like "Perfect"
- If the answer is partially or fully incorrect, the feedback must explain why, referencing the answer model.

**IMPORTANT INSTRUCTIONS FOR GRADING**
- If the student has submitted a visual answer to his answer, you should ALWAYS start your comment with a detailed description of what you see in the image provided by the student. You should then look super closely at the image to check if the student draw correctly according to the question and answermodel. Only in these cases, you may be slightly less brief and concise in your comment. Do this only with answer_visuals, not with context_visuals or component_visuals.
- It is very important that you use the given answer model as instructions for grading. You should not do too much thinking yourself, and in fact you should ideally not even pay attention to the actual questions asked. You should pretty much only look at the answer model and the student's attempt, and only base your scoring on that.
- There is one slight exception to the above rule. In quantitative questions (when the final outcome is a number), occasionally the student will arrive at a final numeric answer, which is correct, according to the answer model, but the way in which he arrived to that number is not stated on any of the alternatives. If this is the case for this specific answer, and if the way he arrived at the number seems logical to you, given the question and the student's answer, then you are allowed to give full points for that specific question.
- If the student's answer is numeric, do not subtract points if the student's answer has too many decimals/is not rounded exactly like in the answer key. Unless instructed otherwise in the grading rules above.
- The extra_comment with further grading instructions are also super important if present. Read them carefully.
- Choose best alternative: If multiple model_alternatives exist, evaluate them all and grade using the single alternative that yields the highest valid score. Do not mix components across alternatives.
- “K of the following” lists: When the model uses slots (each component = one acceptable item; the acceptable items are listed in extra_comment):
    - Count up to K distinct correct items present in the student’s answer; ignore duplicates/near-duplicates.
    - Award one slot per correct item using that component’s component_points, capped at the sub-question total. Do not penalize for extra wrong items unless the model explicitly says so.
    - In the feedback, briefly name which items counted (or state what was missing/incorrect).
- Bounds: sub_points_awarded must be an integer in [0, sub-question total]; never exceed the total or go negative.
- Restrictions: Apply any per-component constraints specified in extra_comment (e.g., all-or-nothing scoring). Accept clear synonyms/equivalent phrasing unless explicitly disallowed.

OUTPUT:
Return only the following JSON structure. **Do not include the "questions" wrapper key.** Just the object itself.

{{
"question_number": "1a",
"sub_questions": [
    {{
        "sub_question_id": "some-unique-id-from-input",
        "sub_q_text_content": "What is 2+2?",
        "student_answers": {{
            "sub_points_awarded": 2,
            "feedback_comment": "Correct."
        }}
    }}
]
}}
"""


# --------------- helper to download one image ---------------------


def _download_image(url:str, timeout:int=10) -> bytes|None:
    """Return raw image bytes or None on any failure."""
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.read()
    except Exception as exc:
        print(f"[WARN] could not fetch image '{url}': {exc}")
        return None



# ----------------- (1)  call_gemini  ------------------------------
def call_gemini(json_for_one_question, image_bytes_list, grading_rules):
    """
    Single synchronous Gemini request.
    image_bytes_list  – list[bytes], each entry already fetched from URL.
    """

    client = genai.Client(api_key=GEMINI_API_KEY)

    parts = [types.Part.from_text(text=json.dumps(json_for_one_question, ensure_ascii=False))]

    # Attach every downloaded image – no filenames/captions
    for img_bytes in image_bytes_list:
        parts.append(
            types.Part.from_bytes(
                mime_type="image/png",   # works for jpeg/png; gemini ignores exact mime
                data=img_bytes
            )
        )

    contents = [types.Content(role="user", parts=parts)]

    cfg = types.GenerateContentConfig(
        temperature=0,
        response_mime_type="application/json",
        system_instruction=[
            types.Part.from_text(
                text=SYSTEM_PROMPT_TEMPLATE.format(rules=grading_rules or "")
            )
        ]
    )

    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=cfg
    )

    return json.loads(resp.text)



# ----------------- (2)  Cloud-Function entry point ----------------
@functions_framework.http
def generate_points(request):
    # ---- CORS pre-flight
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*'}

    if request.method != 'POST':
        return error(405, ('Only POST is allowed', 405, headers))

    if 'grading_data' not in request.form:
        return error(400, ('grading_data field missing', 400, headers))

    try:
        big_json = json.loads(request.form['grading_data'])
    except Exception as e:
        return error(400, (f'Invalid JSON: {e}', 400, headers))

    grading_rules = big_json.get('grading_regulations')

    # ----------------------------------------------------------------
    # NOTE: we completely IGNORE any files that might have been
    #       uploaded in `request.files`.
    # ----------------------------------------------------------------

    jobs = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        for original_question in big_json['questions']:

            # ---------------------------------------------------------
            # Gather *all* image URLs found in this specific question
            # ---------------------------------------------------------
            image_urls = []

            # 1. any top-level list like  "image_urls": ["..."]
            if isinstance(original_question.get('image_urls'), list):
                image_urls.extend(original_question['image_urls'])

            # 2.  possible single string "image_url": "..."
            if isinstance(original_question.get('image_url'), str):
                image_urls.append(original_question['image_url'])

            # 3. inside sub-questions
            for sq in original_question.get('sub_questions', []):
                if isinstance(sq.get('image_urls'), list):
                    image_urls.extend(sq['image_urls'])
                if isinstance(sq.get('image_url'), str):
                    image_urls.append(sq['image_url'])

            # Download them right here (synchronously – still cheap, few per Q)
            img_bytes_list = []
            for url in image_urls:
                img = _download_image(url)
                if img:           # only keep successfully downloaded images
                    img_bytes_list.append(img)

            # ---------------------------------------------------------
            # Build the clean JSON that will be sent to Gemini
            # ---------------------------------------------------------
            question_for_ai = json.loads(json.dumps(original_question))  # deep copy
            # RENAME the 'id' key to 'sub_question_id' to match the prompt's example
            for sq in question_for_ai.get('sub_questions', []):
                if 'id' in sq:
                    sq['sub_question_id'] = sq.pop('id') # Rename for clarity
                if 'student_answers' in sq and sq['student_answers']:
                    sq['student_answers'][0].pop('id', None)

            single_json_for_ai = {"questions": [question_for_ai]}

            fut = ex.submit(
                call_gemini,
                single_json_for_ai,
                img_bytes_list,           # <-- our freshly downloaded images
                grading_rules
            )
            jobs.append((original_question, fut))

    # ----------------------------------------------------------------
    # The remainder of the function (merging IDs back, error handling,
    # final JSON) is identical to before
    # ----------------------------------------------------------------
    out_questions = []
    for original_q, fut in jobs:
        merged_q = {
            "question_number": original_q["question_number"],
            "sub_questions": []
        }
        try:
            gemini_result_q = fut.result(timeout=300)
            # --- MODIFICATION START ---
            # Build the map using the stable sub_question_id
            gemini_sq_map = {
                sq.get('sub_question_id'): sq
                for sq in gemini_result_q.get('sub_questions', [])
                if sq.get('sub_question_id') # Only include if ID is present
            }

            for original_sq in original_q.get('sub_questions', []):
                # Look up using the original sub-question's ID
                graded_sq_data = gemini_sq_map.get(original_sq.get('id'))
                
                final_sq_data = {
                    "sub_question_id": original_sq.get('id'),
                    "sub_q_text_content": original_sq.get('sub_q_text_content')
                }

                # Check if the lookup was successful and if it has the answers
                if graded_sq_data and graded_sq_data.get('student_answers'):
                    final_sq_data["student_answers"] = graded_sq_data['student_answers']
                else:
                    # The failure path remains the same
                    final_sq_data["student_answers"] = {
                        "sub_points_awarded": 0,
                        "feedback_comment": (
                            f"ERROR: AI failed to grade this sub-question "
                            f"(ID: {original_sq.get('id')})."
                        )
                    }
                merged_q["sub_questions"].append(final_sq_data)
            # --- MODIFICATION END ---

        except Exception as e:
            print(f"ERROR processing question {original_q['question_number']}: {e}")
            for original_sq in original_q.get('sub_questions', []):
                merged_q["sub_questions"].append({
                    "sub_question_id": original_sq.get('id'),
                    "sub_q_text_content": original_sq.get('sub_q_text_content'),
                    "student_answers": {
                        "sub_points_awarded": 0,
                        "feedback_comment": (
                            "ERROR: AI processing failed for the entire question "
                            f"(ID: {original_sq.get('id')})."
                        )
                    }
                })
        out_questions.append(merged_q)

    final_payload = {"questions": out_questions}


    return (
        json.dumps(final_payload, ensure_ascii=False),
        200,
        {**headers, 'Content-Type': 'application/json; charset=utf-8'}
    )
