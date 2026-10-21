// Minimal session client for UCR's public Banner 9 Student Registration SSB
// class search. Keeps a cookie jar across requests (Banner tracks the
// selected term and active search criteria server-side, keyed by
// JSESSIONID) and rate-limits live requests.
//
// Adaptation notes (discovered empirically against the live site):
// - Changing txt_subject on a second searchResults call in the SAME session
//   is silently ignored — Banner caches the first search's criteria server
//   side. Re-POSTing term/search + classSearch/resetDataForm before each
//   subject's search resets that cached criteria. bootstrap() only needs to
//   run once per process (it mints the session cookie); selectTerm() must
//   be re-run before every distinct subject search.

const DEFAULT_USER_AGENT = "Bento-Scraper/0.1 (UCR CS schedule tool; student project)";
const DELAY_MS = 300;

export type FormParams = Record<string, string>;

export class BannerClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly cookies = new Map<string, string>();
  private lastRequestAt = 0;

  constructor(baseUrl: string, userAgent: string = DEFAULT_USER_AGENT) {
    this.baseUrl = baseUrl;
    this.userAgent = userAgent;
  }

  private rememberCookies(response: Response): void {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  /** GET with query params. Returns the raw response body text. */
  async get(path: string, query: FormParams = {}): Promise<string> {
    await this.throttle();
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const response = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        "X-Requested-With": "XMLHttpRequest",
        Cookie: this.cookieHeader(),
      },
    });
    this.rememberCookies(response);
    if (!response.ok) {
      throw new Error(`GET ${path} -> HTTP ${response.status}`);
    }
    return response.text();
  }

  /** POST a url-encoded form body. Returns the raw response body text. */
  async post(path: string, form: FormParams = {}): Promise<string> {
    await this.throttle();
    const body = new URLSearchParams(form);

    const response = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: {
        "User-Agent": this.userAgent,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.cookieHeader(),
      },
      body,
    });
    this.rememberCookies(response);
    if (!response.ok) {
      throw new Error(`POST ${path} -> HTTP ${response.status}`);
    }
    return response.text();
  }

  /** Mints the session cookie (JSESSIONID). Call once per process. */
  async bootstrap(): Promise<void> {
    await this.get("/term/termSelection", { mode: "search" });
  }

  /**
   * Selects the term and clears Banner's server-side search criteria cache.
   * Must be called before EVERY subject's search, not just once — see the
   * adaptation note above.
   */
  async selectTerm(term: string): Promise<void> {
    await this.post("/term/search?mode=search", { term });
    await this.post("/classSearch/resetDataForm", {});
  }
}
