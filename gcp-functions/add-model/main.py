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

# TEMP LOGGING IMPORTS
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

# Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
IMAGE_PARSER_URL = os.environ.get("IMAGE_PARSER_URL")
GEMINI_MODEL = "gemini-2.5-pro"

# System prompt for Gemini (remains the same)
SYSTEM_PROMPT = """###INPUT EXPLANATION:
The user will give you two types of input:
1. Transcriptions of an exam answer model with correct answers, and their awarded points, per correct answer component.
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
Your task is to take the transcriptions and the JSON file, and use it to create a more detailed JSON structure, you will need to introduce a new property inside each of the sub-question objects. Alongside the existing "sub_q_text_content", you would add a property named "model_alternatives". The value for this "model_alternatives" property is an array, designed to hold a list of different possible model answers for the sub-question. There can be one or multiple possible model answer alternatives for each sub-question. Each item within this "model_alternatives" array is an object that represents one complete, distinct answer. This individual answer object itself contains two properties: "alternative_number" and "model_components". The "alternative_number" is a numerical value that identifies which specific alternative answer it is (if there is only one possible alternative for a specific sub-question, this value should by default be 1). The "extra_comment" represents any extra comments made in the answer model. In the JSON this comment should be placed in the respective overall "model_alternative" as a whole, not to a specific answer component (even when the comment's content itself might relate to a very specific component). The "model_components" property holds yet another array, which breaks down that single answer into smaller, scorable parts. Each item in this final "model_components" array is an object representing one piece of the answer. Although, not always, sometimes there should only be one model component. There can be one or multiple model_components inside every alternative model answers, this means that you should only create multiple model components if the input transcription clearly does so. This component object has three properties: "component_text", which is a string containing the text for that specific partial correct answer; "component_points", a number indicating the score awarded for that component; and "component_order", a number that dictates the sequence of these components within the overall alternative answer, in the scenario that only one model component exists for a specific alternative answer, the value of "component_order" should be 1 by default.

###EXAMPLE:
Here is the base example JSON:
{
  "questions": [
    {
      "question_number": 1,
      "sub_questions": [
        {
          "sub_q_text_content": "[FIRST SUBQUESTION TEXT PLACEHOLDER]",
          "model_alternatives": [
            {
              "alternative_number": 1,
              "model_components": [
                {
                  "component_text": "[PLACEHOLDER ANSWER COMPONENT]",
                  "component_points": 1,
                  "component_order": 1
                },
                {
                  "component_text": "[PLACEHOLDER ANSWER COMPONENT]",
                  "component_points": 3,
                  "component_order": 2
                }
              ]
            },
            {
              "alternative_number": 2,
              "model_components": [
                {
                  "component_text": "[PLACEHOLDER ANSWER COMPONENT]",
                  "component_points": 4,
                  "component_order": 1
                },
                {
                  "component_text": "[PLACEHOLDER ANSWER COMPONENT]",
                  "component_points": 1,
                  "component_order": 2
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "question_number": 2,
      "sub_questions": [
        {
          "sub_q_text_content": "[FIRST SUBQUESTION TEXT PLACEHOLDER]",
          "model_alternatives": [
            {
              "alternative_number": 1,
              "model_components": [
                {
                  "component_text": "[PLACEHOLDER ANSWER COMPONENT]",
                  "component_points": 1,
                  "component_order": 1
                }
              ]
            }
          ]
        },
	{
          "sub_q_text_content": "[SECOND SUBQUESTION TEXT PLACEHOLDER]",
          "model_alternatives": [
            {
              "alternative_number": 1,
              "model_components": [
                {
                  "component_visual": "[PLACEHOLDER FILENAME]",
                  "component_points": 1,
                  "component_order": 1
                }
              ],
              "extra_comment": [COMMENT PLACEHOLDER],
            }
          ]
        }
      ]
    }
  ]
}

### SPECIFIC INSTRUCTIONS REGARDING EXTRA COMMENTS:

The source transcription may contain extra comments or grading remarks, typically found after the answer components for a question. Your task is to accurately parse, rephrase, and place these comments into the correct `model_alternatives` object(s) using the `extra_comment` string property. Follow these rules precisely:

**1. Placement Logic: Where to put the comment?**

*   **Rule A: General Comments (Apply to All)**
    If a comment does not specify a particular answer alternative, it is a general remark. You MUST duplicate this comment and include it in the `extra_comment` property for **every** `model_alternative` within that sub-question.

*   **Rule B: Specific Comments (Apply to One)**
    If a comment explicitly refers to a single, specific answer alternative (e.g., "In the first answer alternative..."), you MUST place it **only** in the `extra_comment` property of that one `model_alternative`.

*   **Rule C: Compound Comments (Split and Distribute)**
    If a single comment from the source text addresses multiple alternatives with different instructions (e.g., 'For alternative 2 do X, and for alternative 4 do Y'), you MUST:
    a. **Split** the source comment into separate, distinct instructions.
    b. **Place** each distinct instruction into the `extra_comment` property of its corresponding `model_alternative`.

**2. Content Rephrasing: How to write the comment?**

*   **CRITICAL RULE: Remove All Alternative References in the Output.**
    When you place a comment into a specific `model_alternative`, you MUST rephrase it to **remove any mention of which alternative it belongs to**. The comment's position within the JSON already provides this context.

*   **Example of Splitting and Rephrasing:**
    *   **Source Comment:** "For the second answer component of the third alternative and for the fourth answer component of the fourth alternative, you may exclusively award either 0 or 2 points."
    *   **Your Action:** Split this into two parts and rephrase them.
    *   **Correct JSON Output:**
        *   Inside the object where `"alternative_number": 3`, you will add:
            `"extra_comment": "For the second answer component, you may exclusively award either 0 or 2 points."`
        *   Inside the object where `"alternative_number": 4`, you will add:
            `"extra_comment": "For the fourth answer component, you may exclusively award either 0 or 2 points."`

**3. Handling Mixed Comment Types**

*   A sub-question might have a mix of general and specific comments. Apply the rules above accordingly. General comments (Rule A) will be duplicated across all alternatives, while specific comments (Rules B & C) will only appear in their designated alternative after being rephrased.

*   **Example of Mixed Comments:**
    *   **Source Comments:**
        1. "In the first answer alternative, the third answer component should be mentioned explicitly."
        2. "If the candidate uses a different formula in the second answer component, do not deduct any points for this."
    *   **Your Action:**
        *   The first comment is specific to alternative 1.
        *   The second comment is general as it does not specify an alternative.
    *   **Correct JSON Output (assuming two alternatives):**
        *   Inside `"alternative_number": 1`:
            `"extra_comment": "The third answer component should be mentioned explicitly. If the candidate uses a different formula in the second answer component, do not deduct any points for this."`
        *   Inside `"alternative_number": 2`:
            `"extra_comment": "If the candidate uses a different formula in the second answer component, do not deduct any points for this."`

### POINTS ALLOCATION WHEN ONLY A TOTAL IS PROVIDED
If the transcription gives a **single total point value** for a sub-question but **no per-component points**:

* You **must** still populate `"component_points"` for every component by **inferring a fair distribution** of the total based on the relative importance and difficulty of each component.
* **Do not change** any provided totals and **do not invent** a new total.
* For **mutually exclusive alternatives** within the same sub-question, **each** alternative’s components must sum to the **same total** for that sub-question.
* The sum of `"component_points"` within each `"model_alternatives"` **must equal exactly** the sub-question’s total.
* Use **integers by default**. Only use half-points or other fractions if the transcription **explicitly uses fractional scoring** elsewhere.
* **Heuristics (apply judgment; adjust to reflect the model text):**
  • 1 component → 100% of the total.
  • 2 components → default **60/40** (or **50/50** if clearly equal weight).
  • 3+ components → default to equal distribution of points, or IF certain components are more important than others, assign slightly more points if possible.
* Keep **consistent relative weights across alternatives** that express the same logical steps.
* Do **not** assign **0** to any required component (component points represent the **maximum available** for that component).
* If an alternative has only **one component** (text, formula, or visual), assign the **full total** to that component.

### LIST-TYPE ANSWERS (“K OF THE FOLLOWING”)

When a sub-question awards points for **any K correct items from a longer list** (e.g., “drie van de volgende”, “three of the following”, “per juist antwoord 1”, “maximumpunten 3”), represent it as **one model alternative** (unless the transcription explicitly gives multiple mutually exclusive alternatives). Follow these rules:

1. **Components = Slots (Not Items)**

   * Create exactly **K components** (the number of items the candidate may earn credit for), where each component represents a **slot** for “one correct item from the list,” **not** one component per listed item.
   * Use a **generic component text** in the original language, e.g.:

     * Dutch: `"Eén juist element uit de onderstaande lijst."`
     * English: `"One correct item from the list."`
   * Order them 1…K with `"component_order"`.

2. **Points per Component**

   * If the transcription states a per-item value (e.g., “per juist antwoord 1”), set `"component_points"` to that value and ensure **K × per-item = sub-question total**.
   * If **no per-item value** is given but **K** and a **total** are given, split the total **as evenly as possible** across the K components using **integers by default** (if a remainder exists, assign +1 to the earliest components until the sum matches the total). NEVER use fractional points.
   * The **sum of component_points within the alternative must equal exactly the sub-question total**.

3. **extra_comment = Full Acceptable List**

   * Put the **entire list of acceptable items** (verbatim, preserve line breaks, bullets, and original language) into the alternative’s `"extra_comment"`.
   * Prepend a brief instruction in the original language, e.g.:

     * Dutch: `"Accepteer elk van de volgende punten (maximaal K punten totaal, één punt per juist item):\n• ..."`
     * English: `"Accept any of the following (maximum K points total, one point per correct item):\n• ..."`
   * If there are additional general or specific grading remarks, **append** them to the same `"extra_comment"` following the existing comment-placement rules.

4. **Mixed Alternatives**

   * If the transcription offers a **different, mutually exclusive path** (e.g., “Define X **or** list three of the following”), create a **separate `model_alternatives` entry** for that path. Ensure each alternative’s component points **sum to the same sub-question total**.

**Mini Example (based on “drie van de volgende”, maximumscore 3, per juist antwoord 1):**

```json
{
  "sub_q_text_content": "Leg uit aan de hand van kenmerken van The Globe Theatre. (drie van de volgende)",
  "model_alternatives": [
    {
      "alternative_number": 1,
      "model_components": [
        { "component_text": "Eén juist element uit de onderstaande lijst.", "component_points": 1, "component_order": 1 },
        { "component_text": "Eén juist element uit de onderstaande lijst.", "component_points": 1, "component_order": 2 },
        { "component_text": "Eén juist element uit de onderstaande lijst.", "component_points": 1, "component_order": 3 }
      ],
      "extra_comment": "Accepteer elk van de volgende punten (maximaal 3 punten totaal, één punt per juist item):\n• is rond (zoals een klassiek theater), waardoor er een beter zicht op het podium is vanuit het publiek.\n• is rond (zoals een klassiek theater), waardoor er sprake is van een betere akoestiek.\n• heeft een variatie in zit- en staanplaatsen (voor verschillende rangen) als onderdeel van de architectuur, waardoor gevarieerd kan worden in toegangsprijzen.\n• heeft oplopende plaatsen / een variatie in (zit)plaatsen als onderdeel van de architectuur, waardoor het zicht ook goed is voor het publiek achteraan.\n• heeft een (deels) overdekt podium, waardoor de acteurs beschermd tegen het weer spelen.\n• biedt meer ruimte voor theatertechniek (vanuit de ruimtes die boven het podium gesitueerd zijn).\n• biedt in de architectuur opgenomen gelegenheid voor de acteurs om op te komen en af te gaan (bijvoorbeeld voor de wisseling van rol).\n• biedt ruimte voor voorbereiding en uitrusting van de acteurs, zoals kleedkamers en/of een plek voor attributen.\n• bevat decoraties met verwijzingen naar de klassieken, zoals de zuilen op het podium. Hiermee wordt getoond dat er kennis is van de geschiedenis / oorsprong van het theater (in de oudheid) / legt men een relatie met de klassieke oudheid.\n• per juist antwoord 1"
    }
  ]
}
```

**Notes**
* Do **not** create one component per bullet item (that would break the total-points constraint).
* Keep the list exactly as written (language, line breaks, examples).
* If the source specifies limits like “maximaal K antwoorden tellen mee,” include that phrasing in `extra_comment`.

### FURTHER INSTRUCTIONS:
- The input transcription will very likely provide you with the overall question numbers before the contents of each respective correct model answer, but it might not tell you which correct answer fits to which specific sub question. This is for you to figure out.
- Some examples of when to provide multiple model alternatives is when the input text answer for that specific subquestion says something similar to "Either of the following", or it has multiple answer alternatives with "or" between them, or when it provides different alternatives already in writing (this was a non-exhaustive list of examples).
- If the input transcription gives only one model component and/or alternative for a sub question, you are perfectly allowed to only include one alternative answer and one component answer in your output, this is also done in the example JSON I gave you, in question number 2, for both sub questions.
- Some of the given text is not related to a specific model answers to specific questions. This content is noise and shouldn't be included in your output. That can include exam titles, page numbers, explanations on how to grade, etc.
- You might receive image files from the user, these represent any visual elements of the answer model. Place the filenames of those images inside the JSON in the appropriate question attribute within the "component_visual" key (e.g.: "component_visual": "page_4_graph_2.png"). The user will sequentially put the filenames below each respective image (file1 - filename1 - file2 - filename2 - etc.), to clarify which filename belongs to which image.
- For most answers, no visual will be given, in this case you can just omit the "component_visual" object. In case ONLY a visual is given, and no text, then you should omit "component_text" instead.
- If there are any mathematical/physics/etc. equations in the input transcription files, they will likely be written in the LaTeX syntax, and wrapped in either single or double dollar signs (for KaTeX library displaying on HTML pages). KEEP that syntax and the dollar sign wrapping, do NOT change it back to normal notation.
- When you include LaTeX code inside a JSON string value, you MUST escape all backslashes that are part of said LaTeX code snippets for correct JSON formatting. For example, the LaTeX `\\sin(t)` must be written as `\\\\sin(t)` in the final JSON output. The LaTeX `\\begin{cases}` must be written as `\\\\begin{cases}`. This is essential for the JSON to be valid. This is because In a JSON string, the backslash is a special character used to "escape" other characters. For example, to include a double quote (") inside a string, you write \". To include a literal backslash, you must escape it with another backslash, resulting in \\.
- Keep the original line breaks within the text when appropriate.
- Output in the original language as given by the user.
- DO NOT OUTPUT ANYTHING OTHER THAN THE SOLE JSON CONTENT."""

