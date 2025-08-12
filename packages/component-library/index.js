#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";
import { input, select, number, expand, checkbox } from "@inquirer/prompts";
import crypto from "crypto";

const configPath = path.join(process.env.HOME, ".ecli", "config.json");
const componentsDir = path.join(process.cwd(), "Components");
const stateFilePath = path.join(componentsDir, ".ecli-state.json");

// File path constants for the new architecture
const getComponentPaths = (componentName) => ({
  form: path.join(componentsDir, componentName, "form.json"),
  inputs: path.join(componentsDir, componentName, "inputs.json"),
  workflow: path.join(componentsDir, componentName, "workflow.json"),
  test: path.join(componentsDir, componentName, "test.json"),
  credits: path.join(componentsDir, componentName, "credits.js"),
  api: path.join(componentsDir, componentName, "api.json"),
  body: path.join(componentsDir, componentName, "body.json"),
  job: path.join(componentsDir, componentName, "job.json"),
});

async function fetchGetComponent(config, name) {
  try {
    const url = `${config.apiUrl}/workflows/name/${name}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to fetch component ${name}: ${error.message}`,
    };
  }
}


async function fetchCreateComponent(config, data) {
  try {
    const url = `${config.apiUrl}/workflows`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to create component: ${error.message}`,
    };
  }
}

async function fetchRemoveComponent(config, id) {
  try {
    const url = `${config.apiUrl}/workflows/${id}`;
    const response = await fetch(url, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to remove component: ${error.message}`,
    };
  }
}

async function fetchUpdateComponent(config, id, data) {
  try {
    const url = `${config.apiUrl}/workflows/${id}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to update component: ${error.message}`,
    };
  }
}

async function fetchGetFormConfig(config, name) {
  try {
    const url = name
      ? `${config.apiUrl}/form-configs/name/${name}`
      : `${config.apiUrl}/form-configs`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    return {
      data: null,
      error: `Failed to fetch form config: ${error.message}`,
    };
  }
}

async function fetchCreateFormConfig(config, name, data) {
  try {
    const url = `${config.apiUrl}/form-configs`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        data,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    return {
      data: null,
      error: `Failed to create form config: ${error.message}`,
    };
  }
}

