# GradingFlow: AI-Powered Exam Structuring & Grading

<p align="center">
  <a href="https://gradingflow.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-GradingFlow-blue?style=for-the-badge&logo=vercel" alt="Live Demo">
  </a>
  <img src="https://img.shields.io/badge/Status-Active%20Development-green?style=for-the-badge" alt="Project Status">
</p>

<p align="center">
  A full-stack, AI-native platform that transforms static exam documents (PDFs/images) into interactive, auto-gradable digital formats. Built from first principles with vanilla JS, Python, and a suite of generative AI models.
</p>

---

## What is GradingFlow?

GradingFlow is a tool for educators designed to automate the most tedious parts of exam management. A teacher can upload a multi-page exam PDF, and GradingFlow's AI pipeline will intelligently parse, structure, and digitize every question, sub-question, and visual element. The teacher can then upload an answer key, which is similarly structured, and finally, upload student submissions (individually or in bulk) via direct file upload or a dedicated scanning page designed for mobile use to be automatically graded against the model.

The result is a rich, interactive interface where teachers can review the AI's work, see student answers side-by-side with the model, and get a complete overview of class performance, saving hours of manual work.


## Key Features

*   **AI-Powered Exam Structuring**: Upload a PDF or images of an exam, and the system automatically identifies questions, sub-questions (including implicit ones), MCQ options, and context visuals.
*   **Intelligent Answer Model Integration**: Upload an answer key, and the AI links correct answers, points, and grading criteria to the corresponding structured questions.
*   **Flexible Submission Uploads**:
    *   **Single Student**: Generate a unique QR code for a student to scan with their phone and upload their handwritten answers.
    *   **Bulk Upload**: Handle multiple student submissions at once through a dedicated interface.
    *   **Direct Upload**: Upload files directly from the teacher's computer.
*   **Automated Grading**: Compares student answers (both text and visuals) against the answer model to assign points and generate explanatory feedback.
*   **Interactive Review Interface**: A clean, three-column layout displays the sub-question, the model answer, and the student's submission side-by-side for easy review.
*   **Dynamic Rendering**: Supports LaTeX for mathematical equations and Markdown for rich text formatting.

## How It Works: The Architecture

This project is built on a modern, serverless architecture designed for scalability and rapid development. It's a "first principles" stack, meaning no high-level frameworks like LangChain—just direct, purposeful API calls.



*   **Frontend**: **Vanilla JavaScript, HTML, & CSS**. Deployed on Vercel.
    *   No React, Vue, or Angular. This was a deliberate choice for maximum control over the DOM, state management, and the exact `FormData` payloads sent to the backend.
    *   *Libraries*: `Supabase-js` for auth/DB, `JSZip` for handling zipped API responses, `Marked.js` for Markdown, `QRious` for QR codes, and `KaTeX` for math rendering.

*   **Backend**: **Google Cloud Functions (Python)**.
    *   A suite of stateless, single-purpose functions that form the core AI pipeline.
    *   `image-parser`: Extracts visual elements and transcribes text from documents.
    *   `exam-structurer`: Takes transcribed text and structures it into a valid exam JSON.
    *   `add-appendix` / `add-model` / `add-student-answers`: Augments the exam JSON with new data.
    *   `generate-points`: The grading engine. Compares a student's submission to the model answer.

*   **AI & Models**:
    *   **Google Gemini 2.5 Pro**: The primary model for all structuring, transcription, and grading tasks due to its large context window and strong reasoning capabilities.
    *   **Parasail Qwen2.5-VL-72B-Instruct**: Used within the `image-parser` for its specialized visual element extraction (bounding box detection).

*   **Database & Storage**: **Supabase**.
    *   **PostgreSQL**: The single source of truth for all structured data.
    *   **Storage**: Hosts all exam visuals, student answer images, and other assets.
    *   **Auth**: Manages teacher accounts.
    *   **Edge Functions (Deno)**: Securely handle session generation for QR code scanning.

## Why No frameworks like LangChain?

I chose to build the AI orchestration layer from scratch for three key reasons that were critical to this project's success:

1.  **Absolute Control & Transparency**: My pipeline is a complex, multi-step process involving several custom GCP functions. I needed absolute control over the exact `FormData` payloads, HTTP headers, and timeout logic (`AbortController` in the frontend, `timeout` in Python `requests`). By using direct API calls, I have a transparent, auditable data flow. I know precisely what's going over the wire at every step, which was critical for debugging the interactions between my frontend, my cloud functions, and the various AI services.

2.  **Robustness & Simplicity**: My architecture uses simple, stateless cloud functions. If the `generate-points` function fails for a specific student, I can log the exact, self-contained JSON input that caused the error. There's no hidden state or complex object lifecycle to worry about. This 'first principles' approach makes the system more robust and easier to maintain because each component is simple and independently testable.

## Project Context & Timeline

This is a solo project I've been building in my spare time—primarily on weekends and late nights after my full-time internship in VC. Development started in late-June 2025.

## Roadmap & Future Improvements

*   **Short-Term (The Next Weeks)**:
    *   **UI/UX Polish**: Refine animations, improve mobile responsiveness, and add more intuitive loading states.
    *   **Performance Optimization**: Implement client-side image compression before upload to speed up the pipeline.
    *   **Enhanced Error Handling**: Provide more specific, user-friendly error messages on both the frontend and backend.

*   **Mid-Term (The Next Months)**:
    *   **Student-Facing Portal**: Give students a way to view their graded exams and the AI-generated feedback.
    *   **Teacher Dashboard**: Add analytics to show class-wide performance on specific questions.

*   **Long-Term**:
    *   **Subject-specific Finetuned Models for Grading**: Use Reinforcement Learning to finetune thinking models for each specific school subject, in order to boost grading accuracy.
    *   **Agent-Based Workflows**: The ultimate goal is to move beyond a UI-driven process. A teacher should be able to simply state their intent: *"Grade my Physics midterm submissions and flag any answers that mention 'quantum entanglement'."* An autonomous agent would then orchestrate this entire pipeline—fetching the exam, finding the submissions, running the grading function, and applying the custom filter—delivering a complete result without manual clicks. This aligns perfectly with HUMAIN's vision of agents replacing apps.
