import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class SidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _extensionPath: string;
    private _messageHandler?: (message: any) => void;

    constructor(extensionPath: string) {
        this._extensionPath = extensionPath;
    }

    public setMessageHandler(handler: (message: any) => void): void {
        this._messageHandler = handler;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this._extensionPath, 'src', 'templates')),
                vscode.Uri.file(path.join(this._extensionPath, 'out')),
                vscode.Uri.file(path.join(this._extensionPath, 'Icons'))
            ]
        };

        // Always show welcome screen first
        webviewView.webview.html = this.getWelcomeContent(webviewView.webview);

        // Set up message handler
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.command === 'checkWorkspace') {
                const hasWorkspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0;
                if (hasWorkspace) {
                    // Reload with main wizard
                    webviewView.webview.html = this.getWebviewContent(webviewView.webview);
                } else {
                    // Show message to open folder
                    webviewView.webview.postMessage({ command: 'showMessage' });
                }
            } else if (message.command === 'openLink') {
                if (message.url) {
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                }
            } else if (this._messageHandler) {
                // Pass other messages to the main handler
                this._messageHandler(message);
            }
        });
    }

    public getWebview(): vscode.Webview | undefined {
        return this._view?.webview;
    }

    public sendMessage(message: any): void {
        this._view?.webview.postMessage(message);
    }

    public logToTerminal(message: string, type: 'info' | 'success' | 'error' | 'command' = 'info'): void {
        this.sendMessage({
            command: 'terminalOutput',
            message: message,
            type: type,
            timestamp: new Date().toLocaleTimeString()
        });
    }

    public updateStepStatus(stepNumber: number, status: 'pending' | 'doing' | 'done' | 'error'): void {
        this.sendMessage({
            command: 'updateStepStatus',
            stepNumber: stepNumber,
            status: status
        });
    }

    private getWebviewContent(webview: vscode.Webview): string {
        const templatesPath = path.join(this._extensionPath, 'src', 'templates');
        const htmlPath = path.join(templatesPath, 'wizard.html');
        const jsPath = path.join(templatesPath, 'wizard.js');

        let html = fs.readFileSync(htmlPath, 'utf8');
        
        const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));
        html = html.replace('<script src="wizard.js"></script>', `<script src="${jsUri}"></script>`);
        
        return html;
    }

    private getWelcomeContent(webview: vscode.Webview): string {
        const templatesPath = path.join(this._extensionPath, 'src', 'templates');
        const welcomePath = path.join(templatesPath, 'indie.html');
        const iconsPath = path.join(this._extensionPath, 'Icons');

        let html = fs.readFileSync(welcomePath, 'utf8');

        // Generate URIs for icons
        const svgTaskbarIconUri = webview.asWebviewUri(vscode.Uri.file(path.join(iconsPath, 'svgtaskbaricon.svg')));
        const cillersIconUri = webview.asWebviewUri(vscode.Uri.file(path.join(iconsPath, 'Cillers.svg')));
        const polytopeIconUri = webview.asWebviewUri(vscode.Uri.file(path.join(iconsPath, 'polytope.svg')));

        // Replace placeholders
        html = html.replace('{{svgtaskbaricon}}', svgTaskbarIconUri.toString());
        html = html.replace('{{cillers}}', cillersIconUri.toString());
        html = html.replace('{{polytope}}', polytopeIconUri.toString());
        
        // Inject CSP to allow unpkg.com
        const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://unpkg.com; img-src data: https: ${webview.cspSource}; font-src data:;">`;
        html = html.replace('<head>', `<head>${csp}`);

        // Inject CSS URI
        // const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
        // html = html.replace('</head>', `<link rel="stylesheet" href="${cssUri}"></head>`);
        
        return html;
    }
}