async function fetchDeleteFormConfig(config, id) {
  try {
    const url = `${config.apiUrl}/form-configs/${id}`;
    const response = await fetch(url, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    return {
      data: null,
      error: `Failed to delete form config: ${error.message}`,
    };
  }
}

// Custom Nodes API functions
async function fetchGetCustomNodes(config, options = {}) {
  try {
    const searchParams = new URLSearchParams();
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

// Model API functions
async function fetchGetModels(config, options = {}) {
  try {
    const searchParams = new URLSearchParams();
    if (options.authOnly) searchParams.set('auth_only', 'true');
    if (options.modelType) searchParams.set('model_type', options.modelType);
    if (options.search) searchParams.set('search', options.search);
    
    const url = `${config.apiUrl}/models${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to fetch models: ${error.message}`,
    };
  }
}

async function fetchGetModelByName(config, name) {
  try {
    const url = `${config.apiUrl}/models/name/${encodeURIComponent(name)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to fetch model ${name}: ${error.message}`,
    };
  }
}

async function fetchCreateModel(config, modelData) {
  try {
    const url = `${config.apiUrl}/models`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(modelData),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to create model: ${error.message}`,
    };
  }
}

async function fetchValidateModelAuth(config) {
  try {
    const url = `${config.apiUrl}/models/validate-auth`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json(); // API already returns { data, error } structure
  } catch (error) {
    return {
      data: null,
      error: `Failed to validate model authentication: ${error.message}`,
    };
  }
}

// Helper function to extract model names from workflow
function extractModelsFromWorkflow(workflow) {
  const models = new Set();
  
  if (!workflow || !workflow.nodes) {
    return [];
  }
  
  // Look for EmProps_Asset_Downloader nodes
  workflow.nodes.forEach(node => {
    if (node.type === 'EmProps_Asset_Downloader' && node.widgets_values) {
      const url = node.widgets_values[0]; // download URL is first widget
      const filename = node.widgets_values[2]; // filename is third widget
      
      if (filename && filename.trim()) {
        // Extract model name from filename (remove extension)
        const modelName = filename.replace(/\.(safetensors|ckpt|pt|bin)$/i, '');
        models.add(modelName);
      }
    }
  });
  
  return Array.from(models);
}

// Helper function to extract custom nodes from workflow
function extractCustomNodesFromWorkflow(workflow) {
  const customNodes = new Set();
  
  if (!workflow || !workflow.nodes) {
    return [];
  }
  
  // Look for non-standard ComfyUI nodes (custom nodes)
  const standardNodes = new Set([
    'KSampler', 'CLIPTextEncode', 'CheckpointLoaderSimple', 'VAEDecode', 
    'EmptyLatentImage', 'LoadImage', 'SaveImage', 'LatentUpscale',
    'ControlNetLoader', 'ControlNetApply', 'VAELoader', 'LoraLoader',
    'EmProps_Asset_Downloader' // Our custom asset downloader
  ]);
  
  workflow.nodes.forEach(node => {
    if (node.type && !standardNodes.has(node.type)) {
      // This is likely a custom node
      customNodes.add(node.type);
    }
  });
  
  return Array.from(customNodes);
}

// Helper function to prompt user to select custom nodes
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
    name: customNode.name,
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

// Helper function to prompt user to select models
async function promptForModelSelection(config, currentModels = []) {
  const { data: availableModels, error } = await fetchGetModels(config);
  
  if (error) {
    console.error(chalk.red(`Error fetching models: ${error}`));
    return [];
  }
  
  if (!availableModels || availableModels.length === 0) {
    console.log(chalk.yellow("No models available in the system"));
    return [];
  }
  
  console.log(chalk.blue("\nSelect models this component will use:"));
  if (currentModels.length > 0) {
    console.log(chalk.gray(`Currently selected: ${currentModels.join(', ')}`));
  }
  console.log(chalk.gray("Use ↑↓ to navigate, Space to select/deselect, Enter to confirm"));
  
  const modelChoices = availableModels.map(model => ({
    name: `${model.name} (${model.modelType}${model.isAuthReq ? ' - 🔒 Auth Required' : ''})`,
    value: model.name,
    checked: currentModels.includes(model.name), // Pre-select if already associated
    description: model.description || 'No description'
  }));
  
  const selectedModels = await checkbox({
    message: "Choose models:",
    choices: modelChoices,
    instructions: false, // Hide default instructions since we show custom ones above
  });
  
  if (selectedModels.length > 0) {
    console.log(chalk.blue(`\nSelected models: ${selectedModels.join(', ')}`));
  } else {
    console.log(chalk.gray("No models selected"));
  }
  
  return selectedModels;
}

async function initConfig() {
  try {
    const defaultConfig = {
      currentEnv: "local",
      environments: {
        local: {
          apiUrl: "http://localhost:3331",
        },
      },
    };
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, defaultConfig, { spaces: 2 });
    console.log(chalk.green("Configuration file created successfully!"));
  } catch (error) {
    console.error(
      chalk.red(`Failed to initialize configuration: ${error.message}`),
    );
  }
}

async function getCurrentEnvironment() {
  try {
    const config = await fs.readJson(configPath);
    return {
      name: config.currentEnv,
      ...config.environments[config.currentEnv],
    };
  } catch (error) {
    console.error(
      chalk.red(`Failed to get current environment: ${error.message}`),
    );
    process.exit(1);
  }
}

async function addEnvironment(name, apiUrl) {
  try {
    const config = await fs.readJson(configPath);
    if (config.environments[name]) {
      console.error(chalk.red(`Environment "${name}" already exists`));
      return;
    }

    config.environments[name] = { apiUrl };
    await fs.writeJson(configPath, config, { spaces: 2 });
    console.log(chalk.green(`Environment "${name}" added successfully`));
  } catch (error) {
    console.error(chalk.red(`Failed to add environment: ${error.message}`));
  }
}

async function removeEnvironment(name) {
  try {
    const config = await fs.readJson(configPath);
    if (!config.environments[name]) {
      console.error(chalk.red(`Environment "${name}" does not exist`));
      return;
    }

    if (config.currentEnv === name) {
      console.error(chalk.red(`Cannot remove current environment "${name}"`));
      return;
    }

    delete config.environments[name];
    await fs.writeJson(configPath, config, { spaces: 2 });
    console.log(chalk.green(`Environment "${name}" removed successfully`));
  } catch (error) {
    console.error(chalk.red(`Failed to remove environment: ${error.message}`));
  }
}

async function setEnvironment(name) {
  try {
    const config = await fs.readJson(configPath);
    if (!config.environments[name]) {
      console.error(chalk.red(`Environment "${name}" does not exist`));
      return;
    }

    config.currentEnv = name;
    await fs.writeJson(configPath, config, { spaces: 2 });
    console.log(chalk.green(`Switched to environment "${name}"`));
  } catch (error) {
    console.error(chalk.red(`Failed to switch environment: ${error.message}`));
  }
}

async function listEnvironments() {
  try {
    const config = await fs.readJson(configPath);
    console.log(chalk.blue("\nAvailable Environments:"));
    Object.entries(config.environments).forEach(([name, env]) => {
      const isCurrent = name === config.currentEnv;
      const prefix = isCurrent ? chalk.green("* ") : "  ";
      console.log(`${prefix}${name}: ${env.apiUrl}`);
    });
  } catch (error) {
    console.error(chalk.red(`Failed to list environments: ${error.message}`));
  }
}

async function detectComponentType(componentPath) {
  const paths = getComponentPaths(path.basename(componentPath));
  
  // Check which files exist to determine component type
  const hasWorkflow = await fs.pathExists(paths.workflow);
  const hasApi = await fs.pathExists(paths.api);
  const hasForm = await fs.pathExists(paths.form);
  const hasCredits = await fs.pathExists(paths.credits);
  const hasJob = await fs.pathExists(paths.job);
  
  if (hasJob && hasForm) {
    return "direct_job";
  } else if (hasWorkflow && hasForm) {
    return "comfy_workflow";
  } else if (hasApi && hasForm) {
    return "fetch_api";
  } else if (hasCredits && !hasForm && !hasWorkflow && !hasApi && !hasJob) {
    return "basic";
  }
  
  return null;
}

async function addComponent(componentName) {
  try {
    const config = await getCurrentEnvironment();
    const componentPath = path.join(componentsDir, componentName);
    
    // Check if component directory exists
    if (!(await fs.pathExists(componentPath))) {
      console.error(chalk.red(`Component directory "${componentName}" does not exist in Components/`));
      return;
    }
    
    // Check if component already exists in the API
    const { data: existingComponent } = await fetchGetComponent(config, componentName);
    if (existingComponent) {
      console.error(chalk.red(`Component "${componentName}" already exists. Use 'ecli component apply' to update it.`));
      return;
    }
    
    // Auto-detect component type
    const detectedType = await detectComponentType(componentPath);
    if (!detectedType) {
      console.error(chalk.red(`Could not determine component type for "${componentName}". Make sure it has the required files.`));
      return;
    }
    
    console.log(chalk.blue(`Detected component type: ${detectedType}`));
    
    // Gather component metadata
    let componentData;
    try {
      componentData = {
        name: componentName,
        label: await input({
          message: "Enter the label of the component",
          default: componentName,
          required: true,
        }),
        description: await input({
          message: "Enter the description of the component",
          required: true,
        }),
        output_mime_type: await input({
          message: "Enter the output mime type",
          default: detectedType === "fetch_api" || detectedType === "direct_job" ? "application/json" : "image/png",
        }),
        type: detectedType,
        order: await number({
          message: "Enter the order of the component",
          default: 0,
        }),
        display: false,
      };
    } catch (error) {
      // User cancelled
      return;
    }
    
    // Create the component in the API
    const { data: createdComponent, error: componentCreationError } = await fetchCreateComponent(
      config,
      componentData,
    );
    
    if (componentCreationError) {
      console.error(chalk.red(componentCreationError));
      return;
    }
    
    console.log(chalk.green(`Component "${componentName}" registered successfully!`));
    console.log(chalk.blue(`Component ID: ${createdComponent.id}`));
    
    // Ask if user wants to apply the component files now
    const shouldApply = await expand({
      message: "Do you want to apply the component files now?",
      default: "y",
      choices: [
        { key: "y", name: "Yes", value: "yes" },
        { key: "n", name: "No", value: "no" },
      ],
    });
    
    if (shouldApply === "yes") {
      await applyComponents(componentName);
    } else {
      console.log(chalk.yellow(`Remember to run 'ecli component apply ${componentName}' to upload the component files.`));
    }
    
  } catch (error) {
    console.error(chalk.red(`Failed to add component: ${error.message}`));
  }
}

async function newComponent() {
  try {
    const config = await getCurrentEnvironment();

    let componentData;
    try {
      componentData = {
        name: await input({
          message: "Enter the name of the component",
          required: true,
        }),
        label: await input({
          message: "Enter the label of the component",
          required: true,
        }),
        description: await input({
          message: "Enter the description of the component",
          required: true,
        }),
        output_mime_type: await input({
          message: "Enter the output mime type",
          initial: "image/png",
        }),
        type: await select({
          message: "Select the type of the component",
          choices: [
            { title: "Basic", value: "basic" },
            { title: "Comfy Workflow", value: "comfy_workflow" },
            { title: "Fetch API", value: "fetch_api" },
            { title: "Direct Job", value: "direct_job" },
          ],
        }),
        order: await number({
          message: "Enter the order of the component",
          default: 0,
        }),
        display: false,
      };
      
      // Add model and custom node selection for workflow components
      if (componentData.type === "comfy_workflow") {
        console.log(chalk.blue("\nModel Selection for Component:"));
        const selectedModels = await promptForModelSelection(config);
        componentData.models = selectedModels;
        
        console.log(chalk.blue("\nCustom Node Selection for Component:"));
        const selectedCustomNodes = await promptForCustomNodeSelection(config);
        componentData.custom_nodes = selectedCustomNodes;
      }
      
    } catch (error) {
      return;
    }

    // Check if the component already exists
    const componentPath = path.join(componentsDir, componentData.name);
    const { error: componentCreationError } = await fetchCreateComponent(
      config,
      componentData,
    );

    if (componentCreationError) {
      console.error(chalk.red(componentCreationError));
      return;
    }

    if (!(await fs.pathExists(componentPath))) {
      const paths = getComponentPaths(componentData.name);

      try {
        // Create component directory
        await fs.ensureDir(componentPath);

        // Create ref directory only for comfy_workflow type
        if (componentData.type === "comfy_workflow") {
          await fs.mkdir(path.join(componentPath, "ref"));
        }

        if (componentData.type === "comfy_workflow") {
          // Create all required files with empty objects/default content
          await fs.writeJson(
            paths.form,
            { main: [], advanced: [] },
            { spaces: 2 },
          );
          await fs.writeJson(paths.inputs, {}, { spaces: 2 });
          await fs.writeJson(paths.workflow, {}, { spaces: 2 });
          await fs.writeJson(paths.test, {}, { spaces: 2 });
          await fs.writeFile(
            paths.credits,
            `function computeCost(context) {\n  return { cost: 1 };\n}`,
          );
        } else if (componentData.type === "fetch_api") {
          // For fetch_api, create credits.js, form.json, inputs.json, body.json and api.json
          await fs.writeJson(
            paths.form,
            { main: [], advanced: [] },
            { spaces: 2 },
          );
          await fs.writeJson(paths.api, {}, { spaces: 2 });
          await fs.writeJson(paths.inputs, {}, { spaces: 2 });
          await fs.writeJson(paths.body, {}, { spaces: 2 });
          await fs.writeFile(
            paths.credits,
            `function computeCost(context) {\n  return { cost: 1 };\n}`,
          );
        } else if (componentData.type === "direct_job") {
          // For direct_job, create credits.js, form.json, inputs.json, job.json
          await fs.writeJson(
            paths.form,
            { 
              config: {
                groupOrder: ["main", "advanced"],
                componentGroup: "text"
              },
              fields: []
            },
            { spaces: 2 },
          );
          await fs.writeJson(paths.job, {
            service_required: "text_generation",
            priority: 5,
            payload: {
              job_type: "openai_text"
            },
            requirements: {
              service_type: "text_generation",
              timeout_minutes: 1
            }
          }, { spaces: 2 });
          await fs.writeJson(paths.inputs, [], { spaces: 2 });
          await fs.writeFile(
            paths.credits,
            `function computeCost(context) {\n  return { cost: 1 };\n}`,
          );
        } else if (componentData.type === "basic") {
          // For basic, only create credits.js
          await fs.writeFile(
            paths.credits,
            `function computeCost(context) {\n  return { cost: 1 };\n}`,
          );
        }

        console.log(
          chalk.green(`Component "${componentData.name}" added successfully!`),
        );
      } catch (fsError) {
        console.error(
          chalk.red(`Failed to create component files: ${fsError.message}`),
        );
        // Attempt to rollback the API creation
        const { data: component } = await fetchGetComponent(
          config,
          componentData.name,
        );
        if (component?.id) {
          await fetchRemoveComponent(config, component.id);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Unexpected error: ${error.message}`));
  }
}

