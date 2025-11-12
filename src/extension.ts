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
        vscode.window.showInformationMessage(successMsg);
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
        
        vscode.window.showInformationMessage(
            successMsg,
            'Open Settings'
        ).then(selection => {
            if (selection === 'Open Settings') {
                vscode.workspace.openTextDocument(clineSettingsPath).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            }
        });
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
    vscode.window.showInformationMessage(msg);
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
        vscode.window.showInformationMessage(msg);
        logToTerminal(msg, 'info');
        return;
    }

    logToTerminal('Executing: git init', 'info');
    const terminal = vscode.window.createTerminal('Bluetext - Git Init');
    terminal.show();
    terminal.sendText('git init');
    
    const successMsg = 'Git repository initialized!';
    vscode.window.showInformationMessage(successMsg);
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
    vscode.window.showInformationMessage(msg);
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
    logToTerminal('🚀 Starting Quick Setup...', 'command');
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
    logToTerminal('\n🚀 Step 4/4: Starting MCP server...', 'command');
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
        .terminal-panel {
            height: 40vh;
            min-height: 200px;
            max-height: 50vh;
            border-top: 3px solid #2a5298;
            display: flex;
            flex-direction: column;
            background: #1a1a1a;
        }
        .terminal-header {
            background: #2a2a2a;
            color: #e0e0e0;
            padding: 10px 15px;
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #3a3a3a;
        }
        .terminal-title {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .terminal-icon {
            width: 16px;
            height: 16px;
            background: #4a9eff;
            border-radius: 3px;
        }
        .terminal-actions {
            display: flex;
            gap: 8px;
        }
        .terminal-btn {
            background: transparent;
            color: #b0b0b0;
            border: 1px solid #4a4a4a;
            padding: 4px 12px;
            cursor: pointer;
            border-radius: 4px;
            font-size: 12px;
            transition: all 0.2s ease;
        }
        .terminal-btn:hover {
            background: #3a3a3a;
            color: #e0e0e0;
            border-color: #5a5a5a;
        }
        .terminal-output {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            font-family: 'Monaco', 'Menlo', 'Consolas', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.6;
            color: #d4d4d4;
            background: #1e1e1e;
        }
        .terminal-line {
            margin-bottom: 8px;
            display: flex;
            gap: 10px;
        }
        .terminal-timestamp {
            color: #808080;
            flex-shrink: 0;
        }
        .terminal-message {
            flex: 1;
            word-wrap: break-word;
        }
        .terminal-info {
            color: #4a9eff;
        }
        .terminal-success {
            color: #4ec9b0;
        }
        .terminal-error {
            color: #f48771;
        }
        .terminal-command {
            color: #dcdcaa;
            font-weight: 600;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 50px;
            padding: 40px 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        h1 {
            color: #1e3c72;
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 15px;
            letter-spacing: -0.5px;
        }
        .subtitle {
            color: #5a6c7d;
            font-size: 16px;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto;
        }
        .step {
            background: white;
            margin: 25px 0;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 15px rgba(0, 0, 0, 0.08);
            border-left: 5px solid #2a5298;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .step:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
        }
        .step-number {
            display: inline-block;
            width: 35px;
            height: 35px;
            background: #2a5298;
            color: white;
            border-radius: 50%;
            text-align: center;
            line-height: 35px;
            font-weight: 700;
            font-size: 16px;
            margin-right: 12px;
            vertical-align: middle;
        }
        h2 {
            color: #1e3c72;
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 15px;
            display: inline-block;
            vertical-align: middle;
        }
        .info {
            color: #5a6c7d;
            margin: 15px 0 20px 0;
            line-height: 1.6;
            font-size: 15px;
        }
        .code {
            background: #f5f7fa;
            border: 1px solid #e1e8ed;
            padding: 15px;
            border-radius: 6px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            margin: 15px 0 20px 0;
            color: #1e3c72;
            font-size: 14px;
            overflow-x: auto;
        }
        button {
            background: #1e3c72;
            color: white;
            border: none;
            padding: 12px 24px;
            cursor: pointer;
            border-radius: 6px;
            margin-right: 10px;
            font-size: 15px;
            font-weight: 600;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(42, 82, 152, 0.3);
        }
        button:hover {
            background: #2a5298;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(42, 82, 152, 0.4);
        }
        button:active {
            transform: translateY(0);
        }
        .docs-section {
            background: white;
            margin-top: 40px;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 15px rgba(0, 0, 0, 0.08);
        }
        .docs-section h2 {
            color: #1e3c72;
            font-size: 24px;
            margin-bottom: 20px;
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
        
        /* Quick Start Section */
        .quick-start-section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 15px rgba(0, 0, 0, 0.08);
            border-left: 5px solid #2a5298;
            margin-bottom: 30px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        
        .quick-start-section:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
        }
        
        .quick-start-section h2 {
            color: #1e3c72;
            font-size: 24px;
            margin-bottom: 15px;
        }
        
        .quick-start-section .info {
            color: #5a6c7d;
            margin-bottom: 20px;
            line-height: 1.6;
            font-size: 15px;
        }
        
        .agent-selection {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .agent-selection label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            color: #333;
        }
        
        .agent-selection input[type="radio"] {
            cursor: pointer;
            width: 18px;
            height: 18px;
        }
        
        .quick-start-btn {
            background: #1e3c72;
            color: white;
            font-size: 16px;
            padding: 14px 32px;
            font-weight: 700;
            border: none;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(42, 82, 152, 0.3);
        }
        
        .quick-start-btn:hover {
            background: #2a5298;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(42, 82, 152, 0.4);
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
        }
        
        .step-number.done {
            background: #28a745;
        }
        
        .step-number.error {
            background: #dc3545;
        }
        
        /* Step status styling */
        .step.done {
            border-left-color: #28a745;
            box-shadow: 0 2px 15px rgba(40, 167, 69, 0.15);
        }
        
        .step.done h2 {
            color: #28a745;
        }
        
        .step.done button {
            background: #28a745;
        }
        
        .step.done button:hover {
            background: #218838;
        }
        
        .step.done::after {
            content: "✓";
            position: absolute;
            right: 30px;
            top: 30px;
            width: 40px;
            height: 40px;
            background: #28a745;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: bold;
            box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
        }
        
        .step {
            position: relative;
        }
        
        .step.doing {
            border-left-color: #ffa500;
        }
        
        .step.error {
            border-left-color: #dc3545;
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
                <div class="header">
                    <h1>Bluetext Setup Wizard</h1>
                    <p class="subtitle">This wizard will guide you through setting up Bluetext with Polytope for MCP server integration.</p>
                </div>

                <div class="quick-start-section">
                    <h2>🚀 Quick Start</h2>
                    <p class="info">Run all setup steps automatically in sequence:</p>
                    <div class="agent-selection">
                        <label>
                            <input type="radio" name="agent" value="cline" checked> Configure Cline
                        </label>
                        <label>
                            <input type="radio" name="agent" value="claude"> Configure Claude Code
                        </label>
                    </div>
                    <button class="quick-start-btn" onclick="startQuickSetup()">▶ Run Quick Start</button>
                </div>
                
                <div class="step" data-step="1">
                    <span class="step-number" id="step-1">1</span>
                    <h2 id="step-1-title" data-original="Initialize Git Repository" data-completed="Git Initialized">Initialize Git Repository</h2>
                    <p class="info">Initialize a git repository in your project directory (recommended)</p>
                    <button id="step-1-button" data-original="Initialize Git" data-completed="Git Initialized" onclick="runCommand('initGit')">Initialize Git</button>
                </div>

                <div class="step" data-step="2">
                    <span class="step-number" id="step-2">2</span>
                    <h2 id="step-2-title" data-original="Create polytope.yml" data-completed="polytope.yml Created">Create polytope.yml</h2>
                    <p class="info">Create the main Polytope configuration file that includes Bluetext tools</p>
                    <div class="code">include:
  - repo: gh:bluetext-io/bluetext</div>
                    <button id="step-2-button" data-original="Create polytope.yml" data-completed="polytope.yml Created" onclick="runCommand('createPolytopeYml')">Create polytope.yml</button>
                </div>

                <div class="step" data-step="3">
                    <span class="step-number" id="step-3">3</span>
                    <h2 id="step-3-title" data-original="Configure Coding Agent" data-completed="Coding Agent Configured">Configure Coding Agent</h2>
                    <p class="info">Choose your preferred coding agent to configure:</p>
                    <button id="step-3-button-cline" data-original="Configure Cline" data-completed="Cline Configured" onclick="runCommand('configureCline')">Configure Cline</button>
                    <button id="step-3-button-claude" data-original="Configure Claude Code" data-completed="Claude Code Configured" onclick="runCommand('configureClaudeCode')">Configure Claude Code</button>
                </div>

                <div class="step" data-step="4">
                    <span class="step-number" id="step-4">4</span>
                    <h2 id="step-4-title" data-original="Start MCP Server" data-completed="MCP Server Started">Start MCP Server</h2>
                    <p class="info">Start the Polytope MCP server on http://localhost:31338</p>
                    <div class="code">pt run --mcp</div>
                    <button id="step-4-button" data-original="Start MCP Server" data-completed="MCP Server Started" onclick="runCommand('startMCP')">Start MCP Server</button>
                </div>

                <div class="docs-section">
                    <h2>Documentation</h2>
                    <ul>
                        <li><a href="https://polytope.dev/docs">Polytope Documentation</a></li>
                        <li><a href="https://github.com/bluetext-io/bluetext">Bluetext Repository</a></li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="terminal-panel">
            <div class="terminal-header">
                <div class="terminal-title">
                    <div class="terminal-icon"></div>
                    <span>Terminal Output</span>
                </div>
                <div class="terminal-actions">
                    <button class="terminal-btn" onclick="clearTerminalOutput()">Clear</button>
                </div>
            </div>
            <div class="terminal-output" id="terminalOutput">
                <div class="terminal-line">
                    <span class="terminal-timestamp">--:--:--</span>
                    <span class="terminal-message terminal-info">Terminal ready. Waiting for commands...</span>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function runCommand(command) {
            vscode.postMessage({ command: command });
        }

        function clearTerminalOutput() {
            const output = document.getElementById('terminalOutput');
            output.innerHTML = '<div class="terminal-line"><span class="terminal-timestamp">--:--:--</span><span class="terminal-message terminal-info">Terminal cleared.</span></div>';
        }

        function addTerminalLine(message, type, timestamp) {
            const output = document.getElementById('terminalOutput');
            const line = document.createElement('div');
            line.className = 'terminal-line';
            
            const time = document.createElement('span');
            time.className = 'terminal-timestamp';
            time.textContent = timestamp;
            
            const msg = document.createElement('span');
            msg.className = 'terminal-message terminal-' + type;
            msg.textContent = message;
            
            line.appendChild(time);
            line.appendChild(msg);
            output.appendChild(line);
            
            // Auto-scroll to bottom
            output.scrollTop = output.scrollHeight;
        }

        // Quick Start function
        function startQuickSetup() {
            const agentChoice = document.querySelector('input[name="agent"]:checked').value;
            vscode.postMessage({ 
                command: 'quickStart',
                agentChoice: agentChoice
            });
        }
        
        // Update step status
        function updateStepStatus(stepNumber, status) {
            const stepElement = document.getElementById('step-' + stepNumber);
            const stepContainer = document.querySelector('.step[data-step="' + stepNumber + '"]');
            const stepTitle = document.getElementById('step-' + stepNumber + '-title');
            
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
            
            if (stepTitle) {
                // Update title text based on status
                if (status === 'done') {
                    stepTitle.textContent = stepTitle.getAttribute('data-completed');
                } else {
                    stepTitle.textContent = stepTitle.getAttribute('data-original');
                }
            }
            
            // Update button text based on status
            const updateButtonText = (buttonId) => {
                const button = document.getElementById(buttonId);
                if (button) {
                    if (status === 'done') {
                        button.textContent = button.getAttribute('data-completed');
                    } else {
                        button.textContent = button.getAttribute('data-original');
                    }
                }
            };
            
            // Update button(s) for the step
            if (stepNumber === 3) {
                // Step 3 has two buttons
                updateButtonText('step-3-button-cline');
                updateButtonText('step-3-button-claude');
            } else {
                updateButtonText('step-' + stepNumber + '-button');
            }
        }
        
        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'terminalOutput':
                    addTerminalLine(message.message, message.type, message.timestamp);
                    break;
                case 'clearTerminal':
                    clearTerminalOutput();
                    break;
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
