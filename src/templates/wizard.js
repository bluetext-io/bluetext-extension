const vscode = acquireVsCodeApi();
let clineConfigured = false;
let claudeConfigured = false;
let copilotConfigured = false;
let availableTools = [];
let executedTools = new Set();
let currentToolIndex = null;

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
    const paramsSection = toolItem.querySelector('.tool-params-section');
    const icon = toolHeader.querySelector('.expand-icon');
    const isExpanded = description.style.maxHeight && description.style.maxHeight !== '0px';
    
    if (isExpanded) {
        description.style.maxHeight = '0';
        description.style.padding = '0 16px';
        icon.style.transform = 'rotate(0deg)';
        if (paramsSection) {
            paramsSection.classList.remove('show');
        }
    } else {
        description.style.maxHeight = description.scrollHeight + 'px';
        description.style.padding = '0 16px';
        icon.style.transform = 'rotate(180deg)';
        if (paramsSection) {
            paramsSection.classList.add('show');
        }
    }
}

function runTool(toolIndex) {
    const tool = availableTools[toolIndex];
    if (!tool) return;
    
    // Collect parameters and run tool
    const params = collectToolParams(toolIndex);
    if (params !== null) {
        executeToolDirect(toolIndex, params);
    }
}

function collectToolParams(toolIndex) {
    const tool = availableTools[toolIndex];
    if (!tool) return null;
    
    const schema = tool.inputSchema;
    if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
        return {};
    }
    
    const params = {};
    const properties = schema.properties;
    
    // First, populate with all default values from the schema
    Object.keys(properties).forEach(paramName => {
        const param = properties[paramName];
        if (param.default !== undefined) {
            params[paramName] = param.default;
        }
    });
    
    // Then override with user input values if they exist
    const inputs = document.querySelectorAll(`[data-tool-params="${toolIndex}"] .tool-param-input`);
    
    inputs.forEach(input => {
        const paramName = input.getAttribute('data-param');
        const paramType = input.getAttribute('data-type');
        let value;
        let hasValue = false;
        
        if (paramType === 'boolean') {
            // For checkboxes, always use the checked state (even if false)
            value = input.checked;
            hasValue = true;
        } else if (paramType === 'number' || paramType === 'integer') {
            if (input.value !== '') {
                value = paramType === 'integer' ? parseInt(input.value, 10) : parseFloat(input.value);
                hasValue = true;
            }
        } else if (paramType === 'array' || paramType === 'object') {
            if (input.value.trim()) {
                try {
                    value = JSON.parse(input.value);
                    hasValue = true;
                } catch (e) {
                    alert(`Invalid JSON for parameter "${paramName}": ${e.message}`);
                    return null;
                }
            }
        } else {
            if (input.value !== '') {
                value = input.value;
                hasValue = true;
            }
        }
        
        // Override default with user value if provided
        if (hasValue) {
            params[paramName] = value;
        }
    });
    
    return params;
}

function openParamModal(toolIndex) {
    const tool = availableTools[toolIndex];
    if (!tool) return;
    
    currentToolIndex = toolIndex;
    const modal = document.getElementById('param-modal');
    const modalTitle = document.getElementById('modal-tool-name');
    const modalBody = document.getElementById('modal-body');
    
    if (modalTitle) {
        modalTitle.textContent = `${tool.name} - Parameters`;
    }
    
    // Generate parameter form
    const schema = tool.inputSchema;
    let html = '';
    
    if (schema && schema.properties) {
        const properties = schema.properties;
        const required = schema.required || [];
        
        Object.keys(properties).forEach(paramName => {
            const param = properties[paramName];
            const isRequired = required.includes(paramName);
            const paramType = param.type || 'string';
            const description = param.description || '';
            
            html += '<div class="param-group">';
            html += `<label class="param-label">${escapeHtml(paramName)}`;
            if (isRequired) {
                html += '<span class="param-required">*</span>';
            }
            html += '</label>';
            
            if (description) {
                html += `<div class="param-description">${escapeHtml(description)}</div>`;
            }
            
            // Generate appropriate input based on type
            if (paramType === 'boolean') {
                html += `<input type="checkbox" class="param-input" data-param="${escapeHtml(paramName)}" data-type="boolean">`;
            } else if (paramType === 'number' || paramType === 'integer') {
                html += `<input type="number" class="param-input" data-param="${escapeHtml(paramName)}" data-type="${paramType}" ${isRequired ? 'required' : ''} placeholder="Enter ${paramName}">`;
            } else if (paramType === 'array') {
                html += `<textarea class="param-input" data-param="${escapeHtml(paramName)}" data-type="array" rows="3" ${isRequired ? 'required' : ''} placeholder="Enter JSON array, e.g., [&quot;item1&quot;, &quot;item2&quot;]"></textarea>`;
            } else if (paramType === 'object') {
                html += `<textarea class="param-input" data-param="${escapeHtml(paramName)}" data-type="object" rows="4" ${isRequired ? 'required' : ''} placeholder="Enter JSON object, e.g., {&quot;key&quot;: &quot;value&quot;}"></textarea>`;
            } else {
                // Default to text input for string and unknown types
                html += `<input type="text" class="param-input" data-param="${escapeHtml(paramName)}" data-type="string" ${isRequired ? 'required' : ''} placeholder="Enter ${paramName}">`;
            }
            
            html += '</div>';
        });
    } else {
        html = '<div class="no-params-message">This tool has no parameters configured.</div>';
    }
    
    if (modalBody) {
        modalBody.innerHTML = html;
    }
    
    if (modal) {
        modal.classList.add('active');
    }
}

