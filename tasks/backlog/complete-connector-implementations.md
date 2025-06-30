# Complete Connector Implementations

## Status: Backlog

## Description
Finish implementing the A1111, REST sync/async, and WebSocket connectors that currently exist as basic stubs in the TypeScript version.

## Missing Implementations
- **A1111 Connector**: Basic stub exists, needs full implementation
- **REST Sync Connector**: Basic stub exists, needs full implementation  
- **REST Async Connector**: Basic stub exists, needs full implementation
- **WebSocket Connector**: Basic stub exists, needs full implementation

## Tasks
- [ ] Complete A1111 connector with full API support
- [ ] Implement REST sync connector with proper request handling
- [ ] Build REST async connector with polling and callbacks
- [ ] Complete WebSocket connector with bidirectional communication
- [ ] Add comprehensive error handling for all connectors
- [ ] Implement connector-specific configuration validation

## Priority: Medium

## Dependencies
- Job broker core logic (for job processing)
- Message processing system (for communication)

## Files to Modify
- `src/worker/connectors/a1111-connector.ts`
- `src/worker/connectors/rest-sync-connector.ts`
- `src/worker/connectors/rest-async-connector.ts`
- `src/worker/connectors/websocket-connector.ts`

## Reference Implementation
- Python: `/Users/the_dusky/code/emprops/ai_infra/emp-redis/worker/connectors/`
- All connector files for feature comparison

## Acceptance Criteria
- [ ] All connectors support their respective service types
- [ ] Proper error handling and retry logic
- [ ] Configuration validation for each connector type
- [ ] Unit tests for connector functionality
- [ ] Integration tests with actual services