#!/usr/bin/env node

// Extension to add custom_nodes management to ecli
// This should be integrated into the main index.js file

// ==============================================
// Custom Nodes API Functions (similar to model functions)
// ==============================================

async function fetchGetCustomNodes(config, options = {}) {
  try {
    const searchParams = new URLSearchParams();
    if (options.category) searchParams.set('category', options.category);
    if (options.search) searchParams.set('search', options.search);
    
    const url = `${config.apiUrl}/custom-nodes${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    return {
      data: null,
      error: `Failed to fetch custom nodes: ${error.message}`,
    };
  }
}

async function fetchGetCustomNodeByName(config, name) {
  try {
    const url = `${config.apiUrl}/custom-nodes/name/${encodeURIComponent(name)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    return {
      data: null,
      error: `Failed to fetch custom node ${name}: ${error.message}`,
    };
  }
}

async function fetchCreateCustomNode(config, customNodeData) {
  try {
    const url = `${config.apiUrl}/custom-nodes`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(customNodeData),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    return {
      data: null,
      error: `Failed to create custom node: ${error.message}`,
    };
  }
}

// ==============================================
// Helper Functions
// ==============================================

function extractCustomNodesFromWorkflow(workflow) {
  const customNodes = new Set();
  
  if (!workflow || !workflow.nodes) {
    return [];
  }
  
  // Look for non-standard ComfyUI nodes (custom nodes)
  const standardNodes = new Set([
    'KSampler', 'CLIPTextEncode', 'CheckpointLoaderSimple', 'VAEDecode', 
    'EmptyLatentImage', 'LoadImage', 'SaveImage', 'LatentUpscale',
    'ControlNetLoader', 'ControlNetApply', 'VAELoader', 'LoraLoader'
    // Add more standard nodes as needed
  ]);
  
  workflow.nodes.forEach(node => {
    if (node.type && !standardNodes.has(node.type)) {
      // This is likely a custom node
      customNodes.add(node.type);
    }
  });
  
  return Array.from(customNodes);
}

async function promptForCustomNodeSelection(config, currentCustomNodes = []) {
  const { data: availableCustomNodes, error } = await fetchGetCustomNodes(config);
  
  if (error) {
    console.error(chalk.red(`Error fetching custom nodes: ${error}`));
    return [];
  }
  
  if (!availableCustomNodes || availableCustomNodes.length === 0) {
    console.log(chalk.yellow("No custom nodes available in the system"));
    return [];
  }
  
  console.log(chalk.blue("\nSelect custom nodes this component will use:"));
  if (currentCustomNodes.length > 0) {
    console.log(chalk.gray(`Currently selected: ${currentCustomNodes.join(', ')}`));
  }
  console.log(chalk.gray("Use ↑↓ to navigate, Space to select/deselect, Enter to confirm"));
  
  const customNodeChoices = availableCustomNodes.map(customNode => ({
    name: `${customNode.name} (${customNode.category || 'uncategorized'})`,
    value: customNode.name,
    checked: currentCustomNodes.includes(customNode.name),
    description: customNode.description || 'No description'
  }));
  
  const selectedCustomNodes = await checkbox({
    message: "Choose custom nodes:",
    choices: customNodeChoices,
    instructions: false,
  });
  
  if (selectedCustomNodes.length > 0) {
    console.log(chalk.blue(`\nSelected custom nodes: ${selectedCustomNodes.join(', ')}`));
  } else {
    console.log(chalk.gray("No custom nodes selected"));
  }
  
  return selectedCustomNodes;
}

// ==============================================
// CLI Command Functions
// ==============================================

async function listCustomNodes(options) {
  try {
    const config = await getCurrentEnvironment();
    const { data: customNodes, error } = await fetchGetCustomNodes(config, { 
      category: options.category 
    });
    
    if (error) {
      console.error(chalk.red(`Error fetching custom nodes: ${error}`));
      return;
    }
    
    if (!customNodes || customNodes.length === 0) {
      console.log(chalk.yellow("No custom nodes found"));
      return;
    }
    
    console.log(chalk.blue("\nCustom Nodes Registry (from API):"));
    console.log(chalk.blue(`Found ${customNodes.length} custom nodes:\n`));
    
    customNodes.forEach((customNode) => {
      console.log(`${chalk.white(customNode.name)}`);
      console.log(`  ID: ${customNode.id}`);
      console.log(`  Category: ${customNode.category || 'uncategorized'}`);
      console.log(`  Git URL: ${customNode.gitUrl}`);
      console.log(`  Branch: ${customNode.gitBranch || 'main'}`);
      console.log(`  Install Method: ${customNode.installMethod || 'git_clone'}`);
      console.log(`  Status: ${customNode.status || 'active'}`);
      console.log(`  Description: ${customNode.description || 'No description'}`);
      console.log();
    });
  } catch (error) {
    console.error(chalk.red(`Error listing custom nodes: ${error.message}`));
  }
}

async function addCustomNode(name) {
  try {
    const config = await getCurrentEnvironment();
    
    // Check if custom node already exists
    const { data: existingCustomNode } = await fetchGetCustomNodeByName(config, name);
    if (existingCustomNode) {
      console.error(chalk.red(`Custom node "${name}" already exists`));
      return;
    }

    console.log(chalk.blue(`Adding new custom node: ${name}`));

    const displayName = await input({ 
      message: "Enter the display name:", 
      default: name,
      required: true 
    });
    
    const gitUrl = await input({ 
      message: "Enter the Git repository URL:", 
      required: true 
    });
    
    const gitBranch = await input({ 
      message: "Enter the Git branch:", 
      default: "main"
    });
    
    const category = await select({
      message: "Select category:",
      choices: [
        { name: "controlnet", value: "controlnet" },
        { name: "video", value: "video" },
        { name: "upscaling", value: "upscaling" },
        { name: "utilities", value: "utilities" },
        { name: "animation", value: "animation" },
        { name: "preprocessing", value: "preprocessing" },
        { name: "other", value: "other" }
      ]
    });
    
    const description = await input({ 
      message: "Enter description:", 
      required: true 
    });
    
    const installMethod = await select({
      message: "Select install method:",
      choices: [
        { name: "Git Clone", value: "git_clone" },
        { name: "Pip Install", value: "pip_install" },
        { name: "Manual", value: "manual" }
      ]
    });
    
    const requirements = await input({ 
      message: "Enter pip requirements (comma-separated, optional):" 
    });
    
    const postInstallScript = await input({ 
      message: "Enter post-install script commands (optional):" 
    });
    
    const comfyuiCompatibility = await input({ 
      message: "Enter ComfyUI compatibility (e.g., '>=1.0.0', optional):" 
    });

    const customNodeData = {
      name,
      displayName,
      gitUrl,
      gitBranch: gitBranch || "main",
      category,
      description,
      installMethod,
      requirements: requirements ? requirements.split(',').map(r => r.trim()) : [],
      postInstallScript: postInstallScript || null,
      comfyuiCompatibility: comfyuiCompatibility || null
    };

    const { data: newCustomNode, error } = await fetchCreateCustomNode(config, customNodeData);
    
    if (error) {
      console.error(chalk.red(`Error creating custom node: ${error}`));
      return;
    }

    console.log(chalk.green(`✓ Custom node "${name}" added successfully!`));
    console.log(chalk.gray(`  ID: ${newCustomNode.id}`));
    console.log(chalk.gray(`  Status: ${newCustomNode.status}`));
  } catch (error) {
    console.error(chalk.red(`Error adding custom node: ${error.message}`));
  }
}

// ==============================================
// Integration Points
// ==============================================

// This should be added to the newComponent() function around line 614:
/*
// Add custom node selection for workflow components
if (componentData.type === "comfy_workflow") {
  console.log(chalk.blue("\nModel Selection for Component:"));
  const selectedModels = await promptForModelSelection(config);
  componentData.models = selectedModels;
  
  console.log(chalk.blue("\nCustom Node Selection for Component:"));
  const selectedCustomNodes = await promptForCustomNodeSelection(config);
  componentData.custom_nodes = selectedCustomNodes;
}
*/

// This should be added to the updateComponent() function around line 1274:
/*
// Add custom node selection for workflow components
if (updatedData.type === "comfy_workflow") {
  console.log(chalk.blue("\nModel Selection for Component:"));
  const currentModels = component.models || [];
  const selectedModels = await promptForModelSelection(config, currentModels);
  updatedData.models = selectedModels;
  
  console.log(chalk.blue("\nCustom Node Selection for Component:"));
  const currentCustomNodes = component.custom_nodes || [];
  const selectedCustomNodes = await promptForCustomNodeSelection(config, currentCustomNodes);
  updatedData.custom_nodes = selectedCustomNodes;
}
*/

// This should be added to the applyComponents() function around line 862:
/*
// Extract custom nodes from workflow if available
const customNodes = workflow ? extractCustomNodesFromWorkflow(workflow) : [];

const data = {
  form,
  inputs,
  workflow,
  test,
  api,
  body,
  job,
  payload,
  credits_script: credits,
  output_node_id: workflow?.output_node_id || null,
  models, // Add models array for API
  custom_nodes: customNodes, // Add custom_nodes array for API
};
*/

// CLI Commands to be added:
/*
const customNodeCommand = program
  .command("custom-node")
  .description("Manage custom nodes");

customNodeCommand
  .command("list")
  .description("List all custom nodes")
  .option("--category <category>", "Filter by category")
  .action(listCustomNodes);

customNodeCommand
  .command("add <name>")
  .description("Add a new custom node to the registry")
  .action(addCustomNode);
*/

export {
  fetchGetCustomNodes,
  fetchGetCustomNodeByName,
  fetchCreateCustomNode,
  extractCustomNodesFromWorkflow,
  promptForCustomNodeSelection,
  listCustomNodes,
  addCustomNode
};