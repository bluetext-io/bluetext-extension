import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Global panel reference for terminal output
let wizardPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Bluetext Setup Assistant is now active');

    // Register all commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bluetext.setupWizard', setupWizard),
        vscode.commands.registerCommand('bluetext.createPolytopeYml', createPolytopeYml),
        vscode.commands.registerCommand('bluetext.configureCline', configureCline),
        vscode.commands.registerCommand('bluetext.configureClaudeCode', configureClaudeCode),
        vscode.commands.registerCommand('bluetext.initGit', initGit),
        vscode.commands.registerCommand('bluetext.startMCP', startMCP),
        vscode.commands.registerCommand('bluetext.clearTerminal', clearTerminal)
    );
}

// Helper function to send terminal output to the webview
function logToTerminal(message: string, type: 'info' | 'success' | 'error' | 'command' = 'info') {
    if (wizardPanel) {
        wizardPanel.webview.postMessage({
            command: 'terminalOutput',
            message: message,
            type: type,
            timestamp: new Date().toLocaleTimeString()
        });
    }
}

// Clear terminal command
async function clearTerminal() {
    if (wizardPanel) {
        wizardPanel.webview.postMessage({
            command: 'clearTerminal'
        });
    }
}

async function setupWizard() {
    // Clean up any existing panel
    if (wizardPanel) {
        wizardPanel.dispose();
    }

    wizardPanel = vscode.window.createWebviewPanel(
        'bluetextSetup',
        'Bluetext Setup Wizard',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    wizardPanel.webview.html = getWizardHtml();

    // Clean up the reference when panel is disposed
    wizardPanel.onDidDispose(() => {
        wizardPanel = undefined;
    });

    // Handle messages from the webview
    wizardPanel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'initGit':
                    await initGit();
                    break;
                case 'createPolytopeYml':
                    await createPolytopeYml();
                    break;
                case 'configureCline':
                    await configureCline();
                    break;
                case 'configureClaudeCode':
                    await configureClaudeCode();
                    break;
                case 'startMCP':
                    await startMCP();
                    break;
                case 'quickStart':
                    await runQuickStart(message.agentChoice);
                    break;
                case 'clearTerminal':
                    // Already handled via global command
                    break;
            }
        },
        undefined,
        []
    );

    // Send welcome message to terminal
    logToTerminal('Bluetext Setup Wizard initialized', 'info');
    logToTerminal('Click any setup button to begin', 'info');
}

