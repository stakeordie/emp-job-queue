export class SelfApi {
  constructor(
    private baseURL: string,
    private apiKey: string,
  ) {}

  getProjectsByEmail(email: string) {
    return this.doRequest(`/projects/migrate?email=${email}`, "GET");
  }

  async doRequest(url: string, method: string, body?: any) {
    const response = await fetch(`${this.baseURL}${url}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}`);
    }
    return response.json();
  }
}
