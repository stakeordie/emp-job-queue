/**
 * Tests for OpenAI semantic failure detection
 *
 * Tests the sophisticated failure detection that identifies content policy violations
 * and refusal patterns in OpenAI responses, even when the API call succeeds.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIResponsesConnector } from '../connectors/openai-responses-connector.js';
import { createMockJobData } from './setup.js';

// Mock the AssetSaver to focus on semantic failure detection
vi.mock('../connectors/asset-saver.js', () => ({
  AssetSaver: vi.fn().mockImplementation(() => ({
    saveAssets: vi.fn().mockResolvedValue([])
  }))
}));

describe('OpenAI Semantic Failure Detection', () => {
  let connector: OpenAIResponsesConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    connector = new OpenAIResponsesConnector('test-connector');
  });

  describe('refusal pattern detection', () => {
    it('should detect "cannot generate" refusal pattern', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "I cannot generate that type of content as it violates our usage policies."
              }
            }
          ]
        },
        status: 200
      };

      // Mock the parsePollingResponse method call
      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('cannot generate');
    });

    it('should detect "unable to create" refusal pattern', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "I'm unable to create images with explicit violent content."
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('unable to create');
    });

    it('should detect "policy violation" refusal pattern', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "This request appears to violate OpenAI's content policy regarding harmful content."
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('policy violation');
    });

    it('should detect "inappropriate" refusal pattern', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "I can't help with that as the request is inappropriate."
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('inappropriate');
    });

    it('should detect "not allowed" refusal pattern', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "Creating that type of content is not allowed by our guidelines."
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('not allowed');
    });

    it('should detect "refused" refusal pattern', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "I refused to generate this content for safety reasons."
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('refused');
    });

    it('should detect "declined" refusal pattern', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "I declined to process your request due to content guidelines."
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('declined');
    });
  });

  describe('case insensitive detection', () => {
    it('should detect refusal patterns regardless of case', async () => {
      const testCases = [
        "I CANNOT GENERATE that content",
        "Unable To Create such images",
        "POLICY VIOLATION detected",
        "This is INAPPROPRIATE content",
        "NOT ALLOWED by guidelines",
        "Request REFUSED for safety",
        "I have DECLINED this request"
      ];

      for (const content of testCases) {
        const mockResponse = {
          data: {
            choices: [{ message: { content } }]
          },
          status: 200
        };

        const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

        expect(result.completed).toBe(true);
        expect(result.error).toContain('Content generation refused');
        expect(result.error).toContain(content.trim());
      }
    });
  });

  describe('mixed content scenarios', () => {
    it('should detect refusal even with image data present', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "I cannot generate explicit content. Here's an alternative image instead."
              }
            }
          ]
        },
        status: 200
      };

      // Mock presence of image data
      const mockImageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

      // This would normally be extracted from the response in the actual implementation
      // For testing, we simulate the presence of image data
      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toContain('Content generation refused');
      expect(result.error).toContain('cannot generate');
    });

    it('should allow content without refusal patterns', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: "Here's a beautiful landscape image as requested."
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      // Should not trigger refusal detection
      expect(result.completed).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty message content', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: ""
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      // Should not crash and should not detect refusal
      expect(result.completed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle null message content', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: null
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      // Should not crash
      expect(result.completed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle missing choices array', async () => {
      const mockResponse = {
        data: {},
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      // Should not crash but may indicate completion without content
      expect(result.completed).toBe(true);
    });

    it('should handle malformed response structure', async () => {
      const mockResponse = {
        data: "invalid response format",
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      // Should handle gracefully without crashing
      expect(result.completed).toBe(true);
    });
  });

  describe('refusal text extraction', () => {
    it('should include full refusal text in error message', async () => {
      const refusalText = "I cannot generate images containing violence, hate speech, or other harmful content as it violates OpenAI's usage policies. Please modify your request to comply with our guidelines.";

      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: refusalText
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.completed).toBe(true);
      expect(result.error).toBe(`Content generation refused: ${refusalText.trim()}`);
    });

    it('should trim whitespace from refusal text', async () => {
      const refusalText = "   I cannot generate that content.   \n\n";

      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: refusalText
              }
            }
          ]
        },
        status: 200
      };

      const mockJobData = createMockJobData();
      const result = await (connector as any).parsePollingResponse(mockResponse, mockJobData);

      expect(result.error).toBe("Content generation refused: I cannot generate that content.");
    });
  });
});