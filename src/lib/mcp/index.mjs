/**
 * Model Context Protocol (MCP) Library - In-Memory Implementation
 * Handles context registration, validation, and file operations for AI interaction.
 * Version: 8.0.0 (Refactored for ES Modules)
 */

// Create a default export object to resolve the import issue in wsHandler.mjs
import fs from 'fs/promises'; // Use promise-based fs
import path from 'path';
import { randomUUID } from 'crypto';

// --- Constants ---
const DEFAULT_CONTEXT_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_PERMISSIONS = ['read', 'write', 'delete', 'create_directory'];
const MAX_PREVIEW_LENGTH = 250; // Max characters for content preview

// --- In-Memory Storage ---
/**
 * @typedef {object} McpContext
 * @property {string} sessionId - The session ID (e.g., WebSocket session) initiating the context.
 * @property {string} directory - The absolute base directory path for this context.
 * @property {string} userId - The ID of the user this context belongs to.
 * @property {string[]} permissions - Array of allowed permissions.
 * @property {number} expiresAt - Timestamp when the context expires.
 * @property {string} [projectId] - Optional project identifier.
 * @property {string} [description] - Optional description for the context.
 */

/** @type {Map<string, McpContext>} */
const activeContexts = new Map(); // Stores token -> McpContext

/**
 * @typedef {'write' | 'delete' | 'create_directory'} McpOperationType
 */

/**
 * @typedef {object} McpOperation
 * @property {string} id - Unique operation ID.
 * @property {string} userId - User who owns this operation.
 * @property {string} contextToken - Token of the context this operation belongs to.
 * @property {McpOperationType} type - The type of operation.
 * @property {string} [filePath] - Relative path for file operations (write/delete).
 * @property {string} [content] - Content for write operations.
 * @property {string} [dirPath] - Relative path for directory operations (create_directory/delete).
 * @property {object} metadata - Additional metadata (description, requestedBy, etc.).
 * @property {'pending' | 'approved' | 'rejected'} status - Current status.
 * @property {number} createdAt - Timestamp of creation.
 * @property {string} [previewContent] - Short preview for write operations.
 */

/** @type {Map<string, McpOperation>} */
const pendingOperations = new Map(); // Stores operationId -> McpOperation

// --- Helper Functions ---

/**
 * Generates a unique token.
 * @returns {string} A unique token.
 */
function generateToken() {
    return randomUUID();
}

/**
 * Resolves a relative path against the context's base directory securely.
 * Prevents path traversal attacks.
 * @param {string} baseDir - The absolute base directory of the context.
 * @param {string} relativePath - The relative path provided.
 * @returns {Promise<string>} The resolved absolute path.
 * @throws {Error} If the path is invalid or attempts to escape the base directory.
 */
async function resolveSecurePath(baseDir, relativePath) {
    // Normalize paths to prevent issues with mixed separators or redundant components
    const normalizedBase = path.normalize(baseDir);
    const normalizedRelative = path.normalize(relativePath);

    // Resolve the path
    const resolvedPath = path.resolve(normalizedBase, normalizedRelative);

    // Security Check: Ensure the resolved path is still within the base directory
    // path.relative will return '../' if resolvedPath is outside baseDir
    const relativeCheck = path.relative(normalizedBase, resolvedPath);
    if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
         console.error(`Path traversal attempt blocked: Base='${normalizedBase}', Relative='${normalizedRelative}', Resolved='${resolvedPath}'`);
        throw new Error('Path traversal attempt detected. Access denied.');
    }

    // Optional: Check for symbolic links if they pose a security risk in your environment
    // try {
    //     const stats = await fs.lstat(resolvedPath);
    //     if (stats.isSymbolicLink()) {
    //         throw new Error('Symbolic links are not permitted within the context path.');
    //     }
    // } catch (err) {
    //     // If lstat fails (e.g., file doesn't exist yet for write), that's okay here.
    //     // The check is primarily for existing symlinks during read/list/delete.
    //     if (err.code !== 'ENOENT') throw err;
    // }

    return resolvedPath;
}