GRADING_RULES_SYSTEM_PROMPT = """
The user will input a document or a set of images with the correct answer model to an exam.
This document MIGHT contain a set of rules that you could hypothetically use to grade a written exam from a student. These rules are typically under the header of "General Rules" or "Subject-Specific Rules" (or under both these headers in separate paragraphs), or something similar.
What I want you to do is to fully transcribe these rules, and format them appropriately. Your output should only contain these sets of specific rules that you, as an LLM, could hypothetically later use to grade an actual exam. Also, it should always be in the English language. If the input content is in a foreign language, you should translate it to English. Your output should contain nothing else other than this.
CRUCIAL: It is imperative that you do not skip over anything relevant from the input content (you are not allowed to outputplaceholder text like "..." or "Placeholder for the rest..." or anything similary). Do not include any rules that are irrelevant to the actual work itself of grading an exam, but that are instead formulated with the goal of facilitating real-world processes and laws.
If the input document does not contain any of these relevant types of rules, you only have to output: There are no specified grading rules for this exam.
"""

# --- TEMP LOGGING FUNCTION ---
def send_debug_email(subject, body, attachments=None):
    """
    Sends an email with a subject, body, and optional attachments.
    Reads configuration from environment variables.
    """
    sender_email = os.environ.get("SENDER_EMAIL")
    sender_password = os.environ.get("SENDER_APP_PASSWORD")
    recipient_email = os.environ.get("RECIPIENT_EMAIL")

    if not all([sender_email, sender_password, recipient_email]):
        print("Email credentials not set in environment variables. Skipping email.")
        return

    try:
        # Create the email message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = subject

        # Attach the body of the email
        msg.attach(MIMEText(body, 'plain'))

        # Attach files
        if attachments:
            for filename, content in attachments.items():
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(content)
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {filename}',
                )
                msg.attach(part)

        # Connect to Gmail's SMTP server and send the email
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        text = msg.as_string()
        server.sendmail(sender_email, recipient_email, text)
        server.quit()
        print(f"Debug email sent successfully to {recipient_email}")

    except Exception as e:
        print(f"Failed to send debug email: {e}")

