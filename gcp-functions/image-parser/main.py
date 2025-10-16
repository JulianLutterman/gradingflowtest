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
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY")  # <-- add this

# Model for Element Extraction (via Parasail/Gemini)
EXTRACTION_MODEL_NAME = "gemini-2.5-flash"
# Model for Transcription (via Qwen)
TRANSCRIPTION_MODEL_NAME = "qwen3-vl-235b-a22b-instruct"

TEMPERATURE_FOR_JSON = 0


# --- System Prompts ---

ELEMENT_EXTRACTION_PROMPT = """
Detect items ("diagram", "chart", "graph", "table", "drawing", "photograph"). Capture 0-5 items maximum. Output a json list where each entry contains the 2D bounding box in "box_2d" and a short (two words max, seperated by "_") text label in "label".
"""

TRANSCRIPTION_PROMPT = """
You are an expert document transcription assistant. Your sole task is to provide an accurate transcription of the text in the provided image.
You need to:
- Transcribe all text that is part of the main body, headings, questions, and general page content.
- The document could be a school exam. You MUST ALWAYS INCLUDE any question or answer NUMBERS AND THE POINTS AWARDED (typically identified by for example "p", "points") per question if they are present. DO NOT OMIT THIS DATA.
- The document can also be from an appendix that belongs to the school exam. In this case, it is CRUCIAL that you include the titles of the appendices (e.g.: "B: Graph on Macroeconomics", or "Source A", or "Appendix C - Image of Sobibor during WW2"), as well as the obvious textual elements that are clearly part of the appendix. Each appendix item might also include a textual introduction and/or a short textual explanation. Be sure to include this in your transcription.
- Another possibility is that the document is the model for correct answers to an exam, in this case also, be sure to include the points awarded per correct answer component, the question number for each bucket of correct answers, and any extra comments relevant to grading the question.
- If there are any mathematical/physics/etc. equations in the text, use the LaTeX syntax to write these equations. Also, as the text will eventually be shown on HTML pages via the KaTeX library, using single dollar signs ($ ... $) to wrap in-line formulas, and use double dollar signs to wrap block (display) formulas that should be centered on its own line.
- CRUCIAL: REMEMBER TO PUT THE DOLLAR SIGNS BOTH AT THE BEGINNING AND END OF EACH FORMULA. I'VE NOTICED SOMETIMES YOU FORGET TO PUT THESE SIGNS AT THE END OF A FORMULA, ESPECIALLY IF THERE IS A NEWLINE RIGHT AFTER THE FORMULA.
- When returning JSON, escape every backslash as \\\\ inside the JSON string, and do not introduce backslashes that aren’t part of LaTeX.
- CRUCIAL: In certain documents, there are a few pages with introductory text or large bodies of text that explain grading guidelines, general rules, or anything else in that direction. IF there is any text like this, which is NOT specific to any SPECIFIC exam question (meaning also not specific to a certain appendix item, a specific model answer, or a specific answer attempt by a student), then you should not include this in your transcription. Instead of the large body of text, you should just write "[LARGE BODY OF IRRELEVANT TEXT]".
- IF there is/are any VISUAL ELEMENT(S) in the document provided, EXCLUDE any text that is an integral part of that/those visual element. Do not transcribe axis labels on a graph, data points in a chart, text within a diagram, or content inside a table. Your focus is on the text *surrounding* these elements. This means you'll typically also exclude titles of such visual elements.
- Despite not being allowed to transcribe anything part of such visual elements, DO NOT OMIT outside references to such elements. For example if the text says something along the lines of: "Refer to source B", you should include it in your transcription.

Output your findings as a single JSON object with one key: "full_transcription". The value should be a single string containing all the transcribed text.

Example Output:
{
  "full_transcription": "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
}

Ensure the JSON is valid. If no text is found, return an empty string for "full_transcription".
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

# --- New Helper Function (Add this to the Helper Functions section) ---

# --- New Helper Function (Add this to the Helper Functions section) ---

def resize_image_for_analysis(pil_image, max_dimension=2048):
    """
    Resizes a PIL image to a maximum dimension for consistent LLM analysis,
    maintaining aspect ratio. Returns the resized image and scaling ratios.
    """
    original_width, original_height = pil_image.size
    
    if max(original_width, original_height) <= max_dimension:
        # If the image is already small enough, no resize is needed.
        # The ratio is 1.0, so coordinates won't be changed.
        return pil_image, 1.0, 1.0

    if original_width > original_height:
        # Landscape or square
        new_width = max_dimension
        new_height = int(new_width * original_height / original_width)
    else:
        # Portrait
        new_height = max_dimension
        new_width = int(new_height * original_width / original_height)

    resized_image = pil_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Calculate the ratio to scale coordinates back up to the original size
    width_ratio = original_width / new_width
    height_ratio = original_height / new_height
    
    print(f"Image resized for analysis from {original_width}x{original_height} to {new_width}x{new_height}.")
    return resized_image, width_ratio, height_ratio


# --- API Call Functions ---

def _ensure_gemini_client(task_name=""):
    if not GEMINI_API_KEY:
        print(f"Error ({task_name}): GEMINI_API_KEY not set.")
        return None
    try:
        return genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        print(f"Failed to init Gemini client for {task_name}: {e}")
        return None


def call_gemini_elements_api(pil_image, system_prompt, task_name=""):
    """
    Calls the Gemini model for element extraction (cropping) and returns the parsed JSON.

    Expected output format (primary): a JSON list of objects like:
    [
      {"box_2d": [y_min, x_min, y_max, x_max], "label": "..."},
      ...
    ]

    Back-compat: we also accept an object with key "identified_elements".
    """
    client = _ensure_gemini_client(task_name)
    if not client:
        return None

    try:
        generation_config = types.GenerateContentConfig(
            system_instruction=types.Content(parts=[types.Part(text=system_prompt)]),
            temperature=TEMPERATURE_FOR_JSON,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            response_mime_type="application/json",
        )

        contents = pil_image

        print(f"Sending '{task_name}' request to Gemini API (Model: {EXTRACTION_MODEL_NAME})...")
        response = client.models.generate_content(
            model=EXTRACTION_MODEL_NAME,
            contents=contents,
            config=generation_config,
        )

        return json.loads(response.text)
    except json.JSONDecodeError as jde:
        print(f"Error decoding JSON from Gemini response for {task_name}: {jde}")
        print(f"Received text: {response.text if 'response' in locals() else 'N/A'}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during {task_name} Gemini API call: {e}")
        return None

def _ensure_qwen_client(task_name=""):
    if not DASHSCOPE_API_KEY:
        print(f"Error ({task_name}): DASHSCOPE_API_KEY not set.")
        return None
    try:
        return OpenAI(
            api_key=DASHSCOPE_API_KEY,
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        )
    except Exception as e:
        print(f"Failed to init Qwen client for {task_name}: {e}")
        return None


def call_qwen_transcription_api(pil_image, system_prompt, task_name=""):
    """
    Calls the Qwen model (OpenAI-compatible DashScope endpoint) for transcription
    and returns a JSON object: {"full_transcription": "..."}.
    The system prompt is passed as a true system message.
    """
    client = _ensure_qwen_client(task_name)
    if not client:
        return None

    # Ensure we can encode the image as a data URL for the image_url content
    try:
        b64 = encode_image_to_base64(pil_image)
        if not b64:
            print(f"Error ({task_name}): Failed to base64-encode image for Qwen.")
            return None
        mime = get_image_mime_type(pil_image) or "image/png"
        data_url = f"data:{mime};base64,{b64}"
    except Exception as e:
        print(f"Error ({task_name}): Preparing image for Qwen: {e}")
        return None

    try:
        # System prompt is **system** role (not injected into user)
        completion = client.chat.completions.create(
            model=TRANSCRIPTION_MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": "Analyze the image and provide a transcription following the system instructions."}
                    ],
                },
            ],
            temperature=0,
            top_p=0.8,
        )

        content = completion.choices[0].message.content or ""
        content = content.strip()

        # Try to parse JSON; if not valid, wrap as "full_transcription"
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict) and "full_transcription" in parsed:
                return parsed
            # If it's JSON but doesn't match shape, wrap it
            return {"full_transcription": content}
        except json.JSONDecodeError:
            # Try extracting JSON between backticks if present
            m = re.search(r"\{[\s\S]*\}", content)
            if m:
                try:
                    parsed = json.loads(m.group(0))
                    if isinstance(parsed, dict) and "full_transcription" in parsed:
                        return parsed
                except Exception:
                    pass
            # Fallback: return raw text wrapped in the expected shape
            return {"full_transcription": content}

    except APIError as e:
        print(f"Qwen APIError during {task_name}: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during {task_name} Qwen API call: {e}")
        return None



# --- Core Processing Function ---

def process_single_image(original_image_pil, output_prefix=""):
    """
    Processes a single PIL image by making two concurrent API calls (one for transcription,
    one for element extraction) and returns the generated files as a list of
    (filename, data_in_bytes) tuples.

    Changes:
      - Switched element extraction from OpenRouter/Parasail to Gemini 2.5 Flash.
      - Supports NEW element format: a list of dicts with:
          {
            "box_2d": [y_min, x_min, y_max, x_max],  # vertical-first ordering
            "label": "photograph"  # used as element type/name
          }
      - Backward-compatible with OLD format (identified_elements key using bbox [x_min, y_min, x_max, y_max]).
    """
    print(f"\n--- Starting concurrent processing for {output_prefix} ---")
    generated_files = []

    if original_image_pil.mode != 'RGB':
        original_image_pil = original_image_pil.convert("RGB")

    # Resize image for consistent analysis and get scaling ratios
    image_for_analysis, width_ratio, height_ratio = resize_image_for_analysis(original_image_pil)

    # Concurrent API Calls (Gemini for BOTH tasks now)
    elements_response = None
    transcription_response = None
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future_elements = executor.submit(
            call_gemini_elements_api,
            image_for_analysis,
            ELEMENT_EXTRACTION_PROMPT,
            "Element Extraction",
        )
        future_transcription = executor.submit(
            call_qwen_transcription_api,
            original_image_pil,
            TRANSCRIPTION_PROMPT,
            "Transcription",
        )

        try:
            elements_response = future_elements.result()
        except Exception as e:
            print(f"Element extraction task failed for {output_prefix}: {e}")

        try:
            transcription_response = future_transcription.result()
        except Exception as e:
            print(f"Transcription task failed for {output_prefix}: {e}")

    # Process Transcription Result
    if transcription_response:
        full_transcription = transcription_response.get("full_transcription", "No transcription provided.")
        transcription_filename = f"{output_prefix}full_transcription.txt"
        generated_files.append((transcription_filename, full_transcription.encode('utf-8')))
        print(f"Generated transcription: {transcription_filename}")
    else:
        print(f"Failed to get a valid transcription response for {output_prefix}.")

    # Process Element Extraction Result
    identified_elements = []
    if elements_response:
        if isinstance(elements_response, list):
            identified_elements = elements_response
        else:
            print(f"Warning: Expected a JSON array for elements; got {type(elements_response)}. Ignoring.")
    else:
        print(f"Failed to get a valid element extraction response for {output_prefix}.")

    if not identified_elements:
        print(f"\nNo elements were identified by the API for {output_prefix}.")
    else:
        print(f"\n--- Processing {len(identified_elements)} Elements Identified for {output_prefix} ---")
        element_filenames = {}

        for i, element in enumerate(identified_elements):
            label = element.get("label") or element.get("type") or "element"
            title = element.get("title") or f"{label}_{i+1}"
            element_type = label

            bbox_data = element.get("box_2d")

            if not bbox_data or not (isinstance(bbox_data, list) and len(bbox_data) == 4):
                print(f"Warning: Element '{title}' has invalid or missing box_2d data. Skipping crop.")
                continue

            try:
                # The format is [y_min, x_min, y_max, x_max]
                # These are NORMALIZED coordinates on a 0-1000 scale.
                y_min_norm, x_min_norm, y_max_norm, x_max_norm = bbox_data

                # Get the dimensions of the ORIGINAL image, not the resized one.
                orig_width, orig_height = original_image_pil.size

                # Convert normalized coordinates to absolute pixel coordinates on the ORIGINAL image
                x_min_orig = int((x_min_norm / 1000.0) * orig_width)
                y_min_orig = int((y_min_norm / 1000.0) * orig_height)
                x_max_orig = int((x_max_norm / 1000.0) * orig_width)
                y_max_orig = int((y_max_norm / 1000.0) * orig_height)

                # The width_ratio and height_ratio from the resize are no longer needed for this calculation.

                # Margin (this part is fine)
                MARGIN_RATIO = 0.03
                element_width = x_max_orig - x_min_orig
                element_height = y_max_orig - y_min_orig

                margin_x = max(0, int(element_width * MARGIN_RATIO))
                margin_y = max(0, int(element_height * MARGIN_RATIO))

                crop_box = (
                    max(0, x_min_orig - margin_x),
                    max(0, y_min_orig - margin_y),
                    min(orig_width, x_max_orig + margin_x),
                    min(orig_height, y_max_orig + margin_y),
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
def image_parser(request):
    """
    HTTP Cloud Function entry point.
    Accepts multipart/form-data with one or more files.
    Returns a zip file containing transcriptions and cropped images.
    """
    if request.method != 'POST':
        return 'Please use POST request with multipart/form-data.', 405

    uploaded_files = request.files.getlist('files')
    if not uploaded_files:
        return 'No files uploaded. Please upload files with the key "files".', 400

    all_output_files = []
    images_to_process = []

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
                    images_to_process.append({
                        "image": page_image,
                        "prefix": f"{os.path.splitext(filename)[0]}_page_{i+1}_"
                    })
                pdf_document.close()
            except Exception as e:
                print(f"Error converting PDF file '{filename}' with PyMuPDF: {e}")
        else:
            try:
                image = Image.open(io.BytesIO(file_bytes))
                images_to_process.append({
                    "image": image,
                    "prefix": f"{os.path.splitext(filename)[0]}_"
                })
            except UnidentifiedImageError as e:
                print(f"Error opening image file '{filename}': {e}")

    if not images_to_process:
        return "No valid image or PDF files could be processed.", 400

    with concurrent.futures.ThreadPoolExecutor() as executor:
        future_to_prefix = {
            executor.submit(
                process_single_image,
                item['image'],
                output_prefix=item['prefix']
            ): item['prefix']
            for item in images_to_process
        }

        for future in concurrent.futures.as_completed(future_to_prefix):
            prefix = future_to_prefix[future]
            try:
                processed_files = future.result()
                if processed_files:
                    all_output_files.extend(processed_files)
                    print(f"--- Successfully finished processing for {prefix} ---")
                else:
                    print(f"--- Processing for {prefix} returned no files. ---")
            except Exception as exc:
                print(f"--- An exception occurred while processing {prefix}: {exc} ---")

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
        download_name='processed_elements.zip'
    )