/**
 * Checks if a directory exists and is accessible.
 * @param {string} dirPath - Absolute path to the directory.
 * @returns {Promise<boolean>} True if the directory exists and is valid.
 */
async function isValidDirectory(dirPath) {
    try {
        const stats = await fs.stat(dirPath);
        return stats.isDirectory();
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false; // Directory does not exist
        }
        console.error(`Error accessing directory ${dirPath}:`, error);
        throw new Error(`Failed to access directory: ${error.message}`); // Re-throw other errors
    }
}

/**
 * Checks if a file exists and is accessible.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<boolean>} True if the file exists and is valid.
 */
async function isValidFile(filePath) {
     try {
        const stats = await fs.stat(filePath);
        return stats.isFile();
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false; // File does not exist
        }
        console.error(`Error accessing file ${filePath}:`, error);
        throw new Error(`Failed to access file: ${error.message}`);
    }
}

// --- Context Management ---

/**
 * Registers a new context for file operations.
 * @param {string} sessionId - The session ID initiating the context.
 * @param {string} directory - The absolute base directory path.
 * @param {string} userId - The user ID.
 * @param {object} [options] - Additional options.
 * @param {string} [options.projectId] - Optional project identifier.
 * @param {string} [options.description] - Optional description.
 * @param {string[]} [options.permissions] - Permissions (defaults to all).
 * @param {number} [options.duration] - Validity duration (ms, defaults to 24h).
 * @returns {Promise<string>} The generated context token.
 * @throws {Error} If the directory is invalid.
 */
export async function registerContext(sessionId, directory, userId, options = {}) {
    const absoluteDirectory = path.resolve(directory); // Ensure absolute path

    if (!await isValidDirectory(absoluteDirectory)) {
        throw new Error(`Invalid or inaccessible directory provided: ${absoluteDirectory}`);
    }

    const token = generateToken();
    const duration = options.duration || DEFAULT_CONTEXT_DURATION;
    const contextDetails = {
        sessionId,
        directory: absoluteDirectory,
        userId,
        permissions: options.permissions || [...DEFAULT_PERMISSIONS],
        expiresAt: Date.now() + duration,
        projectId: options.projectId,
        description: options.description,
    };
    activeContexts.set(token, contextDetails);
    console.log(`MCP: Context registered - User: ${userId}, Token: ${token.substring(0, 8)}..., Dir: ${absoluteDirectory}`);
    return token;
}

/**
 * Validates a context token and checks permissions.
 * @param {string} token - The context token.
 * @param {string} userId - The user ID claiming the context.
 * @param {string} [requiredPermission] - Optional specific permission required.
 * @returns {{valid: boolean, context?: McpContext, error?: string}} Validation result.
 */
export function validateContext(token, userId, requiredPermission) {
    const context = activeContexts.get(token);

    if (!context) {
        return { valid: false, error: 'Invalid or unknown context token.' };
    }
    if (context.userId !== userId) {
        return { valid: false, error: 'User ID does not match context owner.' };
    }
    if (Date.now() > context.expiresAt) {
        activeContexts.delete(token); // Clean up expired token
        console.log(`MCP: Expired context token removed: ${token.substring(0, 8)}...`);
        return { valid: false, error: 'Context token has expired.' };
    }
    if (requiredPermission && !context.permissions.includes(requiredPermission)) {
        return { valid: false, error: `Permission '${requiredPermission}' denied for this context.` };
    }

    return { valid: true, context };
}

// --- File System Operations ---

/**
 * Lists files and directories within a context's path.
 * @param {string} token - Context token.
 * @param {string} userId - User ID.
 * @param {string} [subPath=''] - Optional sub-path relative to context directory.
 * @returns {Promise<Array<{name: string, type: 'file' | 'directory', path: string, size?: number, modified?: Date}>>} List of entries.
 * @throws {Error} If context invalid, path inaccessible, or not a directory.
 */
