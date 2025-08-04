function computeCost(context) {
  const { model } = context;
  
  // GPT-4.1 image generation pricing (estimated - adjust based on actual pricing)
  const pricing = {
    'gpt-4.1': { 
      imageGeneration: 0.08,  // Estimated per image generated
      inputTokens: 0.01       // Per 1K input tokens for prompt processing
    }
  };
  
  const modelPricing = pricing[model] || pricing['gpt-4.1'];
  
  // Estimate input tokens for prompt (rough approximation: 4 chars per token)
  const inputTokens = Math.ceil((context.prompt || '').length / 4);
  const inputCost = (inputTokens / 1000) * modelPricing.inputTokens;
  
  // Image generation cost (typically 1 image)
  const imageGenCost = modelPricing.imageGeneration;
  
  return { 
    cost: inputCost + imageGenCost,
    details: {
      inputTokens,
      inputCost,
      imageGenCost,
      totalCost: inputCost + imageGenCost,
      model
    }
  };
}