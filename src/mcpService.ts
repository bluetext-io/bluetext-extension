import * as http from 'http';
import * as vscode from 'vscode';
import { WizardPanel } from './wizardPanel';

export class McpService {
    private static instance: McpService;
    private healthCheckInterval: NodeJS.Timeout | undefined;
    private isMonitoring: boolean = false;

    private constructor() {}

    public static getInstance(): McpService {
        if (!McpService.instance) {
            McpService.instance = new McpService();
        }
        return McpService.instance;
    }

    public startHealthMonitoring(): void {
        if (this.isMonitoring) {
            return; // Already monitoring
        }

        this.isMonitoring = true;
        const panel = WizardPanel.getInstance();
        
        panel.logToTerminal('🔍 Starting MCP server health monitoring...', 'info');

        // Check immediately
        this.checkServerHealth();

        // Then check every 2 seconds for near-instant detection
        this.healthCheckInterval = setInterval(() => {
            this.checkServerHealth();
        }, 2000);
    }

    public stopHealthMonitoring(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }
        this.isMonitoring = false;
        
        const panel = WizardPanel.getInstance();
        panel.logToTerminal('🛑 Stopped MCP server health monitoring', 'info');
    }

    private async checkServerHealth(): Promise<void> {
        const config = vscode.workspace.getConfiguration('bluetext');
        const mcpPort = config.get<number>('mcpPort', 31338);
        const panel = WizardPanel.getInstance();

        return new Promise<void>((resolve) => {
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
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    // Server responded, it's alive
                    resolve();
                });
                res.on('error', () => {
                    // Server connection failed
                    this.handleServerDown();
                    resolve();
                });
            });

            req.on('error', () => {
                // Server is down
                this.handleServerDown();
                resolve();
            });

            req.on('timeout', () => {
                req.destroy();
                this.handleServerDown();
                resolve();
            });

            req.setTimeout(5000); // 5 second timeout for health checks

            const body = JSON.stringify({
                jsonrpc: '2.0',
                id: 999,
                method: 'tools/list',
                params: {}
            });

            try {
                req.write(body);
                req.end();
            } catch (error) {
                this.handleServerDown();
                resolve();
            }
        });
    }

    private handleServerDown(): void {
        if (!this.isMonitoring) {
            return; // Don't update if we stopped monitoring
        }

        const panel = WizardPanel.getInstance();
        panel.logToTerminal('⚠️  MCP server is not responding - resetting step 4', 'error');
        panel.updateStepStatus(4, 'pending');
        
        // Stop monitoring since server is down
        this.stopHealthMonitoring();
    }

    public async fetchTools(): Promise<void> {
        const panel = WizardPanel.getInstance();
        const config = vscode.workspace.getConfiguration('bluetext');
        const mcpPort = config.get<number>('mcpPort', 31338);
        
        panel.logToTerminal(`🔍 Fetching tools from MCP server...`, 'info');

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

            panel.logToTerminal(`Connecting to 127.0.0.1:${mcpPort}/mcp`, 'info');

            const req = http.request(options, (res) => {
                panel.logToTerminal(`✓ Connected! Status: ${res.statusCode}`, 'success');
                
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                    panel.logToTerminal(`Received ${chunk.length} bytes...`, 'info');
                });

                res.on('end', () => {
                    panel.logToTerminal(`✓ Response complete (${data.length} bytes total)`, 'success');
                    
                    try {
                        const response = JSON.parse(data.trim());
                        const tools = response?.result?.tools || [];
                        
                        if (tools.length > 0) {
                            panel.logToTerminal(`✓ Found ${tools.length} tools`, 'success');
                            const toolNames = tools.slice(0, 3).map((t: any) => t.name).join(', ');
                            panel.logToTerminal(`Tools: ${toolNames}${tools.length > 3 ? '...' : ''}`, 'info');
                        } else {
                            panel.logToTerminal(`⚠️  No tools found in response`, 'info');
                        }

                        panel.sendMessage({
                            command: 'updateTools',
                            tools: tools
                        });

                        resolve();
                    } catch (error) {
                        const errorMsg = `Failed to parse response: ${error}`;
                        panel.logToTerminal(errorMsg, 'error');
                        
                        panel.sendMessage({
                            command: 'updateTools',
                            tools: [],
                            error: String(error)
                        });
                        
                        reject(error);
                    }
                });

                res.on('error', (error) => {
                    panel.logToTerminal(`Response stream error: ${error.message}`, 'error');
                    panel.sendMessage({
                        command: 'updateTools',
                        tools: [],
                        error: error.message
                    });
                    reject(error);
                });
            });

            req.on('error', (error) => {
                panel.logToTerminal(`❌ Request error: ${error.message}`, 'error');
                panel.logToTerminal('💡 Make sure MCP server is running at 127.0.0.1:31338', 'info');
                
                panel.sendMessage({
                    command: 'updateTools',
                    tools: [],
                    error: `${error.name}: ${error.message}`
                });
                
                reject(error);
            });

            req.on('timeout', () => {
                panel.logToTerminal(`❌ Request timed out`, 'error');
                req.destroy();
                
                panel.sendMessage({
                    command: 'updateTools',
                    tools: [],
                    error: 'Request timed out'
                });
                
                reject(new Error('Request timed out'));
            });

            req.setTimeout(10000);

            const body = JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/list',
                params: {}
            });

            panel.logToTerminal(`📤 Sending request: ${body}`, 'info');
            
            try {
                req.write(body);
                req.end();
                panel.logToTerminal(`✓ Request sent, waiting for response...`, 'info');
            } catch (error) {
                panel.logToTerminal(`❌ Failed to send request: ${error}`, 'error');
                reject(error);
            }
        });
    }

    public async executeTool(toolName: string, toolSchema: any, parameters?: any): Promise<void> {
        const panel = WizardPanel.getInstance();
        const config = vscode.workspace.getConfiguration('bluetext');
        const mcpPort = config.get<number>('mcpPort', 31338);
        
        panel.logToTerminal(`▶ Running tool: ${toolName}`, 'command');
        
        // Use provided parameters or empty object
        const args = parameters || {};
        
        // Log parameters if they exist
        if (parameters && Object.keys(parameters).length > 0) {
            panel.logToTerminal(`Parameters: ${JSON.stringify(parameters, null, 2)}`, 'info');
        }
        
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
                            panel.logToTerminal(`❌ Tool execution failed: ${response.error.message}`, 'error');
                            reject(new Error(response.error.message));
                        } else {
                            panel.logToTerminal(`✅ Tool executed successfully!`, 'success');
                            
                            if (response.result) {
                                const resultStr = JSON.stringify(response.result, null, 2);
                                panel.logToTerminal(`Result: ${resultStr}`, 'info');
                            }
                            
                            resolve();
                        }
                    } catch (error) {
                        panel.logToTerminal(`Failed to parse tool response: ${error}`, 'error');
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                panel.logToTerminal(`❌ Tool execution error: ${error.message}`, 'error');
                reject(error);
            });

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
}