export async function listFiles(token, userId, subPath = '') {
    const validation = validateContext(token, userId, 'read');
    if (!validation.valid) throw new Error(validation.error);

    const baseDir = validation.context.directory;
    const targetPath = await resolveSecurePath(baseDir, subPath); // Use async version

    if (!await isValidDirectory(targetPath)) {
        throw new Error(`Path is not a valid directory: ${targetPath}`);
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const results = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(targetPath, entry.name);
        // Use POSIX separators for relative paths sent to client/AI
        const entryRelativePath = path.join(subPath, entry.name).replace(/\\/g, '/');
        try {
            const stats = await fs.lstat(entryPath); // Use lstat to detect symlinks if needed later
            return {
                name: entry.name,
                type: stats.isDirectory() ? 'directory' : 'file',
                path: entryRelativePath, // Relative path from context root
                size: stats.isFile() ? stats.size : undefined,
                modified: stats.mtime,
            };
        } catch (err) {
            console.warn(`MCP: Could not stat entry '${entryPath}': ${err.message}`);
            return null; // Skip problematic entries
        }
    }));
    return results.filter(r => r !== null); // Filter out skipped entries
}

/**
 * Reads the content of a file within a context.
 * @param {string} token - Context token.
 * @param {string} userId - User ID.
 * @param {string} filePath - Relative path to the file.
 * @returns {Promise<string>} File content as UTF-8 string.
 * @throws {Error} If context invalid, path inaccessible, or not a file.
 */
export async function readFile(token, userId, filePath) {
    const validation = validateContext(token, userId, 'read');
    if (!validation.valid) throw new Error(validation.error);

    const baseDir = validation.context.directory;
    const absoluteFilePath = await resolveSecurePath(baseDir, filePath);

    if (!await isValidFile(absoluteFilePath)) {
        throw new Error(`Path is not a valid file: ${absoluteFilePath}`);
    }
    // TODO: Add check for max file size to prevent reading huge files?
    return fs.readFile(absoluteFilePath, 'utf8');
}

/**
 * Creates a request for a file write operation (pending user approval).
 * @param {string} token - Context token.
 * @param {string} userId - User ID.
 * @param {string} filePath - Relative path to the file.
 * @param {string} content - Content to write.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<string>} The ID of the pending operation.
 */
export async function requestWriteFile(token, userId, filePath, content, metadata = {}) {
    const validation = validateContext(token, userId, 'write');
    if (!validation.valid) throw new Error(validation.error);

    // Validate filePath format (basic)
    if (!filePath || typeof filePath !== 'string' || filePath.includes('..')) {
        throw new Error('Invalid file path provided for write request.');
    }

    const operationId = generateToken();
    const operationDetails = {
        id: operationId,
        userId,
        contextToken: token,
        type: 'write',
        filePath: filePath.replace(/\\/g, '/'), // Normalize path separators
        content,
        metadata,
        status: 'pending',
        createdAt: Date.now(),
        previewContent: content.substring(0, MAX_PREVIEW_LENGTH) + (content.length > MAX_PREVIEW_LENGTH ? '...' : ''),
    };
    pendingOperations.set(operationId, operationDetails);
    console.log(`MCP: Write request created - User: ${userId}, OpID: ${operationId.substring(0, 8)}..., Path: ${filePath}`);
    return operationId;
}

/**
 * Creates a request for a file or directory delete operation (pending user approval).
 * @param {string} token - Context token.
 * @param {string} userId - User ID.
 * @param {string} itemPath - Relative path to the file or directory.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<string>} The ID of the pending operation.
 */
