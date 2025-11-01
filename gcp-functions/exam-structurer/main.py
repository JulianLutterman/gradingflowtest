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
SYSTEM_PROMPT = """###TASK:
These are exam questions. Output JSON with the questions ordered in this specific way, with these specific element titles.

###EXAMPLE:
Here is the base example JSON:
{
  "exam": {
    "questions": [
      {
        "question_number": "1",
        "max_total_points": 5,
        "context_text": "placeholder text",
        "context_visual": "visualplaceholder.png",
        "sub_questions": [
          {
            "sub_q_text_content": "placeholder text",
            "max_sub_points": 3,
            "sub_question_order": 1
          },
          {
            "sub_q_text_content": "placeholder text",
            "max_sub_points": 2,
            "sub_question_order": 2
          }
        ],
        "extra_comment": "You may use your calculator for this question"
      },
      {
        "question_number": "2",
        "max_total_points": 2,
        "context_visual": "visualplaceholder2.png",
        "sub_questions": [
          {
            "sub_q_text_content": "placeholder text",
            "mcq_options": [
              {
                "mcq_letter": "a",
                "mcq_content": "Lorem"
              },
              {
                "mcq_letter": "b",
                "mcq_content": "Lorem"
              }
            ],
            "sub_question_order": 1
          }
        ]
      }
    ]
  }
}


### FURTHER INSTRUCTIONS:
- Not all JSON attributes in the example need to be included in your output. For example, sometimes the user input does not contain images (context_visual attributes), or max_sub_points, or sometimes the question does not have subquestions at all but is just one question.
- Include 'sub_question_order' for every sub-question. It must be a 1-based integer increasing in the same order the sub-questions appear in the source. Do not skip numbers.
- It is possible that the input transcriptions contain titles of figures and charts and such (like "Figure 1" for example). Exclude these titles in your output.
- If there are not really multiple subquestions, but just one main question, just output one sub question.
- Typically, sub questions as given by the user are separated by hyphens, letters or other separators. For example, user input: "Explain why: - The US joined WW2 - The US dropped two bombs in Japan." In that case the two SEPARATE sub questions should be outputted by you: "Explain why the US joined WW2" and "Explain why the US dropped two bombs in Japan." This means you need to output full sentences, including the verb given at the start if the situation necessitates it.
- Subquestions are not always separated by hyphens, but sometimes implicit. For example, when 2 or more statements are given in the question context, and if the student is then asked, in one question sentence, to comment on both statements separately. This should also be classified as two subquestions, and two separate sub questions should be outputted by you. An example of such a case would be: "Two statements:\n1 The Liberator wants to strenghten abolishonist movements.\n2 The author assumes civilian household ideals. QUESTION: Give an argument for both statements, and refer to the source for both arguments."
- As a rule of thumb, you will separate CONTEXT for a question (context_text and/or context_visual in the questions attribute) from the actual sub questions (sub_q_text_content in the sub_questions attribute), by considering what text represents INFORMATION AROUND THE QUESTION (for context - e.g., "the pool is 2 meters deep, 5 meters long, and 3 meters wide"), from a clear CALL TO ACTION (for sub question - e.g., "Calculate how many liters water the pool can contain.")
- In extension of the above, if no max_sub_points are given, do not include them in your output, but only include max_total_points (if they exist in the user input). Points are ofter referred to with a "p", or "points", or anything similar.
- Only use the "mcq" type attributes when the question is a multiple choice question.
- Some of the given text is not related to a specific exam question. This content is noise and shouldn't be included in your output. That can include headers, exam titles, page numbers, etc.
- Sometimes the user input text refers to a source (image, chart, table, photograph, visual, etc). For example: "Refer to source 4" In this case, DO NOT take initiative and add an image placeholder context_visual" JSON attribute. Just the leave the text there as is and include the text as is in your output within the existing text element.
- You may receive image files from the user. Place the filenames of those images inside the JSON in the appropriate question attribute within the "context_visual" key (e.g.: "context_visual": "page_4_graph_2.png"), inside of the "question" key. The user will sequentially put the filenames below each respective image (file1 - filename1 - file2 - filename2 - etc.).
- In some instances, multiple images could be given/relevant for one question. In these occasions, you have to choose the most important image, and insert that one in the JSON. The definition of "most important" in this context is the image that provides most information for the student to answer the question. You are not allowed to include 2 or more image filenames in one individual question. Maximum one per individual question (the most important one).
- Some images may be relevant for multiple consecutive questions. In this case, you should only include the image in the "context_visual" object of the first of those consecutive questions (e.g.: An image relevant for Q8-12, should only be included for Q8).
- If there are any mathematical/physics/etc. equations in the input transcription files, they will likely be written in the LaTeX syntax, and wrapped in either single or double dollar signs (for KaTeX library displaying on HTML pages). KEEP that syntax and the dollar sign wrapping, do NOT change it back to normal notation.
- When you include LaTeX code inside a JSON string value, you MUST escape all backslashes that are part of said LaTeX code snippets for correct JSON formatting. For example, the LaTeX `\\sin(t)` must be written as `\\\\sin(t)` in the final JSON output. The LaTeX `\\begin{cases}` must be written as `\\\\begin{cases}`. This is essential for the JSON to be valid. This is because In a JSON string, the backslash is a special character used to "escape" other characters. For example, to include a double quote (") inside a string, you write \". To include a literal backslash, you must escape it with another backslash, resulting in \\.
- Keep the original line breaks within the text ONLY when appropriate. If you there are some linebreaks that seem unnecessary to you, you are free to leave those specific linebreaks out. In fact. If you think certain text snippets should be in one line, actively make sure that it is by deleting newlines or overly many whitespaces.
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

def create_gemini_content(text_files, image_files):
    """Create content parts for Gemini API call."""
    parts = []
    
    for text_file in text_files:
        text_content_b64 = base64.b64encode(text_file['content'].encode('utf-8')).decode('utf-8')
        parts.append(types.Part.from_bytes(
            mime_type="text/plain",
            data=base64.b64decode(text_content_b64)
        ))
    
    for image_file in image_files:
        parts.append(types.Part.from_text(text=image_file['filename']))
        image_content_b64 = base64.b64encode(image_file['content']).decode('utf-8')
        parts.append(types.Part.from_bytes(
            mime_type="image/png",
            data=base64.b64decode(image_content_b64)
        ))
    
    return parts

def call_gemini_api(text_files, image_files):
    """Call Gemini API to structure the exam."""
    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not set.")
        return None
    
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        content_parts = create_gemini_content(text_files, image_files)
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

@functions_framework.http
def exam_structurer(request):
    """
    HTTP Cloud Function entry point.
    Accepts files, calls image parser, then structures exam with Gemini.
    """
    # === START OF CORS HANDLING ===
    # Set CORS headers for the preflight request
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    # Set CORS headers for the main request
    headers = {
        'Access-Control-Allow-Origin': '*'
    }
    # === END OF CORS HANDLING ===

    if request.method != 'POST':
        return ('Please use POST request with multipart/form-data.', 405, headers)
    
    uploaded_files = request.files.getlist('files')
    if not uploaded_files:
        return ('No files uploaded. Please upload files with the key "files".', 400, headers)
    
    print("Step 1: Calling image parser...")
    parser_result = call_image_parser(uploaded_files)
    if not parser_result:
        return ("Failed to process files with image parser.", 500, headers)
    
    print("Step 2: Extracting files from parser result...")
    text_files, image_files = extract_files_from_zip(parser_result)
    if not text_files and not image_files:
        return ("No valid files extracted from parser result.", 500, headers)
    
    print("Step 3: Calling Gemini API...")
    structured_exam = call_gemini_api(text_files, image_files)
    if not structured_exam:
        return ("Failed to structure exam with Gemini.", 500, headers)
    
    print("Step 4: Creating output zip...")
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('structured_exam.json', structured_exam.encode('utf-8'))
        for image_file in image_files:
            zf.writestr(image_file['filename'], image_file['content'])
    
    zip_buffer.seek(0)
    
    print("Processing completed successfully!")
    
    # Create a Flask response object to attach the headers
    response = make_response(send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='structured_exam.zip'
    ))
    response.headers.extend(headers)
    return response