# --- END OF NEW FUNCTION ---

def call_image_parser(files):
    """Call the image parser function with the uploaded files."""
    print("Calling image parser function...")
    
    try:
        files_data = []
        for file in files:
            files_data.append(('files', (file.filename, file.stream, file.content_type)))
        
        response = requests.post(IMAGE_PARSER_URL, files=files_data, timeout=1000)
        
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
    """Call Gemini API to structure the exam and return its output and a log of its input."""
    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not set.")
        return None, None

    # --- START: LOGGING CAPTURE ---
    gemini_input_log = {
        "system_prompt": SYSTEM_PROMPT,
        "model": GEMINI_MODEL,
        "config": {
            "temperature": 0,
            "response_mime_type": "application/json"
        },
        "user_content": {
            "text_files": {tf['filename']: tf['content'] for tf in text_files},
            "image_files": [img['filename'] for img in image_files],
            "exam_structure_json": json.loads(json_content) if json_content else None
        }
    }
    # --- END: LOGGING CAPTURE ---

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        content_parts = create_gemini_content(text_files, image_files, json_content)
        contents = [types.Content(role="user", parts=content_parts)]

        generate_content_config = types.GenerateContentConfig(
            temperature=0,
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

        # Return both the response text and the logged input
        return response.text, gemini_input_log
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        # Return None for both if there's an error
        return None, gemini_input_log


def call_gemini_for_grading_rules(files):
    """
    Calls Gemini with a specific prompt to extract grading rules from original documents.
    """
    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not set for grading rules extraction.")
        return "Error: GEMINI_API_KEY not set."

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)

        # Create content parts from the original uploaded files
        parts = []
        for file in files:
            # Reset stream position to the beginning in case it was read before
            file.stream.seek(0)
            file_bytes = file.stream.read()
            parts.append(types.Part.from_bytes(
                mime_type=file.content_type,
                data=file_bytes
            ))
        
        contents = [types.Content(role="user", parts=parts)]

        generate_content_config = types.GenerateContentConfig(
            temperature=0,
            thinking_config=types.ThinkingConfig(
                thinking_budget=0,
            ),
            system_instruction=[types.Part.from_text(text=GRADING_RULES_SYSTEM_PROMPT)]
        )

        print("Calling Gemini API for grading rules...")
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=generate_content_config
        )

        return response.text
    except Exception as e:
        print(f"Error calling Gemini API for grading rules: {e}")
        # Return a default message in case of failure so the main process doesn't crash
        return "Failed to extract grading rules due to an API error."

