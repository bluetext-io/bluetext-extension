import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WizardPanel } from './wizardPanel';
import { McpService } from './mcpService';

export async function createPolytopeYml(skipPrompt: boolean = false): Promise<boolean> {
    const panel = WizardPanel.getInstance();
    panel.logToTerminal('Creating polytope.yml...', 'command');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const errorMsg = 'Please open a workspace folder first';
        vscode.window.showErrorMessage(errorMsg);
        panel.logToTerminal(errorMsg, 'error');
        return false;
    }

    const polytopeYmlPath = path.join(workspaceFolder.uri.fsPath, 'polytope.yml');
    const polytopeContent = `include:
  - repo: gh:bluetext-io/bluetext
`;

    if (fs.existsSync(polytopeYmlPath)) {
        try {
            const existingContent = fs.readFileSync(polytopeYmlPath, 'utf8').trim();
            const requiredContent = polytopeContent.trim();
            
            if (existingContent === requiredContent) {
                panel.logToTerminal('polytope.yml already exists with correct configuration', 'success');
                return true;
            }
        } catch (error) {
            panel.logToTerminal(`Error reading existing polytope.yml: ${error}`, 'error');
        }
        
        if (skipPrompt) {
            panel.logToTerminal('polytope.yml exists with different content, skipping...', 'info');
            return true;
        }
        
        panel.logToTerminal('polytope.yml already exists', 'info');
        const overwrite = await vscode.window.showWarningMessage(
            'polytope.yml already exists. Do you want to overwrite it?',
            'Yes', 'No'
        );
        if (overwrite !== 'Yes') {
            panel.logToTerminal('Operation cancelled by user', 'info');
            return false;
        }
    }

    try {
        fs.writeFileSync(polytopeYmlPath, polytopeContent, 'utf8');
        const successMsg = 'polytope.yml created successfully!';
        panel.logToTerminal(successMsg, 'success');
        panel.logToTerminal(`File location: ${polytopeYmlPath}`, 'info');
        
        if (!skipPrompt) {
            const document = await vscode.workspace.openTextDocument(polytopeYmlPath);
            await vscode.window.showTextDocument(document);
        }
        return true;
    } catch (error) {
        const errorMsg = `Failed to create polytope.yml: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        panel.logToTerminal(errorMsg, 'error');
        return false;
    }
}

export async function configureCline(): Promise<void> {
    const panel = WizardPanel.getInstance();
    panel.logToTerminal('Configuring Cline MCP settings...', 'command');
    
    const config = vscode.workspace.getConfiguration('bluetext');
    const mcpPort = config.get<number>('mcpPort', 31338);

    const codeServerPath = '/root/.local/share/code-server/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json';
    let clineSettingsPath: string;

    if (fs.existsSync(path.dirname(codeServerPath))) {
        clineSettingsPath = codeServerPath;
        panel.logToTerminal('Detected code-server environment', 'info');
    } else {
        const appData = process.env.APPDATA || 
                        (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : 
                         path.join(os.homedir(), '.config'));
        
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

    panel.logToTerminal(`Settings path: ${clineSettingsPath}`, 'info');

    try {
        const settingsDir = path.dirname(clineSettingsPath);
        if (!fs.existsSync(settingsDir)) {
            panel.logToTerminal('Creating settings directory...', 'info');
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        let config: any = { mcpServers: {} };
        if (fs.existsSync(clineSettingsPath)) {
            panel.logToTerminal('Reading existing Cline settings...', 'info');
            try {
                const existingContent = fs.readFileSync(clineSettingsPath, 'utf8');
                if (existingContent.trim()) {
                    config = JSON.parse(existingContent);
                } else {
                    panel.logToTerminal('Existing file is empty, creating new config...', 'info');
                }
            } catch (parseError) {
                panel.logToTerminal('Existing file has invalid JSON, creating new config...', 'info');
            }
        } else {
            panel.logToTerminal('Creating new Cline settings file...', 'info');
        }

        config.mcpServers = config.mcpServers || {};
        config.mcpServers.polytope = {
            type: "streamableHttp",
            url: `http://localhost:${mcpPort}/mcp`,
            alwaysAllow: [],
            disabled: false
        };

        panel.logToTerminal(`Configuring polytope server at http://localhost:${mcpPort}/mcp`, 'info');

        fs.writeFileSync(clineSettingsPath, JSON.stringify(config, null, 2), 'utf8');
        
        const successMsg = 'Cline MCP settings configured successfully!';
        panel.logToTerminal(successMsg, 'success');
    } catch (error) {
        const errorMsg = `Failed to configure Cline: ${error}`;
        vscode.window.showErrorMessage(errorMsg);
        panel.logToTerminal(errorMsg, 'error');
    }
}

export async function configureClaudeCode(): Promise<void> {
    const panel = WizardPanel.getInstance();
    panel.logToTerminal('Configuring Claude Code MCP...', 'command');
    
    const config = vscode.workspace.getConfiguration('bluetext');
    const mcpPort = config.get<number>('mcpPort', 31338);

    const command = `claude mcp add polytope-mcp http://localhost:${mcpPort}/mcp`;
    panel.logToTerminal(`Executing: ${command}`, 'info');

    const terminal = vscode.window.createTerminal('Bluetext - Claude Code Setup');
    terminal.show();
    terminal.sendText(command);
    
    const msg = 'Claude Code MCP configuration command executed. Check the terminal for results.';
    panel.logToTerminal(msg, 'success');
}

