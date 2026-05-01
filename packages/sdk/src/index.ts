export interface ProofCourtClientConfig {
  apiUrl: string;
  apiKey?: string;
}

export class ProofCourt {
  readonly apiUrl: string;
  readonly apiKey?: string;

  constructor(config: ProofCourtClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }
}
