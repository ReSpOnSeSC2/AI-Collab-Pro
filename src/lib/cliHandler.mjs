/**
 * CLI Command Handler
 * Executes system commands and AI-assisted utility commands.
 * Version: 8.0.0
 */

import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
// Temporarily remove AI imports until those modules are ready
// import { clients, availability } from './ai/index.mjs';

// --- Configuration ---
// Determine a safe default path. Use an environment variable or fallback.
const DEFAULT_PROJECT_PATH = process.env.DEFAULT_PROJECT_PATH || path.resolve(process.cwd()); // Default to server's CWD
console.log(`CLI Handler: Default execution path set to ${DEFAULT_PROJECT_PATH}`);

// --- Main Handler Function ---

/**
 * Handles incoming CLI commands from WebSocket or API.
 *
 * @param {string} command - The full command string entered by the user.
 * @param {string} userId - The ID of the user executing the command (for context/logging).
 * @param {function(string): void} onOutput - Callback for standard output/error chunks.
 * @param {function(string, number): void} onComplete - Callback when command finishes (final output chunk, exit code).
 * @param {function(Error): void} onError - Callback for critical execution errors.
 */
export async function handleCliCommand(command, userId, onOutput, onComplete, onError) {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
        onComplete("No command entered.\n", 0);
        return;
    }

    console.log(`CLI Handler: User ${userId} executing command: "${trimmedCommand}"`);
    onOutput(`Executing: ${trimmedCommand}\n`); // Echo command back

    const commandParts = trimmedCommand.split(/\s+/); // Split by whitespace
    const mainCommand = commandParts[0].toLowerCase();

    try {
        // Check for AI-assisted commands first
        if (mainCommand === 'claude' || mainCommand === 'ai') { // Allow 'ai' as alias
            // Simplified AI command handling for demo version
            if (commandParts[1]?.toLowerCase() === 'help') {
                onOutput(getAiHelpText('Demo'));
                onComplete('', 0);
            } else {
                onOutput("AI functionality is coming soon. Try 'ai help' for more information.\n");
                onComplete('', 0);
            }
        }
        // Check for potentially unsafe commands (add more as needed)
        else if (isPotentiallyUnsafe(mainCommand, commandParts.slice(1))) {
             throw new Error(`Command "${mainCommand}" is restricted for security reasons.`);
        }
        // Execute as a system command
        else {
            await executeSystemCommand(trimmedCommand, DEFAULT_PROJECT_PATH, onOutput, onComplete);
        }
    } catch (error) {
        console.error(`CLI Handler Error (User: ${userId}, Command: "${trimmedCommand}"):`, error);
        onError(error); // Report critical error
        onComplete(`Error: ${error.message}\n`, 1); // Ensure completion is called
    }
}

// --- AI Utility Command Handler ---

