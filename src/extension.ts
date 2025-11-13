import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

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
                case 'fetchMcpTools':
                    await fetchMcpTools();
                    break;
                case 'runMcpTool':
                    await executeMcpTool(message.toolName, message.toolSchema);
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

// Function to fetch available MCP tools
async function fetchMcpTools() {
    const config = vscode.workspace.getConfiguration('bluetext');
    const mcpPort = config.get<number>('mcpPort', 31338);
    
    logToTerminal(`🔍 Fetching tools from MCP server...`, 'info');

    return new Promise<void>((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: mcpPort,
            path: '/mcp',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        logToTerminal(`Connecting to 127.0.0.1:${mcpPort}/mcp`, 'info');

        const req = http.request(options, (res) => {
            logToTerminal(`✓ Connected! Status: ${res.statusCode}`, 'success');
            
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
                logToTerminal(`Received ${chunk.length} bytes...`, 'info');
            });

            res.on('end', () => {
                logToTerminal(`✓ Response complete (${data.length} bytes total)`, 'success');
                
                try {
                    // Parse the single-line JSON response
                    const response = JSON.parse(data.trim());
                    
                    // Extract tools from the MCP response structure
                    const tools = response?.result?.tools || [];
                    
                    if (tools.length > 0) {
                        logToTerminal(`✓ Found ${tools.length} tools`, 'success');
                        
                        // Log first few tool names for verification
                        const toolNames = tools.slice(0, 3).map((t: any) => t.name).join(', ');
                        logToTerminal(`Tools: ${toolNames}${tools.length > 3 ? '...' : ''}`, 'info');
                    } else {
                        logToTerminal(`⚠️  No tools found in response`, 'info');
                        logToTerminal(`Response keys: ${JSON.stringify(Object.keys(response))}`, 'info');
                    }

                    // Send tools to webview
                    if (wizardPanel) {
                        wizardPanel.webview.postMessage({
                            command: 'updateTools',
                            tools: tools
                        });
                    }

                    resolve();
                } catch (error) {
                    const errorMsg = `Failed to parse response: ${error}`;
                    logToTerminal(errorMsg, 'error');
                    logToTerminal(`Raw data (first 500 chars): ${data.substring(0, 500)}`, 'error');
                    
                    if (wizardPanel) {
                        wizardPanel.webview.postMessage({
                            command: 'updateTools',
                            tools: [],
                            error: String(error)
                        });
                    }
                    
                    reject(error);
                }
            });

            res.on('error', (error) => {
                logToTerminal(`Response stream error: ${error.message}`, 'error');
                
                if (wizardPanel) {
                    wizardPanel.webview.postMessage({
                        command: 'updateTools',
                        tools: [],
                        error: error.message
                    });
                }
                
                reject(error);
            });
        });

        req.on('error', (error) => {
            logToTerminal(`❌ Request error: ${error.message}`, 'error');
            logToTerminal(`Error code: ${(error as any).code}`, 'error');
            logToTerminal(`Error type: ${error.name}`, 'error');
            logToTerminal('💡 Make sure MCP server is running at 127.0.0.1:31338', 'info');
            
            if (wizardPanel) {
                wizardPanel.webview.postMessage({
                    command: 'updateTools',
                    tools: [],
                    error: `${error.name}: ${error.message}`
                });
            }
            
            reject(error);
        });

        req.on('timeout', () => {
            logToTerminal(`❌ Request timed out`, 'error');
            req.destroy();
            
            if (wizardPanel) {
                wizardPanel.webview.postMessage({
                    command: 'updateTools',
                    tools: [],
                    error: 'Request timed out'
                });
            }
            
            reject(new Error('Request timed out'));
        });

        // Set request timeout
        req.setTimeout(10000);

        // Send the tools/list request
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        });

        logToTerminal(`📤 Sending request: ${body}`, 'info');
        
        try {
            req.write(body);
            req.end();
            logToTerminal(`✓ Request sent, waiting for response...`, 'info');
        } catch (error) {
            logToTerminal(`❌ Failed to send request: ${error}`, 'error');
            reject(error);
        }
    });
}

