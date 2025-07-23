import os
import base64
import json
import re
import sys
from openai import OpenAI, APIError
import functions_framework
import io
import zipfile
import concurrent.futures
from flask import request, send_file
from PIL import Image, UnidentifiedImageError
import fitz
from google import genai
from google.genai import types

# --- Configuration ---
PARASAIL_API_KEY = os.environ.get("PARASAIL_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Model for Element Extraction (via Parasail)
EXTRACTION_MODEL_NAME = "parasail-qwen25-vl-72b-instruct"
# Model for Transcription (via Google AI)
TRANSCRIPTION_MODEL_NAME = "gemini-2.5-pro"

BOUNDING_BOX_PADDING_FACTOR = 0.005 # Reduced padding as the new prompt asks the model to include margins
TEMPERATURE_FOR_JSON = 0

# --- System Prompts ---
# As requested, these are unchanged.

ELEMENT_EXTRACTION_PROMPT = """
You are an expert document analysis assistant.
Your sole task is to crop out all visual elements from the set of user-given images of a student's handwritten answers on an exam. The input image may contain text, and any type of visual elements (diagrams, charts, graphs, tables, drawings, photographs, other). You need to isolate the visual elements, and provide the bounding box coordinates of each element you can find.
You need to:
1. Identify all distinct graphs, charts, flowcharts, diagrams, photographs, tables, drawings or other images/visual elements (referred to as 'elements').
2. For each element, extract its title as accurately as possible. If an element has no discernible title, use a generic placeholder like "Untitled_Element_N" where N is a unique number for that element.
3. For each element, provide the bounding box coordinates as a list of four integers: [x_min, y_min, x_max, y_max].
   - The resulting bounding box should TIGHTLY YET COMPLETELY encompass the entire visual element (text, diagrams, charts, graphs, tables, drawings, photographs, other) PLUS any textual/numerical labels or legends that are clearly part of that visual element.
   - The title of the element should generally NOT be included within this box if it's positioned as a caption outside the visual boundaries of the element itself. However, if the title is an integral part of the image (e.g., embedded within a chart image), then it can be included.
   - Aim to include a small natural margin around the element on ALL sides if it helps capture it fully, but do NOT extend the box to include unrelated text or other page elements significantly distant from the visual element.
   - If the element is very close to an edge of the page, you are allowed to let the bounding box stretch to the very edge(s) of the image/document to account for some natural margin around the element and to ensure no part is cut off.
   - If no elements are found, "identified_elements" should be an empty list.

Output your findings as a single JSON object with the following structure:
- "identified_elements": A list of objects. Each object in this list should represent one identified graph, chart, or image and must have the following keys:
    - "title": The verbatim title associated with the element.
    - "type": A string, either "diagram", "chart", "graph", "table", "drawing", "photograph" or "other" based on your best judgment.
    - "bbox": A list of four integer values representing the bounding box coordinates of the element: [x_min, y_min, x_max, y_max].

Example of the desired output for an input image with two graphs:
{
  "identified_elements": [
    {
      "title": "[PLACEHOLDER TITLE]",
      "type": "graph",
      "bbox": [425, 180, 648, 495]
    },
    {
      "title": "[PLACEHOLDER TITLE]",
      "type": "graph",
      "bbox": [425, 520, 648, 745]
    }
  ]
}

Ensure the JSON is valid.
Be precise with the bounding box coordinates.
Analyze the provided image and follow these instructions carefully.

In your final output, do not output anything other than pure JSON.
"""

TRANSCRIPTION_PROMPT = """
You are an expert document transcription assistant. You will be given a set of images that, together, form a single, continuous document: a student's handwritten exam. Your sole task is to provide a single, accurate, and logically structured transcription of the text from all images combined.

You must adhere to the following rules:

**1. Content & Accuracy:**
- Transcribe all text that is part of the main body, headings, questions, and general page content.
- It is extremely important that you transcribe every letter and number accurately as the student wrote it. Do not correct spelling or grammatical errors. For example, you should not write a 4 if the student wrote an 8. The only exception to this strict ruling is for mathematical formulas and writing, for which you need to add LaTeX encoding, but this will explained later on under heading 4.
- Do not include any text that the student has clearly crossed out. This is considered noise and should be omitted.

**2. Formatting & Structure:**
- The final output must be structured sequentially by question number (Q1, then Q2, then Q3, etc.).
- Combine fragmented answers. A student might write part of an answer, move to another question, and then add more to the previous one later. You must consolidate all parts of an answer under the correct single question heading.
- Normalize formatting. Remove line breaks that are artifacts of handwriting and would not appear in a typed document. If a student uses an arrow to insert text, place that text in its intended location in the sentence and do not transcribe the arrow itself.

**3. Page & Answer Continuation:**
- **CRUCIAL LOGIC FOR PAGE CONTINUATION:** You must treat all provided images as parts of a single, continuous exam. If a new page begins with text that is **not** explicitly labeled with a new question number (e.g., "Q10", "Question 11"), you **MUST** assume it is a continuation of the answer to the most recently mentioned question number from the previous pages.
- **DO NOT** invent a new question number based on page numbers, stray marks, or any other artifacts. For example, if the last question on page 1 was Q9, and page 2 starts with more writing without a new question label, that writing belongs to Q9.

**4. Technical & Visual Elements:**
- For any mathematical or scientific equations written by the student, use LaTeX syntax. Wrap inline formulas with single dollar signs (`$ ... $`) and block (display) formulas with double dollar signs (`$$ ... $$`). Typically, only use the single dollar signs refrain from using double dollar signsfor block display - Only use double dollar signs when absolutely necessary.
- **CRUCIAL:** Ensure every LaTeX formula is correctly closed with a dollar sign (`$` or `$$`), even if it is at the end of a line.
- **IMPROVED PROMPT:** **CRUCIAL FOR JSON VALIDITY:** Within the final JSON output string, every literal backslash `\` character (such as those used in LaTeX) **MUST be escaped as `\\`**. For example, `\frac` must be written as `\\frac`, and `\%` must be written as `\\%`.
- **VISUAL ELEMENT EXCLUSION:** If there are any visual elements (graphs, charts, diagrams, tables), you must **EXCLUDE** any text that is an integral part of them. This includes axis labels, data points, legends, text inside a diagram, and content within table cells. Do not transcribe the titles of these elements. However, you **MUST** include any text in the main body that *refers* to these elements (e.g., "As shown in Figure 1...").

**5. Output Format:**
- Your entire output must be a single, valid JSON object.
- This object will have one key: `"full_transcription"`.
- The value for this key will be a single string containing all the transcribed and structured text.
- If no transcribable text is found in any of the images, return an empty string for `"full_transcription"`.

**Example Output:**
```json
{
  "full_transcription": "Q1. This is the answer to the first question. It includes a formula like $E=mc^2$. \n\nQ2. This is the answer to the second question, which was continued on the next page."
}
"""


# --- Helper Functions ---

def encode_image_to_base64(pil_image):
    """Encodes a PIL Image object to a base64 string."""
    try:
        buffered = io.BytesIO()
        image_format = pil_image.format if pil_image.format else 'PNG'
        img_to_save = pil_image
        if image_format == 'JPEG' and img_to_save.mode != 'RGB':
             img_to_save = img_to_save.convert('RGB')
        elif image_format not in ['PNG', 'JPEG', 'WEBP', 'GIF']:
            image_format = 'PNG'

        img_to_save.save(buffered, format=image_format)
        return base64.b64encode(buffered.getvalue()).decode('utf-8')
    except Exception as e:
        print(f"Error encoding PIL image: {e}")
        return None

def get_image_mime_type(pil_image):
    """Determines common image MIME types from PIL Image format."""
    img_format = pil_image.format
    if img_format == "PNG":
        return "image/png"
    elif img_format == "JPEG":
        return "image/jpeg"
    elif img_format == "WEBP":
        return "image/webp"
    elif img_format == "GIF":
        return "image/gif"
    print(f"Warning: PIL image format is '{img_format}', defaulting to image/png for MIME type.")
    return "image/png"


def sanitize_filename(title, default_prefix="element"):
    """Sanitizes a title to be a valid filename."""
    if not title or title.isspace():
        return f"{default_prefix}_untitled"
    sanitized = re.sub(r'[\\/*?:"<>|]', "", title)
    sanitized = sanitized.replace(" ", "_")
    sanitized = sanitized[:100]
    if not sanitized:
        return f"{default_prefix}_untitled"
    return sanitized

def resize_image_for_analysis(pil_image, max_dimension=2048):
    """
    Resizes a PIL image to a maximum dimension for consistent LLM analysis,
    maintaining aspect ratio. Returns the resized image and scaling ratios.
    """
    original_width, original_height = pil_image.size
    
    if max(original_width, original_height) <= max_dimension:
        return pil_image, 1.0, 1.0

    if original_width > original_height:
        new_width = max_dimension
        new_height = int(new_width * original_height / original_width)
    else:
        new_height = max_dimension
        new_width = int(new_height * original_width / original_height)

    resized_image = pil_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    width_ratio = original_width / new_width
    height_ratio = original_height / new_height
    
    print(f"Image resized for analysis from {original_width}x{original_height} to {new_width}x{new_height}.")
    return resized_image, width_ratio, height_ratio

# --- API Call Functions ---

def call_parasail_api(base64_image, image_mime_type, system_prompt, task_name=""):
    """
    Calls a model via Parasail for element extraction and returns the JSON response.
    """
    if not PARASAIL_API_KEY:
        print(f"Error ({task_name}): PARASAIL_API_KEY not set.")
        return None

    client = OpenAI(
        base_url="https://api.parasail.io/v1",
        api_key=PARASAIL_API_KEY,
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Analyze the provided image and follow the system instructions carefully."},
                {"type": "image_url", "image_url": {"url": f"data:{image_mime_type};base64,{base64_image}"}}
            ]
        }
    ]

    try:
        print(f"Sending '{task_name}' request to Parasail (Model: {EXTRACTION_MODEL_NAME})...")
        response = client.chat.completions.create(
            model=EXTRACTION_MODEL_NAME,
            messages=messages,
            temperature=TEMPERATURE_FOR_JSON,
            response_format={"type": "json_object"},
        )
        json_text = response.choices[0].message.content
        return json.loads(json_text)
    except APIError as e:
        print(f"Error calling Parasail API for {task_name}: {e}")
        return None
    except json.JSONDecodeError as jde:
        print(f"Error decoding JSON from Parasail response for {task_name}: {jde}")
        print(f"Received text: {response.choices[0].message.content if 'response' in locals() and response.choices else 'N/A'}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during {task_name} Parasail API call: {e}")
        return None

