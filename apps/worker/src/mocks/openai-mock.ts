/**
 * OpenAI Mock - Simulates OpenAI API with realistic job progression
 */

import { BaseProgressiveMock, ProgressiveMockConfig } from './base-progressive-mock.js';

export class OpenAIMock extends BaseProgressiveMock {
  constructor(baseUrl: string = 'https://api.openai.com') {
    const config: ProgressiveMockConfig = {
      baseUrl,
      submitEndpoint: '/v1/images/generations', // For DALL-E style async jobs
      statusEndpoint: '/v1/images/generations/:id',
      progressSteps: [0, 20, 45, 70, 90, 100], // OpenAI image generation progression
      stepDelayMs: 2000, // 2 seconds per step = ~10 seconds total (realistic for DALL-E)
      serviceName: 'OpenAI',
      finalResponse: {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            url: "https://mock-openai-image-1.jpg",
            b64_json: null
          },
          {
            url: "https://mock-openai-image-2.jpg",
            b64_json: null
          }
        ]
      }
    };

    super(config);
    this.setupOpenAISpecificEndpoints();
  }

  private setupOpenAISpecificEndpoints() {
    // Immediate chat completions (no polling needed)
    this.addCustomEndpoint('post', '/v1/chat/completions', {
      id: `chatcmpl-mock-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "This is a mock response from OpenAI GPT-4 in the staging environment! The chat completion was successful and this response demonstrates realistic content generation with proper formatting and contextual understanding."
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 35,
        completion_tokens: 48,
        total_tokens: 83
      }
    });

    // Text completions (legacy endpoint)
    this.addCustomEndpoint('post', '/v1/completions', {
      id: `cmpl-mock-${Date.now()}`,
      object: "text_completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-3.5-turbo-instruct",
      choices: [
        {
          text: "Mock completion response from OpenAI staging environment. This simulates the legacy completions API.",
          index: 0,
          logprobs: null,
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 25,
        total_tokens: 45
      }
    });

    // Embeddings endpoint
    this.addCustomEndpoint('post', '/v1/embeddings', {
      object: "list",
      data: [
        {
          object: "embedding",
          index: 0,
          embedding: new Array(1536).fill(0).map(() => Math.random() * 2 - 1) // OpenAI ada-002 is 1536 dimensions
        }
      ],
      model: "text-embedding-ada-002",
      usage: {
        prompt_tokens: 15,
        total_tokens: 15
      }
    });

    // Models list
    this.addCustomEndpoint('get', '/v1/models', {
      object: "list",
      data: [
        {
          id: "gpt-4",
          object: "model",
          created: 1687882411,
          owned_by: "openai"
        },
        {
          id: "gpt-3.5-turbo",
          object: "model",
          created: 1677610602,
          owned_by: "openai"
        },
        {
          id: "dall-e-3",
          object: "model",
          created: 1698785189,
          owned_by: "system"
        }
      ]
    });
  }

  // Simulate OpenAI-specific error conditions
  public simulateRateLimitError() {
    this.simulateError('/v1/chat/completions', 429, {
      error: {
        message: "Rate limit reached for requests",
        type: "requests",
        param: null,
        code: "rate_limit_exceeded"
      }
    });
  }

  public simulateInsufficientCredits() {
    this.simulateError('/v1/chat/completions', 429, {
      error: {
        message: "You exceeded your current quota, please check your plan and billing details.",
        type: "insufficient_quota",
        param: null,
        code: "insufficient_quota"
      }
    });
  }

  public simulateContentPolicy() {
    this.simulateError('/v1/images/generations', 400, {
      error: {
        message: "Your request was rejected as a result of our safety system.",
        type: "invalid_request_error",
        param: "prompt",
        code: "content_policy_violation"
      }
    });
  }
}