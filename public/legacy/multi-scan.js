// --- CONFIGURATION ---
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const STORAGE_BUCKET = 'exam-visuals';

// --- SUPABASE CLIENT ---
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL STATE ---
let sessionToken = null;
let multiScanSession = null;
let currentStudentIndex = 0;
let imagesForCurrentStudent = []; // Array of { id: uuid, data: File }
let isUploading = false;
let cameraStream = null;
let bestRearCamera = null;

// --- DOM ELEMENTS ---
const studentInfo = document.getElementById('studentInfo');
const imagePreviews = document.getElementById('imagePreviews');
const nextStudentBtn = document.getElementById('nextStudentBtn');
const cameraActivation = document.getElementById('cameraActivation');
const activateCameraBtn = document.getElementById('activateCameraBtn');
const cameraContainer = document.getElementById('cameraContainer');
const cameraFeed = document.getElementById('cameraFeed');
const cameraCanvas = document.getElementById('cameraCanvas');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const cameraFlash = document.getElementById('cameraFlash');

// --- UTILITY ---
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    sessionToken = urlParams.get('token');

    if (!sessionToken) {
        studentInfo.textContent = 'Error: No session token provided.';
        nextStudentBtn.disabled = true;
        return;
    }

    try {
        const { data, error } = await sb.rpc('get_multi_scan_session_by_token', { token_arg: sessionToken });
        if (error) throw error;
        if (!data || !data.students || data.students.length === 0) {
            throw new Error('Session not found, is invalid, or has expired.');
        }

        multiScanSession = data;
        const firstPendingIndex = multiScanSession.students.findIndex(s => s.status !== 'uploaded');
        currentStudentIndex = firstPendingIndex !== -1 ? firstPendingIndex : 0;

        if (multiScanSession.students.every(s => s.status === 'uploaded')) {
             showCompletionScreen();
        } else {
            setupCurrentStudent();
        }

    } catch (error) {
        console.error('Initialization error:', error);
        studentInfo.textContent = `Error: ${error.message}`;
        nextStudentBtn.disabled = true;
    }
});

// --- EVENT LISTENERS ---
activateCameraBtn.addEventListener('click', activateCamera);
takePhotoBtn.addEventListener('click', takePhoto);
nextStudentBtn.addEventListener('click', handleNextStudent);
window.addEventListener('beforeunload', stopCamera);
window.addEventListener('pagehide', stopCamera);


// --- STATE MANAGEMENT ---
function setupCurrentStudent() {
    if (currentStudentIndex >= multiScanSession.students.length) {
        showCompletionScreen();
        return;
    }

    const student = multiScanSession.students[currentStudentIndex];
    studentInfo.textContent = `Scanning for: ${student.student_name || student.student_number}`;
    imagesForCurrentStudent = [];
    renderPreviews();
    updateNextButton();
}

function showCompletionScreen() {
    studentInfo.textContent = 'All submissions have been scanned!';
    nextStudentBtn.textContent = 'All Done! You can close this page.';
    nextStudentBtn.disabled = true;
    nextStudentBtn.classList.add('uploaded'); // Use success style
    cameraContainer.classList.add('hidden');
    cameraActivation.classList.add('hidden');
    imagePreviews.innerHTML = '';
    stopCamera();
}

// --- CAMERA LOGIC (COPIED FROM SCAN.JS - UNCHANGED) ---
async function findBestRearCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const rearCameras = [];
        for (const device of videoDevices) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: device.deviceId } });
                const track = stream.getVideoTracks()[0];
                const capabilities = track.getCapabilities();
                const settings = track.getSettings();
                stream.getTracks().forEach(track => track.stop());
                const label = device.label || '';
                const isRearCamera = label.toLowerCase().includes('back') || label.toLowerCase().includes('rear') || label.toLowerCase().includes('environment') || settings.facingMode === 'environment';
                if (isRearCamera) {
                    const maxResolution = capabilities.width && capabilities.height ? capabilities.width.max * capabilities.height.max : 0;
                    rearCameras.push({ deviceId: device.deviceId, label: label, maxResolution: maxResolution, capabilities: capabilities, settings: settings });
                }
            } catch (error) { console.warn(`Could not test camera ${device.deviceId}:`, error); }
        }
        if (rearCameras.length === 0) { console.log('No rear cameras found, will use default'); return null; }
        rearCameras.sort((a, b) => b.maxResolution - a.maxResolution);
        bestRearCamera = rearCameras[0];
        console.log('Selected rear camera:', bestRearCamera.label, 'Resolution:', bestRearCamera.maxResolution);
        return bestRearCamera;
    } catch (error) { console.error('Error finding rear camera:', error); return null; }
}

