/**
 * API Route Handler for File Uploads
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises'; // Use promises for async operations

const router = express.Router();

let UPLOAD_DIR = ''; // Will be initialized

/**
 * Initializes the upload directory.
 * @param {string} uploadsPath - The absolute path to the uploads directory.
 */
export function initializeUploads(uploadsPath) {
    UPLOAD_DIR = uploadsPath;
    // Ensure the upload directory exists
    fs.mkdir(UPLOAD_DIR, { recursive: true })
        .then(() => console.log(`Upload directory ensured at: ${UPLOAD_DIR}`))
        .catch(err => console.error(`Error creating upload directory ${UPLOAD_DIR}:`, err));
}

// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!UPLOAD_DIR) {
            // This should not happen if initializeUploads was called correctly
            console.error("Upload directory not initialized!");
            return cb(new Error("Server configuration error: Upload directory not set."), '');
        }
        cb(null, UPLOAD_DIR); // Use the initialized directory path
    },
    filename: (req, file, cb) => {
        // Sanitize filename slightly, keep original extension
        const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E5)}`;
        const extension = path.extname(safeOriginalName);
        const baseName = path.basename(safeOriginalName, extension);
        cb(null, `${baseName}-${uniqueSuffix}${extension}`);
    }
});

// File filter (optional: restrict file types)
const fileFilter = (req, file, cb) => {
    // Example: Allow only text, images, pdf
    // const allowedTypes = /text\/plain|image\/jpeg|image\/png|image\/gif|application\/pdf/;
    // if (allowedTypes.test(file.mimetype)) {
    //     cb(null, true);
    // } else {
    //     cb(new Error('Unsupported file type'), false);
    // }
    cb(null, true); // Allow all file types for now
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB limit per file
    }
});

// --- Route Handler ---

// POST /api/upload
router.post('/upload', upload.array('files', 10), (req, res) => { // Allow up to 10 files
    if (!UPLOAD_DIR) {
        return res.status(500).json({ success: false, error: 'Server configuration error: Upload directory not available.' });
    }

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files were uploaded.' });
    }

    try {
        const uploadedFiles = req.files.map(file => ({
            originalName: file.originalname, // Keep original name for reference
            filename: file.filename,       // The generated unique filename
            path: file.path,               // Full path on the server
            relativePath: path.relative(__dirname, file.path), // Path relative to server.js location (adjust if needed)
            size: file.size,
            mimetype: file.mimetype
        }));

        console.log(`Files uploaded successfully: ${uploadedFiles.length}`, uploadedFiles.map(f => f.filename));
        res.json({ success: true, files: uploadedFiles });

    } catch (error) {
        console.error('Error processing file upload:', error);
        // Attempt to clean up uploaded files if processing fails after multer finishes
        if (req.files) {
            req.files.forEach(file => {
                fs.unlink(file.path).catch(unlinkErr => console.error(`Failed to cleanup failed upload ${file.filename}:`, unlinkErr));
            });
        }
        res.status(500).json({ success: false, error: 'File upload processing failed after saving.' });
    }
});

// --- Multer Error Handling Middleware ---
// This needs to be added *after* the upload route in the main server file (server.mjs)
// or used specifically with the upload route like: router.post('/upload', (req, res, next) => { upload.array(...)(req, res, err => { /* handle multer err */ next(err); }) });
// For simplicity here, we'll rely on the main server's error handler, but a dedicated one is better.
// Example dedicated handler (would go in server.mjs or be passed to the route):
/*
function handleMulterError(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        console.error("Multer Error:", err);
        return res.status(400).json({ success: false, error: `File upload error: ${err.message}`, code: err.code });
    } else if (err) {
        // An unknown error occurred when uploading.
        console.error("Unknown Upload Error:", err);
        return res.status(500).json({ success: false, error: `Upload failed: ${err.message}` });
    }
    // Everything went fine.
    next();
}
*/

export default router;
// initializeUploads is already exported above