function closeParamModal() {
    const modal = document.getElementById('param-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    currentToolIndex = null;
}

function submitToolExecution() {
    if (currentToolIndex === null) return;
    
    const tool = availableTools[currentToolIndex];
    if (!tool) return;
    
    // Collect parameter values
    const params = {};
    const inputs = document.querySelectorAll('.param-input');
    
    let hasError = false;
    
    inputs.forEach(input => {
        const paramName = input.getAttribute('data-param');
        const paramType = input.getAttribute('data-type');
        let value;
        
        if (paramType === 'boolean') {
            value = input.checked;
        } else if (paramType === 'number' || paramType === 'integer') {
            value = input.value ? (paramType === 'integer' ? parseInt(input.value, 10) : parseFloat(input.value)) : undefined;
        } else if (paramType === 'array' || paramType === 'object') {
            if (input.value.trim()) {
                try {
                    value = JSON.parse(input.value);
                } catch (e) {
                    alert(`Invalid JSON for parameter "${paramName}": ${e.message}`);
                    hasError = true;
                    return;
                }
            }
        } else {
            value = input.value || undefined;
        }
        
        // Only add parameter if it has a value
        if (value !== undefined && value !== '') {
            params[paramName] = value;
        }
    });
    
    if (hasError) return;
    
    // Close modal
    closeParamModal();
    
    // Execute tool with parameters
    executeToolDirect(currentToolIndex, params);
}

function executeToolDirect(toolIndex, params) {
    const tool = availableTools[toolIndex];
    if (!tool) return;
    
    executedTools.add(toolIndex);
    const button = document.querySelector(`[data-tool-index="${toolIndex}"]`);
    if (button) {
        button.style.background = '#28a745';
        button.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.25)';
    }
    
    vscode.postMessage({ 
        command: 'runMcpTool', 
        toolName: tool.name, 
        toolSchema: tool.inputSchema,
        parameters: params
    });
}

function runCommand(command) {
    vscode.postMessage({ command: command });
}

