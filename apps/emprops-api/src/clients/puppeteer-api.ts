export class PuppeteerClient {
  constructor(private url: string) {}

  async takeScreenshot(code: string): Promise<string> {
    const url = `${this.url}/api/screenshot`;
    const result = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    if (!result.ok) throw new Error(result.statusText);
    const { data } = await result.json();
    return data;
  }

  async executeCode(
    file: string,
    output: "image/gift" | "image/png",
    width?: number,
    height?: number,
  ): Promise<string> {
    const url = `${this.url}/api/v2/execute`;
    const result = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file, width, height, output }),
    });
    if (!result.ok) throw new Error(result.statusText);
    const { data } = await result.json();
    return data;
  }

  async takeVideo(
    id: string,
    code: string,
    duration?: number,
  ): Promise<string> {
    const url = `${this.url}/api/video`;
    const result = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, code, duration }),
    });
    if (!result.ok) throw new Error(result.statusText);
    const { data } = await result.json();
    return data;
  }
}
