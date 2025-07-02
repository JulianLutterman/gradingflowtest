// Configuration
const SUPABASE_URL = 'https://uagiatfoiwusxafxskvp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhZ2lhdGZvaXd1c3hhZnhza3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyODc0NjYsImV4cCI6MjA2NDg2MzQ2Nn0.b0wIEHgENkhzkp3qHAotqbLTq7BwsqgM7b0ksAl3h1U';
const STORAGE_BUCKET = 'exam-visuals';

// Initialize Supabase client
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global variables
let scanSessionId = null;
let sessionToken = null;
// Stores objects like { id: uuid, type: 'new'|'uploaded', data: File|string }
let allImagesForSession = [];
let cameraStream = null;
let bestRearCamera = null;

// DOM elements
const studentInfo = document.getElementById('studentInfo');
const imagePreviews = document.getElementById('imagePreviews');
const uploadBtn = document.getElementById('uploadBtn');
const noImagesMessage = document.getElementById('noImagesMessage');

const cameraActivation = document.getElementById('cameraActivation');
const activateCameraBtn = document.getElementById('activateCameraBtn');
const cameraContainer = document.getElementById('cameraContainer');
const cameraFeed = document.getElementById('cameraFeed');
const cameraCanvas = document.getElementById('cameraCanvas');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const cameraFlash = document.getElementById('cameraFlash');

// Utility to generate a unique ID for local image management
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Show status messages (removed - keeping function for compatibility)
function showStatus(message, type) {
    // Status messages removed per user request
}

async function findBestRearCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        const rearCameras = [];

        for (const device of videoDevices) {
            try {
                // Test each camera to get its capabilities
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: device.deviceId }
                });

                const track = stream.getVideoTracks()[0];
                const capabilities = track.getCapabilities();
                const settings = track.getSettings();

                // Stop the test stream immediately
                stream.getTracks().forEach(track => track.stop());

                // Check if this is a rear camera
                const label = device.label || '';
                const isRearCamera = label.toLowerCase().includes('back') ||
                    label.toLowerCase().includes('rear') ||
                    label.toLowerCase().includes('environment') ||
                    settings.facingMode === 'environment';

                if (isRearCamera) {
                    const maxResolution = capabilities.width && capabilities.height ?
                        capabilities.width.max * capabilities.height.max : 0;

                    rearCameras.push({
                        deviceId: device.deviceId,
                        label: label,
                        maxResolution: maxResolution,
                        capabilities: capabilities,
                        settings: settings
                    });
                }
            } catch (error) {
                console.warn(`Could not test camera ${device.deviceId}:`, error);
            }
        }

        if (rearCameras.length === 0) {
            console.log('No rear cameras found, will use default');
            return null;
        }

        // Sort by resolution (highest first) and pick the best one
        rearCameras.sort((a, b) => b.maxResolution - a.maxResolution);
        bestRearCamera = rearCameras[0];

        console.log('Selected rear camera:', bestRearCamera.label, 'Resolution:', bestRearCamera.maxResolution);
        return bestRearCamera;

    } catch (error) {
        console.error('Error finding rear camera:', error);
        return null;
    }
}

/**
 * Get optimal camera constraints for document scanning
 */
function getOptimalConstraints(cameraInfo) {
    let constraints;

    if (cameraInfo) {
        // Use specific camera with high quality settings
        constraints = {
            deviceId: cameraInfo.deviceId,
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            focusMode: 'continuous',
            exposureMode: 'continuous',
            whiteBalanceMode: 'continuous'
        };

        // Add advanced constraints if supported
        if (cameraInfo.capabilities) {
            const caps = cameraInfo.capabilities;

            // Set focus distance for document scanning (typically 20-50cm)
            if (caps.focusDistance) {
                constraints.focusDistance = { ideal: 0.3 }; // 30cm
            }

            // Use highest available resolution
            if (caps.width && caps.height) {
                constraints.width = {
                    ideal: Math.min(caps.width.max, 1920),
                    min: Math.min(caps.width.min || 640, 1280)
                };
                constraints.height = {
                    ideal: Math.min(caps.height.max, 1080),
                    min: Math.min(caps.height.min || 480, 720)
                };
            }

            // Set frame rate for stability
            if (caps.frameRate) {
                constraints.frameRate = { ideal: 30, max: 30 };
            }
        }
    } else {
        // Fallback to environment camera
        constraints = {
            facingMode: 'environment',
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            focusMode: 'continuous',
            exposureMode: 'continuous',
            whiteBalanceMode: 'continuous'
        };
    }

    return constraints;
}