async function removeComponent(componentName) {
  try {
    const config = await getCurrentEnvironment();
    const { data: component, error: getComponentError } =
      await fetchGetComponent(config, componentName);
    if (getComponentError) {
      console.error(chalk.red(getComponentError));
      return;
    }
    const { error: removeComponentError } = await fetchRemoveComponent(
      config,
      component.id,
    );
    if (removeComponentError) {
      console.error(chalk.red(removeComponentError));
      return;
    }

    const componentPath = path.join(componentsDir, componentName);
    if (!(await fs.pathExists(componentPath))) {
      console.error(chalk.red(`Component "${componentName}" does not exist!`));
      return;
    }

    await fs.remove(componentPath);
    console.log(
      chalk.green(`Component "${componentName}" removed successfully!`),
    );
  } catch (error) {
    console.error(chalk.red(`Unexpected error: ${error.message}`));
  }
}

async function applyComponents(componentName, options = { verbose: false }) {
  try {
    const config = await getCurrentEnvironment();
    const paths = getComponentPaths(componentName);

    const { error: componentError, data: component } = await fetchGetComponent(
      config,
      componentName,
    );
    if (componentError) {
      console.error(chalk.red(componentError));
      return;
    }

    // Check for required files based on component type
    let requiredFiles = [];

    if (component.type === "fetch_api") {
      requiredFiles = [
        { path: paths.form, name: "Form" },
        { path: paths.api, name: "API" },
        { path: paths.credits, name: "Credits" },
      ];
    } else if (component.type === "direct_job") {
      requiredFiles = [
        { path: paths.form, name: "Form" },
        { path: paths.job, name: "Job" },
        { path: paths.inputs, name: "Inputs" },
        { path: paths.credits, name: "Credits" },
      ];
    } else if (component.type === "basic") {
      requiredFiles = [{ path: paths.credits, name: "Credits" }];
    } else if (component.type === "comfy_workflow") {
      requiredFiles = [
        { path: paths.form, name: "Form" },
        { path: paths.inputs, name: "Inputs" },
        { path: paths.workflow, name: "Workflow" },
        { path: paths.test, name: "Test" },
        { path: paths.credits, name: "Credits" },
      ];
    }

    for (const file of requiredFiles) {
      if (!(await fs.pathExists(file.path))) {
        console.error(
          chalk.red(
            `${file.name} file not found for component "${componentName}"!`,
          ),
        );
        return;
      }
    }

    // Read files based on component type
    let form = undefined;
    let inputs = undefined;
    let workflow = undefined;
    let test = undefined;
    let api = undefined;
    let body = undefined;
    let job = undefined;
    let payload = undefined;
    let credits = undefined;

    if (component.type === "comfy_workflow") {
      form = await fs.readJson(paths.form);
      inputs = await fs.readJson(paths.inputs);
      workflow = await fs.readJson(paths.workflow);
      if (await fs.pathExists(paths.test)) {
        test = await fs.readJson(paths.test);
      }
      credits = await fs.readFile(paths.credits, "utf8");
    } else if (component.type === "fetch_api") {
      form = await fs.readJson(paths.form);
      api = await fs.readJson(paths.api);
      if (await fs.pathExists(paths.inputs)) {
        inputs = await fs.readJson(paths.inputs);
      }
      if (await fs.pathExists(paths.body)) {
        body = await fs.readJson(paths.body);
      }
      credits = await fs.readFile(paths.credits, "utf8");
    } else if (component.type === "direct_job") {
      form = await fs.readJson(paths.form);
      job = await fs.readJson(paths.job);
      inputs = await fs.readJson(paths.inputs);
      credits = await fs.readFile(paths.credits, "utf8");
    } else if (component.type === "basic") {
      credits = await fs.readFile(paths.credits, "utf8");
    }

    console.log(chalk.green(`Applying component "${componentName}"...`));

    // Extract models from workflow if available
    const models = workflow ? extractModelsFromWorkflow(workflow) : [];
    
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
    };

    if (options.verbose) {
      console.log(chalk.blue("\nSubmitting data:"));
      console.log(JSON.stringify(data, null, 2));
    }

    const { error: updateError } = await fetchUpdateComponent(
      config,
      component.id,
      {
        data,
      },
    );

    if (updateError) {
      console.error(chalk.red(`Failed to update component: ${updateError}`));
      return;
    }

    console.log(
      chalk.green(`Component "${componentName}" applied successfully!`),
    );
  } catch (error) {
    console.error(chalk.red(`Unexpected error: ${error.message}`));
  }
}

