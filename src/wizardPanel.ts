import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class WizardPanel {
    private panel: vscode.WebviewPanel | undefined;
    private static instance: WizardPanel | undefined;

    private constructor() {}

    public static getInstance(): WizardPanel {
        if (!WizardPanel.instance) {
            WizardPanel.instance = new WizardPanel();
        }
        return WizardPanel.instance;
    }

    public createOrShow(extensionPath: string): vscode.Webview | undefined {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return this.panel.webview;
        }

        this.panel = vscode.window.createWebviewPanel(
            'bluetextSetup',
            'Bluetext Setup Wizard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'src', 'templates'))]
            }
        );

        this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionPath);

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        return this.panel.webview;
    }

    public getWebview(): vscode.Webview | undefined {
        return this.panel?.webview;
    }

    public sendMessage(message: any): void {
        this.panel?.webview.postMessage(message);
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

    private getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
        const templatesPath = path.join(extensionPath, 'src', 'templates');
        const htmlPath = path.join(templatesPath, 'wizard.html');
        const jsPath = path.join(templatesPath, 'wizard.js');

        let html = fs.readFileSync(htmlPath, 'utf8');
        
        const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));
        html = html.replace('<script src="wizard.js"></script>', `<script src="${jsUri}"></script>`);
        
        return html;
    }
}