export async function requestDeleteFile(token, userId, itemPath, metadata = {}) {
    const validation = validateContext(token, userId, 'delete');
    if (!validation.valid) throw new Error(validation.error);

    if (!itemPath || typeof itemPath !== 'string' || itemPath.includes('..')) {
        throw new Error('Invalid path provided for delete request.');
    }

    const operationId = generateToken();
    const operationDetails = {
        id: operationId,
        userId,
        contextToken: token,
        type: 'delete',
        // Store under filePath for consistency, even if it's a directory
        filePath: itemPath.replace(/\\/g, '/'),
        metadata,
        status: 'pending',
        createdAt: Date.now(),
    };
    pendingOperations.set(operationId, operationDetails);
    console.log(`MCP: Delete request created - User: ${userId}, OpID: ${operationId.substring(0, 8)}..., Path: ${itemPath}`);
    return operationId;
}

/**
 * Creates a request for a directory creation operation (pending user approval).
 * @param {string} token - Context token.
 * @param {string} userId - User ID.
 * @param {string} dirPath - Relative path for the new directory.
 * @param {object} [metadata={}] - Additional metadata.
 * @returns {Promise<string>} The ID of the pending operation.
 */
export async function requestCreateDirectory(token, userId, dirPath, metadata = {}) {
    const validation = validateContext(token, userId, 'create_directory');
    if (!validation.valid) throw new Error(validation.error);

     if (!dirPath || typeof dirPath !== 'string' || dirPath.includes('..')) {
        throw new Error('Invalid directory path provided for create request.');
    }

    const operationId = generateToken();
    const operationDetails = {
        id: operationId,
        userId,
        contextToken: token,
        type: 'create_directory',
        dirPath: dirPath.replace(/\\/g, '/'), // Normalize path separators
        metadata,
        status: 'pending',
        createdAt: Date.now(),
    };
    pendingOperations.set(operationId, operationDetails);
    console.log(`MCP: Create directory request - User: ${userId}, OpID: ${operationId.substring(0, 8)}..., Path: ${dirPath}`);
    return operationId;
}

// --- Operation Management ---

/**
 * Retrieves all pending operations for a specific user.
 * @param {string} userId - The user ID.
 * @returns {Array<McpOperation>} A list of pending operations, newest first.
 */