async function createPolytopeYml(skipPrompt: boolean = false): Promise<boolean> {
    logToTerminal('Creating polytope.yml...', 'command');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const errorMsg = 'Please open a workspace folder first';
        vscode.window.showErrorMessage(errorMsg);
        logToTerminal(errorMsg, 'error');
        return false;
    }

    const polytopeYmlPath = path.join(workspaceFolder.uri.fsPath, 'polytope.yml');
    const polytopeContent = `include:
  - repo: gh:bluetext-io/bluetext
`;

    // Check if file already exists
    if (fs.existsSync(polytopeYmlPath)) {
        // Check if existing file has the correct content
        try {
            const existingContent = fs.readFileSync(polytopeYmlPath, 'utf8').trim();
            const requiredContent = polytopeContent.trim();
            
            if (existingContent === requiredContent) {
                logToTerminal('polytope.yml already exists with correct configuration', 'success');
                return true; // File exists with correct config
            }
        } catch (error) {
            logToTerminal(`Error reading existing polytope.yml: ${error}`, 'error');
        }
        
        // File exists but has different content
        if (skipPrompt) {
            logToTerminal('polytope.yml exists with different content, skipping...', 'info');
            return true; // Don't fail the quick start
        }
        
        logToTerminal('polytope.yml already exists', 'info');
        const overwrite = await vscode.window.showWarningMessage(
            'polytope.yml already exists. Do you want to overwrite it?',
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            logToTerminal('Operation cancelled by user', 'info');
            return false;
        }
    }

    try {
        fs.writeFileSync(polytopeYmlPath, polytopeContent, 'utf8');
        const successMsg = 'polytope.yml created successfully!';
        logToTerminal(successMsg, 'success');
        logToTerminal(`File location: ${polytopeYmlPath}`, 'info');
        
        // Open the file only if not in skip prompt mode
        if (!skipPrompt) {
            const document = await vscode.workspace.openTextDocument(polytopeYmlPath);
            await vscode.window.showTextDocument(document);
        }
        return true;
    } catch (error) {
        const errorMsg = `Failed to create polytope.yml: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        logToTerminal(errorMsg, 'error');
        return false;
    }
}

async function configureCline() {
    logToTerminal('Configuring Cline MCP settings...', 'command');
    
    const config = vscode.workspace.getConfiguration('bluetext');
    const mcpPort = config.get<number>('mcpPort', 31338);

    // Check for code-server path first
    const codeServerPath = '/root/.local/share/code-server/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json';
    let clineSettingsPath: string;

    if (fs.existsSync(path.dirname(codeServerPath))) {
        clineSettingsPath = codeServerPath;
        logToTerminal('Detected code-server environment', 'info');
    } else {
        // Get Cline MCP settings path - works for both VSCode and VSCodium
        const appData = process.env.APPDATA || 
                        (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : 
                         path.join(os.homedir(), '.config'));
        
        // Detect if using VSCodium or VSCode
        const editorName = vscode.env.appName.toLowerCase().includes('vscodium') ? 'VSCodium' : 'Code';
        
        clineSettingsPath = path.join(
            appData,
            editorName,
            'User',
            'globalStorage',
            'saoudrizwan.claude-dev',
            'settings',
            'cline_mcp_settings.json'
        );
    }

    logToTerminal(`Settings path: ${clineSettingsPath}`, 'info');

    try {
        // Ensure directory exists
        const settingsDir = path.dirname(clineSettingsPath);
        if (!fs.existsSync(settingsDir)) {
            logToTerminal('Creating settings directory...', 'info');
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        // Read existing config or create new one
        let config: any = { mcpServers: {} };
        if (fs.existsSync(clineSettingsPath)) {
            logToTerminal('Reading existing Cline settings...', 'info');
            try {
                const existingContent = fs.readFileSync(clineSettingsPath, 'utf8');
                if (existingContent.trim()) {
                    config = JSON.parse(existingContent);
                } else {
                    logToTerminal('Existing file is empty, creating new config...', 'info');
                }
            } catch (parseError) {
                logToTerminal('Existing file has invalid JSON, creating new config...', 'info');
            }
        } else {
            logToTerminal('Creating new Cline settings file...', 'info');
        }

        // Add or update polytope server config
        config.mcpServers = config.mcpServers || {};
        config.mcpServers.polytope = {
            type: "streamableHttp",
            url: `http://localhost:${mcpPort}/mcp`,
            alwaysAllow: [],
            disabled: false
        };

        logToTerminal(`Configuring polytope server at http://localhost:${mcpPort}/mcp`, 'info');

        // Write updated config
        fs.writeFileSync(clineSettingsPath, JSON.stringify(config, null, 2), 'utf8');
        
        const successMsg = 'Cline MCP settings configured successfully!';
        logToTerminal(successMsg, 'success');
    } catch (error) {
        const errorMsg = `Failed to configure Cline: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        logToTerminal(errorMsg, 'error');
    }
}

async function configureClaudeCode() {
    logToTerminal('Configuring Claude Code MCP...', 'command');
    
    const config = vscode.workspace.getConfiguration('bluetext');
    const mcpPort = config.get<number>('mcpPort', 31338);

    const command = `claude mcp add polytope-mcp http://localhost:${mcpPort}/mcp`;
    logToTerminal(`Executing: ${command}`, 'info');

    const terminal = vscode.window.createTerminal('Bluetext - Claude Code Setup');
    terminal.show();
    terminal.sendText(command);
    
    const msg = 'Claude Code MCP configuration command executed. Check the terminal for results.';
    logToTerminal(msg, 'success');
}

