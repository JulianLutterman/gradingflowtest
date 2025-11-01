import json
import os
from typing import Any, Dict, List

import functions_framework
from flask import Request
from google import genai
from google.genai import types

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-pro"

SYSTEM_PROMPT = """You are an expert at spotting where a new student's submission starts inside a
single combined PDF that contains multiple scanned exams. Use cues like cover
pages, name headers, blank separators, or abrupt handwriting changes. Always
provide concise, JSON-formatted results indicating the start page of each
submission. Do not include explanations."""


def _cors_headers() -> Dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "3600",
    }


def _error(message: str, status: int = 400):
    return json.dumps({"error": message}), status, _cors_headers()


def _get_client() -> genai.Client:
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set.")
    return genai.Client(api_key=GEMINI_API_KEY)


def _build_user_instruction(students: List[Dict[str, Any]]) -> str:
    if not students:
        roster = "No roster provided."
    else:
        labels = []
        for entry in students:
            name = (entry.get("studentName") or "").strip()
            number = (entry.get("studentNumber") or "").strip()
            label = name
            if number:
                label = f"{name} ({number})" if name else number
            if label:
                labels.append(label)
        roster = " | ".join(labels) if labels else "No roster provided."

    expected_count = len(students)
    expected_hint = (
        f"There are {expected_count} student submissions in order." if expected_count else ""
    )

    return (
        "Determine the 1-indexed page numbers where each new student submission begins "
        "in the provided PDF. Return a JSON object with a single key "
        '"submission_start_pages" whose value is an array of ascending integers. '
        "Only output valid JSON with no additional commentary.\n"
        f"Roster (first to last): {roster}. {expected_hint}"
    ).strip()


@functions_framework.http
def detect_submission_boundaries(request: Request):
    if request.method == "OPTIONS":
        return "", 204, _cors_headers()

    headers = _cors_headers()

    if request.method != "POST":
        return _error("Please use POST request with multipart/form-data.", 405)

    if not request.files or "bulk_pdf" not in request.files:
        return _error("Missing 'bulk_pdf' file upload.")

    pdf_file = request.files["bulk_pdf"]
    pdf_bytes = pdf_file.read()
    if not pdf_bytes:
        return _error("Uploaded PDF is empty.")

    students_raw = request.form.get("students", "[]")
    try:
        students = json.loads(students_raw) if students_raw else []
    except json.JSONDecodeError:
        return _error("Invalid JSON provided for 'students'.")

    try:
        client = _get_client()
    except RuntimeError as exc:
        return _error(str(exc), 500)

    user_instruction = _build_user_instruction(students)

    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(text=user_instruction),
                types.Part.from_bytes(mime_type="application/pdf", data=pdf_bytes),
            ],
        )
    ]

    config = types.GenerateContentConfig(
        temperature=0,
        response_mime_type="application/json",
        system_instruction=[types.Part.from_text(text=SYSTEM_PROMPT)],
    )

    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=config,
        )
    except Exception as exc:
        return _error(f"Gemini API call failed: {exc}", 500)

    raw_text = getattr(response, "text", "") if response else ""
    if not raw_text:
        return _error("Gemini response was empty.", 500)

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        return _error(f"Gemini response was not valid JSON: {exc}", 500)

    if isinstance(payload, list):
        pages = payload
    else:
        pages = payload.get("submission_start_pages") if isinstance(payload, dict) else None

    if not isinstance(pages, list):
        return _error("Gemini response missing 'submission_start_pages' list.", 500)

    clean_pages: List[int] = []
    for entry in pages:
        try:
            page_number = int(entry)
        except (TypeError, ValueError):
            continue
        if page_number >= 1:
            clean_pages.append(page_number)

    if not clean_pages:
        return _error("Gemini response did not include any valid page numbers.", 500)

    clean_pages = sorted(set(clean_pages))

    body = json.dumps({"submission_start_pages": clean_pages})
    return body, 200, headers