# --- START: MODIFIED FUNCTION ---
def call_gemini_api_for_transcription(pil_images, system_prompt, task_name=""):
    """
    Calls the Gemini model with a list of images for a single, combined transcription.
    Includes a fallback mechanism to repair malformed JSON responses.
    """
    if not GEMINI_API_KEY:
        print(f"Error ({task_name}): GEMINI_API_KEY not set.")
        return None
    if not pil_images:
        print(f"Warning ({task_name}): No images provided to Gemini API.")
        return None

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        generation_config = types.GenerateContentConfig(
            system_instruction=types.Content(parts=[types.Part(text=system_prompt)]),
            temperature=TEMPERATURE_FOR_JSON,
            max_output_tokens=65536,
            thinking_config = types.ThinkingConfig(
                thinking_budget=128,
            ),
            response_mime_type="application/json",
        )

        contents = ["Analyze the following images in order and provide a single, combined transcription following the system instructions."]
        contents.extend(pil_images)

        print(f"Sending '{task_name}' request to Gemini API with {len(pil_images)} images (Model: {TRANSCRIPTION_MODEL_NAME})...")

        response = client.models.generate_content(
            model=TRANSCRIPTION_MODEL_NAME,
            contents=contents,
            config=generation_config,
        )
        
        raw_text = response.text
        
        # --- FIX START: Clean the raw text before parsing ---
        # 1. Find the start and end of the actual JSON object.
        start_index = raw_text.find('{')
        end_index = raw_text.rfind('}')
        
        if start_index == -1 or end_index == -1:
            print(f"Could not find JSON object markers '{{' and '}}' in the response.")
            print(f"Raw text: {raw_text}")
            return None
            
        # 2. Extract the potential JSON string.
        json_string = raw_text[start_index : end_index + 1]
        
        # 3. First attempt to parse the cleaned string.
        try:
            return json.loads(json_string)
        except json.JSONDecodeError as jde:
            print(f"Initial parse of cleaned JSON failed: {jde}. Attempting to repair backslashes.")
            
            # 4. If it fails, apply the backslash repair logic.
            # This regex finds single backslashes that are NOT part of a valid JSON
            # escape sequence and escapes them by replacing '\' with '\\'.
            repaired_json_string = re.sub(r'\\([^"\\/bfnrtu])', r'\\\\\1', json_string)
            
            try:
                # 5. Second attempt with the repaired string.
                return json.loads(repaired_json_string)
            except json.JSONDecodeError as jde2:
                print(f"Failed to parse even the repaired JSON string: {jde2}")
                print(f"Original Raw Text: {raw_text}")
                print(f"Cleaned String: {json_string}")
                print(f"Repaired String: {repaired_json_string}")
                return None
        # --- FIX END ---

    except Exception as e:
        print(f"An unexpected error occurred during {task_name} Gemini API call: {e}")
        return None
