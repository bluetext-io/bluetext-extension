const vscode = acquireVsCodeApi();
let clineConfigured = false;
let claudeConfigured = false;
let availableTools = [];
let executedTools = new Set();

function toggleHeader(headerId) {
    const content = document.getElementById(headerId + '-content');
    const arrow = document.getElementById(headerId + '-arrow');
    if (content && arrow) {
        content.classList.toggle('collapsed');
        arrow.classList.toggle('collapsed');
    }
}

function toggleTool(event, toolIndex) {
    const toolHeader = event.currentTarget;
    const toolItem = toolHeader.parentElement;
    const description = toolItem.querySelector('.tool-description');
    const icon = toolHeader.querySelector('.expand-icon');
    const isExpanded = description.style.maxHeight && description.style.maxHeight !== '0px';
    if (isExpanded) {
        description.style.maxHeight = '0';
        description.style.padding = '0 16px';
        icon.style.transform = 'rotate(0deg)';
    } else {
        description.style.maxHeight = description.scrollHeight + 'px';
        description.style.padding = '0 16px';
        icon.style.transform = 'rotate(180deg)';
    }
}

function runTool(toolIndex) {
    const tool = availableTools[toolIndex];
    if (!tool) return;
    executedTools.add(toolIndex);
    const button = document.querySelector(`[data-tool-index="${toolIndex}"]`);
    if (button) {
        button.style.background = '#28a745';
        button.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.25)';
    }
    vscode.postMessage({ command: 'runMcpTool', toolName: tool.name, toolSchema: tool.inputSchema });
}

function runCommand(command) {
    vscode.postMessage({ command: command });
}

function configureAgent() {
    const agentChoice = document.querySelector('input[name="agent"]:checked').value;
    const agentWarning = document.getElementById('agent-warning');
    if (agentChoice === 'cline') {
        clineConfigured = true;
    } else {
        claudeConfigured = true;
    }
    if (agentWarning) {
        agentWarning.classList.remove('show');
    }
    vscode.postMessage({ command: agentChoice === 'cline' ? 'configureCline' : 'configureClaudeCode' });
}

function startQuickSetup() {
    const agentChoice = document.querySelector('input[name="agent"]:checked').value;
    const agentWarning = document.getElementById('agent-warning');
    if (agentWarning) {
        agentWarning.classList.remove('show');
    }
    vscode.postMessage({ command: 'quickStart', agentChoice: agentChoice });
}

document.addEventListener('DOMContentLoaded', function() {
    const agentRadios = document.querySelectorAll('input[name="agent"]');
    const step3Button = document.getElementById('step-3-button');
    const agentWarning = document.getElementById('agent-warning');
    
    agentRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            const selectedAgent = this.value;
            const agentName = selectedAgent === 'cline' ? 'Cline' : 'Claude';
            const isConfigured = selectedAgent === 'cline' ? clineConfigured : claudeConfigured;
            
            if (step3Button) {
                step3Button.textContent = isConfigured ? '✓ ' + agentName : agentName;
            }
            
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
            
            if (agentWarning && !isConfigured && (clineConfigured || claudeConfigured)) {
                agentWarning.classList.add('show');
            } else if (agentWarning) {
                agentWarning.classList.remove('show');
            }
        });
    });
});

function updateStepStatus(stepNumber, status) {
    const stepElement = document.getElementById('step-' + stepNumber);
    const stepContainer = document.querySelector('.step[data-step="' + stepNumber + '"]');
    const stepsContainer = document.getElementById('steps-container');
    const stepTitle = document.getElementById('step-' + stepNumber + '-title');
    
    if (stepNumber === 3 && status === 'done') {
        const agentChoice = document.querySelector('input[name="agent"]:checked').value;
        if (agentChoice === 'cline') {
            clineConfigured = true;
        } else {
            claudeConfigured = true;
        }
    }
    
    if (stepElement) {
        stepElement.classList.remove('pending', 'doing', 'done', 'error');
        stepElement.classList.add(status);
    }
    if (stepContainer) {
        stepContainer.classList.remove('pending', 'doing', 'done', 'error');
        stepContainer.classList.add(status);
    }
    if (stepsContainer) {
        stepsContainer.classList.remove('step-' + stepNumber + '-pending', 'step-' + stepNumber + '-doing', 'step-' + stepNumber + '-done', 'step-' + stepNumber + '-error');
        stepsContainer.classList.add('step-' + stepNumber + '-' + status);
    }
    
    if (stepTitle) {
        if (status === 'done') {
            stepTitle.textContent = stepTitle.getAttribute('data-completed');
        } else {
            stepTitle.textContent = stepTitle.getAttribute('data-original');
        }
    }
    
    if (stepNumber === 3) {
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
        const button = document.getElementById('step-' + stepNumber + '-button');
        if (button) {
            if (status === 'done') {
                button.textContent = button.getAttribute('data-completed');
                // Disable step 4 button when MCP server is running
                if (stepNumber === 4) {
                    button.disabled = true;
                    button.style.opacity = '0.6';
                    button.style.cursor = 'not-allowed';
                }
            } else {
                button.textContent = button.getAttribute('data-original');
                // Re-enable step 4 button if status changes
                if (stepNumber === 4) {
                    button.disabled = false;
                    button.style.opacity = '1';
                    button.style.cursor = 'pointer';
                }
            }
        }
    }
}

