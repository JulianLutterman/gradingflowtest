import { useEffect, useMemo } from 'react';
import { useLegacyScripts } from '../hooks/useLegacyScripts.js';

const scripts = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  '/legacy/multi-scan.js',
];

function MultiScanPage() {
  const scriptList = useMemo(() => scripts, []);

  useLegacyScripts(scriptList, {
    active: true,
    onLoaded: () => {
      setTimeout(() => {
        document.dispatchEvent(new Event('DOMContentLoaded'));
      }, 0);
    },
  });

  useEffect(() => {
    return () => {
      window.dispatchEvent(new Event('legacy-multi-scan-unmounted'));
    };
  }, []);

  return (
    <div className="page page-multi-scan">
      <div id="studentInfo" className="student-info">
        Loading...
      </div>

      <div id="cameraActivation" className="camera-activation">
        <button id="activateCameraBtn" className="upload-btn" type="button">
          Activate Camera
        </button>
      </div>

      <div id="cameraContainer" className="camera-container hidden">
        <video id="cameraFeed" autoPlay playsInline className="hidden" />
        <div id="cameraPlaceholder" className="camera-placeholder">
          Attempting to start camera...
        </div>
        <canvas id="cameraCanvas" className="hidden" />
        <button id="takePhotoBtn" type="button" disabled />
        <div className="camera-flash" id="cameraFlash" />
      </div>

      <button id="nextStudentBtn" className="upload-btn" type="button" disabled>
        Continue to next student
      </button>

      <div id="imagePreviews" className="preview-container" />
    </div>
  );
}

export default MultiScanPage;