function configureAgent() {
    const agentChoice = document.querySelector('input[name="agent"]:checked').value;
    const agentWarning = document.getElementById('agent-warning');
    if (agentChoice === 'cline') {
        clineConfigured = true;
    } else if (agentChoice === 'claude') {
        claudeConfigured = true;
    } else if (agentChoice === 'copilot') {
        copilotConfigured = true;
    }
    if (agentWarning) {
        agentWarning.classList.remove('show');
    }
    const commandMap = {
        'cline': 'configureCline',
        'claude': 'configureClaudeCode',
        'copilot': 'configureCopilot'
    };
    vscode.postMessage({ command: commandMap[agentChoice] });
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
            const agentName = selectedAgent === 'cline' ? 'Cline' : selectedAgent === 'claude' ? 'Claude' : 'Copilot';
            const isConfigured = selectedAgent === 'cline' ? clineConfigured : selectedAgent === 'claude' ? claudeConfigured : copilotConfigured;
            
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
            
            if (agentWarning && !isConfigured && (clineConfigured || claudeConfigured || copilotConfigured)) {
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
        } else if (agentChoice === 'claude') {
            claudeConfigured = true;
        } else if (agentChoice === 'copilot') {
            copilotConfigured = true;
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
                const completedText = button.getAttribute('data-completed-' + agentChoice);
                const text = completedText.replace('✓ ', '');
                button.innerHTML = '<span class="checkmark-icon"><svg viewBox="0 0 16 16"><polyline points="3,8 6,11 13,4"></polyline></svg></span>' + text;
            } else {
                button.textContent = button.getAttribute('data-original-' + agentChoice);
            }
        }
    } else {
        const button = document.getElementById('step-' + stepNumber + '-button');
        if (button) {
            if (status === 'done') {
                const completedText = button.getAttribute('data-completed');
                const text = completedText.replace('✓ ', '');
                button.innerHTML = '<span class="checkmark-icon"><svg viewBox="0 0 16 16"><polyline points="3,8 6,11 13,4"></polyline></svg></span>' + text;
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
            
            // Generate parameter form HTML
            const schema = tool.inputSchema;
            const hasParams = schema && schema.properties && Object.keys(schema.properties).length > 0;
            
            // Check if all required parameters have default values
            let hasDefaultsForRequired = false;
            if (hasParams) {
                const required = schema.required || [];
                const properties = schema.properties;
                
                if (required.length === 0) {
                    // No required parameters means we can run with defaults/empty params
                    hasDefaultsForRequired = true;
                } else {
                    // Check if all required parameters have default values
                    hasDefaultsForRequired = required.every(paramName => {
                        return properties[paramName] && properties[paramName].default !== undefined;
                    });
                }
            }
            
            let paramsHtml = '';
            
            if (hasParams) {
                const properties = schema.properties;
                const required = schema.required || [];
                
                Object.keys(properties).forEach(paramName => {
                    const param = properties[paramName];
                    const isRequired = required.includes(paramName);
                    const paramType = param.type || 'string';
                    const description = param.description || '';
                    const defaultValue = param.default;
                    
                    paramsHtml += '<div class="tool-param-group">';
                    paramsHtml += `<label class="tool-param-label">${escapeHtml(paramName)}`;
                    if (isRequired) {
                        paramsHtml += '<span class="tool-param-required">*</span>';
                    }
                    paramsHtml += '</label>';
                    
                    if (description) {
                        paramsHtml += `<div class="tool-param-description">${escapeHtml(description)}</div>`;
                    }
                    
                    // Generate appropriate input based on type with default values
                    if (paramType === 'boolean') {
                        const checked = defaultValue === true ? 'checked' : '';
                        paramsHtml += `<input type="checkbox" class="tool-param-input" data-param="${escapeHtml(paramName)}" data-type="boolean" ${checked}>`;
                    } else if (paramType === 'number' || paramType === 'integer') {
                        const value = defaultValue !== undefined ? ` value="${defaultValue}"` : '';
                        paramsHtml += `<input type="number" class="tool-param-input" data-param="${escapeHtml(paramName)}" data-type="${paramType}" ${isRequired ? 'required' : ''} placeholder="Enter ${paramName}"${value}>`;
                    } else if (paramType === 'array') {
                        const value = defaultValue !== undefined ? escapeHtml(JSON.stringify(defaultValue, null, 2)) : '';
                        paramsHtml += `<textarea class="tool-param-input" data-param="${escapeHtml(paramName)}" data-type="array" rows="3" ${isRequired ? 'required' : ''} placeholder="Enter JSON array, e.g., [&quot;item1&quot;, &quot;item2&quot;]">${value}</textarea>`;
                    } else if (paramType === 'object') {
                        const value = defaultValue !== undefined ? escapeHtml(JSON.stringify(defaultValue, null, 2)) : '';
                        paramsHtml += `<textarea class="tool-param-input" data-param="${escapeHtml(paramName)}" data-type="object" rows="4" ${isRequired ? 'required' : ''} placeholder="Enter JSON object, e.g., {&quot;key&quot;: &quot;value&quot;}">${value}</textarea>`;
                    } else {
                        const value = defaultValue !== undefined ? ` value="${escapeHtml(String(defaultValue))}"` : '';
                        paramsHtml += `<input type="text" class="tool-param-input" data-param="${escapeHtml(paramName)}" data-type="string" ${isRequired ? 'required' : ''} placeholder="Enter ${paramName}"${value}>`;
                    }
                    
                    paramsHtml += '</div>';
                });
                
                // Add run button in the params section
                paramsHtml = `<div class="tool-params-section" data-tool-params="${index}">${paramsHtml}<div class="tool-actions"><button onclick="runTool(${index}); event.stopPropagation();" style="background: #1e3c72; padding: 6px 16px; font-size: 12px; border-radius: 4px; box-shadow: 0 2px 6px rgba(42, 82, 152, 0.25); transition: all 0.2s ease; display: flex; align-items: center; gap: 4px; border: none; color: white; cursor: pointer;"><svg width="12" height="13" viewBox="0 0 71.884262 76.735161" style="flex-shrink: 0;"><path style="fill:none;stroke:#ffffff;stroke-width:10;stroke-linecap:square;stroke-linejoin:miter" d="m 12.259,2 c -4.05249,0.15214 -7.259192,3.48167 -7.258988,7.53701 v 25.65631 0.39946 25.65632 c -1.58e-4,5.79375 6.261243,9.42401 11.289233,6.54533 l 45.286075,-23.39342 a 10.1794,10.1794 89.96398 0 0 -0.0114,-18.09387 L 16.28924,2.99196 c -1.224231,-0.70098 -2.620523,-1.04455 -4.030245,-0.99167 z" /></svg>Run Tool</button></div></div>`;
            }
            
            // Generate header action based on parameter status
            let headerAction = '';
            if (hasParams && hasDefaultsForRequired) {
                // Has parameters but all required ones have defaults - show badge and enabled run button
                headerAction = `
                    <div class="tool-header-actions">
                        <div class="tool-info-badge">
                            <span>Defaults provided</span>
                        </div>
                        <button data-tool-index="${index}" onclick="runTool(${index}); event.stopPropagation();" style="background: ${buttonBg}; padding: 6px 16px; font-size: 12px; border-radius: 4px; box-shadow: ${buttonShadow}; transition: all 0.2s ease; display: flex; align-items: center; gap: 4px; border: none; color: white; cursor: pointer;"><svg width="12" height="13" viewBox="0 0 71.884262 76.735161" style="flex-shrink: 0;"><path style="fill:none;stroke:#ffffff;stroke-width:10;stroke-linecap:square;stroke-linejoin:miter" d="m 12.259,2 c -4.05249,0.15214 -7.259192,3.48167 -7.258988,7.53701 v 25.65631 0.39946 25.65632 c -1.58e-4,5.79375 6.261243,9.42401 11.289233,6.54533 l 45.286075,-23.39342 a 10.1794,10.1794 89.96398 0 0 -0.0114,-18.09387 L 16.28924,2.99196 c -1.224231,-0.70098 -2.620523,-1.04455 -4.030245,-0.99167 z" /></svg>Run</button>
                    </div>`;
            } else if (hasParams && !hasDefaultsForRequired) {
                // Has parameters but missing defaults for required ones - show badge and disabled run button
                headerAction = `
                    <div class="tool-header-actions">
                        <div class="tool-info-badge">
                            <span>Expects parameters</span>
                        </div>
                        <button class="tool-run-button-disabled" style="padding: 6px 16px; font-size: 12px; border-radius: 4px; transition: all 0.2s ease; display: flex; align-items: center; gap: 4px; border: none; color: white;"><svg width="12" height="13" viewBox="0 0 71.884262 76.735161" style="flex-shrink: 0;"><path style="fill:none;stroke:#ffffff;stroke-width:10;stroke-linecap:square;stroke-linejoin:miter" d="m 12.259,2 c -4.05249,0.15214 -7.259192,3.48167 -7.258988,7.53701 v 25.65631 0.39946 25.65632 c -1.58e-4,5.79375 6.261243,9.42401 11.289233,6.54533 l 45.286075,-23.39342 a 10.1794,10.1794 89.96398 0 0 -0.0114,-18.09387 L 16.28924,2.99196 c -1.224231,-0.70098 -2.620523,-1.04455 -4.030245,-0.99167 z" /></svg>Run</button>
                    </div>`;
            } else {
                // No parameters - show normal run button
                headerAction = `<button data-tool-index="${index}" onclick="runTool(${index}); event.stopPropagation();" style="background: ${buttonBg}; padding: 6px 16px; font-size: 12px; border-radius: 4px; box-shadow: ${buttonShadow}; transition: all 0.2s ease; display: flex; align-items: center; gap: 4px;"><svg width="12" height="13" viewBox="0 0 71.884262 76.735161" style="flex-shrink: 0;"><path style="fill:none;stroke:#ffffff;stroke-width:10;stroke-linecap:square;stroke-linejoin:miter" d="m 12.259,2 c -4.05249,0.15214 -7.259192,3.48167 -7.258988,7.53701 v 25.65631 0.39946 25.65632 c -1.58e-4,5.79375 6.261243,9.42401 11.289233,6.54533 l 45.286075,-23.39342 a 10.1794,10.1794 89.96398 0 0 -0.0114,-18.09387 L 16.28924,2.99196 c -1.224231,-0.70098 -2.620523,-1.04455 -4.030245,-0.99167 z" /></svg>Run</button>`;
            }
            
            html += `
                <div class="tool-item" style="background: #f3f4f5; border-left: 4px solid #2a5298; border-radius: 4px; overflow: hidden;">
                    <div class="tool-header" onclick="toggleTool(event, ${index})" style="display: flex; align-items: center; gap: 12px; padding: 16px; cursor: pointer; user-select: none; transition: background-color 0.15s ease;" onmouseenter="this.style.backgroundColor='rgba(42, 82, 152, 0.04)'" onmouseleave="this.style.backgroundColor='transparent'">
                        <div style="background: #2a5298; color: white; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><svg viewBox="0 0 107.688 109.773" style="width: 20px; height: 20px;" xmlns="http://www.w3.org/2000/svg"><g transform="translate(-45.471,-18.226)"><path style="fill:#ffffff" d="m 125.866,18.410 c -10.741,1.436 -19.373,10.067 -20.810,20.808 -0.232,1.737 -0.232,4.595 0,6.331 1.437,10.741 10.068,19.373 20.810,20.810 1.737,0.232 4.595,0.232 6.331,0 10.927,-1.462 19.669,-10.369 20.876,-21.369 0.157,-1.433 0.105,-3.783 -0.194,-5.191 -0.274,-1.292 -2.066,-0.911 -3.771,0.793 l -8.082,8.076 c -0.979,0.979 -2.565,2.622 -3.808,3.216 -0.681,0.325 -1.396,0.535 -2.112,0.620 -1.719,0.206 -4.385,-1.075 -5.972,-1.821 -0.999,-0.470 -3.141,-1.429 -4.468,-2.567 -0.456,-0.391 -0.880,-0.816 -1.270,-1.273 -1.135,-1.329 -2.314,-3.950 -3.057,-5.539 -0.467,-0.997 -1.518,-3.187 -1.311,-4.905 0.061,-0.504 0.183,-1.007 0.363,-1.498 0.600,-1.633 2.728,-3.636 3.970,-4.874 2.982,-2.974 5.894,-6.022 8.894,-8.978 1.248,-1.230 0.893,-2.557 -0.850,-2.731 -1.306,-0.130 -3.803,-0.140 -5.540,0.092 z"/></g><g transform="translate(-45.471,-18.226)"><path style="fill:none;stroke:#ffffff;stroke-width:18.9;stroke-linecap:round;stroke-linejoin:round" d="M 54.921,118.549 115.535,57.935"/></g></svg></div>
                        <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
                            <h3 style="font-size: 16px; font-weight: 600; color: #1e3c72; margin: 0;">${escapeHtml(tool.name)}</h3>
                            <svg class="expand-icon" width="12" height="12" viewBox="0 0 12 12" style="transition: transform 0.2s ease; opacity: 0.6; flex-shrink: 0;">
                                <path d="M2 4 L6 8 L10 4" fill="none" stroke="#2a5298" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        ${headerAction}
                    </div>
                    <div class="tool-description" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; padding: 0 16px;">
                        <p style="font-size: 13px; color: #5a6c7d; margin: 0; line-height: 1.5; padding-bottom: 16px; border-top: 1px solid #e0e0e0; padding-top: 12px;">${escapeHtml(tool.description || 'No description available')}</p>
                    </div>
                    ${paramsHtml}
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
