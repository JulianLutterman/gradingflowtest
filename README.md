Of course. Here is a completely new, detailed README for the GradingFlow project, written from scratch based on the provided file structure and code analysis.

---

# GradingFlow: AI-Powered Exam Structuring & Grading

<p align="center">
  <a href="https://gradingflow.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-GradingFlow-blue?style=for-the-badge&logo=vercel" alt="Live Demo">
  </a>
  <img src="https://img.shields.io/badge/Status-Active%20Development-green?style=for-the-badge" alt="Project Status">
</p>

<p align="center">
  A full-stack, AI-native platform that transforms static exam documents (PDFs/images) into interactive, auto-gradable digital formats.
</p>

---

## What is GradingFlow?

GradingFlow is a tool for educators designed to automate the most tedious parts of exam management. A teacher can upload a multi-page exam PDF, and GradingFlow's AI pipeline will intelligently parse, structure, and digitize every question, sub-question, and visual element. The teacher can then upload an answer key, which is similarly structured, and finally, upload student submissions (individually or in bulk) to be automatically graded against the model.

The result is a rich, interactive interface where teachers can review the AI's work, see student answers side-by-side with the model, make inline edits, and get a complete overview of class performance—saving hours of manual work.

## Key Features

*   **AI-Powered Exam Structuring**: Upload a PDF or images of an exam, and the system automatically identifies questions, sub-questions (including implicit ones), MCQ options, and context visuals.
*   **Intelligent Answer Model Integration**: Upload an answer key, and the AI links correct answers, points, and grading criteria to the corresponding structured questions.
*   **Flexible Submission Uploads**:
    *   **Single Student QR Scan**: Generate a unique QR code for a student to scan with their phone and upload their handwritten answers.
    *   **Bulk QR Scan**: Create a session for multiple students at once, allowing a teacher to scan submissions sequentially from a single mobile interface.
    *   **Direct Bulk Upload**: Handle multiple student submissions at once through a dedicated file upload interface.
*   **Automated Grading**: Compares student answers (both text and visuals) against the answer model to assign points and generate explanatory feedback.
*   **Comprehensive Inline Editing**: Nearly every piece of data—from the exam title to individual answer components and student scores—can be edited directly in the UI without a page reload.
*   **Interactive Review Interface**: A clean, three-column layout displays the sub-question, the model answer, and the student's submission side-by-side for easy review and manual overrides.
*   **Dynamic Rendering**: Natively supports LaTeX for mathematical equations and Markdown for rich text formatting.

## How It Works: The Architecture

This project is built on a modern, serverless architecture designed for scalability and rapid development. It's a "first principles" stack, meaning no high-level AI frameworks like LangChain—just direct, purposeful API calls for maximum control and transparency.

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="Vanilla JS">
  <img src="https://img.shields.io/badge/Backend-Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/AI-Google_Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini">
  <img src="https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase">
  <img src="https://img.shields.io/badge/Deployment-Vercel_&_GCP-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel & GCP">
</p>

*   **Frontend**: **Vanilla JavaScript, HTML, & CSS**. Deployed on Vercel.
    *   No React, Vue, or Angular. This was a deliberate choice for maximum control over the DOM, state management, and the exact `FormData` payloads sent to the backend.
    *   *Key Libraries*: `Supabase-js` for auth/DB, `JSZip` for handling zipped API responses, `Marked.js` for Markdown, `QRious` for QR codes, and `KaTeX` for math rendering.

*   **Backend (AI Pipeline)**: **Google Cloud Functions (Python)**.
    *   A suite of stateless, single-purpose functions that form the core AI pipeline.
    *   `image-parser`: Extracts visual elements and transcribes text from documents.
    *   `exam-structurer`: Takes transcribed text and structures it into a valid exam JSON.
    *   `add-model` / `add-student-answers`: Augments the exam JSON with new data.
    *   `generate-points`: The grading engine. Compares a student's submission to the model answer.

*   **AI & Models**:
    *   **Google Gemini 2.5 Pro**: The primary model for all structuring, transcription, and grading tasks due to its large context window and strong reasoning capabilities.
    *   **Google Gemini 2.5 Flash**: Used within the `image-parser` for its speed and specialized visual element extraction (bounding box detection).

*   **Database & API**: **Supabase**.
    *   **PostgreSQL**: The single source of truth for all structured data, managed with custom SQL functions for complex operations like cascade deletes and point recalculations.
    *   **Storage**: Hosts all exam visuals, student answer images, and other assets.
    *   **Auth**: Manages teacher accounts.
    *   **Edge Functions (Deno/TypeScript)**: Securely handle session generation for QR code scanning, acting as a trusted intermediary between the client and the database.

## Project Context & Timeline

This is a solo project built in my spare time. Development started in late-June 2025.

## Roadmap & Future Improvements

*   **Short-Term (The Next Weeks)**:
    *   **UI/UX Polish**: Refine animations, improve mobile responsiveness, and add more intuitive loading states.
    *   **Performance Optimization**: Implement client-side image compression before upload to speed up the pipeline.
    *   **Enhanced Error Handling**: Provide more specific, user-friendly error messages on both the frontend and backend.

*   **Mid-Term (The Next Months)**:
    *   **Student-Facing Portal**: Give students a way to view their graded exams and the AI-generated feedback.
    *   **Teacher Dashboard**: Add analytics to show class-wide performance on specific questions and identify common mistakes.

*   **Long-Term Vision**:
    *   **Subject-Specific Finetuned Models**: Use Reinforcement Learning from Human Feedback (RLHF) based on teacher corrections to finetune grading models for specific subjects (e.g., Physics, History), boosting accuracy and nuance.
    *   **Agent-Based Workflows**: The ultimate goal is to move beyond a UI-driven process. A teacher should be able to simply state their intent: *"Grade my Physics midterm submissions and flag any answers that mention 'quantum entanglement'."* An autonomous agent would then orchestrate this entire pipeline—fetching the exam, finding the submissions, running the grading function, and applying the custom filter—delivering a complete result without manual clicks.