export async function initGit(): Promise<void> {
    const panel = WizardPanel.getInstance();
    panel.logToTerminal('Initializing Git repository...', 'command');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const errorMsg = 'Please open a workspace folder first';
        vscode.window.showErrorMessage(errorMsg);
        panel.logToTerminal(errorMsg, 'error');
        return;
    }

    const gitPath = path.join(workspaceFolder.uri.fsPath, '.git');
    
    if (fs.existsSync(gitPath)) {
        const msg = 'Git repository already initialized';
        panel.logToTerminal(msg, 'info');
        return;
    }

    panel.logToTerminal('Executing: git init', 'info');
    const terminal = vscode.window.createTerminal('Bluetext - Git Init');
    terminal.show();
    terminal.sendText('git init');
    
    const successMsg = 'Git repository initialized!';
    panel.logToTerminal(successMsg, 'success');
}

export async function startMCP(): Promise<void> {
    const panel = WizardPanel.getInstance();
    panel.logToTerminal('Starting MCP server...', 'command');
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        const errorMsg = 'Please open a workspace folder first';
        vscode.window.showErrorMessage(errorMsg);
        panel.logToTerminal(errorMsg, 'error');
        return;
    }

    const polytopeYmlPath = path.join(workspaceFolder.uri.fsPath, 'polytope.yml');
    if (!fs.existsSync(polytopeYmlPath)) {
        panel.logToTerminal('polytope.yml not found', 'error');
        const create = await vscode.window.showErrorMessage(
            'polytope.yml not found. Would you like to create it?',
            'Yes', 'No'
        );
        if (create === 'Yes') {
            await createPolytopeYml();
        } else {
            panel.logToTerminal('Operation cancelled', 'info');
            return;
        }
    }

    panel.logToTerminal('Executing: pt run --mcp', 'info');
    panel.logToTerminal(`Working directory: ${workspaceFolder.uri.fsPath}`, 'info');
    
    const terminal = vscode.window.createTerminal({
        name: 'Bluetext - MCP Server',
        cwd: workspaceFolder.uri.fsPath
    });
    terminal.show();
    terminal.sendText('pt run --mcp');
    
    const msg = 'MCP server starting... Check terminal for output. Server will run on http://localhost:31338';
    panel.logToTerminal(msg, 'success');
}

export async function runQuickStart(agentChoice: 'cline' | 'claude'): Promise<void> {
    const panel = WizardPanel.getInstance();
    panel.logToTerminal('='.repeat(50), 'info');
    panel.logToTerminal('Starting Quick Setup...', 'command');
    panel.logToTerminal('='.repeat(50), 'info');
    
    // Step 1: Initialize Git
    panel.updateStepStatus(1, 'doing');
    panel.logToTerminal('\n📦 Step 1/4: Initializing Git repository...', 'command');
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const gitPath = path.join(workspaceFolder.uri.fsPath, '.git');
            if (!fs.existsSync(gitPath)) {
                await initGit();
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                panel.logToTerminal('Git already initialized, skipping...', 'info');
            }
        }
        panel.updateStepStatus(1, 'done');
        await new Promise(resolve => setTimeout(resolve, 700));
    } catch (error) {
        panel.logToTerminal(`Git initialization failed: ${error}`, 'error');
        panel.updateStepStatus(1, 'error');
    }
    
    // Step 2: Create polytope.yml
    panel.updateStepStatus(2, 'doing');
    panel.logToTerminal('\n📄 Step 2/4: Creating polytope.yml...', 'command');
    try {
        const success = await createPolytopeYml(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        if (success) {
            panel.updateStepStatus(2, 'done');
            await new Promise(resolve => setTimeout(resolve, 700));
        } else {
            panel.updateStepStatus(2, 'error');
            return;
        }
    } catch (error) {
        panel.logToTerminal(`Failed to create polytope.yml: ${error}`, 'error');
        panel.updateStepStatus(2, 'error');
        return;
    }
    
    // Step 3: Configure Agent
    panel.updateStepStatus(3, 'doing');
    panel.logToTerminal(`\n⚙️  Step 3/4: Configuring ${agentChoice === 'cline' ? 'Cline' : 'Claude Code'}...`, 'command');
    try {
        if (agentChoice === 'cline') {
            await configureCline();
        } else {
            await configureClaudeCode();
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        panel.updateStepStatus(3, 'done');
        await new Promise(resolve => setTimeout(resolve, 700));
    } catch (error) {
        panel.logToTerminal(`Agent configuration failed: ${error}`, 'error');
        panel.updateStepStatus(3, 'error');
    }
    
    // Step 4: Start MCP Server
    panel.updateStepStatus(4, 'doing');
    panel.logToTerminal('\n⚡ Step 4/4: Starting MCP server...', 'command');
    try {
        await startMCP();
        await new Promise(resolve => setTimeout(resolve, 1000));
        panel.updateStepStatus(4, 'done');
        
        // Start health monitoring after server starts
        // Wait longer (7 seconds) to give server time to fully initialize before first health check
        panel.logToTerminal('Waiting for MCP server to fully initialize...', 'info');
        await new Promise(resolve => setTimeout(resolve, 7000));
        McpService.getInstance().startHealthMonitoring();
    } catch (error) {
        panel.logToTerminal(`Failed to start MCP server: ${error}`, 'error');
        panel.updateStepStatus(4, 'error');
    }
    
    panel.logToTerminal('\n' + '='.repeat(50), 'info');
    panel.logToTerminal('✅ Quick Setup Complete!', 'success');
    panel.logToTerminal('='.repeat(50), 'info');
    panel.logToTerminal('\nYou can now start using Bluetext tools with your coding agent!', 'info');
}