async function handleAiUtilCommand(args, userId, onOutput, onComplete, onError) {
    const subCommand = args[0]?.toLowerCase();
    const subArgs = args.slice(1);

    // Check which AI is available for utility tasks (prioritize Claude/Opus if available)
    let aiProvider = null;
    let aiClient = null;
    let aiModel = null;

    if (availability.claude && clients.anthropic) {
        aiProvider = 'Claude';
        aiClient = clients.anthropic;
        aiModel = 'claude-3-opus-20240229'; // Use Opus for complex tasks
    } else if (availability.chatgpt && clients.openai) {
        aiProvider = 'ChatGPT';
        aiClient = clients.openai;
        aiModel = 'gpt-4o'; // Use a capable OpenAI model
    } else if (availability.gemini && clients.gemini) {
        // Gemini requires slightly different handling (no direct message creation like others)
        // For simplicity, we might skip Gemini for complex file tasks or implement specific logic
        onOutput("Note: AI file utilities currently prioritize Claude/ChatGPT. Gemini support is limited for these tasks.\n");
        // Fall through or handle specific Gemini commands if implemented
    }
    // Add other providers if they have suitable models

    if (!aiProvider) {
        throw new Error("No suitable AI available (Claude Opus or GPT-4o preferred) for utility commands.");
    }

    onOutput(`Using ${aiProvider} (${aiModel}) for command: ${subCommand}\n`);

    try {
        switch (subCommand) {
            case 'help':
                onComplete(getAiHelpText(aiProvider), 0);
                break;
            case 'explain':
            case 'fix':
            case 'analyze':
            case 'test':
                if (subArgs.length === 0) throw new Error(`Usage: ai ${subCommand} <file_path>`);
                // IMPORTANT: Resolve path securely within allowed project directory
                const filePath = resolveSecureCliPath(DEFAULT_PROJECT_PATH, subArgs[0]);
                await processFileWithAi(aiProvider, aiClient, aiModel, subCommand, filePath, onOutput, onComplete);
                break;
            case 'create':
                if (subArgs.length < 2) throw new Error(`Usage: ai create <file_path> <description>`);
                const createFilePath = resolveSecureCliPath(DEFAULT_PROJECT_PATH, subArgs[0]);
                const description = subArgs.slice(1).join(' ');
                await createFileWithAi(aiProvider, aiClient, aiModel, createFilePath, description, onOutput, onComplete);
                break;
            // Add 'chat' command if desired, similar to original server.js
            case 'chat':
                 if (subArgs.length === 0) throw new Error(`Usage: ai chat <message>`);
                 const chatMessage = subArgs.join(' ');
                 await chatWithAi(aiProvider, aiClient, aiModel, chatMessage, onOutput, onComplete);
                 break;
            default:
                throw new Error(`Unknown AI command: '${subCommand}'. Try 'ai help'.`);
        }
    } catch (error) {
        // Catch errors from AI processing and report them
        onError(error); // Report to main handler
        onComplete(`AI Command Error: ${error.message}\n`, 1); // Send completion with error
    }
}

function getAiHelpText(aiProviderName) {
    return `AI CLI Utilities (using ${aiProviderName}):\n\n` +
           `  ai help                       Show this help message\n` +
           `  ai explain <file>             Explain code in the specified file\n` +
           `  ai fix <file>                 Attempt to fix bugs (overwrites original, creates backup)\n` +
           `  ai create <file> <desc>       Create a new file with content based on description\n` +
           `  ai analyze <file>             Provide analysis of the code in the file\n` +
           `  ai test <file>                Generate unit tests for the code in the file\n` +
           `  ai chat <message>             Chat directly with the AI\n\n` +
           `Notes:\n` +
           `- File paths are relative to the project directory (${DEFAULT_PROJECT_PATH}).\n` +
           `- Ensure the relevant AI API key is configured.\n`;
}

/**
 * Securely resolves a path provided via CLI relative to the allowed base path.
 * Prevents accessing files outside the intended project directory.
 * @param {string} basePath - The allowed base directory (e.g., DEFAULT_PROJECT_PATH).
 * @param {string} relativePath - The path provided by the user.
 * @returns {string} The resolved, validated absolute path.
 * @throws {Error} If the path is invalid or outside the base path.
 */
