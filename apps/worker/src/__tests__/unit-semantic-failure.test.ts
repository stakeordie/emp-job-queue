/**
 * Unit tests for OpenAI semantic failure detection
 *
 * Tests the refusal pattern detection logic without full connector integration
 */

import { describe, it, expect } from 'vitest';

// Simulate the semantic failure detection logic
function detectRefusalPatterns(textContent: string): { hasRefusal: boolean; message?: string } {
  if (!textContent || typeof textContent !== 'string') {
    return { hasRefusal: false };
  }

  const refusalPatterns = [
    /cannot generate/i,
    /unable to create/i,
    /can't generate/i,
    /cannot create/i,
    /policy violation/i,
    /content policy/i,
    /inappropriate/i,
    /not allowed/i,
    /refused/i,
    /declined/i
  ];

  const hasRefusal = refusalPatterns.some(pattern => pattern.test(textContent));

  if (hasRefusal) {
    return {
      hasRefusal: true,
      message: `Content generation refused: ${textContent.trim()}`
    };
  }

  return { hasRefusal: false };
}

describe('Unit: OpenAI Semantic Failure Detection', () => {
  describe('refusal pattern detection', () => {
    it('should detect "cannot generate" refusal pattern', () => {
      const text = "I cannot generate that type of content as it violates our usage policies.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('Content generation refused');
      expect(result.message).toContain('cannot generate');
    });

    it('should detect "unable to create" refusal pattern', () => {
      const text = "I'm unable to create images with explicit violent content.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('unable to create');
    });

    it('should detect "policy violation" refusal pattern', () => {
      const text = "This request appears to violate OpenAI's content policy regarding harmful content.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('violate OpenAI');
    });

    it('should detect "inappropriate" refusal pattern', () => {
      const text = "I can't help with that as the request is inappropriate.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('inappropriate');
    });

    it('should detect "not allowed" refusal pattern', () => {
      const text = "Creating that type of content is not allowed by our guidelines.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('not allowed');
    });

    it('should detect "refused" refusal pattern', () => {
      const text = "I refused to generate this content for safety reasons.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('refused');
    });

    it('should detect "declined" refusal pattern', () => {
      const text = "I declined to process your request due to content guidelines.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('declined');
    });
  });

  describe('case insensitive detection', () => {
    it('should detect refusal patterns regardless of case', () => {
      const testCases = [
        "I CANNOT GENERATE that content",
        "Unable To Create such images",
        "POLICY VIOLATION detected",
        "This is INAPPROPRIATE content",
        "NOT ALLOWED by guidelines",
        "Request REFUSED for safety",
        "I have DECLINED this request"
      ];

      for (const text of testCases) {
        const result = detectRefusalPatterns(text);
        expect(result.hasRefusal).toBe(true);
        expect(result.message).toContain('Content generation refused');
        expect(result.message).toContain(text.trim());
      }
    });
  });

  describe('non-refusal content', () => {
    it('should allow content without refusal patterns', () => {
      const validTexts = [
        "Here's a beautiful landscape image as requested.",
        "I've generated the content you asked for.",
        "The image shows a sunset over mountains.",
        "Successfully created the requested artwork.",
        "Generated a professional headshot as specified."
      ];

      for (const text of validTexts) {
        const result = detectRefusalPatterns(text);
        expect(result.hasRefusal).toBe(false);
        expect(result.message).toBeUndefined();
      }
    });

    it('should handle partial matches correctly', () => {
      const partialMatches = [
        "I can generate beautiful content for you.",  // Contains "generate" but not "cannot generate"
        "This allows creative freedom.",              // Contains "allows" but not "not allowed"
        "Policy compliance is important.",            // Contains "policy" but not "policy violation"
        "Content creation is my specialty."           // Contains "content" but no refusal context
      ];

      for (const text of partialMatches) {
        const result = detectRefusalPatterns(text);
        expect(result.hasRefusal).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty string gracefully', () => {
      const result = detectRefusalPatterns('');
      expect(result.hasRefusal).toBe(false);
    });

    it('should handle null/undefined gracefully', () => {
      expect(detectRefusalPatterns(null as any).hasRefusal).toBe(false);
      expect(detectRefusalPatterns(undefined as any).hasRefusal).toBe(false);
    });

    it('should handle non-string input gracefully', () => {
      expect(detectRefusalPatterns(123 as any).hasRefusal).toBe(false);
      expect(detectRefusalPatterns({} as any).hasRefusal).toBe(false);
      expect(detectRefusalPatterns([] as any).hasRefusal).toBe(false);
    });

    it('should trim whitespace from refusal text', () => {
      const text = "   I cannot generate that content.   \n\n";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toBe("Content generation refused: I cannot generate that content.");
    });
  });

  describe('complex refusal scenarios', () => {
    it('should detect refusal in mixed content', () => {
      const text = "While I understand your request, I cannot generate explicit content. However, I can suggest alternatives.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('cannot generate');
    });

    it('should handle multiple refusal patterns in one text', () => {
      const text = "I cannot generate this content as it's inappropriate and violates policy.";
      const result = detectRefusalPatterns(text);

      expect(result.hasRefusal).toBe(true);
      // Should trigger on the first match (cannot generate)
      expect(result.message).toContain('cannot generate');
    });

    it('should handle very long refusal messages', () => {
      const longText = "I cannot generate " + "a".repeat(1000) + " content that violates policies.";
      const result = detectRefusalPatterns(longText);

      expect(result.hasRefusal).toBe(true);
      expect(result.message).toContain('Content generation refused:');
      expect(result.message.length).toBeGreaterThan(1000);
    });
  });
});