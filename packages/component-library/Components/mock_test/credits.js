function computeCost(context) {
  // Mock component has no cost - it's for testing
  return {
    cost: 0,
    details: {
      type: 'mock_test',
      description: 'Testing component - no cost'
    }
  };
}