// Initialize page on load
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    sessionToken = urlParams.get('token');

    if (!sessionToken) {
        studentInfo.textContent = 'Error: No session token provided.';
        return;
    }

    try {
        // Fetch scan session details using a secure RPC call
        const { data, error } = await sb.rpc('get_session_by_token', {
            token_arg: sessionToken
        });

        if (error) {
            // This will catch database-level errors
            throw error;
        }

        if (!data || data.length === 0) {
            // This handles the case where the token is invalid or the session is expired,
            // as our function will return an empty array.
            throw new Error('Session not found or has expired.');
        }

        // The RPC function returns an array of results, we just need the first one.
        const session = data[0];

        scanSessionId = session.id;

        // Populate allImagesForSession with existing uploaded images from the session
        if (session.uploaded_image_paths && session.uploaded_image_paths.length > 0) {
            allImagesForSession = session.uploaded_image_paths.map(url => ({
                id: generateUUID(), // Assign a new ID for local management
                type: 'uploaded',
                data: url
            }));
        }

        studentInfo.textContent = `Student: ${session.student_name || session.student_number || 'Unknown'}`;
        renderPreviews(); // Display existing images
        updateNoImagesMessage(); // Update message based on images
        updateUploadButton(); // Update upload button state

    } catch (error) {
        console.error('Initialization error:', error);
        studentInfo.textContent = `Error: ${error.message}`;
    }
});

// Event listeners
activateCameraBtn.addEventListener('click', activateCamera);
takePhotoBtn.addEventListener('click', takePhoto);
uploadBtn.addEventListener('click', uploadImages);

/**
 * Activates the camera and shows the camera view
 */
async function activateCamera() {
    cameraActivation.classList.add('hidden');
    cameraContainer.classList.remove('hidden');

    // Find the best rear camera first
    await findBestRearCamera();
    await startCamera();
}

/**
 * Starts the camera stream with optimal settings for document scanning
 */
async function startCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    cameraPlaceholder.textContent = 'Starting camera...';
    cameraFeed.classList.add('hidden');
    cameraPlaceholder.classList.remove('hidden');

    try {
        const constraints = getOptimalConstraints(bestRearCamera);

        console.log('Starting camera with constraints:', constraints);

        const stream = await navigator.mediaDevices.getUserMedia({
            video: constraints
        });

        cameraStream = stream;
        cameraFeed.srcObject = stream;

        // Wait for video to load and get actual settings
        cameraFeed.onloadedmetadata = () => {
            // --- START: NEW LOGIC TO SET CONTAINER ASPECT RATIO ---
            const videoWidth = cameraFeed.videoWidth;
            const videoHeight = cameraFeed.videoHeight;

            // Calculate the true aspect ratio of the video stream
            const aspectRatio = videoWidth / videoHeight;

            // Set the container's aspect ratio to match the video's
            cameraContainer.style.aspectRatio = aspectRatio;
            // --- END: NEW LOGIC ---

            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            console.log('Camera settings:', settings);
            console.log('Video dimensions:', videoWidth, 'x', videoHeight);
            console.log('Applied aspect ratio to container:', aspectRatio);

            cameraFeed.classList.remove('hidden');
            cameraPlaceholder.classList.add('hidden');
            takePhotoBtn.disabled = false;
        };

    } catch (error) {
        console.error('Error accessing camera:', error);
        cameraFeed.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.textContent = `Camera access failed: ${error.message}`;
        takePhotoBtn.disabled = true;

        // Try basic fallback
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            cameraStream = fallbackStream;
            cameraFeed.srcObject = fallbackStream;
            cameraFeed.classList.remove('hidden');
            cameraPlaceholder.classList.add('hidden');
            takePhotoBtn.disabled = false;

        } catch (fallbackError) {
            console.error('Fallback camera failed:', fallbackError);
        }
    }
}