async function getComponent(componentName, options) {
  try {
    console.log(`Getting details of component "${componentName}"...`);
    const config = await getCurrentEnvironment();
    const paths = getComponentPaths(componentName);

    if (options.form) {
      if (await fs.pathExists(paths.form)) {
        const form = await fs.readJson(paths.form);
        console.log(chalk.magentaBright(JSON.stringify(form, null, 2)));
      } else {
        console.log(chalk.yellow("Form not found"));
      }
    } else if (options.input) {
      if (await fs.pathExists(paths.inputs)) {
        const inputs = await fs.readJson(paths.inputs);
        console.log(chalk.magentaBright(JSON.stringify(inputs, null, 2)));
      } else {
        console.log(chalk.yellow("Inputs not found"));
      }
    } else if (options.workflow) {
      if (await fs.pathExists(paths.workflow)) {
        const workflow = await fs.readJson(paths.workflow);
        console.log(chalk.magentaBright(JSON.stringify(workflow, null, 2)));
      } else {
        console.log(chalk.yellow("Workflow not found"));
      }
    } else if (options.credits) {
      if (await fs.pathExists(paths.credits)) {
        const credits = await fs.readFile(paths.credits, "utf8");
        console.log(chalk.magenta(credits));
      } else {
        console.log(chalk.yellow("Credits not found"));
      }
    } else {
      // Fetch and display all component data
      const { data: component, error } = await fetchGetComponent(
        config,
        componentName,
      );
      if (error) {
        console.error(chalk.red(error));
        return;
      }
      console.log(JSON.stringify(component, null, 2));
    }
  } catch (error) {
    console.error(chalk.red(`Unexpected error: ${error.message}`));
  }
}

async function displayComponents(componentName) {
  try {
    const config = await getCurrentEnvironment();
    const { data: components, error: getComponentError } =
      await fetchGetComponent(config, componentName);
    if (getComponentError) {
      console.error(chalk.red(getComponentError));
      return;
    }

    const answer = await expand({
      message: `Do you want to display/hide the ${componentName}?`,
      default: "n",
      choices: [
        {
          key: "y",
          name: "Display",
          value: "yes",
        },
        {
          key: "n",
          name: "Hide",
          value: "no",
        },
        {
          key: "x",
          name: "Abort",
          value: "abort",
        },
      ],
    });

    switch (answer) {
      case "yes": {
        const { error } = await fetchUpdateComponent(config, components.id, {
          display: true,
        });
        if (error) {
          console.error(chalk.red(`Failed to update component: ${error}`));
          return;
        }
        console.log(chalk.green("Component displayed successfully!"));
        break;
      }
      case "no": {
        const { error } = await fetchUpdateComponent(config, components.id, {
          display: false,
        });
        if (error) {
          console.error(chalk.red(`Failed to update component: ${error}`));
          return;
        }
        console.log(chalk.green("Component hidden successfully!"));
        break;
      }
      case "abort":
        break;
    }
  } catch (error) {
    console.error(chalk.red(`Unexpected error: ${error.message}`));
  }
}

async function calculateFileHash(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch (error) {
    return null;
  }
}

async function getComponentHash(componentName) {
  const paths = getComponentPaths(componentName);

  // Get component type first
  const config = await getCurrentEnvironment();
  const { data: component } = await fetchGetComponent(config, componentName);

  const hashes = {
    credits: await calculateFileHash(paths.credits),
  };

  if (component.type === "comfy_workflow") {
    hashes.form = await calculateFileHash(paths.form);
    hashes.inputs = await calculateFileHash(paths.inputs);
    hashes.workflow = await calculateFileHash(paths.workflow);
    hashes.test = await calculateFileHash(paths.test);
  } else if (component.type === "fetch_api") {
    hashes.form = await calculateFileHash(paths.form);
    hashes.api = await calculateFileHash(paths.api);
  } else if (component.type === "direct_job") {
    hashes.form = await calculateFileHash(paths.form);
    hashes.job = await calculateFileHash(paths.job);
    hashes.inputs = await calculateFileHash(paths.inputs);
  }

  return hashes;
}

async function loadState() {
  try {
    if (await fs.pathExists(stateFilePath)) {
      return await fs.readJson(stateFilePath);
    }
    return { components: {} };
  } catch (error) {
    console.error(
      chalk.yellow(`Warning: Could not load state file: ${error.message}`),
    );
    return { components: {} };
  }
}

async function saveState(state) {
  try {
    await fs.writeJson(stateFilePath, state, { spaces: 2 });
  } catch (error) {
    console.error(
      chalk.yellow(`Warning: Could not save state file: ${error.message}`),
    );
  }
}

