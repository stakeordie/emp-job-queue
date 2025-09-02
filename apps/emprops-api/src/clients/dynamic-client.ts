type UserFilter = {
  filterColumn: string;
  filterValue: string;
};

type User = {
  id: string;
  alias: string;
  btcWallet: string | null;
  ckbWallet: string | null;
  country: string | null;
  discordNotification: boolean;
  dogeWallet: string | null;
  email: string;
  emailNotification: boolean;
  firstName: string;
  jobTitle: string;
  kasWallet: string | null;
  kdaWallet: string | null;
  lastName: string;
  ltcWallet: string | null;
  metadata: Record<string, string>;
  newsletterNotification: boolean;
  phoneNumber: string;
  policiesConsent: boolean;
  tShirtSize: string;
  team: string;
  username: string | null;
};

type UserUpdateRequest = Partial<User>;

class DynamicClient {
  constructor(
    private baseUrl: string,
    private environmentId: string,
    private apiKey: string,
  ) {
    this.baseUrl = `${baseUrl}/api/v0`;
  }

  async getAllUsersForEnvironment(
    filters: UserFilter,
  ): Promise<{ count: number; users: User[] }> {
    const filterString = `${encodeURIComponent(JSON.stringify(filters))}`;
    const url = `${this.baseUrl}/environments/${this.environmentId}/users?filter=${filterString}`;
    const config = {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    };
    const response = await fetch(url, config);
    if (!response.ok) throw new Error(response.statusText);
    return response.json();
  }

  async getUser(userId: string) {
    const response = await fetch(`${this.baseUrl}/users/${userId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    if (!response.ok) throw new Error(response.statusText);
    return response.json();
  }

  async updateUser(userId: string, data: UserUpdateRequest) {
    const response = await fetch(`${this.baseUrl}/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(response.statusText);
    return response.json();
  }
}

export default DynamicClient;