function resolveSecureCliPath(basePath, relativePath) {
    const resolvedPath = path.resolve(basePath, relativePath);
    if (!resolvedPath.startsWith(basePath)) {
        throw new Error(`Access denied: Path "${relativePath}" is outside the allowed project directory.`);
    }
    // Add checks for potentially dangerous characters if needed
    if (/[<>:"|?*]/.test(relativePath)) {
        throw new Error(`Invalid characters in path: "${relativePath}"`);
    }
    return resolvedPath;
}


async function processFileWithAi(aiProvider, aiClient, aiModel, action, filePath, onOutput, onComplete) {
    onOutput(`Reading file: ${path.relative(DEFAULT_PROJECT_PATH, filePath)}...\n`);
    let fileContent;
    try {
        fileContent = await fs.readFile(filePath, 'utf8');
    } catch (readError) {
        throw new Error(readError.code === 'ENOENT' ? `File not found: ${filePath}` : `Failed to read file: ${readError.message}`);
    }

    let prompt = '';
    let taskDescription = '';
    let requiresCodeOutputOnly = false;

    switch (action) {
        case 'explain':
            taskDescription = 'Explaining code';
            prompt = `Please explain this code file concisely and clearly:\n\nPath: ${filePath}\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nFocus on purpose, key components, logic, and potential issues.`;
            break;
        case 'fix':
            taskDescription = 'Attempting to fix code';
            prompt = `Please fix any bugs or issues in this code file:\n\nPath: ${filePath}\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nReturn ONLY the fixed version of the code within a single code block (e.g., \`\`\`language\n...\n\`\`\`). Do not include explanations or comments about the changes outside the code block.`;
            requiresCodeOutputOnly = true;
            break;
        case 'analyze':
            taskDescription = 'Analyzing code';
            prompt = `Analyze the following code for quality, potential issues, complexity, and adherence to best practices:\n\nPath: ${filePath}\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nProvide a structured analysis.`;
            break;
        case 'test':
            taskDescription = 'Generating tests';
            prompt = `Generate relevant unit tests for the following code. Choose an appropriate testing framework based on the language (e.g., pytest for Python, Jest for JS/TS). Provide ONLY the test code within a single code block (e.g., \`\`\`language\n...\n\`\`\`). Do not include explanations.`;
            requiresCodeOutputOnly = true;
            break;
        default: throw new Error(`Invalid action: ${action}`);
    }

    onOutput(`${taskDescription} for ${path.basename(filePath)} using ${aiProvider}...\n`);

    try {
        let resultText = '';
        if (aiProvider === 'Claude') {
            const response = await aiClient.messages.create({ model: aiModel, max_tokens: 4096, messages: [{ role: "user", content: prompt }] });
            resultText = response.content[0]?.text?.trim() || '';
        } else if (aiProvider === 'ChatGPT') {
            const response = await aiClient.chat.completions.create({ model: aiModel, messages: [{ role: "user", content: prompt }], max_tokens: 4096 });
            resultText = response.choices[0]?.message?.content?.trim() || '';
        } else {
            throw new Error(`AI provider ${aiProvider} not fully supported for file processing yet.`);
        }

        if (requiresCodeOutputOnly) {
            // Extract content within the first code block found
            const codeBlockMatch = resultText.match(/```(?:\w*\n)?([\s\S]*?)\n?```/);
            resultText = codeBlockMatch ? codeBlockMatch[1].trim() : resultText; // Fallback to full text if no block found
        }

        if (action === 'fix') {
            const backupPath = `${filePath}.${Date.now()}.backup`;
            await fs.copyFile(filePath, backupPath);
            await fs.writeFile(filePath, resultText, 'utf8');
            onComplete(`Original file backed up to ${path.basename(backupPath)}\nFixed code written to ${path.relative(DEFAULT_PROJECT_PATH, filePath)}\n`, 0);
        } else {
            onComplete(`\n--- ${aiProvider}'s ${action} for ${path.basename(filePath)} ---\n${resultText}\n`, 0);
        }
    } catch (apiError) {
        throw new Error(`${aiProvider} API error during ${action}: ${apiError.message}`);
    }
}

async function createFileWithAi(aiProvider, aiClient, aiModel, filePath, description, onOutput, onComplete) {
    try {
        await fs.access(filePath);
        // File exists
        throw new Error(`File already exists: ${path.relative(DEFAULT_PROJECT_PATH, filePath)}. Cannot create.`);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err; // Re-throw if it's not "file not found"
    }

    const dir = path.dirname(filePath);
    try { await fs.mkdir(dir, { recursive: true }); }
    catch (dirError) { throw new Error(`Failed to create directory ${path.relative(DEFAULT_PROJECT_PATH, dir)}: ${dirError.message}`); }

    onOutput(`Generating content for ${path.basename(filePath)} using ${aiProvider} based on: "${description}"...\n`);
    const prompt = `Create the content for a file named '${path.basename(filePath)}'.
Description/Requirements: ${description}
Generate ONLY the raw file content. Do not include any explanations, comments about the code, or code fences like \`\`\`.`;

    try {
        let fileContent = '';
         if (aiProvider === 'Claude') {
            const response = await aiClient.messages.create({ model: aiModel, max_tokens: 4096, messages: [{ role: "user", content: prompt }] });
            fileContent = response.content[0]?.text?.trim() || '';
        } else if (aiProvider === 'ChatGPT') {
            const response = await aiClient.chat.completions.create({ model: aiModel, messages: [{ role: "user", content: prompt }], max_tokens: 4096 });
            fileContent = response.choices[0]?.message?.content?.trim() || '';
        } else {
            throw new Error(`AI provider ${aiProvider} not fully supported for file creation yet.`);
        }

        // Basic check if AI refused or returned empty
        if (!fileContent || fileContent.length < 5) {
             throw new Error(`${aiProvider} did not generate sufficient content based on the description.`);
        }

        await fs.writeFile(filePath, fileContent, 'utf8');
        onComplete(`File created successfully: ${path.relative(DEFAULT_PROJECT_PATH, filePath)}\nContent preview:\n${fileContent.substring(0, 200)}${fileContent.length > 200 ? '...' : ''}\n`, 0);
    } catch (apiError) {
        throw new Error(`${aiProvider} API error during file creation: ${apiError.message}`);
    }
}

async function chatWithAi(aiProvider, aiClient, aiModel, message, onOutput, onComplete) {
    onOutput(`Asking ${aiProvider}: "${message}"...\n`);
    try {
        let resultText = '';
         if (aiProvider === 'Claude') {
            const response = await aiClient.messages.create({ model: aiModel, max_tokens: 4096, messages: [{ role: "user", content: message }] });
            resultText = response.content[0]?.text?.trim() || '';
        } else if (aiProvider === 'ChatGPT') {
            const response = await aiClient.chat.completions.create({ model: aiModel, messages: [{ role: "user", content: message }], max_tokens: 4096 });
            resultText = response.choices[0]?.message?.content?.trim() || '';
        } else {
            throw new Error(`AI provider ${aiProvider} not fully supported for direct chat yet.`);
        }
        onComplete(`\n--- ${aiProvider}'s Response ---\n${resultText}\n`, 0);
    } catch (apiError) {
         throw new Error(`${aiProvider} API error during chat: ${apiError.message}`);
    }
}


// --- System Command Execution ---

/**
 * Executes a system command safely.
 * @param {string} command - The command string to execute.
 * @param {string} cwd - The current working directory for execution.
 * @param {function(string): void} onOutput - Callback for stdout/stderr chunks.
 * @param {function(string, number): void} onComplete - Callback when command finishes.
 * @returns {Promise<void>}
 */
function executeSystemCommand(command, cwd, onOutput, onComplete) {
    return new Promise((resolve, reject) => {
        const options = {
            shell: true, // Use shell for convenience (e.g., pipes, redirects) - be cautious!
            cwd: cwd,
            env: { ...process.env }, // Inherit environment
            windowsHide: true,
        };

        const childProcess = exec(command, options);
        let finalOutput = '';

        childProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            finalOutput += output;
            onOutput(output);
        });

        childProcess.stderr?.on('data', (data) => {
            const output = data.toString();
            finalOutput += output; // Include stderr in final output for completion callback
            onOutput(`STDERR: ${output}`); // Distinguish stderr in stream
        });

        childProcess.on('close', (code) => {
            const exitMessage = `Command finished with exit code ${code}\n`;
            finalOutput += exitMessage;
            onComplete(exitMessage, code ?? 1); // Pass final message chunk and code
            resolve();
        });

        childProcess.on('error', (error) => {
            console.error(`CLI Execution Error (Command: "${command}"):`, error);
            const errorMessage = `Error executing command: ${error.message}\n`;
            finalOutput += errorMessage;
            onComplete(errorMessage, 1); // Pass error message and non-zero code
            reject(error); // Reject the promise on critical execution error
        });
    });
}

/**
 * Checks if a command is potentially unsafe to execute directly.
 * This is a basic blocklist, not exhaustive security.
 * @param {string} commandName - The main command (e.g., 'rm').
 * @param {string[]} args - The arguments.
 * @returns {boolean} True if potentially unsafe, false otherwise.
 */
function isPotentiallyUnsafe(commandName, args) {
    const unsafeCommands = ['rm', 'sudo', 'su', 'shutdown', 'reboot', 'mkfs', 'dd', 'userdel', 'groupdel'];
    if (unsafeCommands.includes(commandName)) {
        return true;
    }
    // Add checks for dangerous argument patterns if needed (e.g., 'rm -rf /')
    if (commandName === 'rm' && args.includes('-rf') && (args.includes('/') || args.includes('/*'))) {
        return true;
    }
    return false;
}