import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';
import * as commands from './commands';
import { McpService } from './mcpService';

export function activate(context: vscode.ExtensionContext) {
    console.log('Bluetext Setup Assistant is now active');

    // Handle messages from sidebar webview
    const handleWebviewMessage = async (message: any, provider: SidebarProvider) => {
        // Set the current provider so commands and MCP service know which UI to update
        commands.setCurrentProvider(provider);
        McpService.getInstance().setCurrentProvider(provider);
        
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
            case 'configureCopilot':
                await commands.configureCopilot();
                break;
            case 'startMCP':
                provider.updateStepStatus(4, 'doing');
                await commands.startMCP();
                await new Promise(resolve => setTimeout(resolve, 1000));
                provider.updateStepStatus(4, 'done');
                provider.logToTerminal('Waiting for MCP server to fully initialize...', 'info');
                await new Promise(resolve => setTimeout(resolve, 7000));
                McpService.getInstance().startHealthMonitoring();
                break;
            case 'quickStart':
                await commands.runQuickStart(message.agentChoice);
                await new Promise(resolve => setTimeout(resolve, 3000));
                try {
                    await McpService.getInstance().fetchTools();
                    provider.logToTerminal('✅ Tools loaded successfully!', 'success');
                } catch (error) {
                    provider.logToTerminal('⚠️  Could not fetch tools yet. Click "Refresh Tools" button once server is ready.', 'info');
                }
                break;
            case 'fetchMcpTools':
                await McpService.getInstance().fetchTools();
                break;
            case 'runMcpTool':
                await McpService.getInstance().executeTool(
                    message.toolName, 
                    message.toolSchema,
                    message.parameters
                );
                break;
        }
    };

    // Register sidebar provider for Activity Bar icon
    const sidebarProvider = new SidebarProvider(context.extensionPath);
    
    // Set up message handler for sidebar
    sidebarProvider.setMessageHandler(async (message: any) => {
        await handleWebviewMessage(message, sidebarProvider);
    });
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('bluetext.sidebarView', sidebarProvider)
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
