import os
import json
import base64
import io
import zipfile
import requests
import functions_framework
from flask import request, send_file, make_response
from google import genai
from google.genai import types

# Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
IMAGE_PARSER_URL = os.environ.get("IMAGE_PARSER_URL")
GEMINI_MODEL = "gemini-2.5-pro"

# System prompt for Gemini (remains the same)
SYSTEM_PROMPT = """###INPUT EXPLANATION:
The user will give you two types of input:
1. Transcriptions of a student's exam submission, together with question numbers and their answers to the question.
2. A JSON with question numbers, and their respective subquestions. The main object contains a single property named "questions". The value associated with "questions" is an array, which functions as a list of individual question entries. Each item within this "questions" array is itself an object, designed to hold the details for one main question. Within each of these question objects, there are two distinct properties: "question_number" and "sub_questions". The "question_number" is paired with a simple numerical value that identifies the question. The "sub_questions" property, in turn, holds another array. This nested array is a collection of objects, where each object represents a single sub-question belonging to the main question. Finally, each sub-question object has one property, "sub_q_text_content", which contains the actual text of the sub-question as a string value. This creates a hierarchical relationship where a primary list of questions can each contain their own list of more specific sub-questions.


###INPUT JSON EXAMPLE:
{
  "questions": [
    {
      "question_number": 1,
      "sub_questions": [
        {
          "sub_q_text_content": "[FIRST SUBQUESTION TEXT PLACEHOLDER]",
        }
      ]
    },
    {
      "question_number": 2,
      "sub_questions": [
        {
          "sub_q_text_content": "[FIRST SUBQUESTION TEXT PLACEHOLDER]",
        },
	{
          "sub_q_text_content": "[SECOND SUBQUESTION TEXT PLACEHOLDER]",
        }
      ]
    }
  ]
}

###TASK:
Your task is to augment the JSON structure by incorporating the student's answers. To do this, you will need to introduce a new property named "student_answers" inside each of the sub-question objects alongside the existing "sub_q_text_content". The value for this "student_answers" property is an object, designed to hold the components of a student's response to that specific sub-question. This object can contain up to two distinct properties: "answer_text" and "answer_visual". The "answer_text" property holds a text value, which represents the textual part of the student's answer. The "answer_visual" property also holds text, but this text represents the filename of any associated visual aid, such as a drawing or a diagram, that the student provided. A student's answer might not always include both a textual and a visual component, so the "student_answers" object should only include the keys for the answer types that are actually present. If, for a specific sub question, the student did not seem to attempt to provide an answer, you should only include an "answer_text" object that says: "Student has not attempted to answer this sub question".

###EXAMPLE:
Here is the base example JSON:
{
  "questions": [
    {
      "question_number": 1,
      "sub_questions": [
        {
          "sub_q_text_content": "[FIRST SUBQUESTION TEXT PLACEHOLDER]",
          "student_answers": {
            "answer_text": "[PLACEHOLDER ANSWER COMPONENT]",
            "answer_visual": "[PLACEHOLDER FILENAME]"
          }
        }
      ]
    },
    {
      "question_number": 2,
      "sub_questions": [
        {
          "sub_q_text_content": "[FIRST SUBQUESTION TEXT PLACEHOLDER]",
          "student_answers": {
            "answer_text": "[PLACEHOLDER ANSWER COMPONENT]"
          }
        },
        {
          "sub_q_text_content": "[FIRST SUBQUESTION TEXT PLACEHOLDER]",
          "student_answers": {
            "answer_visual": "[PLACEHOLDER FILENAME]"
          }
        }
      ]
    }
  ]
}


### FURTHER INSTRUCTIONS:
- ALWAYS OUTPUT ALL GIVEN EXAM QUESTIONS GIVEN TO YOU, EVEN IF THERE IS NO ANSWER TO IT. IF THERE IS NO ANSWER, YOU SHOULD NOT EXCLUDE THE QUESTION, but include an "answer_text" object that says: "Student has not attempted to answer this sub question".
- The input transcription will very likely provide you with the overall question numbers before the contents of each respective student answer, but it might not tell you which correct answer fits to which specific sub question. This is for you to figure out.
- Keep in mind that the answers by the students might not be correct sometimes. That does not matter for your task. You should still put those possibly wrong answers in the JSON, under the respective sub questions that you think the student is trying to answer.
- For some answers, extra comments are made by the student. In this case, you can just add this comment in the existing answer_text object.
- Some of the given text is not related to a specific model answers to specific questions. This content is noise and shouldn't be included in your output. That can include exam titles, page numbers, explanations on how to grade, etc.
- You might receive image files from the user, these represent any visual elements of the answer model. Place the filenames of those images inside the JSON in the appropriate question attribute within the "answer_visual" object (e.g.: "answer_visual": "page_4_graph_2.png"). The user will sequentially put the filenames below each respective image (file1 - filename1 - file2 - filename2 - etc.), to clarify which filename belongs to which image. IT IS EXTREMELY IMPORTANT THAT YOU DO NOT ADD ANY OTHER TEXT OTHER THAN THE PURE FILENAME.
- For most answers, no visual will be given, in this case you can just omit the "answer_visual" object. In case ONLY a visual is given, and no text, then you should omit "answer_text" instead. As a general rule, you should omit any images that are purely handwritten text, and you should only consider images that actually portray a visual element such as a drawing, chart, table, etc.
- If there are any mathematical/physics/etc. equations in the input transcription files, they will likely be written in the LaTeX syntax, and wrapped in either single or double dollar signs (for KaTeX library displaying on HTML pages).
    - If any mathematical equation or writing is already written in the LaTeX form and wrapped with $ signs, KEEP that syntax and the dollar sign wrapping, do NOT change it back to normal notation.
    - If any mathematical equation or writing is not yet written in this LaTeX form, and just written normally, then you are required to ADD this yourself. For this you need to use LaTeX syntax, and then wrap inline formulas with single dollar signs (`$ ... $`) and block (display) formulas with double dollar signs (`$$ ... $$`). Ensure every LaTeX formula is correctly closed with a dollar sign (`$` or `$$`), even if it is at the end of a line.
- In addition, when you include LaTeX code inside a JSON string value, you MUST escape all backslashes that are part of said LaTeX code snippets for correct JSON formatting. For example, the LaTeX `\\sin(t)` must be written as `\\\\sin(t)` in the final JSON output. The LaTeX `\\begin{cases}` must be written as `\\\\begin{cases}`. This is essential for the JSON to be valid. This is because In a JSON string, the backslash is a special character used to "escape" other characters. For example, to include a double quote (") inside a string, you write \". To include a literal backslash, you must escape it with another backslash, resulting in \\.
- Keep the original line breaks within the text when appropriate.
- Output in the original language as given by the user.
- DO NOT OUTPUT ANYTHING OTHER THAN THE SOLE JSON CONTENT."""