async function initGit() {
    logToTerminal('Initializing Git repository...', 'command');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const errorMsg = 'Please open a workspace folder first';
        vscode.window.showErrorMessage(errorMsg);
        logToTerminal(errorMsg, 'error');
        return;
    }

    const gitPath = path.join(workspaceFolder.uri.fsPath, '.git');
    
    // Check if git is already initialized
    if (fs.existsSync(gitPath)) {
        const msg = 'Git repository already initialized';
        logToTerminal(msg, 'info');
        return;
    }

    logToTerminal('Executing: git init', 'info');
    const terminal = vscode.window.createTerminal('Bluetext - Git Init');
    terminal.show();
    terminal.sendText('git init');
    
    const successMsg = 'Git repository initialized!';
    logToTerminal(successMsg, 'success');
}

async function startMCP() {
    logToTerminal('Starting MCP server...', 'command');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const errorMsg = 'Please open a workspace folder first';
        vscode.window.showErrorMessage(errorMsg);
        logToTerminal(errorMsg, 'error');
        return;
    }

    const polytopeYmlPath = path.join(workspaceFolder.uri.fsPath, 'polytope.yml');
    if (!fs.existsSync(polytopeYmlPath)) {
        logToTerminal('polytope.yml not found', 'error');
        const create = await vscode.window.showErrorMessage(
            'polytope.yml not found. Would you like to create it?',
            'Yes', 'No'
        );
        if (create === 'Yes') {
            await createPolytopeYml();
        } else {
            logToTerminal('Operation cancelled', 'info');
            return;
        }
    }

    logToTerminal('Executing: pt run --mcp', 'info');
    logToTerminal(`Working directory: ${workspaceFolder.uri.fsPath}`, 'info');
    
    const terminal = vscode.window.createTerminal({
        name: 'Bluetext - MCP Server',
        cwd: workspaceFolder.uri.fsPath
    });
    terminal.show();
    terminal.sendText('pt run --mcp');
    
    const msg = 'MCP server starting... Check terminal for output. Server will run on http://localhost:31338';
    logToTerminal(msg, 'success');
}

// Helper function to update step status in the UI
function updateStepStatus(stepNumber: number, status: 'pending' | 'doing' | 'done' | 'error') {
    if (wizardPanel) {
        wizardPanel.webview.postMessage({
            command: 'updateStepStatus',
            stepNumber: stepNumber,
            status: status
        });
    }
}

// Quick Start function that runs all steps in sequence
async function runQuickStart(agentChoice: 'cline' | 'claude') {
    logToTerminal('='.repeat(50), 'info');
    logToTerminal('Starting Quick Setup...', 'command');
    logToTerminal('='.repeat(50), 'info');
    
    // Step 1: Initialize Git
    updateStepStatus(1, 'doing');
    logToTerminal('\n📦 Step 1/4: Initializing Git repository...', 'command');
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const gitPath = path.join(workspaceFolder.uri.fsPath, '.git');
            if (!fs.existsSync(gitPath)) {
                await initGit();
                await new Promise(resolve => setTimeout(resolve, 1000)); // Give time for git init
            } else {
                logToTerminal('Git already initialized, skipping...', 'info');
            }
        }
        updateStepStatus(1, 'done');
    } catch (error) {
        logToTerminal(`Git initialization failed: ${error}`, 'error');
        updateStepStatus(1, 'error');
    }
    
    // Step 2: Create polytope.yml
    updateStepStatus(2, 'doing');
    logToTerminal('\n📄 Step 2/4: Creating polytope.yml...', 'command');
    try {
        const success = await createPolytopeYml(true); // Skip prompts during quick start
        await new Promise(resolve => setTimeout(resolve, 500));
        if (success) {
            updateStepStatus(2, 'done');
        } else {
            updateStepStatus(2, 'error');
            return; // Stop if this critical step fails
        }
    } catch (error) {
        logToTerminal(`Failed to create polytope.yml: ${error}`, 'error');
        updateStepStatus(2, 'error');
        return; // Stop if this critical step fails
    }
    
    // Step 3: Configure Agent
    updateStepStatus(3, 'doing');
    logToTerminal(`\n⚙️  Step 3/4: Configuring ${agentChoice === 'cline' ? 'Cline' : 'Claude Code'}...`, 'command');
    try {
        if (agentChoice === 'cline') {
            await configureCline();
        } else {
            await configureClaudeCode();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        updateStepStatus(3, 'done');
    } catch (error) {
        logToTerminal(`Agent configuration failed: ${error}`, 'error');
        updateStepStatus(3, 'error');
    }
    
    // Step 4: Start MCP Server
    updateStepStatus(4, 'doing');
    logToTerminal('\n⚡ Step 4/4: Starting MCP server...', 'command');
    try {
        await startMCP();
        await new Promise(resolve => setTimeout(resolve, 1000));
        updateStepStatus(4, 'done');
    } catch (error) {
        logToTerminal(`Failed to start MCP server: ${error}`, 'error');
        updateStepStatus(4, 'error');
    }
    
    logToTerminal('\n' + '='.repeat(50), 'info');
    logToTerminal('✅ Quick Setup Complete!', 'success');
    logToTerminal('='.repeat(50), 'info');
    logToTerminal('\nYou can now start using Bluetext tools with your coding agent!', 'info');
}

function getWizardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bluetext Setup Wizard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html, body {
            height: 100%;
            overflow: hidden;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #1e3c72;
            color: #333;
            display: flex;
            flex-direction: column;
        }
        /* Split panel layout */
        .main-layout {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        .wizard-panel {
            flex: 1;
            overflow-y: auto;
            background: #1e3c72;
            background-image: 
                linear-gradient(rgba(42, 82, 152, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(42, 82, 152, 0.03) 1px, transparent 1px),
                linear-gradient(rgba(42, 82, 152, 0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(42, 82, 152, 0.02) 1px, transparent 1px),
                repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255, 255, 255, 0.02) 35px, rgba(255, 255, 255, 0.02) 70px);
            background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px, 100px 100px;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
        }
        
        /* Single unified card */
        .unified-card {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
            margin-bottom: 20px;
        }
        
        /* Header section - left aligned */
        .header {
            margin-bottom: 25px;
            padding-bottom: 25px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        h1 {
            color: #1e3c72;
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
            text-align: left;
        }
        
        .subtitle {
            color: #5a6c7d;
            font-size: 13px;
            line-height: 1.6;
            text-align: left;
        }
        
        /* Progress line container */
        .steps-container {
            position: relative;
            padding-left: 20px;
        }
        
        /* Vertical progress line */
        .steps-container::before {
            content: '';
            position: absolute;
            left: 34.5px;
            top: 20px;
            bottom: 20px;
            width: 3px;
            background: linear-gradient(to bottom, 
                var(--line-color-1, #f0f0f0) 0%, 
                var(--line-color-1, #f0f0f0) 25%,
                var(--line-color-2, #f0f0f0) 25%,
                var(--line-color-2, #f0f0f0) 50%,
                var(--line-color-3, #f0f0f0) 50%,
                var(--line-color-3, #f0f0f0) 75%,
                var(--line-color-4, #f0f0f0) 75%,
                var(--line-color-4, #f0f0f0) 100%
            );
            border-radius: 2px;
            z-index: 0;
        }
        
        .step {
            padding: 8px 0;
            display: flex;
            align-items: center;
            gap: 20px;
            position: relative;
            z-index: 1;
        }
        
        .step:not(:last-child) {
            margin-bottom: 4px;
            padding-bottom: 12px;
            position: relative;
        }
        
        .step-number-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        
        .step-number {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            min-width: 32px;
            background: #6c757d;
            color: white;
            border-radius: 50%;
            font-weight: 700;
            font-size: 14px;
            flex-shrink: 0;
            position: relative;
            z-index: 2;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transition: all 0.3s ease;
        }
        
        .step-content {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .step-text {
            flex: 1;
            color: #1e3c72;
            font-size: 14px;
            font-weight: 500;
            line-height: 1.5;
        }
        
        .step-actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }
        
        button {
            background: #1e3c72;
            color: white;
            border: none;
            padding: 8px 20px;
            cursor: pointer;
            border-radius: 5px;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s ease;
            box-shadow: 0 2px 6px rgba(42, 82, 152, 0.25);
            white-space: nowrap;
        }
        button:hover {
            background: #2a5298;
            transform: translateY(-1px);
            box-shadow: 0 3px 10px rgba(42, 82, 152, 0.35);
        }
        button:active {
            transform: translateY(0);
        }
        .docs-section {
            margin-top: 25px;
            padding-top: 25px;
            border-top: 2px solid #f0f0f0;
        }
        .docs-section h2 {
            color: #1e3c72;
            font-size: 18px;
            margin-bottom: 15px;
            font-weight: 600;
        }
        .docs-section ul {
            list-style: none;
            padding: 0;
        }
        .docs-section li {
            margin: 12px 0;
            padding-left: 25px;
            position: relative;
        }
        .docs-section li:before {
            content: "→";
            position: absolute;
            left: 0;
            color: #2a5298;
            font-weight: bold;
        }
        .docs-section a {
            color: #2a5298;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.2s ease;
        }
        .docs-section a:hover {
            color: #1e3c72;
            text-decoration: underline;
        }
        /* Quick Start Header (outside card) */
        .quick-start-header-section {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
            gap: 20px;
        }
        
        .quick-start-text {
            flex: 1;
        }
        
        .quick-start-title {
            color: #1e3c72;
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 4px;
            letter-spacing: -0.5px;
        }
        
        .quick-start-subtitle {
            color: #5a6c7d;
            font-size: 13px;
            line-height: 1.6;
        }
        
        /* Agent Selection Card */
        .agent-card {
            background: #f3f4f5;
            padding: 16px 20px;
            border-radius: 6px;
            border-left: 4px solid #2a5298;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .agent-card h3 {
            color: #1e3c72;
            font-size: 15px;
            font-weight: 600;
            margin: 0;
            white-space: nowrap;
        }
        
        /* Warning message for agent change */
        .agent-warning {
            display: none;
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 4px;
            padding: 12px 16px;
            margin-top: 12px;
            font-size: 13px;
            color: #856404;
            line-height: 1.5;
        }
        
        .agent-warning.show {
            display: block;
        }
        
        .agent-warning strong {
            color: #664d03;
        }
        
        .agent-selection {
            display: flex;
            gap: 20px;
            flex: 1;
        }
        
        .agent-selection label {
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            color: #333;
            white-space: nowrap;
        }
        
        .agent-selection input[type="radio"] {
            cursor: pointer;
            width: 16px;
            height: 16px;
        }
        
        .quick-start-btn {
            background: #1e3c72;
            color: white;
            font-size: 13px;
            padding: 8px 20px;
            font-weight: 600;
            border: none;
            cursor: pointer;
            border-radius: 5px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 6px rgba(42, 82, 152, 0.25);
            white-space: nowrap;
        }
        
        .quick-start-btn:hover {
            background: #2a5298;
            transform: translateY(-1px);
            box-shadow: 0 3px 10px rgba(42, 82, 152, 0.35);
        }
        
        .quick-start-btn:active {
            transform: translateY(0);
        }
        
        /* Status indicator colors */
        .step-number.pending {
            background: #6c757d;
        }
        
        .step-number.doing {
            background: #ffa500;
            animation: pulse 1.5s ease-in-out infinite;
            box-shadow: 0 0 20px rgba(255, 165, 0, 0.5);
        }
        
        .step-number.done {
            background: #28a745;
        }
        
        .step-number.error {
            background: #dc3545;
        }
        
        /* Progress line color updates based on step status */
        .steps-container.step-1-pending {
            --line-color-1: #f0f0f0;
        }
        .steps-container.step-1-doing {
            --line-color-1: #ffa500;
        }
        .steps-container.step-1-done {
            --line-color-1: #28a745;
        }
        .steps-container.step-1-error {
            --line-color-1: #dc3545;
        }
        
        .steps-container.step-2-pending {
            --line-color-2: #f0f0f0;
        }
        .steps-container.step-2-doing {
            --line-color-2: #ffa500;
        }
        .steps-container.step-2-done {
            --line-color-2: #28a745;
        }
        .steps-container.step-2-error {
            --line-color-2: #dc3545;
        }
        
        .steps-container.step-3-pending {
            --line-color-3: #f0f0f0;
        }
        .steps-container.step-3-doing {
            --line-color-3: #ffa500;
        }
        .steps-container.step-3-done {
            --line-color-3: #28a745;
        }
        .steps-container.step-3-error {
            --line-color-3: #dc3545;
        }
        
        .steps-container.step-4-pending {
            --line-color-4: #f0f0f0;
        }
        .steps-container.step-4-doing {
            --line-color-4: #ffa500;
        }
        .steps-container.step-4-done {
            --line-color-4: #28a745;
        }
        .steps-container.step-4-error {
            --line-color-4: #dc3545;
        }
        
        /* Step status styling */
        .step.done button {
            background: #28a745;
        }
        
        .step.done button:hover {
            background: #218838;
        }
        
        @keyframes pulse {
            0%, 100% {
                opacity: 1;
            }
            50% {
                opacity: 0.6;
            }
        }
    </style>
</head>
<body>
    <div class="main-layout">
        <div class="wizard-panel">
            <div class="container">
                <div class="unified-card">
                    <div class="header">
                        <h1>Bluetext Setup Wizard</h1>
                        <p class="subtitle">This wizard will guide you through setting up Bluetext with Polytope for MCP server integration.</p>
                    </div>

                    <div class="quick-start-header-section">
                        <div class="quick-start-text">
                            <h2 class="quick-start-title">Quick Start</h2>
                            <p class="quick-start-subtitle">Runs the steps below</p>
                        </div>
                        <button class="quick-start-btn" onclick="startQuickSetup()">▶ Run Quick Start</button>
                    </div>

                    <div class="agent-card">
                        <h3>Select Agent</h3>
                        <div class="agent-selection">
                            <label>
                                <input type="radio" name="agent" value="cline" checked> Cline
                            </label>
                            <label>
                                <input type="radio" name="agent" value="claude"> Claude Code
                            </label>
                        </div>
                    </div>
                    
                    <div class="agent-warning" id="agent-warning">
                        <strong>⚠️ Agent selection changed!</strong> To apply the new configuration, click the "Configure Agent" button (Step 3) or re-run Quick Start.
                    </div>
                    
                    <div class="steps-container" id="steps-container">
                            <div class="step" data-step="1">
                                <div class="step-number-wrapper">
                                    <span class="step-number pending" id="step-1">1</span>
                                </div>
                                <div class="step-content">
                                    <span class="step-text" id="step-1-title" data-original="Initialize git repository in your project" data-completed="Git repository initialized">Initialize git repository in your project</span>
                                    <div class="step-actions">
                                        <button id="step-1-button" data-original="Initialize" data-completed="✓ Done" onclick="runCommand('initGit')">Initialize</button>
                                    </div>
                                </div>
                            </div>

                            <div class="step" data-step="2">
                                <div class="step-number-wrapper">
                                    <span class="step-number pending" id="step-2">2</span>
                                </div>
                                <div class="step-content">
                                    <span class="step-text" id="step-2-title" data-original="Create polytope.yml configuration file" data-completed="polytope.yml created successfully">Create polytope.yml configuration file</span>
                                    <div class="step-actions">
                                        <button id="step-2-button" data-original="Create File" data-completed="✓ Done" onclick="runCommand('createPolytopeYml')">Create File</button>
                                    </div>
                                </div>
                            </div>

                            <div class="step" data-step="3">
                                <div class="step-number-wrapper">
                                    <span class="step-number pending" id="step-3">3</span>
                                </div>
                                <div class="step-content">
                                    <span class="step-text" id="step-3-title" data-original="Configure Agent" data-completed="Agent configured successfully">Configure Agent</span>
                                    <div class="step-actions">
                                        <button id="step-3-button" data-original-cline="Cline" data-original-claude="Claude" data-completed-cline="✓ Cline" data-completed-claude="✓ Claude" onclick="configureAgent()">Cline</button>
                                    </div>
                                </div>
                            </div>

                            <div class="step" data-step="4">
                                <div class="step-number-wrapper">
                                    <span class="step-number pending" id="step-4">4</span>
                                </div>
                                <div class="step-content">
                                    <span class="step-text" id="step-4-title" data-original="Start MCP server on localhost:31338" data-completed="MCP server started successfully">Start MCP server on localhost:31338</span>
                                    <div class="step-actions">
                                        <button id="step-4-button" data-original="Start Server" data-completed="✓ Running" onclick="runCommand('startMCP')">Start Server</button>
                                    </div>
                                </div>
                        </div>
                    </div>

                    <div class="docs-section">
                        <h2>Documentation</h2>
                        <ul>
                            <li><a href="https://docs.bluetext.io/what-is-bluetext">Bluetext Documentation</a></li>
                            <li><a href="https://polytope.dev/docs">Polytope Documentation</a></li>
                            <li><a href="https://github.com/bluetext-io/bluetext">Bluetext Repository</a></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Track configuration state for each agent separately
        let clineConfigured = false;
        let claudeConfigured = false;
        let lastConfiguredAgent = null;
        
        function runCommand(command) {
            vscode.postMessage({ command: command });
        }

        // Configure Agent - dynamically calls the correct configuration based on radio selection
        function configureAgent() {
            const agentChoice = document.querySelector('input[name="agent"]:checked').value;
            const agentWarning = document.getElementById('agent-warning');
            
            // Update tracking variables
            lastConfiguredAgent = agentChoice;
            
            // Mark the agent as configured
            if (agentChoice === 'cline') {
                clineConfigured = true;
            } else {
                claudeConfigured = true;
            }
            
            // Hide warning when user manually reconfigures
            if (agentWarning) {
                agentWarning.classList.remove('show');
            }
            
            if (agentChoice === 'cline') {
                vscode.postMessage({ command: 'configureCline' });
            } else {
                vscode.postMessage({ command: 'configureClaudeCode' });
            }
        }

        // Quick Start function
        function startQuickSetup() {
            const agentChoice = document.querySelector('input[name="agent"]:checked').value;
            const agentWarning = document.getElementById('agent-warning');
            
            // Update tracking variables
            lastConfiguredAgent = agentChoice;
            
            // Hide warning when Quick Start runs
            if (agentWarning) {
                agentWarning.classList.remove('show');
            }
            
            vscode.postMessage({ 
                command: 'quickStart',
                agentChoice: agentChoice
            });
        }
        
        // Update step 3 button text when agent selection changes
        document.addEventListener('DOMContentLoaded', function() {
            const agentRadios = document.querySelectorAll('input[name="agent"]');
            const step3Button = document.getElementById('step-3-button');
            const agentWarning = document.getElementById('agent-warning');
            
            agentRadios.forEach(radio => {
                radio.addEventListener('change', function() {
                    const selectedAgent = this.value;
                    const agentName = selectedAgent === 'cline' ? 'Cline' : 'Claude';
                    
                    // Check if the selected agent has been configured
                    const isConfigured = selectedAgent === 'cline' ? clineConfigured : claudeConfigured;
                    
                    // Update button text and step state based on agent configuration
                    if (step3Button) {
                        if (isConfigured) {
                            step3Button.textContent = '✓ ' + agentName;
                        } else {
                            step3Button.textContent = agentName;
                        }
                    }
                    
                    // Update step 3 visual state
                    const stepNumber = document.getElementById('step-3');
                    const stepContainer = document.querySelector('.step[data-step="3"]');
                    const stepsContainer = document.getElementById('steps-container');
                    
                    if (stepNumber) {
                        stepNumber.classList.remove('pending', 'doing', 'done', 'error');
                        stepNumber.classList.add(isConfigured ? 'done' : 'pending');
                    }
                    
                    if (stepContainer) {
                        stepContainer.classList.remove('pending', 'doing', 'done', 'error');
                        stepContainer.classList.add(isConfigured ? 'done' : 'pending');
                    }
                    
                    if (stepsContainer) {
                        stepsContainer.classList.remove('step-3-pending', 'step-3-doing', 'step-3-done', 'step-3-error');
                        stepsContainer.classList.add(isConfigured ? 'step-3-done' : 'step-3-pending');
                    }
                    
                    // Show warning if switching to unconfigured agent
                    if (agentWarning && !isConfigured && (clineConfigured || claudeConfigured)) {
                        agentWarning.classList.add('show');
                    } else if (agentWarning) {
                        agentWarning.classList.remove('show');
                    }
                });
            });
        });
        
        // Update step status
        function updateStepStatus(stepNumber, status) {
            const stepElement = document.getElementById('step-' + stepNumber);
            const stepContainer = document.querySelector('.step[data-step="' + stepNumber + '"]');
            const stepsContainer = document.getElementById('steps-container');
            const stepTitle = document.getElementById('step-' + stepNumber + '-title');
            
            // Track when step 3 is completed and mark the configured agent
            if (stepNumber === 3 && status === 'done') {
                const agentChoice = document.querySelector('input[name="agent"]:checked').value;
                if (agentChoice === 'cline') {
                    clineConfigured = true;
                } else {
                    claudeConfigured = true;
                }
            }
            
            if (stepElement) {
                // Remove all status classes from step number
                stepElement.classList.remove('pending', 'doing', 'done', 'error');
                // Add new status class to step number
                stepElement.classList.add(status);
            }
            
            if (stepContainer) {
                // Remove all status classes from step container
                stepContainer.classList.remove('pending', 'doing', 'done', 'error');
                // Add new status class to step container
                stepContainer.classList.add(status);
            }
            
            // Update progress line color for this step
            if (stepsContainer) {
                // Remove previous status for this step
                stepsContainer.classList.remove('step-' + stepNumber + '-pending', 'step-' + stepNumber + '-doing', 'step-' + stepNumber + '-done', 'step-' + stepNumber + '-error');
                // Add new status
                stepsContainer.classList.add('step-' + stepNumber + '-' + status);
            }
            
            if (stepTitle) {
                // Update title text based on status
                if (status === 'done') {
                    stepTitle.textContent = stepTitle.getAttribute('data-completed');
                } else {
                    stepTitle.textContent = stepTitle.getAttribute('data-original');
                }
            }
            
            // Update button text based on status
            if (stepNumber === 3) {
                // Step 3 has a single button that changes based on agent selection
                const button = document.getElementById('step-3-button');
                const agentChoice = document.querySelector('input[name="agent"]:checked').value;
                
                if (button) {
                    if (status === 'done') {
                        button.textContent = button.getAttribute('data-completed-' + agentChoice);
                    } else {
                        button.textContent = button.getAttribute('data-original-' + agentChoice);
                    }
                }
            } else {
                // Other steps have standard single buttons
                const button = document.getElementById('step-' + stepNumber + '-button');
                if (button) {
                    if (status === 'done') {
                        button.textContent = button.getAttribute('data-completed');
                    } else {
                        button.textContent = button.getAttribute('data-original');
                    }
                }
            }
        }
        
        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateStepStatus':
                    updateStepStatus(message.stepNumber, message.status);
                    break;
            }
        });
    </script>
</body>
</html>`;
}

export function deactivate() {}
