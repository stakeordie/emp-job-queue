function computeCost(context) {
  console.log("credits context:", context)
  const { job_type } = context;
  
  // OpenAI pricing per 1K tokens (input/output)
  const pricing = {
    'openai': 0.05,
  };
  
  const price = pricing[job_type] || 0.25;
  
  return { 
    cost: price,
    details: {
      job_type
    }
  };
}