def call_image_parser(files):
    """Call the image parser function with the uploaded files."""
    print("Calling image parser function...")
    
    try:
        files_data = []
        for file in files:
            files_data.append(('files', (file.filename, file.stream, file.content_type)))
        
        response = requests.post(IMAGE_PARSER_URL, files=files_data, timeout=600)
        
        if response.status_code == 200:
            print("Image parser completed successfully")
            return response.content
        else:
            print(f"Image parser failed with status code: {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except Exception as e:
        print(f"Error calling image parser: {e}")
        return None

def extract_files_from_zip(zip_content):
    """Extract files from the zip returned by image parser."""
    text_files = []
    image_files = []
    
    try:
        with zipfile.ZipFile(io.BytesIO(zip_content), 'r') as zip_file:
            for filename in zip_file.namelist():
                file_content = zip_file.read(filename)
                
                if filename.endswith('.txt'):
                    text_files.append({
                        'filename': filename,
                        'content': file_content.decode('utf-8')
                    })
                elif filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                    image_files.append({
                        'filename': filename,
                        'content': file_content
                    })
        
        print(f"Extracted {len(text_files)} text files and {len(image_files)} image files")
        return text_files, image_files
    except Exception as e:
        print(f"Error extracting files from zip: {e}")
        return [], []

# Replace this function
def create_gemini_content(text_files, image_files, json_content=None):
    """Create content parts for Gemini API call."""
    parts = []
    
    for text_file in text_files:
        text_content_b64 = base64.b64encode(text_file['content'].encode('utf-8')).decode('utf-8')
        parts.append(types.Part.from_bytes(
            mime_type="text/plain",
            data=base64.b64decode(text_content_b64)
        ))
    
    # Add the user-provided JSON content if it exists
    if json_content:
        print("Adding user-provided JSON to Gemini prompt parts.")
        parts.append(types.Part.from_text(text=json_content))

    for image_file in image_files:
        parts.append(types.Part.from_text(text=image_file['filename']))
        image_content_b64 = base64.b64encode(image_file['content']).decode('utf-8')
        parts.append(types.Part.from_bytes(
            mime_type="image/png",
            data=base64.b64decode(image_content_b64)
        ))
    
    return parts

# Replace this function
def call_gemini_api(text_files, image_files, json_content=None):
    """Call Gemini API to structure the exam."""
    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not set.")
        return None
    
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        content_parts = create_gemini_content(text_files, image_files, json_content)
        contents = [types.Content(role="user", parts=content_parts)]
        
        generate_content_config = types.GenerateContentConfig(
            temperature=0,
            max_output_tokens=65536,
            thinking_config = types.ThinkingConfig(
                thinking_budget=15000,
            ),
            response_mime_type="application/json",
            system_instruction=[types.Part.from_text(text=SYSTEM_PROMPT)]
        )
        
        print("Calling Gemini API...")
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=generate_content_config
        )
        
        return response.text
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return None

