export class PlatformApiClient {
  baseUrl = "";
  constructor(url: string) {
    this.baseUrl = url;
  }

  async getProjects(queryParams: Record<string, string>): Promise<{
    _embedded?: {
      projectModelList?: Project[];
    };
  }> {
    const query = parseJsonToQueryParams(queryParams);
    const res = await fetch(`${this.baseUrl}/api/projects?${query}`);
    return res.json();
  }

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${this.baseUrl}/api/projects/${id}`);
    return res.json();
  }

  async getTokens(queryParams: Record<string, unknown>): Promise<{
    _embedded?: {
      tokenModelList?: Token[];
    };
  }> {
    const query = parseJsonToQueryParams(queryParams);
    const res = await fetch(`${this.baseUrl}/api/tokens?${query}`);
    return res.json();
  }
}

function parseJsonToQueryParams(params: Record<string, unknown>): string {
  let query = "";
  Object.keys(params).forEach((k) => {
    query += `${k}=${params[k]}&`;
  });

  return query;
}

export interface Project {
  id: string;
  projectId: string;
  name: string;
  description: string;
  owner: string;
  price: number;
  totalEditions: number;
  totalEditionsLeft: number;
  totalEditionsMinted: number;
  totalEditionsReserved: number;
  status: string;
  openDate: string;
  ipfsUrl: string;
  blockchain: string;
  mintingContractAddress: string;
  displayUri: string;
  artifactUri: string;
  thumbnailUri: string;
  width: number;
  height: number;
  type: string;
  ungeneratedImage: string;
  royalty: number;
  createdAt: string;
  previewHash: string;
  previewProject: string;
  origen: string;
  primarySalesFee: number;
  secondarySalesFee: number;
  marketContractAddress: string;
  tokenContractAddress: string;
  slug: string;
  banner: string;
  enabled: boolean;
  chainId: string;
}

export interface Token {
  id: string;
  tokenId: string;
  projectId: string;
  owner: string;
  editionNumber: number;
  name: string;
  description: string;
  seed: string;
  symbol: string;
  decimals: number;
  displayUri: string;
  thumbnailUri: string;
  artifactUrl: string;
  generationStatus: string;
  amount: number;
  mintedDate: string;
  width: any;
  height: any;
  isQuestionnaireAnswered: any;
  isListed: any;
  isListingInProgress: any;
  isPurchaseInProgress: any;
  features: any[];
  profile: Profile;
  mintHash: string;
  questionnaireHash: any;
  blockchain: any;
  generationRetries: any;
}

export interface Profile {
  profileId: string;
  profileUsername: string;
  profileDescription: string;
  profilePictureUrl: string;
}