function refreshTools() {
    vscode.postMessage({ command: 'fetchMcpTools' });
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

function updateTools(tools, error) {
    const toolsCard = document.getElementById('tools-card');
    const toolsLoading = document.getElementById('tools-loading');
    const toolsError = document.getElementById('tools-error');
    const toolsList = document.getElementById('tools-list');
    const toolsEmpty = document.getElementById('tools-empty');
    
    if (toolsCard) toolsCard.style.display = 'block';
    if (toolsLoading) toolsLoading.style.display = 'none';
    
    if (error) {
        if (toolsError) toolsError.style.display = 'block';
        if (toolsList) toolsList.style.display = 'none';
        if (toolsEmpty) toolsEmpty.style.display = 'none';
        return;
    }
    
    if (!tools || tools.length === 0) {
        if (toolsError) toolsError.style.display = 'none';
        if (toolsList) toolsList.style.display = 'none';
        if (toolsEmpty) toolsEmpty.style.display = 'block';
        return;
    }
    
    availableTools = tools;
    
    if (toolsError) toolsError.style.display = 'none';
    if (toolsEmpty) toolsEmpty.style.display = 'none';
    if (toolsList) {
        toolsList.style.display = 'block';
        let html = '<div style="display: grid; gap: 12px;">';
        
        tools.forEach((tool, index) => {
            const isExecuted = executedTools.has(index);
            const buttonBg = isExecuted ? '#28a745' : '#1e3c72';
            const buttonShadow = isExecuted ? '0 2px 4px rgba(40, 167, 69, 0.25)' : '0 2px 6px rgba(42, 82, 152, 0.25)';
            
            html += `
                <div class="tool-item" style="background: #f3f4f5; border-left: 4px solid #2a5298; border-radius: 4px; overflow: hidden;">
                    <div class="tool-header" onclick="toggleTool(event, ${index})" style="display: flex; align-items: center; gap: 12px; padding: 16px; cursor: pointer; user-select: none; transition: background-color 0.15s ease;" onmouseenter="this.style.backgroundColor='rgba(42, 82, 152, 0.04)'" onmouseleave="this.style.backgroundColor='transparent'">
                        <div style="background: #2a5298; color: white; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px;">🔧</div>
                        <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
                            <h3 style="font-size: 16px; font-weight: 600; color: #1e3c72; margin: 0;">${escapeHtml(tool.name)}</h3>
                            <svg class="expand-icon" width="12" height="12" viewBox="0 0 12 12" style="transition: transform 0.2s ease; opacity: 0.6; flex-shrink: 0;">
                                <path d="M2 4 L6 8 L10 4" fill="none" stroke="#2a5298" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <button data-tool-index="${index}" onclick="runTool(${index}); event.stopPropagation();" style="background: ${buttonBg}; padding: 6px 16px; font-size: 12px; border-radius: 4px; box-shadow: ${buttonShadow}; transition: all 0.2s ease;">▶ Run</button>
                    </div>
                    <div class="tool-description" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; padding: 0 16px;">
                        <p style="font-size: 13px; color: #5a6c7d; margin: 0; line-height: 1.5; padding-bottom: 16px; border-top: 1px solid #e0e0e0; padding-top: 12px;">${escapeHtml(tool.description || 'No description available')}</p>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        html += `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e0e0e0; text-align: center; color: #6c757d; font-size: 13px;">Total: ${tools.length} tool${tools.length !== 1 ? 's' : ''}</div>`;
        toolsList.innerHTML = html;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addConsoleMessage(message, type, timestamp) {
    const console = document.getElementById('console-output');
    if (!console) return;
    
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
    line.innerHTML = `<span style="color: #6c757d;">[${timestamp}]</span> ${message}`;
    
    console.appendChild(line);
    console.scrollTop = console.scrollHeight;
}

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
