function computeCost(context) {
  const { max_tokens, model } = context;
  
  // OpenAI pricing per 1K tokens (input/output)
  const pricing = {
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
  };
  
  const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
  
  // Estimate input tokens (rough approximation: 4 chars per token)
  const inputTokens = Math.ceil((context.prompt || '').length / 4);
  const outputTokens = max_tokens || 200;
  
  const inputCost = (inputTokens / 1000) * modelPricing.input;
  const outputCost = (outputTokens / 1000) * modelPricing.output;
  
  return { 
    cost: inputCost + outputCost,
    details: {
      inputTokens,
      outputTokens,
      inputCost,
      outputCost,
      model
    }
  };
}