async function getValidComponents() {
  try {
    const items = await fs.readdir(componentsDir);
    return items.filter(
      (item) =>
        !item.startsWith("_") &&
        item !== "p52vid" &&
        item !== ".ecli-state.json" &&
        fs.statSync(path.join(componentsDir, item)).isDirectory(),
    );
  } catch (error) {
    console.error(
      chalk.red(`Error reading components directory: ${error.message}`),
    );
    return [];
  }
}

async function hasComponentChanged(componentName, state) {
  const currentHashes = await getComponentHash(componentName);
  const storedState = state.components[componentName];

  if (!storedState) {
    return true;
  }

  const storedHashes = storedState.fileHashes;
  return Object.entries(currentHashes).some(
    ([file, hash]) => hash !== storedHashes[file],
  );
}

async function applyChangedComponents(
  options = { force: false, dryRun: false },
) {
  try {
    const state = await loadState();
    const components = await getValidComponents();

    if (components.length === 0) {
      console.log(chalk.yellow("No valid components found."));
      return;
    }

    console.log(chalk.blue("Checking for changed components..."));

    const changedComponents = [];
    for (const component of components) {
      const changed =
        options.force || (await hasComponentChanged(component, state));
      if (changed) {
        changedComponents.push(component);
      }
    }

    if (changedComponents.length === 0) {
      console.log(chalk.green("No components have changed."));
      return;
    }

    console.log(
      chalk.blue(`\nFound ${changedComponents.length} changed components:`),
    );
    changedComponents.forEach((component) =>
      console.log(chalk.cyan(`- ${component}`)),
    );

    if (options.dryRun) {
      console.log(chalk.yellow("\nDry run - no changes will be made."));
      return;
    }

    console.log(chalk.blue("\nApplying changes..."));

    const results = {
      success: [],
      failure: [],
    };

    for (const component of changedComponents) {
      try {
        console.log(chalk.cyan(`\nApplying ${component}...`));
        await applyComponents(component);

        // Update state after successful apply
        state.components[component] = {
          lastApplied: new Date().toISOString(),
          fileHashes: await getComponentHash(component),
        };

        results.success.push(component);
        console.log(chalk.green(`✓ ${component} applied successfully`));
      } catch (error) {
        results.failure.push({ component, error: error.message });
        console.log(
          chalk.red(`✗ Failed to apply ${component}: ${error.message}`),
        );
      }
    }

    // Save state only after all successful applications
    await saveState(state);

    // Print summary
    console.log(chalk.blue("\nSummary:"));
    console.log(
      chalk.green(`✓ Successfully applied: ${results.success.length}`),
    );
    if (results.failure.length > 0) {
      console.log(chalk.red(`✗ Failed to apply: ${results.failure.length}`));
      console.log(chalk.red("\nFailed components:"));
      results.failure.forEach(({ component, error }) =>
        console.log(chalk.red(`- ${component}: ${error}`)),
      );
    }
  } catch (error) {
    console.error(chalk.red(`\nUnexpected error: ${error.message}`));
  }
}

async function updateComponent(componentName) {
  try {
    const config = await getCurrentEnvironment();

    // Get current component data
    const { data: component, error: componentError } = await fetchGetComponent(
      config,
      componentName,
    );
    if (componentError) {
      console.error(chalk.red(componentError));
      return;
    }

    let updatedData;
    try {
      updatedData = {
        name: await input({
          message: "Enter the new name of the component",
          default: component.name,
          required: true,
        }),
        label: await input({
          message: "Enter the new label of the component",
          default: component.label,
          required: true,
        }),
        description: await input({
          message: "Enter the new description of the component",
          default: component.description,
          required: true,
        }),
        output_mime_type: await input({
          message: "Enter the new output mime type",
          default: component.output_mime_type || "image/png",
        }),
        type: await select({
          message: "Select the new type of the component",
          choices: [
            { title: "Basic", value: "basic" },
            { title: "Comfy Workflow", value: "comfy_workflow" },
            { title: "Fetch API", value: "fetch_api" },
            { title: "Direct Job", value: "direct_job" },
          ],
          default: component.type,
        }),
        order: await number({
          message: "Enter the new order of the component",
          default: component.order || 0,
        }),
      };
      
      // Add model selection for workflow components
      if (updatedData.type === "comfy_workflow") {
        console.log(chalk.blue("\n🔗 Update Linked Models for Component:"));
        console.log(chalk.gray("ComfyUI workflow components can specify which models they require"));
        
        const currentModels = component.models || []; // Get existing models
        if (currentModels.length > 0) {
          console.log(chalk.gray(`Currently linked models: ${currentModels.join(', ')}`));
        } else {
          console.log(chalk.gray("No models currently linked to this component"));
        }
        
        const shouldUpdateModels = await expand({
          message: "Do you want to update the linked models?",
          default: "y",
          choices: [
            { key: "y", name: "Yes, update model links", value: "yes" },
            { key: "n", name: "No, keep current models", value: "no" },
          ],
        });
        
        if (shouldUpdateModels === "yes") {
          const selectedModels = await promptForModelSelection(config, currentModels);
          updatedData.models = selectedModels;
          
          if (selectedModels.length > 0) {
            console.log(chalk.green(`✓ Updated linked models: ${selectedModels.join(', ')}`));
          } else {
            console.log(chalk.yellow("⚠ No models selected - component will have no model links"));
          }
        } else {
          console.log(chalk.gray("Keeping current model links unchanged"));
          updatedData.models = currentModels; // Keep existing models
        }
        
        // Add custom node selection for workflow components
        console.log(chalk.blue("\n🔧 Update Linked Custom Nodes for Component:"));
        console.log(chalk.gray("ComfyUI workflow components can specify which custom nodes they require"));
        
        const currentCustomNodes = component.custom_nodes || []; // Get existing custom nodes
        if (currentCustomNodes.length > 0) {
          console.log(chalk.gray(`Currently linked custom nodes: ${currentCustomNodes.join(', ')}`));
        } else {
          console.log(chalk.gray("No custom nodes currently linked to this component"));
        }
        
        const shouldUpdateCustomNodes = await expand({
          message: "Do you want to update the linked custom nodes?",
          default: "y",
          choices: [
            { key: "y", name: "Yes, update custom node links", value: "yes" },
            { key: "n", name: "No, keep current custom nodes", value: "no" },
          ],
        });
        
        if (shouldUpdateCustomNodes === "yes") {
          const selectedCustomNodes = await promptForCustomNodeSelection(config, currentCustomNodes);
          updatedData.custom_nodes = selectedCustomNodes;
          
          if (selectedCustomNodes.length > 0) {
            console.log(chalk.green(`✓ Updated linked custom nodes: ${selectedCustomNodes.join(', ')}`));
          } else {
            console.log(chalk.yellow("⚠ No custom nodes selected - component will have no custom node links"));
          }
        } else {
          console.log(chalk.gray("Keeping current custom node links unchanged"));
          updatedData.custom_nodes = currentCustomNodes; // Keep existing custom nodes
        }
      }
      
    } catch (error) {
      return;
    }

    // Update the component on the server
    const { error: updateError } = await fetchUpdateComponent(
      config,
      component.id,
      updatedData,
    );
    if (updateError) {
      console.error(chalk.red(updateError));
      return;
    }

    console.log(
      chalk.green(`✓ Component ${componentName} updated successfully`),
    );
  } catch (error) {
    console.error(chalk.red(`Failed to update component: ${error.message}`));
  }
}

