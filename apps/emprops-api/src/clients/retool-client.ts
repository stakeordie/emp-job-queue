export class RetoolClient {
  constructor() {}

  executeAssignMemberTokenWorkflow(address: string) {
    return fetch(process.env.RETOOL_ASSIGN_MEMBER_TOKEN_WH, {
      method: "POST",
      body: JSON.stringify({
        address,
      }),
    });
  }
}