# Replace this function

@functions_framework.http
def add_model(request):
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

    # --- START: LOGGING CAPTURE (1/3) - Raw Uploaded Files ---
    uploaded_files_data = {}
    files_for_parser = request.files.getlist('files')
    if files_for_parser:
        for file in files_for_parser:
            file.stream.seek(0)
            uploaded_files_data[file.filename] = file.stream.read()
            # IMPORTANT: Reset stream so it can be read again by other functions
            file.stream.seek(0)
    # --- END: LOGGING CAPTURE (1/3) ---

    if not files_for_parser:
        return ('No appendix files uploaded. Please upload files with the key "files".', 400, headers)
    
    # Call Gemini to extract grading rules from the original documents
    print("Step 0: Calling Gemini API for grading rules...")
    grading_rules_text = call_gemini_for_grading_rules(files_for_parser)
    if not grading_rules_text:
        grading_rules_text = "No grading rules were extracted or an error occurred."

    # Reset streams again after the grading rules call
    for file in files_for_parser:
        file.stream.seek(0)
    
    json_content = request.form.get('exam_structure')
    if not json_content:
        return ('The "exam_structure" JSON data is missing from the request.', 400, headers)
    
    print(f"Successfully received exam structure JSON containing {len(json_content)} characters.")
    
    # --- FIX START: THIS BLOCK WAS MISSING AND IS NOW RESTORED ---
    text_files, image_files = [], []
    
    print("Step 1: Calling image parser...")
    parser_result = call_image_parser(files_for_parser)
    if not parser_result:
        # Send email on this specific failure
        send_debug_email("GCP Function FAILED - Image Parser", "The function failed during the image parser call.", uploaded_files_data)
        return ("Failed to process files with image parser.", 500, headers)
    
    print("Step 2: Extracting files from parser result...")
    text_files, image_files = extract_files_from_zip(parser_result)
    if not text_files and not image_files:
        print("Warning: No text or image files extracted from parser. This might be okay if the appendix was text-only and the parser had nothing to do.")
    # --- FIX END ---

    print("Step 3: Calling Gemini API...")
    # The call now returns two values
    structured_exam, gemini_input_log = call_gemini_api(text_files, image_files, json_content)

    if not structured_exam:
        # --- START: Send email on failure ---
        email_body_on_fail = "The GCP function failed during the Gemini API call."
        fail_attachments = uploaded_files_data.copy()
        if gemini_input_log:
            fail_attachments['gemini_input_log.json'] = json.dumps(gemini_input_log, indent=2).encode('utf-8')
        send_debug_email("GCP Function FAILED - Gemini API", email_body_on_fail, fail_attachments)
        # --- END: Send email on failure ---
        return ("Failed to structure exam with Gemini.", 500, headers)
    
    print("Step 4: Creating output zip...")
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('structured_exam.json', structured_exam.encode('utf-8'))
        zf.writestr('grading_rules.txt', grading_rules_text.encode('utf-8'))
        for image_file in image_files:
            zf.writestr(image_file['filename'], image_file['content'])
    
    zip_buffer.seek(0)
    
    # --- START: LOGGING CAPTURE (3/3) - Final Return & Email Send ---
    final_zip_content = zip_buffer.getvalue() # Get the bytes of the final zip
    
    email_body = "GCP function execution completed. See attachments for details."
    
    # Combine all captured data into one attachments dictionary
    all_attachments = uploaded_files_data.copy()
    all_attachments['gemini_input.json'] = json.dumps(gemini_input_log, indent=2).encode('utf-8')
    all_attachments['gemini_output.json'] = structured_exam.encode('utf-8')
    all_attachments['final_response.zip'] = final_zip_content
    
    # Send the email in a try-except block so it doesn't crash the main function
    try:
        send_debug_email("GCP Function Log", email_body, all_attachments)
    except Exception as e:
        print(f"An error occurred in the final email sending block: {e}")
    # --- END: LOGGING CAPTURE (3/3) ---

    # Reset buffer position again before sending the file
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