/**
 * Stops the camera stream and releases resources.
 */
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
        cameraFeed.srcObject = null;
        cameraFeed.classList.add('hidden');
        cameraPlaceholder.classList.remove('hidden');
        cameraPlaceholder.textContent = 'Camera is off.';
        takePhotoBtn.disabled = true;
    }
}

/**
 * Captures a high-quality photo from the current camera feed.
 */
function takePhoto() {
    if (!cameraStream) {
        return;
    }

    // Trigger flash effect
    cameraFlash.classList.add('active');
    setTimeout(() => {
        cameraFlash.classList.remove('active');
    }, 300);

    const context = cameraCanvas.getContext('2d');

    // Use the actual video dimensions for maximum quality
    const videoWidth = cameraFeed.videoWidth;
    const videoHeight = cameraFeed.videoHeight;

    // Set canvas to match video resolution exactly
    cameraCanvas.width = videoWidth;
    cameraCanvas.height = videoHeight;

    // Draw the current video frame onto the canvas at full resolution
    context.drawImage(cameraFeed, 0, 0, videoWidth, videoHeight);

    // Convert canvas content to a high-quality Blob
    cameraCanvas.toBlob((blob) => {
        if (blob) {
            const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const newImage = {
                id: generateUUID(),
                type: 'new',
                data: file
            };
            allImagesForSession.push(newImage);
            renderPreviews();
        }
    }, 'image/jpeg', 0.95); // High quality JPEG (95%)
}

// Stop camera when navigating away from the page
window.addEventListener('beforeunload', stopCamera);
window.addEventListener('pagehide', stopCamera);

/**
 * Renders all images (newly captured and already uploaded) in the preview section.
 */
function renderPreviews() {
    imagePreviews.innerHTML = ''; // Clear existing previews

    updateNoImagesMessage(); // Update the "No images" message visibility
    updateUploadButton(); // Update the upload button's disabled state

    if (allImagesForSession.length === 0) {
        return; // No images to render
    }

    allImagesForSession.forEach(item => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';

        const img = document.createElement('img');
        // For new images, create an object URL; for uploaded, use the direct URL
        img.src = item.type === 'new' ? URL.createObjectURL(item.data) : item.data;
        img.alt = 'Preview';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => removeImage(item.id); // Pass the unique ID for removal

        previewItem.appendChild(img);
        previewItem.appendChild(removeBtn);

        imagePreviews.appendChild(previewItem);

        // Revoke object URL for 'new' images after they are loaded to free memory
        if (item.type === 'new') {
            img.onload = () => URL.revokeObjectURL(img.src);
        }
    });
}

/**
 * Updates the state of the main "Upload All New Images" button.
 */
function updateUploadButton() {
    const hasNewImages = allImagesForSession.some(item => item.type === 'new');
    uploadBtn.disabled = !hasNewImages;
}

/**
 * Toggles the visibility of the "No images uploaded yet" message.
 */
function updateNoImagesMessage() {
    const hasImages = allImagesForSession.length > 0;
    noImagesMessage.classList.toggle('hidden', hasImages);
}

/**
 * Uploads all newly captured images to Supabase Storage and updates the session record.
 */