function getOptimalConstraints(cameraInfo) {
    let constraints;
    if (cameraInfo) {
        constraints = { deviceId: cameraInfo.deviceId, width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, focusMode: 'continuous', exposureMode: 'continuous', whiteBalanceMode: 'continuous' };
        if (cameraInfo.capabilities) {
            const caps = cameraInfo.capabilities;
            if (caps.focusDistance) { constraints.focusDistance = { ideal: 0.3 }; }
            if (caps.width && caps.height) {
                constraints.width = { ideal: Math.min(caps.width.max, 1920), min: Math.min(caps.width.min || 640, 1280) };
                constraints.height = { ideal: Math.min(caps.height.max, 1080), min: Math.min(caps.height.min || 480, 720) };
            }
            if (caps.frameRate) { constraints.frameRate = { ideal: 30, max: 30 }; }
        }
    } else {
        constraints = { facingMode: 'environment', width: { ideal: 1920, min: 1280 }, height: { ideal: 1080, min: 720 }, focusMode: 'continuous', exposureMode: 'continuous', whiteBalanceMode: 'continuous' };
    }
    return constraints;
}

async function activateCamera() {
    cameraActivation.classList.add('hidden');
    cameraContainer.classList.remove('hidden');
    await findBestRearCamera();
    await startCamera();
}

async function startCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); cameraStream = null; }
    cameraPlaceholder.textContent = 'Starting camera...';
    cameraFeed.classList.add('hidden');
    cameraPlaceholder.classList.remove('hidden');
    try {
        const constraints = getOptimalConstraints(bestRearCamera);
        const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
        cameraStream = stream;
        cameraFeed.srcObject = stream;
        cameraFeed.onloadedmetadata = () => {
            const videoWidth = cameraFeed.videoWidth;
            const videoHeight = cameraFeed.videoHeight;
            cameraContainer.style.aspectRatio = videoWidth / videoHeight;
            cameraFeed.classList.remove('hidden');
            cameraPlaceholder.classList.add('hidden');
            takePhotoBtn.disabled = false;
        };
    } catch (error) {
        console.error('Error accessing camera:', error);
        cameraPlaceholder.textContent = `Camera access failed: ${error.message}`;
        takePhotoBtn.disabled = true;
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
        cameraFeed.srcObject = null;
    }
}

function takePhoto() {
    if (!cameraStream) return;
    cameraFlash.classList.add('active');
    setTimeout(() => cameraFlash.classList.remove('active'), 300);
    const context = cameraCanvas.getContext('2d');
    const videoWidth = cameraFeed.videoWidth;
    const videoHeight = cameraFeed.videoHeight;
    cameraCanvas.width = videoWidth;
    cameraCanvas.height = videoHeight;
    context.drawImage(cameraFeed, 0, 0, videoWidth, videoHeight);
    cameraCanvas.toBlob((blob) => {
        if (blob) {
            const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
            imagesForCurrentStudent.push({ id: generateUUID(), data: file });
            renderPreviews();
        }
    }, 'image/jpeg', 0.95);
}

// --- UI & WORKFLOW ---
function renderPreviews() {
    imagePreviews.innerHTML = '';
    updateNextButton();
    if (imagesForCurrentStudent.length === 0) return;

    imagesForCurrentStudent.forEach(item => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(item.data);
        img.alt = 'Preview';
        img.onload = () => URL.revokeObjectURL(img.src);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '⨯';
        removeBtn.onclick = () => removeImage(item.id);
        previewItem.appendChild(img);
        previewItem.appendChild(removeBtn);
        imagePreviews.appendChild(previewItem);
    });
}

function removeImage(idToRemove) {
    imagesForCurrentStudent = imagesForCurrentStudent.filter(item => item.id !== idToRemove);
    renderPreviews();
}

function updateNextButton() {
    const isLastStudent = currentStudentIndex === multiScanSession.students.length - 1;
    if (isLastStudent) {
        nextStudentBtn.textContent = 'Finish Uploading';
    } else {
        const nextStudent = multiScanSession.students[currentStudentIndex + 1];
        const nextStudentIdentifier = nextStudent.student_name || nextStudent.student_number;
        nextStudentBtn.textContent = `Continue to next student: ${nextStudentIdentifier}`;
    }
    nextStudentBtn.disabled = imagesForCurrentStudent.length === 0 || isUploading;
}

async function handleNextStudent() {
    if (isUploading || imagesForCurrentStudent.length === 0) return;

    isUploading = true;
    nextStudentBtn.disabled = true;
    nextStudentBtn.textContent = 'Uploading...';

    try {
        const student = multiScanSession.students[currentStudentIndex];
        const uploadedUrls = [];
        const uploadPromises = imagesForCurrentStudent.map(item => {
            const file = item.data;
            const filePath = `temp_scans/${sessionToken}/${student.id}/${file.name}`;
            return sb.storage.from(STORAGE_BUCKET).upload(filePath, file);
        });

        const results = await Promise.all(uploadPromises);

        for (const result of results) {
            if (result.error) throw result.error;
            const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(result.data.path);
            uploadedUrls.push(urlData.publicUrl);
        }

        const { error: rpcError } = await sb.rpc('update_multi_scan_student_images', {
            student_id_arg: student.id,
            session_token_arg: sessionToken,
            new_urls_arg: uploadedUrls
        });

        if (rpcError) throw rpcError;

        currentStudentIndex++;
        isUploading = false;
        setupCurrentStudent();

    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed. Please check your connection and try again.');
        isUploading = false;
        updateNextButton();
    }
}