export function getUserPendingOperations(userId) {
    const userOps = [];
    for (const op of pendingOperations.values()) {
        if (op.userId === userId && op.status === 'pending') {
            // Return a copy to prevent modification
            userOps.push({ ...op });
        }
    }
    return userOps.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Approves a pending operation and executes it.
 * @param {string} operationId - The ID of the operation.
 * @param {string} userId - The user ID approving (must match owner).
 * @returns {Promise<{success: boolean, message: string, operationId: string}>} Result.
 * @throws {Error} If operation invalid, user mismatch, context invalid, or execution fails.
 */
export async function approveOperation(operationId, userId) {
    const operation = pendingOperations.get(operationId);
    if (!operation) throw new Error('Operation not found.');
    if (operation.userId !== userId) throw new Error('User mismatch. Cannot approve this operation.');
    if (operation.status !== 'pending') throw new Error(`Operation is not pending (status: ${operation.status}).`);

    const validation = validateContext(operation.contextToken, userId);
    if (!validation.valid) {
        operation.status = 'rejected'; // Mark as rejected if context is invalid
        throw new Error(`Context for operation is no longer valid: ${validation.error}`);
    }

    const baseDir = validation.context.directory;
    let resultMessage = '';
    const targetPath = operation.filePath || operation.dirPath; // Path relative to context

    try {
        switch (operation.type) {
            case 'write':
                if (!operation.filePath || operation.content === undefined) throw new Error('Invalid write operation details.');
                const writePath = await resolveSecurePath(baseDir, operation.filePath);
                await fs.mkdir(path.dirname(writePath), { recursive: true });
                await fs.writeFile(writePath, operation.content, 'utf8');
                resultMessage = `File '${targetPath}' written successfully.`;
                break;
            case 'delete':
                if (!operation.filePath) throw new Error('Invalid delete operation details.');
                const deletePath = await resolveSecurePath(baseDir, operation.filePath);
                try {
                    const stats = await fs.lstat(deletePath); // Check if it exists and what type it is
                    if (stats.isDirectory()) {
                        await fs.rm(deletePath, { recursive: true, force: true });
                        resultMessage = `Directory '${targetPath}' deleted successfully.`;
                    } else {
                        await fs.unlink(deletePath);
                        resultMessage = `File '${targetPath}' deleted successfully.`;
                    }
                } catch (statErr) {
                    if (statErr.code === 'ENOENT') throw new Error(`Path not found for deletion: ${targetPath}`);
                    throw statErr; // Re-throw other stat errors
                }
                break;
            case 'create_directory':
                if (!operation.dirPath) throw new Error('Invalid create_directory operation details.');
                const createDirPath = await resolveSecurePath(baseDir, operation.dirPath);
                try {
                    await fs.access(createDirPath);
                    // If access doesn't throw, it exists
                    throw new Error(`Directory already exists: ${targetPath}`);
                } catch (accessErr) {
                    if (accessErr.code !== 'ENOENT') throw accessErr; // Re-throw if it's not "doesn't exist"
                    // Doesn't exist, proceed to create
                    await fs.mkdir(createDirPath, { recursive: true });
                    resultMessage = `Directory '${targetPath}' created successfully.`;
                }
                break;
            default:
                throw new Error(`Unsupported operation type: ${operation.type}`);
        }

        operation.status = 'approved';
        console.log(`MCP: Operation approved/executed - User: ${userId}, OpID: ${operationId.substring(0, 8)}..., Type: ${operation.type}, Path: ${targetPath}`);
        // Optionally remove from pendingOperations after a delay or keep for audit
        // setTimeout(() => pendingOperations.delete(operationId), 60000);
        return { success: true, message: resultMessage, operationId };

    } catch (error) {
        console.error(`MCP: Error executing approved operation ${operationId} (User: ${userId}, Type: ${operation.type}, Path: ${targetPath}):`, error);
        operation.status = 'rejected'; // Mark as rejected if execution failed
        // Provide a more specific error message if possible
        throw new Error(`Execution failed for ${operation.type} on '${targetPath}': ${error.message}`);
    }
}

/**
 * Rejects a pending operation.
 * @param {string} operationId - The ID of the operation.
 * @param {string} userId - The user ID rejecting (must match owner).
 * @param {string} [reason=''] - Optional reason for rejection.
 * @returns {{success: boolean, message: string, operationId: string}} Result.
 * @throws {Error} If operation invalid or user mismatch.
 */
export function rejectOperation(operationId, userId, reason = '') {
    const operation = pendingOperations.get(operationId);
    if (!operation) throw new Error('Operation not found.');
    if (operation.userId !== userId) throw new Error('User mismatch. Cannot reject this operation.');
    if (operation.status !== 'pending') throw new Error(`Operation is not pending (status: ${operation.status}).`);

    operation.status = 'rejected';
    operation.metadata.rejectionReason = reason;
    console.log(`MCP: Operation rejected - User: ${userId}, OpID: ${operationId.substring(0, 8)}..., Reason: ${reason || 'None given'}`);
    // Optionally remove from pendingOperations after a delay or keep for audit
    // setTimeout(() => pendingOperations.delete(operationId), 60000);
    return { success: true, message: `Operation ${operationId} rejected.`, operationId };
}

// Cleanup interval for expired contexts (optional)
setInterval(() => {
    const now = Date.now();
    for (const [token, context] of activeContexts.entries()) {
        if (now > context.expiresAt) {
            activeContexts.delete(token);
            console.log(`MCP: Cleaned up expired context token: ${token.substring(0, 8)}...`);
        }
    }
    // Could also clean up very old completed/rejected operations here
}, 60 * 60 * 1000); // Check every hour

// Create a default export with all the functions
export default {
    registerContext,
    validateContext,
    listFiles,
    readFile,
    requestWriteFile,
    requestDeleteFile,
    requestCreateDirectory,
    getUserPendingOperations,
    approveOperation,
    rejectOperation
};