# Replace this function

@functions_framework.http
def add_student_answers(request):
    """
    HTTP Cloud Function entry point.
    Accepts files, calls image parser, then structures exam with Gemini.
    """
    # === CORS HANDLING (remains the same) ===
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)
    headers = {'Access-Control-Allow-Origin': '*'}
    
    if request.method != 'POST':
        return ('Please use POST request with multipart/form-data.', 405, headers)

    # === START OF FIX ===

    # 1. Get the appendix files meant for the parser
    # These are the actual PDF/image files for the appendix.
    files_for_parser = request.files.getlist('files')
    if not files_for_parser:
        # It's possible to have a text-only update without new files, but for this workflow, we expect files.
        return ('No appendix files uploaded. Please upload files with the key "files".', 400, headers)

    # 2. Get the exam structure JSON from the correct form field
    # This is the crucial fix. We read from `request.form` instead of `request.files`.
    json_content = request.form.get('exam_structure')
    if not json_content:
        return ('The "exam_structure" JSON data is missing from the request.', 400, headers)
    
    # Optional but recommended: Add a log to confirm you received it
    print(f"Successfully received exam structure JSON containing {len(json_content)} characters.")

    # === END OF FIX ===
    
    text_files, image_files = [], []
    
    print("Step 1: Calling image parser...")
    # This part remains the same, as `files_for_parser` is now correctly populated.
    parser_result = call_image_parser(files_for_parser)
    if not parser_result:
        return ("Failed to process files with image parser.", 500, headers)
    
    print("Step 2: Extracting files from parser result...")
    text_files, image_files = extract_files_from_zip(parser_result)
    if not text_files and not image_files:
        print("Warning: No text or image files extracted from parser. This might be okay if the appendix was text-only and the parser had nothing to do.")

    print("Step 3: Calling Gemini API...")
    # Now, `json_content` is correctly populated with the question data
    structured_exam = call_gemini_api(text_files, image_files, json_content)
    if not structured_exam:
        return ("Failed to structure exam with Gemini.", 500, headers)
    
    print("Step 4: Creating output zip...")
    # This part remains the same.
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('structured_exam.json', structured_exam.encode('utf-8'))
        for image_file in image_files:
            zf.writestr(image_file['filename'], image_file['content'])
    
    zip_buffer.seek(0)
    
    print("Processing completed successfully!")
    
    response = make_response(send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='structured_exam.zip'
    ))
    response.headers.extend(headers)
    return response
