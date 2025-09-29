/**
 * Real-World Failure Classification Tests
 *
 * RED-GREEN TDD Approach:
 * 1. When a real failure occurs, immediately add it as a failing test
 * 2. Update the classifier to handle it properly
 * 3. Verify the test goes green
 * 4. Build comprehensive coverage of all real failure patterns
 */

import { describe, it, expect } from 'vitest';
import { FailureClassifier, FailureType, FailureReason } from '../types/failure-classification.js';

describe('Real-World Failure Classification - TDD Collection', () => {

  // ===================================================================
  // CURRENT FAILING CASE - from workflow b789bd80-400a-41ed-96f5-72dc8c225dcf
  // ===================================================================

  describe('OpenAI Moderation Blocked - September 2025', () => {
    it('should classify OpenAI safety system rejection correctly', () => {
      const errorMessage = 'Async job failed: {"code":"moderation_blocked","message":"Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID wfr_0199961219e2757f90717eccfffb8a71."}';
      const context = {
        serviceType: 'openai_responses',
        httpStatus: 200, // Note: OpenAI returns 200 even for moderation blocks
        timeout: false
      };

      const result = FailureClassifier.classify(errorMessage, context);

      expect(result.failure_type).toBe(FailureType.GENERATION_REFUSAL);
      expect(result.failure_reason).toBe(FailureReason.SAFETY_FILTER);
      expect(result.failure_description).toContain('safety system');

      // Verify it includes the request ID for support
      expect(result.failure_description).toContain('wfr_0199961219e2757f90717eccfffb8a71');
    });

    it('should handle nested JSON error from component failures', () => {
      const errorMessage = 'Error in component \'flexible_prompt1\': Job submission failed: Unknown error';
      const context = {
        serviceType: 'openai_responses'
      };

      const result = FailureClassifier.classify(errorMessage, context);

      expect(result.failure_type).toBe(FailureType.VALIDATION_ERROR);
      expect(result.failure_reason).toBe(FailureReason.COMPONENT_ERROR);
      expect(result.failure_description).toContain('component flexible_prompt1');
    });
  });

  // ===================================================================
  // ADD NEW REAL FAILURES HERE AS THEY OCCUR
  // Template for adding new cases:
  //
  // describe('Failure Category - Month Year', () => {
  //   it('should classify [specific error] correctly', () => {
  //     const errorMessage = '[exact error message from real failure]';
  //     const context = { [real context data] };
  //
  //     const result = FailureClassifier.classify(errorMessage, context);
  //
  //     expect(result.failure_type).toBe(FailureType.[EXPECTED_TYPE]);
  //     expect(result.failure_reason).toBe(FailureReason.[EXPECTED_REASON]);
  //     expect(result.failure_description).toContain('[key phrase]');
  //   });
  // });
  // ===================================================================

  describe('Historical Failure Patterns - Comprehensive Coverage', () => {

    describe('Authentication Failures', () => {
      it('should classify invalid API key correctly', () => {
        const errorMessage = 'Request failed with status code 401 - Invalid API key provided';
        const context = { httpStatus: 401, serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.AUTH_ERROR);
        expect(result.failure_reason).toBe(FailureReason.INVALID_API_KEY);
      });

      it('should classify expired tokens correctly', () => {
        const errorMessage = 'Authentication failed: token expired';
        const context = { httpStatus: 401, serviceType: 'comfyui' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.AUTH_ERROR);
        expect(result.failure_reason).toBe(FailureReason.EXPIRED_TOKEN);
      });
    });

    describe('Rate Limiting', () => {
      it('should classify rate limit exceeded correctly', () => {
        const errorMessage = 'Rate limit exceeded. Try again later.';
        const context = { httpStatus: 429, serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.RATE_LIMIT);
        expect(result.failure_reason).toBe(FailureReason.REQUESTS_PER_MINUTE);
      });

      it('should classify quota exceeded correctly', () => {
        const errorMessage = 'You have exceeded your quota for this month';
        const context = { httpStatus: 429, serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.RATE_LIMIT);
        expect(result.failure_reason).toBe(FailureReason.DAILY_QUOTA_EXCEEDED);
      });
    });

    describe('Resource Exhaustion', () => {
      it('should classify CUDA out of memory correctly', () => {
        const errorMessage = 'CUDA out of memory: Tried to allocate 8.5GB but only 6.2GB available';
        const context = { serviceType: 'comfyui' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.RESOURCE_LIMIT);
        expect(result.failure_reason).toBe(FailureReason.GPU_MEMORY_FULL);
      });

      it('should classify system memory exhaustion correctly', () => {
        const errorMessage = 'Process killed due to insufficient memory (OOM)';
        const context = { serviceType: 'comfyui' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.RESOURCE_LIMIT);
        expect(result.failure_reason).toBe(FailureReason.OUT_OF_MEMORY);
      });
    });

    describe('Network Issues', () => {
      it('should classify connection timeout correctly', () => {
        const errorMessage = 'Connection timeout after 30 seconds';
        const context = { timeout: true, serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.NETWORK_ERROR);
        expect(result.failure_reason).toBe(FailureReason.NETWORK_TIMEOUT);
      });

      it('should classify DNS resolution failure correctly', () => {
        const errorMessage = 'getaddrinfo ENOTFOUND api.openai.com';
        const context = { serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.NETWORK_ERROR);
        expect(result.failure_reason).toBe(FailureReason.DNS_RESOLUTION);
      });
    });

    describe('Service Errors', () => {
      it('should classify service unavailable correctly', () => {
        const errorMessage = 'HTTP 503: Service temporarily unavailable';
        const context = { httpStatus: 503, serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.SERVICE_ERROR);
        expect(result.failure_reason).toBe(FailureReason.SERVICE_UNAVAILABLE);
      });

      it('should classify internal server error correctly', () => {
        const errorMessage = 'HTTP 500: Internal server error';
        const context = { httpStatus: 500, serviceType: 'comfyui' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.SERVICE_ERROR);
        expect(result.failure_reason).toBe(FailureReason.SERVICE_DOWN);
      });
    });

    describe('Generation Refusals', () => {
      it('should classify violence detection correctly', () => {
        const errorMessage = 'Content generation refused: detected violence in prompt';
        const context = { serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.GENERATION_REFUSAL);
        expect(result.failure_reason).toBe(FailureReason.VIOLENCE_DETECTED);
      });

      it('should classify copyright blocking correctly', () => {
        const errorMessage = 'Cannot generate copyrighted character: Mickey Mouse';
        const context = { serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.GENERATION_REFUSAL);
        expect(result.failure_reason).toBe(FailureReason.COPYRIGHT_BLOCKER);
      });

      it('should classify NSFW content blocking correctly', () => {
        const errorMessage = 'Request blocked due to adult content detection';
        const context = { serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.GENERATION_REFUSAL);
        expect(result.failure_reason).toBe(FailureReason.NSFW_CONTENT);
      });
    });
  });

  // ===================================================================
  // EDGE CASES AND COMPLEX SCENARIOS
  // ===================================================================

  describe('Complex Error Scenarios', () => {
    it('should handle nested error messages correctly', () => {
      const errorMessage = 'Worker failed: Connector error: HTTP 429: {"error": {"code": "rate_limit_exceeded", "message": "Too many requests"}}';
      const context = { httpStatus: 429, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(errorMessage, context);

      expect(result.failure_type).toBe(FailureType.RATE_LIMIT);
      expect(result.failure_reason).toBe(FailureReason.REQUESTS_PER_MINUTE);
    });

    it('should prioritize HTTP status over message content', () => {
      const errorMessage = 'Processing timeout occurred'; // Message suggests timeout
      const context = { httpStatus: 401, serviceType: 'openai_responses' }; // But HTTP status is auth error

      const result = FailureClassifier.classify(errorMessage, context);

      // Should prioritize HTTP status
      expect(result.failure_type).toBe(FailureType.AUTH_ERROR);
      expect(result.failure_reason).toBe(FailureReason.INVALID_API_KEY);
    });

    it('should handle malformed JSON error responses gracefully', () => {
      const errorMessage = 'HTTP 400: {"error": malformed json response}';
      const context = { httpStatus: 400, serviceType: 'openai_responses' };

      const result = FailureClassifier.classify(errorMessage, context);

      expect(result.failure_type).toBe(FailureType.RESPONSE_ERROR);
      expect(result.failure_reason).toBe(FailureReason.INVALID_RESPONSE_FORMAT);
    });
  });

  describe('Service-Specific Patterns', () => {
    describe('OpenAI Responses Connector', () => {
      it('should handle OpenAI-specific error formats', () => {
        const errorMessage = 'OpenAI API Error: model `gpt-5` does not exist';
        const context = { httpStatus: 404, serviceType: 'openai_responses' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.VALIDATION_ERROR);
        expect(result.failure_reason).toBe(FailureReason.MODEL_NOT_FOUND);
      });
    });

    describe('ComfyUI Connector', () => {
      it('should handle ComfyUI workflow execution errors', () => {
        const errorMessage = 'ComfyUI execution failed: Node "KSampler" failed with error: CUDA error';
        const context = { serviceType: 'comfyui' };

        const result = FailureClassifier.classify(errorMessage, context);

        expect(result.failure_type).toBe(FailureType.SYSTEM_ERROR);
        expect(result.failure_reason).toBe(FailureReason.GPU_ERROR);
      });
    });
  });
});

// ===================================================================
// TEST UTILITIES FOR ADDING NEW CASES
// ===================================================================

/**
 * Utility function to quickly add new real-world failure cases
 * Use this when debugging production failures
 */
const addNewFailureCase = (
  name: string,
  errorMessage: string,
  context: any,
  expectedType: FailureType,
  expectedReason: FailureReason
) => {
  it(`should classify ${name} correctly`, () => {
    const result = FailureClassifier.classify(errorMessage, context);

    expect(result.failure_type).toBe(expectedType);
    expect(result.failure_reason).toBe(expectedReason);

    // Log for debugging
    console.log(`✅ ${name}: ${result.failure_type}/${result.failure_reason}`);
    console.log(`📝 Description: ${result.failure_description}`);
  });
};

// Example of how to add new cases quickly:
// describe('New Real-World Failure Case', () => {
//   addNewFailureCase(
//     'OpenAI Content Policy Violation',
//     'Your request was rejected as it contains content that violates our usage policies',
//     { serviceType: 'openai_responses' },
//     FailureType.GENERATION_REFUSAL,
//     FailureReason.POLICY_VIOLATION
//   );
// });