async function getFormConfig(fileName) {
  try {
    const config = await getCurrentEnvironment();
    const result = await fetchGetFormConfig(config, fileName);

    if (result.error) {
      console.error(chalk.red(result.error));
      return;
    }

    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

async function newFormConfig(fileName) {
  try {
    const config = await getCurrentEnvironment();
    const formConfigPath = path.join(componentsDir, "_form_confs", fileName);

    if (!fs.existsSync(formConfigPath)) {
      console.error(
        chalk.red(
          `Error: File ${fileName} not found in Components/_form_confs`,
        ),
      );
      return;
    }

    const fileData = await fs.readJson(formConfigPath);
    const result = await fetchCreateFormConfig(config, fileName, fileData);

    if (result.error) {
      console.error(chalk.red(result.error));
      return;
    }

    console.log(chalk.green(`Successfully created form config: ${fileName}`));
    console.log(JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

async function deleteFormConfig(fileName, options) {
  try {
    const config = await getCurrentEnvironment();
    const formConfigPath = path.join(componentsDir, "_form_confs", fileName);

    const { data: formConfig, error: getFormConfigError } =
      await fetchGetFormConfig(config, fileName);
    if (getFormConfigError) {
      console.error(chalk.red(getFormConfigError));
      return;
    }
    const result = await fetchDeleteFormConfig(config, formConfig.id);
    if (result.error) {
      console.error(chalk.red(result.error));
      return;
    }

    // Delete local file if --server-only flag is not set
    if (!options.serverOnly) {
      if (await fs.pathExists(formConfigPath)) {
        await fs.remove(formConfigPath);
        console.log(
          chalk.green(`Local file "${fileName}" deleted successfully`),
        );
      } else {
        console.warn(chalk.yellow(`Local file "${fileName}" not found`));
      }
    }

    console.log(
      chalk.green(`Form config "${fileName}" deleted successfully from server`),
    );
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
}

async function listModels(options) {
  try {
    const config = await getCurrentEnvironment();
    const { data: models, error } = await fetchGetModels(config, { 
      authOnly: options.authOnly 
    });
    
    if (error) {
      console.error(chalk.red(`Error fetching models: ${error}`));
      return;
    }
    
    if (!models || models.length === 0) {
      console.log(chalk.yellow("No models found"));
      return;
    }
    
    console.log(chalk.blue("\nModel Registry (from API):"));
    console.log(chalk.blue(`Found ${models.length} models:\n`));
    
    models.forEach((model) => {
      const authStatus = model.isAuthReq 
        ? chalk.red(`🔒 Requires ${model.authEnvVar}`)
        : chalk.green("🔓 No auth required");
      
      console.log(`${chalk.white(model.name)}`);
      console.log(`  ID: ${model.id}`);
      console.log(`  Type: ${model.modelType} (${model.fileSize || 'Unknown size'})`);
      console.log(`  Auth: ${authStatus}`);
      console.log(`  Status: ${model.status}`);
      console.log(`  Description: ${model.description || 'No description'}`);
      console.log(`  Download URL: ${model.downloadUrl}`);
      console.log();
    });
  } catch (error) {
    console.error(chalk.red(`Error listing models: ${error.message}`));
  }
}

async function addModel(name) {
  try {
    const config = await getCurrentEnvironment();
    
    // Check if model already exists
    const { data: existingModel } = await fetchGetModelByName(config, name);
    if (existingModel) {
      console.error(chalk.red(`Model "${name}" already exists`));
      return;
    }

    console.log(chalk.blue(`Adding new model: ${name}`));

    const filename = await input({ message: "Enter the filename:", required: true });
    const downloadUrl = await input({ message: "Enter the download URL:", required: true });
    const saveTo = await select({
      message: "Select save location:",
      choices: [
        { name: "checkpoints", value: "checkpoints" },
        { name: "loras", value: "loras" },
        { name: "vae", value: "vae" },
        { name: "clip", value: "clip" },
        { name: "controlnet", value: "controlnet" },
        { name: "upscale_models", value: "upscale_models" }
      ]
    });
    const description = await input({ message: "Enter description:", required: true });
    const fileSize = await input({ message: "Enter file size (e.g., '2.1GB'):", required: true });
    const modelType = await select({
      message: "Select model type:",
      choices: [
        { name: "checkpoint", value: "checkpoint" },
        { name: "lora", value: "lora" },
        { name: "vae", value: "vae" },
        { name: "clip", value: "clip" },
        { name: "controlnet", value: "controlnet" },
        { name: "upscaler", value: "upscaler" }
      ]
    });
    const hash = await input({ message: "Enter model hash (optional):" });
    const isAuthReq = await expand({
      message: "Does this model require authentication?",
      default: "n",
      choices: [
        { key: "y", name: "Yes", value: true },
        { key: "n", name: "No", value: false }
      ]
    });

    let authEnvVar = null;
    if (isAuthReq) {
      const authChoice = await select({
        message: "Select authentication provider:",
        choices: [
          { name: "Hugging Face (HF_TOKEN)", value: "HF_TOKEN" },
          { name: "CivitAI (CIVITAI_TOKEN)", value: "CIVITAI_TOKEN" },
          { name: "Custom token", value: "CUSTOM" }
        ]
      });
      
      if (authChoice === "CUSTOM") {
        authEnvVar = await input({ message: "Enter custom env var name:" });
      } else {
        authEnvVar = authChoice;
      }
    }

    const modelData = {
      name,
      downloadUrl,
      saveTo: `models/${filename}`, // Construct full save path
      description,
      fileSize,
      modelType,
      hash: hash || undefined,
      isAuthReq,
      ...(authEnvVar && { authEnvVar }) // Only include authEnvVar if it's not null
    };

    const { data: newModel, error } = await fetchCreateModel(config, modelData);
    
    if (error) {
      console.error(chalk.red(`Error creating model: ${error}`));
      return;
    }

    console.log(chalk.green(`✓ Model "${name}" added successfully!`));
    console.log(chalk.gray(`  ID: ${newModel.id}`));
    console.log(chalk.gray(`  Status: ${newModel.status}`));
  } catch (error) {
    console.error(chalk.red(`Error adding model: ${error.message}`));
  }
}

async function checkModelAuth() {
  try {
    const config = await getCurrentEnvironment();
    const { data: authStatus, error } = await fetchValidateModelAuth(config);
    
    if (error) {
      console.error(chalk.red(`Error validating model authentication: ${error}`));
      return;
    }

    if (!authStatus) {
      console.log(chalk.yellow("No authentication status data received"));
      return;
    }

    console.log(chalk.blue("\nAuthentication Status Check (from API):"));
    
    if (authStatus.totalModelsRequiringAuth === 0) {
      console.log(chalk.green("✓ No models require authentication"));
      return;
    }

    console.log(chalk.blue(`\nFound ${authStatus.totalModelsRequiringAuth} models requiring authentication:\n`));

    let allValid = true;
    authStatus.authProviders.forEach(provider => {
      const isAvailable = provider.isAvailable;
      const status = isAvailable ? chalk.green("✓ Available") : chalk.red("✗ Missing");
      
      console.log(`${provider.envVar}: ${status} (${provider.modelCount} models)`);
      
      if (!isAvailable) {
        allValid = false;
        if (provider.modelNames && provider.modelNames.length > 0) {
          const modelsUsingToken = provider.modelNames
            .map(name => `  • ${name}`)
            .join('\n');
          console.log(chalk.gray(modelsUsingToken));
        }
      }
    });

    console.log();
    if (allValid) {
      console.log(chalk.green("✓ All required authentication tokens are available!"));
    } else {
      console.log(chalk.red("✗ Some authentication tokens are missing."));
      console.log(chalk.yellow("Set the missing environment variables to download these models."));
      console.log(chalk.gray("\nExample:"));
      console.log(chalk.gray("  export HF_TOKEN=your_huggingface_token"));
      console.log(chalk.gray("  export CIVITAI_TOKEN=your_civitai_token"));
    }
  } catch (error) {
    console.error(chalk.red(`Error checking authentication: ${error.message}`));
  }
}

async function migrateWorkflows(options) {
  try {
    console.log(chalk.blue("🔄 Migrating workflows to use authenticated model downloads..."));
    
    const config = await getCurrentEnvironment();
    const { data: models, error } = await fetchGetModels(config, { authOnly: true });
    
    if (error) {
      console.error(chalk.red(`Error fetching models: ${error}`));
      return;
    }

    if (!models || models.length === 0) {
      console.log(chalk.yellow("No models requiring authentication found"));
      return;
    }

    // Find all workflow files
    const workflowFiles = [];
    const findWorkflows = (dir) => {
      const items = fs.readdirSync(dir);
      items.forEach(item => {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory() && !item.startsWith('_')) {
          const workflowPath = path.join(itemPath, 'workflow.json');
          if (fs.existsSync(workflowPath)) {
            workflowFiles.push(workflowPath);
          }
          findWorkflows(itemPath);
        }
      });
    };

    const componentsDir = path.join(process.cwd(), 'Components');
    if (fs.existsSync(componentsDir)) {
      findWorkflows(componentsDir);
    }

    console.log(chalk.blue(`Found ${workflowFiles.length} workflow files to check`));
    
    let migratedCount = 0;
    let totalChanges = 0;

    for (const workflowFile of workflowFiles) {
      const workflow = await fs.readJson(workflowFile);
      let hasChanges = false;
      
      // Look for hardcoded Hugging Face URLs in EmProps_Asset_Downloader nodes
      if (workflow.nodes) {
        workflow.nodes.forEach(node => {
          if (node.type === 'EmProps_Asset_Downloader' && node.widgets_values) {
            const url = node.widgets_values[0];
            const tokenProvider = node.widgets_values[3];
            
            // Check if this URL matches a model that should use authentication
            models.forEach(model => {
              if (url === model.downloadUrl && tokenProvider === 'None') {
                console.log(chalk.yellow(`  Found unauthenticated download: ${path.basename(path.dirname(workflowFile))}`));
                console.log(chalk.gray(`    URL: ${url}`));
                console.log(chalk.gray(`    Should use: ${model.authEnvVar}`));
                
                if (!options.dryRun) {
                  // Update to use authentication
                  const providerMap = {
                    'HF_TOKEN': 'Hugging Face',
                    'CIVITAI_TOKEN': 'CivitAI'
                  };
                  node.widgets_values[3] = providerMap[model.authEnvVar] || 'Custom';
                  hasChanges = true;
                  totalChanges++;
                }
              }
            });
          }
        });
      }

      if (hasChanges) {
        await fs.writeJson(workflowFile, workflow, { spaces: 2 });
        migratedCount++;
      }
    }

    if (options.dryRun) {
      console.log(chalk.blue(`\n🔍 Dry run complete:`));
      console.log(`  Would update ${totalChanges} nodes across ${migratedCount} workflows`);
    } else {
      console.log(chalk.green(`\n✅ Migration complete:`));
      console.log(`  Updated ${totalChanges} nodes across ${migratedCount} workflows`);
    }
  } catch (error) {
    console.error(chalk.red(`Error migrating workflows: ${error.message}`));
  }
}

async function listCustomNodes(options) {
  try {
    const config = await getCurrentEnvironment();
    const { data: customNodes, error } = await fetchGetCustomNodes(config, { 
      search: options.search
    });
    
    if (error) {
      console.error(chalk.red(`Error fetching custom nodes: ${error}`));
      return;
    }
    
    if (!customNodes || customNodes.length === 0) {
      console.log(chalk.yellow("No custom nodes found"));
      return;
    }
    
    console.log(chalk.blue("\nCustom Node Registry (from API):"));
    console.log(chalk.blue(`Found ${customNodes.length} custom nodes:\n`));
    
    customNodes.forEach((customNode) => {
      console.log(`${chalk.white(customNode.name)}`);
      console.log(`  ID: ${customNode.id}`);
      console.log(`  Status: ${customNode.status}`);
      console.log(`  Description: ${customNode.description || 'No description'}`);
      console.log(`  Repository: ${customNode.repositoryUrl || 'Not specified'}`);
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
    console.log(chalk.gray("This will configure how the custom node gets installed on machines."));

    const repositoryUrl = await input({ message: "Enter the repository URL:", required: true });
    
    // Installation options matching our actual installer
    const branch = await input({ message: "Enter specific branch (optional, default: none):" });
    const commit = await input({ message: "Enter specific commit hash (optional, default: none):" });
    
    const recursive = await expand({
      message: "Use recursive clone (for repos with submodules)?",
      default: "n",
      choices: [
        { key: "y", name: "Yes - git clone --recursive", value: true },
        { key: "n", name: "No - standard git clone", value: false }
      ]
    });

    const requirements = await expand({
      message: "Install Python requirements.txt?",
      default: "y",
      choices: [
        { key: "y", name: "Yes - run pip install -r requirements.txt", value: true },
        { key: "n", name: "No - skip requirements installation", value: false }
      ]
    });

    let env = null;
    const hasEnv = await expand({
      message: "Does this custom node need environment variables?",
      default: "n",
      choices: [
        { key: "y", name: "Yes - create .env file", value: true },
        { key: "n", name: "No - no .env file needed", value: false }
      ]
    });

    if (hasEnv) {
      console.log(chalk.gray("Enter environment variables as JSON (e.g., {\"API_KEY\": \"${SOME_TOKEN}\", \"BASE_URL\": \"https://api.example.com\"})"));
      const envInput = await input({ message: "Environment variables (JSON):" });
      if (envInput.trim()) {
        try {
          env = JSON.parse(envInput);
        } catch (error) {
          console.error(chalk.red("Invalid JSON format, skipping environment variables"));
          env = null;
        }
      }
    }

    // Optional version tracking
    const version = await input({ message: "Enter version (optional):" });

    const customNodeData = {
      name,
      repositoryUrl,
      // Installation configuration that matches our installer
      branch: branch || null,
      commit: commit || null,
      recursive: recursive || false,
      requirements: requirements !== false, // Default to true
      env: env || null,
      version: version || null
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

async function listComponents(showAll = false) {
  try {
    const config = await getCurrentEnvironment();
    if (!config) {
      console.error(
        chalk.red("No environment configured. Please run `ecli init` first."),
      );
      return;
    }

    const components = await getValidComponents();
    if (components.length === 0) {
      console.log(
        chalk.yellow("\nNo components found in the current directory."),
      );
      return;
    }

    console.log(chalk.blue("\nAvailable Components:"));

    for (const component of components) {
      const { data: apiComponent, error: apiError } = await fetchGetComponent(
        config,
        component,
      );

      if (apiError) {
        console.log(
          `  ${chalk.white(component)} (${chalk.red("error fetching status")})`,
        );
        continue;
      }

      const isEnabled = apiComponent?.display ?? true;
      if (showAll || isEnabled) {
        const status = isEnabled
          ? chalk.green("enabled")
          : chalk.yellow("disabled");
        console.log(
          `  ${chalk.white(apiComponent.name)} (${apiComponent.id}) (${status})`,
        );
      }
    }
    console.log(); // Empty line for better readability
  } catch (error) {
    console.error(chalk.red(`Error listing components: ${error.message}`));
  }
}

const program = new Command();

program
  .command("init")
  .description("Initialize the CLI configuration")
  .action(initConfig);

program
  .command("env")
  .description("Manage environments")
  .addCommand(
    new Command("list")
      .description("List all environments")
      .action(listEnvironments),
  )
  .addCommand(
    new Command("add")
      .argument("<name>", "Environment name")
      .argument("<apiUrl>", "API URL for the environment")
      .description("Add a new environment")
      .action(addEnvironment),
  )
  .addCommand(
    new Command("remove")
      .argument("<name>", "Environment name")
      .description("Remove an environment")
      .action(removeEnvironment),
  )
  .addCommand(
    new Command("set")
      .argument("<name>", "Name of the environment")
      .description("Set the current environment")
      .action(setEnvironment),
  );

const componentsCommand = program
  .command("component")
  .description("Manage components");

componentsCommand
  .command("new")
  .description("Create a new component")
  .action(newComponent);

componentsCommand
  .command("add <componentName>")
  .description("Add an existing component from the Components folder")
  .action(addComponent);

componentsCommand
  .command("update <componentName>")
  .alias("edit")
  .description("Update component details (name, label, description, models, custom nodes, etc.)")
  .action(updateComponent);

componentsCommand
  .command("remove <componentName>")
  .description("Remove a component")
  .action(removeComponent);

componentsCommand
  .command("apply <componentName>")
  .description("Apply component configuration from local files")
  .option("-v, --verbose", "Print submitted data", false)
  .action((componentName, options) => applyComponents(componentName, options));

componentsCommand
  .command("apply-changed")
  .description("Apply all components that have changed since last apply")
  .option(
    "-f, --force",
    "Force apply all components regardless of changes",
    false,
  )
  .option(
    "-d, --dry-run",
    "Show what would be applied without making changes",
    false,
  )
  .action((options) => applyChangedComponents(options));

componentsCommand
  .command("display <componentName>")
  .description("Toggle component visibility")
  .action(displayComponents);

componentsCommand
  .command("get <componentName>")
  .description("Get component details")
  .option("-f, --form", "Get form configuration")
  .option("-i, --input", "Get inputs configuration")
  .option("-w, --workflow", "Get workflow configuration")
  .option("-c, --credits", "Get credits script")
  .action(getComponent);

componentsCommand
  .command("list")
  .description("List available components")
  .option("--all", "Show all components including disabled ones")
  .action((options) => {
    listComponents(options.all);
  });

const formConfigCommand = program
  .command("form-config")
  .description("Manage form configurations");

formConfigCommand
  .command("get [fileName]")
  .description(
    "Get form config(s). If fileName is provided, get specific config",
  )
  .action(getFormConfig);

formConfigCommand
  .command("apply <fileName>")
  .description("Create a new form config from file in Components/_form_confs")
  .action(newFormConfig);

formConfigCommand
  .command("delete <fileName>")
  .description("Delete a form config")
  .option(
    "-s, --server-only",
    "Only delete from server, keep local file",
    false,
  )
  .action((fileName, options) => deleteFormConfig(fileName, options));

const modelCommand = program
  .command("model")
  .description("Manage models and authentication");

modelCommand
  .command("list")
  .description("List all models and their authentication requirements")
  .option("--auth-only", "Show only models requiring authentication")
  .action(listModels);

modelCommand
  .command("add <name>")
  .description("Add a new model to the registry")
  .action(addModel);

modelCommand
  .command("auth-check")
  .description("Check authentication environment variables")
  .action(checkModelAuth);

modelCommand
  .command("migrate-workflows")
  .description("Migrate existing workflows to use authenticated models")
  .option("--dry-run", "Show what would be migrated without making changes")
  .action(migrateWorkflows);

const customNodeCommand = program
  .command("custom-node")
  .description("Manage custom nodes");

customNodeCommand
  .command("list")
  .description("List all custom nodes")
  .option("--search <search>", "Search custom nodes")
  .action(listCustomNodes);

customNodeCommand
  .command("add <name>")
  .description("Add a new custom node to the registry")
  .action(addCustomNode);

program.parse(process.argv);
