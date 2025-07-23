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

TEMPERATURE_FOR_JSON = 0

# --- System Prompts ---

ELEMENT_EXTRACTION_PROMPT = """
You are an expert document analysis assistant.
Your sole task is to crop out all visual elements from the user-given image of a document page, this page can be either computer typed, or handwritten and drawn. The page may contain text, and any type of visual elements (diagrams, charts, graphs, tables, drawings, photographs, other). You need to isolate the visual elements, and provide the bounding box coordinates of each element you can find.
You need to:
1. Identify all distinct graphs, charts, flowcharts, diagrams, photographs, tables, drawings or other images/visual elements (referred to as 'elements').
2. For each element, extract its title as accurately as possible. If an element has no discernible title, use a generic placeholder like "Untitled_Element_N" where N is a unique number for that element. The title must only contain letters, numbers, and underscores. You must process the extracted title to enforce this: replace spaces with underscores and remove all other characters, including punctuation and symbols.
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
You are an expert document transcription assistant. Your sole task is to provide an accurate transcription of the text in the provided image.
You need to:
- Transcribe all text that is part of the main body, headings, questions, and general page content.
- The document could be a school exam. You MUST ALWAYS INCLUDE any question or answer NUMBERS AND THE POINTS AWARDED (typically identified by for example "p", "points") per question if they are present. DO NOT OMIT THIS DATA.
- The document can also be from an appendix that belongs to the school exam. In this case, it is CRUCIAL that you include the titles of the appendices (e.g.: "B: Graph on Macroeconomics", or "Source A", or "Appendix C - Image of Sobibor during WW2"), as well as the obvious textual elements that are clearly part of the appendix. Each appendix item might also include a textual introduction and/or a short textual explanation. Be sure to include this in your transcription.
- Another possibility is that the document is the model for correct answers to an exam, in this case also, be sure to include the points awarded per correct answer component, the question number for each bucket of correct answers, and any extra comments relevant to grading the question.
- If there are any mathematical/physics/etc. equations in the text, use the LaTeX syntax to write these equations. Also, as the text will eventually be shown on HTML pages via the KaTeX library, using single dollar signs ($ ... $) to wrap in-line formulas, and use double dollar signs to wrap block (display) formulas that should be centered on its own line.
- CRUCIAL: REMEMBER TO PUT THE DOLLAR SIGNS BOTH AT THE BEGINNING AND END OF EACH FORMULA. I'VE NOTICED SOMETIMES YOU FORGET TO PUT THESE SIGNS AT THE END OF A FORMULA, ESPECIALLY IF THERE IS A NEWLINE RIGHT AFTER THE FORMULA.
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
        timeout=30, # Added timeout for the API call (30 seconds)
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

    response = None # Initialize response to None
    try:
        print(f"Sending '{task_name}' request to Parasail (Model: {EXTRACTION_MODEL_NAME})...")
        response = client.chat.completions.create(
            model=EXTRACTION_MODEL_NAME,
            messages=messages,
            temperature=TEMPERATURE_FOR_JSON,
            response_format={"type": "json_object"},
        )

        # --- IMPORTANT: Add explicit checks here to prevent 'NoneType' errors ---
        if not response:
            print(f"Error calling Parasail API for {task_name}: Response object is None.")
            return None
        if not hasattr(response, 'choices') or not response.choices:
            print(f"Error calling Parasail API for {task_name}: Response.choices is empty or missing.")
            return None
        if not hasattr(response.choices[0], 'message') or not response.choices[0].message:
            print(f"Error calling Parasail API for {task_name}: Response.choices[0].message is None or missing.")
            return None
        
        json_text = response.choices[0].message.content
        return json.loads(json_text)
    except APIError as e:
        print(f"Error calling Parasail API for {task_name}: {e}")
        # Consider logging e.response.status_code, e.response.text for more detailed debugging
        return None
    except json.JSONDecodeError as jde:
        print(f"Error decoding JSON from Parasail response for {task_name}: {jde}")
        # Ensure 'response' is available and valid before attempting to print its content
        raw_content = "N/A"
        if response and hasattr(response, 'choices') and response.choices and hasattr(response.choices[0], 'message'):
             raw_content = response.choices[0].message.content
        print(f"Received text: {raw_content}")
        return None
    except Exception as e:
        # This catches other general exceptions, including unexpected timeouts from the client if not caught by APIError
        print(f"An unexpected error occurred during {task_name} Parasail API call: {e}")
        return None

def call_gemini_api(pil_image, system_prompt, task_name=""):
    """
    Calls the Gemini model for transcription and returns the JSON response.
    (Corrected Version)
    """
    if not GEMINI_API_KEY:
        print(f"Error ({task_name}): GEMINI_API_KEY not set.")
        return None

    try:
        # Correctly initialize the client using the API key from environment variables
        client = genai.Client(api_key=GEMINI_API_KEY)

        # Correctly configure the generation settings, including the system prompt
        # and the requirement for a JSON response.
        generation_config = types.GenerateContentConfig(
            system_instruction=types.Content(parts=[types.Part(text=system_prompt)]),
            temperature=TEMPERATURE_FOR_JSON,
            max_output_tokens=65536,
            thinking_config = types.ThinkingConfig(
                thinking_budget=128,
            ),
            response_mime_type="application/json",
        )

        # The 'contents' list can directly include the PIL image and a simple user prompt.
        # The main instructions are correctly placed in the system_prompt.
        contents = [pil_image, "Analyze the image and provide a transcription following the system instructions."]

        print(f"Sending '{task_name}' request to Gemini API (Model: {TRANSCRIPTION_MODEL_NAME})...")

        # Use the non-streaming 'generate_content' to get a single, complete response object.
        # This is appropriate for parsing a JSON response.
        response = client.models.generate_content(
            model=TRANSCRIPTION_MODEL_NAME,
            contents=contents,
            config=generation_config,
        )

        # The response.text should now contain the complete JSON string.
        return json.loads(response.text)

    except json.JSONDecodeError as jde:
        print(f"Error decoding JSON from Gemini response for {task_name}: {jde}")
        # It's helpful to see the raw text from the API if JSON parsing fails.
        print(f"Received text: {response.text if 'response' in locals() else 'N/A'}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred during {task_name} Gemini API call: {e}")
        return None

# --- Core Processing Function ---
# --- New Core Processing Function (Replace the old one entirely) ---

def process_single_image(original_image_pil, output_prefix=""):
    """
    Processes a single PIL image by making two concurrent API calls (one for transcription,
    one for element extraction) and returns the generated files as a list of
    (filename, data_in_bytes) tuples.
    """
    print(f"\n--- Starting concurrent processing for {output_prefix} ---")
    generated_files = []

    if original_image_pil.mode != 'RGB':
        original_image_pil = original_image_pil.convert("RGB")

    # --- Resize image for consistent analysis and get scaling ratios ---
    # This is the critical step to solve the coordinate mismatch.
    # We send the resized image for analysis but use the ratios to crop the original hi-res image.
    image_for_analysis, width_ratio, height_ratio = resize_image_for_analysis(original_image_pil)
    analysis_img_width, analysis_img_height = image_for_analysis.size


    # --- Concurrent API Calls ---
    elements_response = None
    transcription_response = None
    with concurrent.futures.ThreadPoolExecutor() as executor:
        # Encode the RESIZED image for element extraction
        base64_analysis_image = encode_image_to_base64(image_for_analysis)
        analysis_image_mime_type = get_image_mime_type(image_for_analysis)

        # Submit element extraction with the resized image
        future_elements = executor.submit(call_parasail_api, base64_analysis_image, analysis_image_mime_type, ELEMENT_EXTRACTION_PROMPT, "Element Extraction")
        # Submit transcription with the ORIGINAL high-quality image for better OCR
        future_transcription = executor.submit(call_gemini_api, original_image_pil, TRANSCRIPTION_PROMPT, "Transcription")

        try:
            elements_response = future_elements.result()
        except Exception as e:
            print(f"Element extraction task failed for {output_prefix}: {e}")

        try:
            transcription_response = future_transcription.result()
        except Exception as e:
            print(f"Transcription task failed for {output_prefix}: {e}")
    # --- End of Concurrent API Calls ---

    # --- Process Transcription Result (No changes here) ---
    if transcription_response:
        full_transcription = transcription_response.get("full_transcription", "No transcription provided.")
        transcription_filename = f"{output_prefix}full_transcription.txt"
        generated_files.append((transcription_filename, full_transcription.encode('utf-8')))
        print(f"Generated transcription: {transcription_filename}")
    else:
        print(f"Failed to get a valid transcription response for {output_prefix}.")

    # --- Process Element Extraction Result ---
    identified_elements = []
    if elements_response:
        identified_elements = elements_response.get("identified_elements", [])
    else:
        print(f"Failed to get a valid element extraction response for {output_prefix}.")

    if not identified_elements:
        print(f"\nNo elements were identified by the API for {output_prefix}.")
    else:
        print(f"\n--- Processing {len(identified_elements)} Elements Identified for {output_prefix} ---")
        element_filenames = {}
        for i, element in enumerate(identified_elements):
            title = element.get("title", f"Untitled_Element_{i+1}")
            bbox_data = element.get("bbox")
            element_type = element.get("type", "element")

            if not bbox_data or not (isinstance(bbox_data, list) and len(bbox_data) == 4):
                print(f"Warning: Element '{title}' has invalid or missing bbox data. Skipping crop.")
                continue

            try:
                # Get the coordinates from the model (relative to the resized analysis image)
                x_min_analysis, y_min_analysis, x_max_analysis, y_max_analysis = map(int, bbox_data)

                # --- Scale coordinates back to the original image's resolution ---
                x_min_orig = int(x_min_analysis * width_ratio)
                y_min_orig = int(y_min_analysis * height_ratio)
                x_max_orig = int(x_max_analysis * width_ratio)
                y_max_orig = int(y_max_analysis * height_ratio)

                # Crop the ORIGINAL high-resolution image using the scaled coordinates
                # We clamp values to the original image dimensions just in case of rounding errors
                # Add extra margin to the crop (in pixels)
                MARGIN_RATIO = 0.03  # 3% margin, adjust as needed

                orig_width, orig_height = original_image_pil.size
                element_width = x_max_orig - x_min_orig
                element_height = y_max_orig - y_min_orig

                margin_x = int(element_width * MARGIN_RATIO)
                margin_y = int(element_height * MARGIN_RATIO)

                crop_box = (
                    max(0, x_min_orig - margin_x),
                    max(0, y_min_orig - margin_y),
                    min(orig_width, x_max_orig + margin_x),
                    min(orig_height, y_max_orig + margin_y)
                )


                if crop_box[0] >= crop_box[2] or crop_box[1] >= crop_box[3]:
                    print(f"Warning: Invalid bounding box for '{title}' after scaling. Skipping crop.")
                    continue

                cropped_image = original_image_pil.crop(crop_box)

                # --- Save the cropped high-quality image ---
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