// Function to execute an MCP tool
async function executeMcpTool(toolName: string, toolSchema: any) {
    const config = vscode.workspace.getConfiguration('bluetext');
    const mcpPort = config.get<number>('mcpPort', 31338);
    
    logToTerminal(`▶ Running tool: ${toolName}`, 'command');
    
    // For now, run tools with empty arguments
    // TODO: Add parameter input UI for tools that require parameters
    const args = {};
    
    return new Promise<void>((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: mcpPort,
            path: '/mcp',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data.trim());
                    
                    if (response.error) {
                        logToTerminal(`❌ Tool execution failed: ${response.error.message}`, 'error');
                        reject(new Error(response.error.message));
                    } else {
                        logToTerminal(`✅ Tool executed successfully!`, 'success');
                        
                        // Log the result
                        if (response.result) {
                            const resultStr = JSON.stringify(response.result, null, 2);
                            logToTerminal(`Result: ${resultStr}`, 'info');
                        }
                        
                        resolve();
                    }
                } catch (error) {
                    logToTerminal(`Failed to parse tool response: ${error}`, 'error');
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            logToTerminal(`❌ Tool execution error: ${error.message}`, 'error');
            reject(error);
        });

        // Send the tools/call request
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        });

        req.write(body);
        req.end();
    });
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
        await new Promise(resolve => setTimeout(resolve, 700)); // Pause before next step
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
            await new Promise(resolve => setTimeout(resolve, 700)); // Pause before next step
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
        await new Promise(resolve => setTimeout(resolve, 700)); // Pause before next step
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
    
    // Wait a bit for MCP server to initialize, then fetch tools
    logToTerminal('\n⌛ Waiting for MCP server to initialize...', 'info');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    logToTerminal('🔍 Fetching available tools...', 'info');
    try {
        await fetchMcpTools();
        logToTerminal('✅ Tools loaded successfully!', 'success');
    } catch (error) {
        logToTerminal('⚠️  Could not fetch tools yet. Click "Refresh Tools" button once server is ready.', 'info');
    }
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
        
        .header-clickable {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            user-select: none;
            transition: background-color 0.15s ease;
            padding: 4px 0;
            margin: -4px 0;
            border-radius: 4px;
        }
        
        .header-clickable:hover {
            background-color: rgba(42, 82, 152, 0.02);
        }
        
        .header-title-section {
            flex: 1;
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
        
        /* Collapsible card content */
        .card-content {
            max-height: 5000px;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        
        .card-content.collapsed {
            max-height: 0;
        }
        
        .header-arrow {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s ease;
            opacity: 0.6;
        }
        
        .header-arrow.collapsed {
            transform: rotate(-90deg);
        }
        
        /* Progress line container */
        .steps-container {
            position: relative;
            padding-left: 20px;
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
        
        /* Individual line segments between circles */
        .step:not(:last-child)::after {
            content: '';
            position: absolute;
            left: 14.5px;
            top: 44px;
            height: calc(100% - 36px);
            width: 3px;
            background: #d0d1d2;
            border-radius: 2px;
            z-index: 0;
            transition: background-color 0.3s ease;
        }
        
        /* Line colors based on step status */
        .step[data-step="1"]::after {
            background: var(--line-color-1, #d0d1d2);
        }
        
        .step[data-step="2"]::after {
            background: var(--line-color-2, #d0d1d2);
        }
        
        .step[data-step="3"]::after {
            background: var(--line-color-3, #d0d1d2);
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
            --line-color-1: #d0d1d2;
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
                        <div class="header-clickable" onclick="toggleHeader('main-header')">
                            <div class="header-title-section">
                                <h1>Bluetext Setup Wizard</h1>
                                <p class="subtitle">This wizard will guide you through setting up Bluetext with Polytope for MCP server integration.</p>
                            </div>
                            <div class="header-arrow" id="main-header-arrow">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path d="M3 6 L8 11 L13 6" fill="none" stroke="#2a5298" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div class="card-content" id="main-header-content">
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

                <!-- Bluetext Tools Card -->
                <div class="unified-card" id="tools-card" style="display: none;">
                    <div class="header">
                        <div class="header-clickable" onclick="toggleHeader('tools-header')">
                            <div class="header-title-section">
                                <h1>🔧 Bluetext Tools</h1>
                                <p class="subtitle">Available MCP tools from your Bluetext server</p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <button onclick="refreshTools(); event.stopPropagation();" style="padding: 8px 16px;">🔄 Refresh</button>
                                <div class="header-arrow" id="tools-header-arrow">
                                    <svg width="16" height="16" viewBox="0 0 16 16">
                                        <path d="M3 6 L8 11 L13 6" fill="none" stroke="#2a5298" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card-content" id="tools-header-content">
                    <div id="tools-loading" style="text-align: center; padding: 20px; color: #6c757d;">
                        <p>Loading tools...</p>
                    </div>

                    <div id="tools-error" style="display: none; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 16px; margin-bottom: 15px; color: #856404;">
                        <strong>⚠️ Could not connect to MCP server</strong>
                        <p style="margin: 8px 0 0 0;">Make sure the MCP server is  running (Step 4). Click "Refresh" to try again.</p>
                    </div>

                    <div id="tools-list" style="display: none;">
                        <!-- Tools will be dynamically populated here -->
                    </div>

                    <div id="tools-empty" style="display: none; text-align: center; padding: 20px; color: #6c757d;">
                        <p>No tools available yet. Complete the quick start to see available tools.</p>
                    </div>
                    </div>
                </div>

                <!-- Debug Console Card -->
                <div class="unified-card" id="console-card">
                    <div class="header">
                        <div class="header-clickable" onclick="toggleHeader('console-header')">
                            <div class="header-title-section">
                                <h1>🖥️ Debug Console</h1>
                                <p class="subtitle">Server communication logs</p>
                            </div>
                            <div class="header-arrow" id="console-header-arrow">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path d="M3 6 L8 11 L13 6" fill="none" stroke="#2a5298" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div class="card-content" id="console-header-content">
                    <div id="console-output" style="background: #1e1e1e; color: #d4d4d4; padding: 16px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 12px; max-height: 400px; overflow-y: auto; line-height: 1.6;">
                        <div style="color: #6c757d; font-style: italic;">Console output will appear here...</div>
                    </div>
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
        
        // Store tools data globally
        let availableTools = [];
        let executedTools = new Set(); // Track which tools have been executed
        
        // Function to toggle header collapse
        function toggleHeader(headerId) {
            const content = document.getElementById(headerId + '-content');
            const arrow = document.getElementById(headerId + '-arrow');
            
            if (content && arrow) {
                content.classList.toggle('collapsed');
                arrow.classList.toggle('collapsed');
            }
        }
        
        // Function to toggle tool description
        function toggleTool(event, toolIndex) {
            const toolHeader = event.currentTarget;
            const toolItem = toolHeader.parentElement;
            const description = toolItem.querySelector('.tool-description');
            const icon = toolHeader.querySelector('.expand-icon');
            
            // Toggle expanded state
            const isExpanded = description.style.maxHeight && description.style.maxHeight !== '0px';
            
            if (isExpanded) {
                // Collapse
                description.style.maxHeight = '0';
                description.style.padding = '0 16px';
                icon.style.transform = 'rotate(0deg)';
            } else {
                // Expand
                description.style.maxHeight = description.scrollHeight + 'px';
                description.style.padding = '0 16px';
                icon.style.transform = 'rotate(180deg)';
            }
        }
        
        // Function to run a tool
        function runTool(toolIndex) {
            const tool = availableTools[toolIndex];
            if (!tool) {
                console.error('Tool not found:', toolIndex);
                return;
            }
            
            // Mark tool as executed and update button color
            executedTools.add(toolIndex);
            const button = document.querySelector(\`[data-tool-index="\${toolIndex}"]\`);
            if (button) {
                button.style.background = '#28a745';
                button.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.25)';
            }
            
            // Send message to extension to run the tool
            vscode.postMessage({
                command: 'runMcpTool',
                toolName: tool.name,
                toolSchema: tool.inputSchema
            });
        }
        
        function runCommand(command) {
            vscode.postMessage({ command: command });
        }

        // Configure Agent - dynamically calls the correct configuration based on radio selection
        function configureAgent() {
            const agentChoice = document.querySelector('input[name="agent"]:checked').value;
            const agentWarning = document.getElementById('agent-warning');
            
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
        
        // Refresh tools function
        function refreshTools() {
            vscode.postMessage({ command: 'fetchMcpTools' });
            
            // Show loading state
            const toolsCard = document.getElementById('tools-card');
            const toolsLoading = document.getElementById('tools-loading');
            const toolsError = document.getElementById('tools-error');
            const toolsList = document.getElementById('tools-list');
            const toolsEmpty = document.getElementById('tools-empty');
            
            if (toolsCard) toolsCard.style.display = 'block';
            if (toolsLoading) toolsLoading.style.display = 'block';
            if (toolsError) toolsError.style.display = 'none';
            if (toolsList) toolsList.style.display = 'none';
            if (toolsEmpty) toolsEmpty.style.display = 'none';
        }
        
        // Update tools display
        function updateTools(tools, error) {
            const toolsCard = document.getElementById('tools-card');
            const toolsLoading = document.getElementById('tools-loading');
            const toolsError = document.getElementById('tools-error');
            const toolsList = document.getElementById('tools-list');
            const toolsEmpty = document.getElementById('tools-empty');
            
            // Show the tools card
            if (toolsCard) toolsCard.style.display = 'block';
            if (toolsLoading) toolsLoading.style.display = 'none';
            
            if (error) {
                // Show error state
                if (toolsError) toolsError.style.display = 'block';
                if (toolsList) toolsList.style.display = 'none';
                if (toolsEmpty) toolsEmpty.style.display = 'none';
                return;
            }
            
            if (!tools || tools.length === 0) {
                // Show empty state
                if (toolsError) toolsError.style.display = 'none';
                if (toolsList) toolsList.style.display = 'none';
                if (toolsEmpty) toolsEmpty.style.display = 'block';
                return;
            }
            
            // Store tools globally for access
            availableTools = tools;
            
            // Show tools list
            if (toolsError) toolsError.style.display = 'none';
            if (toolsEmpty) toolsEmpty.style.display = 'none';
            if (toolsList) {
                toolsList.style.display = 'block';
                
                // Build the tools HTML
                let html = '<div style="display: grid; gap: 12px;">';
                
                tools.forEach((tool, index) => {
                    // Check if tool has been executed
                    const isExecuted = executedTools.has(index);
                    const buttonBg = isExecuted ? '#28a745' : '#1e3c72';
                    const buttonShadow = isExecuted ? '0 2px 4px rgba(40, 167, 69, 0.25)' : '0 2px 6px rgba(42, 82, 152, 0.25)';
                    
                    html += \`
                        <div class="tool-item" style="background: #f3f4f5; border-left: 4px solid #2a5298; border-radius: 4px; overflow: hidden;">
                            <div class="tool-header" onclick="toggleTool(event, \${index})" style="display: flex; align-items: center; gap: 12px; padding: 16px; cursor: pointer; user-select: none; transition: background-color 0.15s ease;" onmouseenter="this.style.backgroundColor='rgba(42, 82, 152, 0.04)'" onmouseleave="this.style.backgroundColor='transparent'">
                                <div style="background: #2a5298; color: white; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px;">
                                    🔧
                                </div>
                                <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
                                    <h3 style="font-size: 16px; font-weight: 600; color: #1e3c72; margin: 0;">\${escapeHtml(tool.name)}</h3>
                                    <svg class="expand-icon" width="12" height="12" viewBox="0 0 12 12" style="transition: transform 0.2s ease; opacity: 0.6; flex-shrink: 0;">
                                        <path d="M2 4 L6 8 L10 4" fill="none" stroke="#2a5298" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </div>
                                <button data-tool-index="\${index}" onclick="runTool(\${index}); event.stopPropagation();" style="background: \${buttonBg}; padding: 6px 16px; font-size: 12px; border-radius: 4px; box-shadow: \${buttonShadow}; transition: all 0.2s ease;">
                                    ▶ Run
                                </button>
                            </div>
                            <div class="tool-description" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; padding: 0 16px;">
                                <p style="font-size: 13px; color: #5a6c7d; margin: 0; line-height: 1.5; padding-bottom: 16px; border-top: 1px solid #e0e0e0; padding-top: 12px;">\${escapeHtml(tool.description || 'No description available')}</p>
                            </div>
                        </div>
                    \`;
                });
                
                html += '</div>';
                html += \`<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0; text-align: center; color: #6c757d; font-size: 13px;">Total: \${tools.length} tool\${tools.length !== 1 ? 's' : ''}</div>\`;
                
                toolsList.innerHTML = html;
            }
        }
        
        // Escape HTML to prevent XSS
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Handle console output
        function addConsoleMessage(message, type, timestamp) {
            const console = document.getElementById('console-output');
            if (!console) return;
            
            // Clear placeholder on first message
            if (console.querySelector('[style*="italic"]')) {
                console.innerHTML = '';
            }
            
            const colors = {
                info: '#d4d4d4',
                success: '#4ec9b0',
                error: '#f48771',
                command: '#dcdcaa'
            };
            
            const line = document.createElement('div');
            line.style.color = colors[type] || colors.info;
            line.style.marginBottom = '4px';
            line.innerHTML = \`<span style="color: #6c757d;">[\${timestamp}]</span> \${message}\`;
            
            console.appendChild(line);
            console.scrollTop = console.scrollHeight;
        }
        
        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'updateStepStatus':
                    updateStepStatus(message.stepNumber, message.status);
                    break;
                case 'updateTools':
                    updateTools(message.tools, message.error);
                    break;
                case 'terminalOutput':
                    addConsoleMessage(message.message, message.type, message.timestamp);
                    break;
            }
        });
    </script>
</body>
</html>`;
}

export function deactivate() {}