# --- END: MODIFIED FUNCTION ---

# --- Core Processing Functions ---

def process_elements_for_single_image(original_image_pil, output_prefix=""):
    """
    Processes a single PIL image for element extraction, returning cropped image files.
    """
    print(f"\n--- Starting element extraction for {output_prefix} ---")
    generated_files = []

    if original_image_pil.mode != 'RGB':
        original_image_pil = original_image_pil.convert("RGB")

    image_for_analysis, width_ratio, height_ratio = resize_image_for_analysis(original_image_pil)
    
    base64_analysis_image = encode_image_to_base64(image_for_analysis)
    analysis_image_mime_type = get_image_mime_type(image_for_analysis)

    if not base64_analysis_image:
        print(f"Failed to encode image for {output_prefix}. Skipping element extraction.")
        return []

    elements_response = call_parasail_api(
        base64_analysis_image,
        analysis_image_mime_type,
        ELEMENT_EXTRACTION_PROMPT,
        f"Element Extraction for {output_prefix}"
    )

    identified_elements = []
    if elements_response:
        identified_elements = elements_response.get("identified_elements", [])
    else:
        print(f"Failed to get a valid element extraction response for {output_prefix}.")

    if not identified_elements:
        print(f"No elements were identified by the API for {output_prefix}.")
        return []

    print(f"--- Processing {len(identified_elements)} elements identified for {output_prefix} ---")
    element_filenames = {}
    for i, element in enumerate(identified_elements):
        title = element.get("title", f"Untitled_Element_{i+1}")
        bbox_data = element.get("bbox")
        element_type = element.get("type", "element")

        if not bbox_data or not (isinstance(bbox_data, list) and len(bbox_data) == 4):
            print(f"Warning: Element '{title}' has invalid or missing bbox data. Skipping crop.")
            continue

        try:
            x_min_analysis, y_min_analysis, x_max_analysis, y_max_analysis = map(int, bbox_data)

            x_min_orig = int(x_min_analysis * width_ratio)
            y_min_orig = int(y_min_analysis * height_ratio)
            x_max_orig = int(x_max_analysis * width_ratio)
            y_max_orig = int(y_max_analysis * height_ratio)

            orig_width, orig_height = original_image_pil.size
            crop_box = (
                max(0, x_min_orig),
                max(0, y_min_orig),
                min(orig_width, x_max_orig),
                min(orig_height, y_max_orig)
            )

            if crop_box[0] >= crop_box[2] or crop_box[1] >= crop_box[3]:
                print(f"Warning: Invalid bounding box for '{title}' after scaling. Skipping crop.")
                continue

            cropped_image = original_image_pil.crop(crop_box)

            filename_title_part = sanitize_filename(title, default_prefix=element_type)
            base_filename = f"{output_prefix}{filename_title_part}.png"

            if base_filename in element_filenames:
                element_filenames[base_filename] += 1
                output_filename = f"{output_prefix}{filename_title_part}_{element_filenames[base_filename]}.png"
            else:
                element_filenames[base_filename] = 1
                output_filename = base_filename

            img_byte_arr = io.BytesIO()
            cropped_image.save(img_byte_arr, format='PNG')
            generated_files.append((output_filename, img_byte_arr.getvalue()))
            print(f"Generated cropped element: {output_filename}")

        except (ValueError, TypeError) as e:
            print(f"Warning: Element '{title}' has invalid bbox data: {e}. Skipping.")

    return generated_files


