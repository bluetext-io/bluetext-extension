import * as vscode from 'vscode';
import { WizardPanel } from './wizardPanel';
import * as commands from './commands';
import { McpService } from './mcpService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Bluetext Setup Assistant is now active');

    // Register setup wizard command
    context.subscriptions.push(
        vscode.commands.registerCommand('bluetext.setupWizard', () => {
            const panel = WizardPanel.getInstance();
            const webview = panel.createOrShow(context.extensionPath);
            
            if (webview) {
                panel.logToTerminal('Bluetext Setup Wizard initialized', 'info');
                panel.logToTerminal('Click any setup button to begin', 'info');
                
                // Handle messages from webview
                webview.onDidReceiveMessage(
                    async message => {
                        switch (message.command) {
                            case 'initGit':
                                await commands.initGit();
                                break;
                            case 'createPolytopeYml':
                                await commands.createPolytopeYml();
                                break;
                            case 'configureCline':
                                await commands.configureCline();
                                break;
                            case 'configureClaudeCode':
                                await commands.configureClaudeCode();
                                break;
                            case 'startMCP':
                                panel.updateStepStatus(4, 'doing');
                                await commands.startMCP();
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                panel.updateStepStatus(4, 'done');
                                // Start health monitoring after server starts
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                McpService.getInstance().startHealthMonitoring();
                                break;
                            case 'quickStart':
                                await commands.runQuickStart(message.agentChoice);
                                // Wait for MCP server to initialize, then fetch tools
                                await new Promise(resolve => setTimeout(resolve, 3000));
                                try {
                                    await McpService.getInstance().fetchTools();
                                    panel.logToTerminal('✅ Tools loaded successfully!', 'success');
                                } catch (error) {
                                    panel.logToTerminal('⚠️  Could not fetch tools yet. Click "Refresh Tools" button once server is ready.', 'info');
                                }
                                break;
                            case 'fetchMcpTools':
                                await McpService.getInstance().fetchTools();
                                break;
                            case 'runMcpTool':
                                await McpService.getInstance().executeTool(message.toolName, message.toolSchema);
                                break;
                        }
                    },
                    undefined,
                    context.subscriptions
                );
            }
        })
    );

    // Register individual command shortcuts
    context.subscriptions.push(
        vscode.commands.registerCommand('bluetext.createPolytopeYml', () => commands.createPolytopeYml()),
        vscode.commands.registerCommand('bluetext.configureCline', () => commands.configureCline()),
        vscode.commands.registerCommand('bluetext.configureClaudeCode', () => commands.configureClaudeCode()),
        vscode.commands.registerCommand('bluetext.initGit', () => commands.initGit()),
        vscode.commands.registerCommand('bluetext.startMCP', () => commands.startMCP())
    );
}

export function deactivate() {
    // Stop health monitoring when extension deactivates
    McpService.getInstance().stopHealthMonitoring();
}
