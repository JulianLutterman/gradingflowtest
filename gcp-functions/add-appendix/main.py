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
GEMINI_MODEL = "gemini-2.5-pro-preview-06-05"

# System prompt for Gemini (remains the same)
SYSTEM_PROMPT = """###INPUT EXPLANATION:
The user will give you two types of input:
1. Transcriptions of an appendix to exam questions. They can be titles of all types of visual elements, and they can be transcribed texts (plus their respective titles.
2. A JSON with question numbers, and their respective question contents (primarily context on the questions, and the questions themselves, and most importantly)

###TASK:
Output JSON with the contents of the appendix, categorized into their respective question numbers, with the specific keys from the example.

###EXAMPLE:
Here is the base example JSON:
{
  "appendices": [
    {
      "question_number": "1",
      "app_title": "Appendix A: Formulas",
      "app_visual": "PLACEHOLDERIMAGE.png"
    },
    {
      "question_number": "2",
      "app_title": "B: [TEXTUAL FORMULAS]",
      "app_text": "PLACEHOLDER TEXT",
    }
  ]
}

### FURTHER INSTRUCTIONS:
- CRUCIAL: If appendices are NUMBERED, it is important to know that the number of the appendix (e.g.: Source 5), DOES NOT have to belong to the same question number. An appendix number can be different from the number of the question it belongs to. For example, appendix number 5 might belong to question 9.
- Match the appendix items to their respective questions, primarily based on how relevant the appendix item is to the question, according to your judgement.
- Usually, you should try to keep consistent title formatting across appendix items.
- Not all JSON attributes in the example need to be included in your output. For example, sometimes the user input does not contain any text aside from the appendix title (app_title), or vice versa, sometimes one specific appendix item might not contain any images, and only text. In these cases you should just not include the related attribute.
- Most times, each appendix has a title, which is a combination of a letter, and a short textual title. Put this in the "app_title". However, a sentence cannot be a title, do not confuse a sentence, or a part of a sentence, with a title. Those should always be included in "app_text".
- Any introductions to a specific appendix item or extra explanations to an appendix item, should be included in the "app_text". Formatting via linebreaks is encouraged when appropriate (e.g.: to separate an introduction to the main body of a textual appendix item, or other similar situations).
- Sometimes, the appendix title/letter is called out in the context_text of the question (e.g.: "Q6: For this question, refer to Appendix 2), this is a clear indicator you should categorize Appendix 2 into question 6.
- Not all questions have appendices, usually it is only some questions.
- Some appendixes belong to multiple different questions. In these cases, you should just put the same exact appendix in each of those questions the appendix belong to.
- Some of the given text is not related to a specific appendix. This content is noise and shouldn't be included in your output. That can include exam titles, page numbers, etc.
- You may receive image files from the user, these represent the visual elements of the appendix. Place the filenames of those images inside the JSON in the appropriate question attribute within the "app_visual" key (e.g.: "app_visual": "page_4_graph_2.png"). The user will sequentially put the filenames below each respective image (file1 - filename1 - file2 - filename2 - etc.), to clarify which filename belongs to which image.
- If there are any mathematical/physics/etc. equations in the input transcription files, they will likely be written in the LaTeX syntax, and wrapped in either single or double dollar signs (for KaTeX library displaying on HTML pages). KEEP that syntax and the dollar sign wrapping, do NOT change it back to normal notation.
- When you include LaTeX code inside a JSON string value, you MUST escape all backslashes that are part of said LaTeX code snippets for correct JSON formatting. For example, the LaTeX `\\sin(t)` must be written as `\\\\sin(t)` in the final JSON output. The LaTeX `\\begin{cases}` must be written as `\\\\begin{cases}`. This is essential for the JSON to be valid. This is because In a JSON string, the backslash is a special character used to "escape" other characters. For example, to include a double quote (") inside a string, you write \". To include a literal backslash, you must escape it with another backslash, resulting in \\.
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
def add_appendix(request):
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