# --- Main Cloud Function Entry Point ---
@functions_framework.http
def student_image_parser(request):
    """
    HTTP Cloud Function entry point.
    Accepts multipart/form-data with one or more files.
    Returns a zip file containing a single combined transcription and all cropped images.
    """
    if request.method != 'POST':
        return 'Please use POST request with multipart/form-data.', 405

    uploaded_files = request.files.getlist('files')
    if not uploaded_files:
        return 'No files uploaded. Please upload files with the key "files".', 400

    all_output_files = []
    
    images_for_element_processing = []
    all_pil_images_for_transcription = []

    for uploaded_file in uploaded_files:
        filename = uploaded_file.filename
        file_bytes = uploaded_file.read()
        print(f"Received file: {filename}")

        if filename.lower().endswith('.pdf'):
            try:
                pdf_document = fitz.open(stream=file_bytes, filetype="pdf")
                for i, page in enumerate(pdf_document):
                    pix = page.get_pixmap(dpi=300)
                    page_image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    
                    images_for_element_processing.append({
                        "image": page_image,
                        "prefix": f"{os.path.splitext(filename)[0]}_page_{i+1}_"
                    })
                    all_pil_images_for_transcription.append(page_image)

                pdf_document.close()
            except Exception as e:
                print(f"Error converting PDF file '{filename}' with PyMuPDF: {e}")
        else:
            try:
                image = Image.open(io.BytesIO(file_bytes))
                
                images_for_element_processing.append({
                    "image": image,
                    "prefix": f"{os.path.splitext(filename)[0]}_"
                })
                all_pil_images_for_transcription.append(image)

            except UnidentifiedImageError as e:
                print(f"Error opening image file '{filename}': {e}")

    if not images_for_element_processing:
        return "No valid image or PDF files could be processed.", 400

    # --- Phase 1: Concurrent Element Extraction (per-image)
    print("\n--- PHASE 1: Starting Concurrent Element Extraction ---")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_prefix = {
            executor.submit(
                process_elements_for_single_image,
                item['image'],
                output_prefix=item['prefix']
            ): item['prefix']
            for item in images_for_element_processing
        }

        for future in concurrent.futures.as_completed(future_to_prefix):
            prefix = future_to_prefix[future]
            try:
                processed_files = future.result()
                if processed_files:
                    all_output_files.extend(processed_files)
                    print(f"--- Successfully finished element extraction for {prefix} ---")
            except Exception as exc:
                print(f"--- An exception occurred during element extraction for {prefix}: {exc} ---")

    # --- Phase 2: Batched Transcription (all images at once)
    print("\n--- PHASE 2: Starting Batched Transcription ---")
    if all_pil_images_for_transcription:
        transcription_response = call_gemini_api_for_transcription(
            all_pil_images_for_transcription,
            TRANSCRIPTION_PROMPT,
            "Batched Document Transcription"
        )
        if transcription_response and "full_transcription" in transcription_response:
            full_transcription = transcription_response.get("full_transcription", "No transcription provided.")
            transcription_filename = "full_document_transcription.txt"
            all_output_files.append((transcription_filename, full_transcription.encode('utf-8')))
            print(f"Successfully generated combined transcription: {transcription_filename}")
        else:
            print("Failed to get a valid batched transcription response.")
    else:
        print("No images were available for transcription.")


    # --- Final Zipping ---
    if not all_output_files:
        return "Processing completed, but no output files were generated.", 400

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for filename, data in all_output_files:
            zf.writestr(filename, data)

    zip_buffer.seek(0)

    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='processed_document.zip'
    )