async function uploadImages() {
    const newFilesToUpload = allImagesForSession.filter(item => item.type === 'new');

    if (newFilesToUpload.length === 0) {
        return;
    }

    uploadBtn.disabled = true;
    const originalText = uploadBtn.textContent;
    uploadBtn.textContent = 'Uploading...';

    try {
        const uploadedUrls = [];
        for (const item of newFilesToUpload) {
            const file = item.data;
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `temp_scans/${sessionToken}/${fileName}`;

            // Upload file to Supabase Storage
            const { error: uploadError } = await sb.storage
                .from(STORAGE_BUCKET)
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get public URL of the uploaded file
            const { data: urlData } = sb.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(filePath);

            uploadedUrls.push(urlData.publicUrl);

            // Update the item's type and data in our local array
            item.type = 'uploaded';
            item.data = urlData.publicUrl;
        }

        // Fetch current uploaded_image_paths from DB to merge with new ones
        const { data: currentSessionData, error: fetchError } = await sb
            .from('scan_sessions')
            .select('uploaded_image_paths')
            .eq('id', scanSessionId)
            .single();

        if (fetchError) throw fetchError;

        const existingPaths = currentSessionData.uploaded_image_paths || [];
        const updatedPaths = [...existingPaths, ...uploadedUrls];

        // Update the scan_sessions table with the merged list of image paths AND set status to ready for processing
        const { error: updateError } = await sb
            .from('scan_sessions')
            .update({
                uploaded_image_paths: updatedPaths,
                status: 'uploaded'  // NEW: Signal that images are ready for processing
            })
            .eq('id', scanSessionId);

        if (updateError) throw updateError;

        renderPreviews(); // Re-render to reflect 'uploaded' status for all images
        updateUploadButton(); // Update button state (should be disabled if no new images)

        // Change button text to show success
        uploadBtn.textContent = 'Images Uploaded Successfully!';
        setTimeout(() => {
            uploadBtn.textContent = originalText;
        }, 3000);

    } catch (error) {
        console.error('Upload error:', error);
        uploadBtn.textContent = originalText;
    } finally {
        uploadBtn.disabled = false; // Re-enable button in case of failure
    }
}

/**
 * Removes an image from the local list and, if uploaded, from Supabase Storage and DB.
 * @param {string} idToRemove - The unique ID of the image to remove.
 */
async function removeImage(idToRemove) {
    const indexToRemove = allImagesForSession.findIndex(item => item.id === idToRemove);
    if (indexToRemove === -1) return; // Image not found

    const itemToRemove = allImagesForSession[indexToRemove];

    if (itemToRemove.type === 'uploaded') {
        // If it's an already uploaded image, delete from Supabase Storage and DB
        const urlToRemove = itemToRemove.data;
        // Extract filename from the URL to construct the storage path
        const filename = urlToRemove.split('/').pop();
        const filePath = `temp_scans/${sessionToken}/${filename}`;

        try {
            // Delete from Supabase Storage
            const { error: deleteError } = await sb.storage.from(STORAGE_BUCKET).remove([filePath]);
            if (deleteError) throw deleteError;

            // Fetch current paths from DB to ensure we're updating the latest version
            const { data: currentSessionData, error: fetchError } = await sb
                .from('scan_sessions')
                .select('uploaded_image_paths')
                .eq('id', scanSessionId)
                .single();

            if (fetchError) throw fetchError;

            const existingPaths = currentSessionData.uploaded_image_paths || [];
            // Filter out the URL of the image being removed
            const updatedPaths = existingPaths.filter(path => path !== urlToRemove);

            // Update the scan_sessions table with the new list of paths
            const { error: updateError } = await sb
                .from('scan_sessions')
                .update({ uploaded_image_paths: updatedPaths })
                .eq('id', scanSessionId);

            if (updateError) throw updateError;

        } catch (error) {
            console.error('Remove image error:', error);
            return; // Stop if deletion failed
        }
    }

    // Remove from local array and re-render the previews
    allImagesForSession.splice(indexToRemove, 1);
    renderPreviews();
}
